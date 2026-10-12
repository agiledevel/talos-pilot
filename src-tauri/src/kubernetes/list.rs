//! Bounded, namespaced Pod list reads owned by a Kubernetes session.

use std::{
    collections::HashSet,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::{Duration, Instant},
};

use futures_util::io::{AsyncRead, AsyncReadExt};
use http::Request as HttpRequest;
use k8s_openapi::api::core::v1::Pod;
use kube::{Client, api::ListParams};
use serde::Deserialize;

use super::KubernetesError;
use super::session::REQUEST_DEADLINE;

pub(super) const PAGE_LIMIT: u32 = 200;
pub(super) const MAX_RETAINED_PODS: usize = 10_000;
pub(super) const MAX_PAGE_BYTES: usize = 2 * 1024 * 1024;
pub(super) const MAX_PROJECTION_BYTES: usize = 16 * 1024 * 1024;
const MAX_LIST_PAGES: usize = MAX_RETAINED_PODS.div_ceil(PAGE_LIMIT as usize) + 1;
const SNAPSHOT_DEADLINE: Duration = Duration::from_secs(60);
const MAX_SELECTOR_BYTES: usize = 1024;

/// A bounded projection of one Pod, excluding its spec, annotations and status details.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PodProjection {
    /// Kubernetes object name.
    pub name: String,
    /// Namespace used for the namespaced request.
    pub namespace: String,
    /// Server-assigned identity distinguishing a recreated Pod.
    pub uid: String,
    /// Opaque object resource version.
    pub resource_version: String,
    /// Bounded Pod phase, or `Unknown` when the server omits it.
    pub phase: String,
    /// Readiness derived from container status summaries.
    pub ready: ReadySummary,
}

/// Safe readiness summary derived from the Pod's container status fields.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum ReadySummary {
    /// At least one container status exists and every reported container is ready.
    Ready,
    /// At least one container status exists and at least one is not ready.
    NotReady,
    /// The server omitted container statuses or reported none.
    Unknown,
}

/// One internally accumulated, consistent paginated snapshot.
#[derive(Debug)]
pub struct PodSnapshot {
    /// Resource version shared by all server-side pages.
    pub resource_version: String,
    /// Bounded, nonsensitive Pod projections collected so far.
    pub items: Vec<PodProjection>,
    /// False when the retained-object or byte cap stopped collection.
    pub complete: bool,
    _budget: ProjectionBudgetLease,
}

#[derive(Debug)]
struct ProjectionBudgetLease {
    used: Arc<AtomicUsize>,
    bytes: usize,
}

impl ProjectionBudgetLease {
    fn new(used: Arc<AtomicUsize>) -> Self {
        Self { used, bytes: 0 }
    }

    fn reserve(&mut self, bytes: usize) -> bool {
        let mut current = self.used.load(Ordering::Acquire);
        loop {
            let Some(next) = current.checked_add(bytes) else {
                return false;
            };
            if next > MAX_PROJECTION_BYTES {
                return false;
            }
            match self.used.compare_exchange_weak(
                current,
                next,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    self.bytes += bytes;
                    return true;
                }
                Err(observed) => current = observed,
            }
        }
    }
}

impl Drop for ProjectionBudgetLease {
    fn drop(&mut self) {
        self.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}

#[derive(Deserialize)]
struct PodList {
    metadata: ListMetadata,
    #[serde(default)]
    items: Vec<Pod>,
}

#[derive(Deserialize)]
struct CoreApiResourceList {
    #[serde(default)]
    resources: Vec<CoreApiResource>,
}

#[derive(Deserialize)]
struct CoreApiResource {
    name: String,
    kind: String,
    namespaced: bool,
    #[serde(default)]
    verbs: Vec<String>,
}

#[derive(Deserialize)]
struct ListMetadata {
    #[serde(rename = "resourceVersion")]
    resource_version: String,
    #[serde(rename = "continue")]
    #[serde(default)]
    continue_token: String,
}

/// Validates the narrow input grammar before constructing any API request.
pub(super) fn validate_query(
    namespace: &str,
    label_selector: Option<&str>,
    field_selector: Option<&str>,
) -> Result<(), KubernetesError> {
    if !valid_namespace(namespace)
        || label_selector.is_some_and(|selector| !valid_selector(selector, false))
        || field_selector.is_some_and(|selector| !valid_selector(selector, true))
    {
        return Err(KubernetesError::InvalidQuery);
    }
    Ok(())
}

/// Reads bounded server-side pages and retains one resource-version-consistent projection.
pub(super) async fn collect_pods(
    client: &Client,
    projection_budget: Arc<AtomicUsize>,
    namespace: &str,
    label_selector: Option<&str>,
    field_selector: Option<&str>,
) -> Result<PodSnapshot, KubernetesError> {
    validate_query(namespace, label_selector, field_selector)?;
    let deadline = Instant::now() + SNAPSHOT_DEADLINE;
    discover_pod_api(client, deadline).await?;
    let path = format!("/api/v1/namespaces/{namespace}/pods");
    let mut continuation = None;
    let mut snapshot_version: Option<String> = None;
    let mut items = Vec::new();
    let mut lease = ProjectionBudgetLease::new(projection_budget);
    let mut seen_continuations = HashSet::new();
    let mut pages_read = 0_usize;

    loop {
        if Instant::now() >= deadline {
            return Err(KubernetesError::Unavailable);
        }
        let mut params = ListParams::default().limit(PAGE_LIMIT);
        if let Some(selector) = label_selector {
            params = params.labels(selector);
        }
        if let Some(selector) = field_selector {
            params = params.fields(selector);
        }
        if let Some(token) = continuation.as_deref() {
            params = params.continue_token(token);
        }
        let bytes = request_page(client, &path, &params, deadline).await?;
        let page: PodList =
            serde_json::from_slice(&bytes).map_err(|_| KubernetesError::UnsupportedResponse)?;
        pages_read += 1;
        let version = bounded_field(&page.metadata.resource_version, 128)?;
        match snapshot_version.as_deref() {
            None => snapshot_version = Some(version),
            Some(previous) if previous == version => {}
            Some(_) => return Err(KubernetesError::UnsupportedResponse),
        }
        for pod in page.items {
            if items.len() == MAX_RETAINED_PODS {
                return Ok(PodSnapshot {
                    resource_version: snapshot_version.unwrap_or_default(),
                    items,
                    complete: false,
                    _budget: lease,
                });
            }
            let projection = project_pod(pod)?;
            if projection.namespace != namespace {
                return Err(KubernetesError::UnsupportedResponse);
            }
            if !lease.reserve(projection_size(&projection)) {
                return Ok(PodSnapshot {
                    resource_version: snapshot_version.unwrap_or_default(),
                    items,
                    complete: false,
                    _budget: lease,
                });
            }
            items.push(projection);
        }
        if page.metadata.continue_token.is_empty() {
            break;
        }
        if page.metadata.continue_token.len() > 16 * 1024 {
            return Err(KubernetesError::UnsupportedResponse);
        }
        if pages_read >= MAX_LIST_PAGES
            || !seen_continuations.insert(page.metadata.continue_token.clone())
        {
            return Ok(PodSnapshot {
                resource_version: snapshot_version.unwrap_or_default(),
                items,
                complete: false,
                _budget: lease,
            });
        }
        continuation = Some(page.metadata.continue_token);
    }

    Ok(PodSnapshot {
        resource_version: snapshot_version.ok_or(KubernetesError::UnsupportedResponse)?,
        items,
        complete: true,
        _budget: lease,
    })
}

async fn request_page(
    client: &Client,
    path: &str,
    params: &ListParams,
    snapshot_deadline: Instant,
) -> Result<Vec<u8>, KubernetesError> {
    request_bounded(
        client,
        || {
            kube::core::Request::new(path)
                .list(params)
                .map_err(|_| KubernetesError::InvalidQuery)
        },
        snapshot_deadline,
        KubernetesError::from_list_kube,
    )
    .await
}

async fn discover_pod_api(
    client: &Client,
    snapshot_deadline: Instant,
) -> Result<(), KubernetesError> {
    let bytes = request_bounded(
        client,
        || {
            HttpRequest::get("/api/v1")
                .body(Vec::new())
                .map_err(|_| KubernetesError::InvalidQuery)
        },
        snapshot_deadline,
        KubernetesError::from_discovery_kube,
    )
    .await?;
    let discovery: CoreApiResourceList =
        serde_json::from_slice(&bytes).map_err(|_| KubernetesError::UnsupportedResponse)?;
    let pods_supported = discovery.resources.iter().any(|resource| {
        resource.name == "pods"
            && resource.kind == "Pod"
            && resource.namespaced
            && resource.verbs.iter().any(|verb| verb == "get")
            && resource.verbs.iter().any(|verb| verb == "list")
    });
    if pods_supported {
        Ok(())
    } else {
        Err(KubernetesError::ApiNotFound)
    }
}

async fn request_bounded<F>(
    client: &Client,
    build_request: F,
    snapshot_deadline: Instant,
    classify_error: fn(&kube::Error) -> KubernetesError,
) -> Result<Vec<u8>, KubernetesError>
where
    F: Fn() -> Result<HttpRequest<Vec<u8>>, KubernetesError>,
{
    const BACKOFFS: [Option<Duration>; 3] = [
        Some(Duration::from_millis(500)),
        Some(Duration::from_secs(1)),
        None,
    ];
    for backoff in BACKOFFS {
        let request = build_request()?;
        let page_deadline = Instant::now()
            + REQUEST_DEADLINE.min(snapshot_deadline.saturating_duration_since(Instant::now()));
        let attempt_result = async {
            let body = client
                .request_stream(request)
                .await
                .map_err(|error| classify_error(&error))?;
            read_bounded_body(body).await
        };
        let result = tokio::time::timeout(
            page_deadline.saturating_duration_since(Instant::now()),
            attempt_result,
        )
        .await
        .unwrap_or(Err(KubernetesError::Unavailable));
        match result {
            Ok(bytes) => return Ok(bytes),
            Err(KubernetesError::Unavailable) if backoff.is_some() => {
                let remaining = snapshot_deadline.saturating_duration_since(Instant::now());
                let delay = backoff.unwrap_or_default().min(remaining);
                if delay.is_zero() {
                    return Err(KubernetesError::Unavailable);
                }
                tokio::time::sleep(delay).await;
            }
            Err(error) => return Err(error),
        }
    }
    Err(KubernetesError::Unavailable)
}

async fn read_bounded_body<R>(body: R) -> Result<Vec<u8>, KubernetesError>
where
    R: AsyncRead + Unpin,
{
    let mut bytes = Vec::with_capacity(8192);
    body.take((MAX_PAGE_BYTES + 1) as u64)
        .read_to_end(&mut bytes)
        .await
        .map_err(|_| KubernetesError::Unavailable)?;
    if bytes.len() > MAX_PAGE_BYTES {
        return Err(KubernetesError::UnsupportedResponse);
    }
    Ok(bytes)
}

fn project_pod(pod: Pod) -> Result<PodProjection, KubernetesError> {
    let metadata = pod.metadata;
    let name = bounded_field(metadata.name.as_deref().unwrap_or_default(), 253)?;
    let namespace = bounded_field(metadata.namespace.as_deref().unwrap_or_default(), 63)?;
    let uid = bounded_field(metadata.uid.as_deref().unwrap_or_default(), 64)?;
    let resource_version = bounded_field(
        metadata.resource_version.as_deref().unwrap_or_default(),
        128,
    )?;
    let phase = bounded_field(
        pod.status
            .as_ref()
            .and_then(|status| status.phase.as_deref())
            .unwrap_or("Unknown"),
        32,
    )?;
    let declared_containers = pod.spec.as_ref().map(|spec| spec.containers.len());
    let ready = match (
        declared_containers,
        pod.status.and_then(|status| status.container_statuses),
    ) {
        (Some(declared), Some(statuses))
            if declared > 0
                && statuses.len() == declared
                && statuses.iter().all(|status| status.ready) =>
        {
            ReadySummary::Ready
        }
        (_, Some(statuses)) if statuses.iter().any(|status| !status.ready) => {
            ReadySummary::NotReady
        }
        _ => ReadySummary::Unknown,
    };
    Ok(PodProjection {
        name,
        namespace,
        uid,
        resource_version,
        phase,
        ready,
    })
}

fn bounded_field(value: &str, max_bytes: usize) -> Result<String, KubernetesError> {
    if value.is_empty() || value.len() > max_bytes || value.chars().any(char::is_control) {
        return Err(KubernetesError::UnsupportedResponse);
    }
    Ok(value.to_owned())
}

fn projection_size(pod: &PodProjection) -> usize {
    std::mem::size_of::<PodProjection>()
        + pod.name.len()
        + pod.namespace.len()
        + pod.uid.len()
        + pod.resource_version.len()
        + pod.phase.len()
}

fn valid_namespace(namespace: &str) -> bool {
    !namespace.is_empty()
        && namespace.len() <= 63
        && namespace
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && namespace
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && namespace
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
}

fn valid_selector(selector: &str, field: bool) -> bool {
    if selector.len() > MAX_SELECTOR_BYTES || selector.chars().any(char::is_control) {
        return false;
    }
    if selector.is_empty() {
        return true;
    }
    split_selector_requirements(selector).is_some_and(|requirements| {
        requirements
            .iter()
            .all(|requirement| valid_requirement(requirement, field))
    })
}

fn split_selector_requirements(selector: &str) -> Option<Vec<&str>> {
    let mut requirements = Vec::new();
    let mut depth = 0_u8;
    let mut start = 0;
    for (index, character) in selector.char_indices() {
        match character {
            '(' if depth == 0 => depth = 1,
            '(' => return None,
            ')' if depth == 1 => depth = 0,
            ')' => return None,
            ',' if depth == 0 => {
                requirements.push(selector[start..index].trim());
                start = index + character.len_utf8();
            }
            _ => {}
        }
    }
    if depth != 0 {
        return None;
    }
    requirements.push(selector[start..].trim());
    requirements
        .iter()
        .all(|part| !part.is_empty())
        .then_some(requirements)
}

fn valid_requirement(requirement: &str, field: bool) -> bool {
    if let Some((key, values)) = requirement.split_once(" in ") {
        return !field && valid_label_key(key) && valid_label_values(values);
    }
    if let Some((key, values)) = requirement.split_once(" notin ") {
        return !field && valid_label_key(key) && valid_label_values(values);
    }
    if let Some(key) = requirement.strip_prefix('!') {
        return !field && valid_label_key(key);
    }
    let (key, value) = requirement
        .split_once("==")
        .or_else(|| requirement.split_once("!="))
        .or_else(|| requirement.split_once('='))
        .unwrap_or((requirement, ""));
    if field {
        let known = matches!(
            key,
            "metadata.name"
                | "metadata.namespace"
                | "status.phase"
                | "spec.nodeName"
                | "spec.restartPolicy"
                | "spec.schedulerName"
                | "spec.serviceAccountName"
                | "spec.hostNetwork"
                | "status.podIP"
                | "status.podIPs"
        );
        let has_operator = requirement.contains('=') || requirement.contains("!=");
        return known && has_operator && !value.contains(',') && value.len() <= MAX_SELECTOR_BYTES;
    }
    valid_label_key(key) && (value.is_empty() || valid_label_value(value))
}

fn valid_label_values(values: &str) -> bool {
    values
        .strip_prefix('(')
        .and_then(|values| values.strip_suffix(')'))
        .is_some_and(|values| {
            !values.is_empty()
                && values
                    .split(',')
                    .all(|value| valid_label_value(value.trim()))
        })
}

fn valid_label_key(key: &str) -> bool {
    if key.len() > 253 {
        return false;
    }
    if key.starts_with('/') || key.matches('/').count() > 1 {
        return false;
    }
    let (prefix, name) = key.split_once('/').unwrap_or(("", key));
    !name.is_empty()
        && name.len() <= 63
        && label_segment(name, b"-_.")
        && (prefix.is_empty() || (prefix.len() <= 253 && prefix.split('.').all(valid_dns_segment)))
}

fn valid_dns_segment(segment: &str) -> bool {
    !segment.is_empty()
        && segment.len() <= 63
        && segment
            .bytes()
            .all(|byte| byte.is_ascii_lowercase() || byte.is_ascii_digit() || byte == b'-')
        && segment
            .as_bytes()
            .first()
            .is_some_and(u8::is_ascii_alphanumeric)
        && segment
            .as_bytes()
            .last()
            .is_some_and(u8::is_ascii_alphanumeric)
}

fn valid_label_value(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 63
        && value
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'-' | b'_' | b'.'))
        && value.as_bytes().iter().any(u8::is_ascii_alphanumeric)
}

fn label_segment(value: &str, punctuation: &[u8]) -> bool {
    let bytes = value.as_bytes();
    bytes.first().is_some_and(u8::is_ascii_alphanumeric)
        && bytes.last().is_some_and(u8::is_ascii_alphanumeric)
        && bytes
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || punctuation.contains(byte))
}

#[cfg(test)]
mod tests {
    use super::{
        MAX_PAGE_BYTES, MAX_PROJECTION_BYTES, MAX_SELECTOR_BYTES, PodProjection,
        ProjectionBudgetLease, ReadySummary, bounded_field, project_pod, read_bounded_body,
        valid_namespace, valid_selector, validate_query,
    };
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    #[test]
    fn rejects_invalid_namespaces_and_selector_bounds_before_request() {
        for namespace in ["", "Upper", "-bad", "bad-", "bad.name", &"a".repeat(64)] {
            assert!(!valid_namespace(namespace));
        }
        assert!(valid_namespace("workloads-1"));
        assert!(valid_namespace(&format!("{}1", "a".repeat(62))));
        assert!(validate_query("workloads-1", Some("app=web,tier!=test"), None).is_ok());
        assert!(validate_query("workloads-1", Some(&"a".repeat(1025)), None).is_err());
        assert!(validate_query("workloads-1", None, Some("status.phase=Running")).is_ok());
        assert!(
            validate_query(
                "workloads-1",
                None,
                Some("metadata.name=pod,status.phase=Running")
            )
            .is_ok()
        );
        assert!(
            validate_query(
                "workloads-1",
                None,
                Some("metadata.name=pod,unsupported=value")
            )
            .is_err()
        );
    }

    #[test]
    fn rejects_malformed_selector_components() {
        for selector in [
            ",app=web",
            "app===x",
            "app=bad value",
            "!",
            "a,,b",
            "/name=value",
        ] {
            assert!(!valid_selector(selector, false));
        }
        assert!(valid_selector("app in (web,worker)", false));
        let at_bound = format!("{}aa=a", "aa=a,".repeat(204));
        assert_eq!(at_bound.len(), MAX_SELECTOR_BYTES);
        assert!(valid_selector(&at_bound, false));
        assert!(!valid_selector(&format!("{at_bound},aa=a"), false));
    }

    #[test]
    fn projects_only_bounded_metadata_and_readiness() {
        let pod: k8s_openapi::api::core::v1::Pod = serde_json::from_str(
            r#"{"metadata":{"name":"api","namespace":"workloads","uid":"u-1","resourceVersion":"17","annotations":{"secret":"hidden"}},"spec":{"containers":[{"name":"app","image":"secret/image"}]},"status":{"phase":"Running","containerStatuses":[{"name":"app","ready":true,"restartCount":0,"image":"secret/image"}]}}"#,
        )
        .unwrap_or_else(|_| panic!("valid synthetic Pod should deserialize"));
        let projected =
            project_pod(pod).unwrap_or_else(|_| panic!("bounded synthetic Pod should project"));
        assert_eq!(
            projected,
            PodProjection {
                name: "api".to_owned(),
                namespace: "workloads".to_owned(),
                uid: "u-1".to_owned(),
                resource_version: "17".to_owned(),
                phase: "Running".to_owned(),
                ready: ReadySummary::Ready,
            }
        );
        assert!(!format!("{projected:?}").contains("secret"));

        let oversized = format!(
            r#"{{"metadata":{{"name":"{}","namespace":"workloads","uid":"u-1","resourceVersion":"17"}}}}"#,
            "n".repeat(254)
        );
        let pod: k8s_openapi::api::core::v1::Pod = serde_json::from_str(&oversized)
            .unwrap_or_else(|_| panic!("oversized test Pod should deserialize"));
        assert!(matches!(
            project_pod(pod),
            Err(crate::kubernetes::KubernetesError::UnsupportedResponse)
        ));
    }

    #[test]
    fn session_projection_budget_is_shared_and_released_with_the_snapshot() {
        let used = Arc::new(AtomicUsize::new(0));
        let mut first = ProjectionBudgetLease::new(Arc::clone(&used));
        let mut second = ProjectionBudgetLease::new(Arc::clone(&used));
        assert!(first.reserve(MAX_PROJECTION_BYTES - 8));
        assert!(!second.reserve(16));
        assert_eq!(used.load(Ordering::Acquire), MAX_PROJECTION_BYTES - 8);
        drop(first);
        assert_eq!(used.load(Ordering::Acquire), 0);
        assert!(second.reserve(MAX_PROJECTION_BYTES));
        assert_eq!(used.load(Ordering::Acquire), MAX_PROJECTION_BYTES);
        assert!(
            !ProjectionBudgetLease::new(Arc::new(AtomicUsize::new(0)))
                .reserve(MAX_PROJECTION_BYTES + 1)
        );
    }

    #[test]
    fn projected_field_limits_accept_the_boundary_and_reject_one_over() {
        for limit in [253, 63, 64, 128, 32] {
            let at_limit = "x".repeat(limit);
            assert!(bounded_field(&at_limit, limit).is_ok());
            let one_over = "x".repeat(limit + 1);
            assert!(bounded_field(&one_over, limit).is_err());
        }
    }

    #[tokio::test]
    async fn response_body_limit_is_enforced_before_json_decode() {
        assert!(
            read_bounded_body(futures_util::io::Cursor::new(vec![0; MAX_PAGE_BYTES]))
                .await
                .is_ok()
        );
        assert!(
            read_bounded_body(futures_util::io::Cursor::new(vec![0; MAX_PAGE_BYTES + 1]))
                .await
                .is_err()
        );
    }
}
