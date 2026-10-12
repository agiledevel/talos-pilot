//! Synthetic TLS Kubernetes API server for native and integration tests.
//!
//! This module is compiled only for unit tests and for the `native-test`
//! feature, so no production artifact contains it. It exists to prove the real
//! client path end to end without a cluster: it generates an ephemeral
//! certificate authority and server certificate, serves a small HTTPS
//! Kubernetes API surface on an ephemeral loopback port, and records exactly
//! what each request carried.
//!
//! The generated certificate authority never leaves the process that created
//! it, and each server instance uses a fresh random token, so no fixture in the
//! repository holds a private key or a reusable credential.

use std::{
    io,
    net::SocketAddr,
    sync::{
        Arc, Mutex,
        atomic::{AtomicU8, AtomicUsize, Ordering},
    },
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};
use rcgen::{BasicConstraints, CertificateParams, DnType, IsCa, Issuer, KeyPair};
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::{TcpListener, TcpStream},
};
use tokio_rustls::{
    TlsAcceptor,
    rustls::{
        ServerConfig,
        pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer},
    },
};

/// Maximum request head the synthetic server reads before answering.
const MAX_REQUEST_BYTES: usize = 16 * 1024;
/// Bound on one synthetic connection so a stuck peer cannot leak a task.
const CONNECTION_DEADLINE: Duration = Duration::from_secs(10);

/// How the synthetic server answers an authenticated request.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SyntheticResponse {
    /// Answer with the supported version payload.
    Success,
    /// Reject the credential itself with HTTP 401.
    CredentialRejected,
    /// Authenticate the caller but deny the request with HTTP 403.
    RequestDenied,
    /// Answer core discovery without the Pod API.
    MissingPodApi,
    /// Answer a namespaced Pod-list request with HTTP 404.
    MissingNamespace,
    /// Answer a continuation request with HTTP 410 after a valid first page.
    ExpiredContinuation,
    /// Answer a namespaced Pod-list request with an empty successful list.
    EmptyList,
}

/// One request the synthetic server answered.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecordedRequest {
    /// HTTP method, for example `GET`.
    pub method: String,
    /// Request target path, for example `/version`.
    pub path: String,
    /// `Authorization` header value when the request carried one.
    pub authorization: Option<String>,
}

/// A running synthetic HTTPS Kubernetes API server.
///
/// Dropping the value stops the accept loop: the background task ends when its
/// accept future is cancelled, so no listener or task outlives the test that
/// created it.
pub struct SyntheticApiserver {
    endpoint: String,
    certificate_authority_pem: String,
    token: String,
    response: Arc<AtomicU8>,
    transient_failures: Arc<AtomicUsize>,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    shutdown: Option<tokio::sync::oneshot::Sender<()>>,
    task: Option<tokio::task::JoinHandle<()>>,
}

impl SyntheticApiserver {
    /// Starts a synthetic API server on an ephemeral loopback port.
    ///
    /// # Errors
    ///
    /// Returns an I/O error when the certificate cannot be generated or the
    /// loopback listener cannot be bound.
    pub async fn start() -> io::Result<Self> {
        let authority = synthetic_authority()?;
        let listener = TcpListener::bind(SocketAddr::from(([127, 0, 0, 1], 0))).await?;
        let port = listener.local_addr()?.port();
        let acceptor = TlsAcceptor::from(Arc::new(authority.server_config));
        let response = Arc::new(AtomicU8::new(SyntheticResponse::Success.code()));
        let transient_failures = Arc::new(AtomicUsize::new(0));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (shutdown, mut shutdown_signal) = tokio::sync::oneshot::channel();

        let task_response = Arc::clone(&response);
        let task_transient_failures = Arc::clone(&transient_failures);
        let task_requests = Arc::clone(&requests);
        let token = authority.token.clone();
        let task_token = token.clone();
        let task = tokio::spawn(async move {
            loop {
                tokio::select! {
                    _ = &mut shutdown_signal => break,
                    accepted = listener.accept() => {
                        let Ok((stream, _)) = accepted else { break };
                        let acceptor = acceptor.clone();
                        let response = Arc::clone(&task_response);
                        let transient_failures = Arc::clone(&task_transient_failures);
                        let requests = Arc::clone(&task_requests);
                        let token = task_token.clone();
                        tokio::spawn(async move {
                            let _ = tokio::time::timeout(
                                CONNECTION_DEADLINE,
                                serve_connection(
                                    stream,
                                    acceptor,
                                    response,
                                    transient_failures,
                                    requests,
                                    token,
                                ),
                            )
                            .await;
                        });
                    }
                }
            }
        });

        Ok(Self {
            endpoint: format!("https://127.0.0.1:{port}"),
            certificate_authority_pem: authority.certificate_authority_pem,
            token,
            response,
            transient_failures,
            requests,
            shutdown: Some(shutdown),
            task: Some(task),
        })
    }

    /// Returns the endpoint the server is listening on.
    #[must_use]
    pub fn endpoint(&self) -> &str {
        &self.endpoint
    }

    /// Returns the synthetic bearer token this server accepts.
    #[must_use]
    pub fn token(&self) -> &str {
        &self.token
    }

    /// Selects how the server answers the next requests.
    pub fn set_response(&self, response: SyntheticResponse) {
        self.response.store(response.code(), Ordering::SeqCst);
    }

    /// Makes the next number of requests fail transiently with HTTP 503.
    pub fn set_transient_failures(&self, count: usize) {
        self.transient_failures.store(count, Ordering::SeqCst);
    }

    /// Returns every request the server has answered so far.
    #[must_use]
    pub fn requests(&self) -> Vec<RecordedRequest> {
        self.requests
            .lock()
            .map(|requests| requests.clone())
            .unwrap_or_default()
    }

    /// Builds a kubeconfig that selects this server with one supported identity.
    ///
    /// The returned document carries the inline certificate authority and an
    /// inline bearer token, exactly the forms the import boundary accepts.
    #[must_use]
    pub fn kubeconfig(&self, context_name: &str, cluster_name: &str) -> String {
        self.kubeconfig_with_authority(
            context_name,
            cluster_name,
            &self.certificate_authority_base64(),
        )
    }

    /// Returns this server's certificate authority as base64 PEM.
    ///
    /// A test that must *fail* TLS validation pairs one server's endpoint with
    /// another authority, so the authority has to be available on its own.
    #[must_use]
    pub fn certificate_authority_base64(&self) -> String {
        STANDARD.encode(self.certificate_authority_pem.as_bytes())
    }

    /// Builds a kubeconfig that trusts the supplied base64 certificate authority.
    ///
    /// # Panics
    ///
    /// Panics only when the embedded document template cannot be formatted,
    /// which cannot happen for a fixed template.
    #[must_use]
    pub fn kubeconfig_with_authority(
        &self,
        context_name: &str,
        cluster_name: &str,
        certificate_authority: &str,
    ) -> String {
        format!(
            "apiVersion: v1\n\
             kind: Config\n\
             current-context: {context_name}\n\
             clusters:\n\
             \x20 - name: {cluster_name}\n\
             \x20   cluster:\n\
             \x20     server: {endpoint}\n\
             \x20     certificate-authority-data: {certificate_authority}\n\
             contexts:\n\
             \x20 - name: {context_name}\n\
             \x20   context:\n\
             \x20     cluster: {cluster_name}\n\
             \x20     user: synthetic-user\n\
             users:\n\
             \x20 - name: synthetic-user\n\
             \x20   user:\n\
             \x20     token: {token}\n",
            endpoint = self.endpoint,
            token = self.token,
        )
    }

    /// Stops the server and waits for its accept loop to end.
    ///
    /// The accept loop is awaited, so the listener is gone when this returns.
    /// A connection that is already being served is bounded by its own
    /// deadline and cannot outlive the runtime.
    pub async fn stop(mut self) {
        if let Some(shutdown) = self.shutdown.take() {
            let _ = shutdown.send(());
        }
        if let Some(task) = self.task.take() {
            let _ = task.await;
        }
    }
}

impl SyntheticResponse {
    fn code(self) -> u8 {
        match self {
            Self::Success => 0,
            Self::CredentialRejected => 1,
            Self::RequestDenied => 2,
            Self::MissingPodApi => 3,
            Self::ExpiredContinuation => 4,
            Self::EmptyList => 5,
            Self::MissingNamespace => 6,
        }
    }

    fn from_code(code: u8) -> Self {
        match code {
            1 => Self::CredentialRejected,
            2 => Self::RequestDenied,
            3 => Self::MissingPodApi,
            4 => Self::ExpiredContinuation,
            5 => Self::EmptyList,
            6 => Self::MissingNamespace,
            _ => Self::Success,
        }
    }
}

struct SyntheticAuthority {
    certificate_authority_pem: String,
    server_config: ServerConfig,
    token: String,
}

/// Generates an ephemeral certificate authority and matching server certificate.
fn synthetic_authority() -> io::Result<SyntheticAuthority> {
    let mut authority_params = CertificateParams::new(Vec::new()).map_err(invalid_input)?;
    authority_params.is_ca = IsCa::Ca(BasicConstraints::Unconstrained);
    authority_params
        .distinguished_name
        .push(DnType::CommonName, "talos-pilot synthetic test CA");
    let authority_key = KeyPair::generate().map_err(invalid_input)?;
    let authority_certificate = authority_params
        .self_signed(&authority_key)
        .map_err(invalid_input)?;

    let mut server_params =
        CertificateParams::new(vec!["127.0.0.1".to_owned(), "localhost".to_owned()])
            .map_err(invalid_input)?;
    server_params
        .distinguished_name
        .push(DnType::CommonName, "127.0.0.1");
    let server_key = KeyPair::generate().map_err(invalid_input)?;
    let issuer = Issuer::from_params(&authority_params, &authority_key);
    let server_certificate = server_params
        .signed_by(&server_key, &issuer)
        .map_err(invalid_input)?;

    let certificate_chain = vec![
        CertificateDer::from(server_certificate.der().to_vec()),
        CertificateDer::from(authority_certificate.der().to_vec()),
    ];
    let private_key = PrivateKeyDer::Pkcs8(PrivatePkcs8KeyDer::from(server_key.serialize_der()));
    let server_config = ServerConfig::builder_with_provider(Arc::new(
        tokio_rustls::rustls::crypto::ring::default_provider(),
    ))
    .with_safe_default_protocol_versions()
    .map_err(invalid_input)?
    .with_no_client_auth()
    .with_single_cert(certificate_chain, private_key)
    .map_err(invalid_input)?;

    let mut token_bytes = [0_u8; 24];
    getrandom::fill(&mut token_bytes).map_err(io::Error::other)?;

    Ok(SyntheticAuthority {
        certificate_authority_pem: authority_certificate.pem(),
        server_config,
        token: STANDARD.encode(token_bytes),
    })
}

fn invalid_input(error: impl std::fmt::Display) -> io::Error {
    io::Error::new(io::ErrorKind::InvalidInput, error.to_string())
}

/// Serves one TLS connection: one HTTP/1.1 request, one response, then close.
async fn serve_connection(
    stream: TcpStream,
    acceptor: TlsAcceptor,
    response: Arc<AtomicU8>,
    transient_failures: Arc<AtomicUsize>,
    requests: Arc<Mutex<Vec<RecordedRequest>>>,
    token: String,
) -> io::Result<()> {
    let mut tls = acceptor.accept(stream).await?;
    let request = read_request_head(&mut tls).await?;
    let recorded = RecordedRequest {
        method: request.method.clone(),
        path: request.path.clone(),
        authorization: request.authorization.clone(),
    };
    if let Ok(mut recorded_requests) = requests.lock() {
        recorded_requests.push(recorded);
    }

    let transient = request.path.starts_with("/api/v1/namespaces/")
        && transient_failures
            .try_update(Ordering::SeqCst, Ordering::SeqCst, |remaining| {
                remaining.checked_sub(1)
            })
            .is_ok();
    let selected = SyntheticResponse::from_code(response.load(Ordering::SeqCst));
    let authorised = request
        .authorization
        .as_deref()
        .is_some_and(|value| value == format!("Bearer {token}"));
    let (status, body) = if transient {
        (
            "503 Service Unavailable",
            status_body(503, "ServiceUnavailable", "synthetic transient failure"),
        )
    } else {
        match selected {
            SyntheticResponse::Success if authorised => version_response(&request.path),
            SyntheticResponse::Success => (
                "401 Unauthorized",
                status_body(401, "Unauthorized", "synthetic rejection"),
            ),
            SyntheticResponse::CredentialRejected if request.path == "/api/v1" => {
                version_response(&request.path)
            }
            SyntheticResponse::CredentialRejected => (
                "401 Unauthorized",
                status_body(401, "Unauthorized", "synthetic rejection"),
            ),
            SyntheticResponse::RequestDenied if request.path == "/api/v1" => {
                version_response(&request.path)
            }
            SyntheticResponse::RequestDenied => (
                "403 Forbidden",
                status_body(403, "Forbidden", "synthetic denial"),
            ),
            SyntheticResponse::MissingPodApi if request.path.starts_with("/api/v1") =>
            {
                (
                    "404 Not Found",
                    status_body(404, "NotFound", "synthetic API is missing"),
                )
            }
            SyntheticResponse::MissingPodApi => version_response(&request.path),
            SyntheticResponse::ExpiredContinuation if request.path.contains("continue=") => (
                "410 Gone",
                status_body(410, "Expired", "synthetic continuation expired"),
            ),
            SyntheticResponse::ExpiredContinuation => version_response(&request.path),
            SyntheticResponse::MissingNamespace
                if request.path.starts_with("/api/v1/namespaces/") =>
            {
                (
                    "404 Not Found",
                    status_body(404, "NotFound", "synthetic namespace is missing"),
                )
            }
            SyntheticResponse::MissingNamespace => version_response(&request.path),
            SyntheticResponse::EmptyList
                if request.path.starts_with("/api/v1/namespaces/") =>
            {
                (
                    "200 OK",
                    r#"{"kind":"PodList","apiVersion":"v1","metadata":{"resourceVersion":"42"},"items":[]}"#.to_owned(),
                )
            }
            SyntheticResponse::EmptyList => version_response(&request.path),
        }
    };
    let head = format!(
        "HTTP/1.1 {status}\r\nContent-Type: application/json\r\nContent-Length: {length}\r\nConnection: close\r\n\r\n",
        length = body.len()
    );
    tls.write_all(head.as_bytes()).await?;
    tls.write_all(body.as_bytes()).await?;
    tls.flush().await?;
    tls.shutdown().await
}

struct RequestHead {
    method: String,
    path: String,
    authorization: Option<String>,
}

/// Reads and parses one bounded HTTP/1.1 request head.
async fn read_request_head(
    stream: &mut tokio_rustls::server::TlsStream<TcpStream>,
) -> io::Result<RequestHead> {
    let mut buffer = Vec::new();
    let mut chunk = [0_u8; 1024];
    loop {
        let read = stream.read(&mut chunk).await?;
        if read == 0 {
            break;
        }
        buffer.extend_from_slice(&chunk[..read]);
        if buffer.windows(4).any(|window| window == b"\r\n\r\n") {
            break;
        }
        if buffer.len() > MAX_REQUEST_BYTES {
            return Err(io::Error::new(
                io::ErrorKind::InvalidData,
                "synthetic request head exceeded its bound",
            ));
        }
    }
    let text = String::from_utf8_lossy(&buffer);
    let mut lines = text.split("\r\n");
    let request_line = lines
        .next()
        .ok_or_else(|| io::Error::new(io::ErrorKind::InvalidData, "missing request line"))?;
    let mut parts = request_line.split_whitespace();
    let method = parts.next().unwrap_or_default().to_owned();
    let path = parts.next().unwrap_or_default().to_owned();
    let authorization = lines
        .filter_map(|line| line.split_once(':'))
        .find(|(name, _)| name.eq_ignore_ascii_case("authorization"))
        .map(|(_, value)| value.trim().to_owned());

    Ok(RequestHead {
        method,
        path,
        authorization,
    })
}

/// Returns the supported payload for one path, or a 404 status body.
fn version_response(path: &str) -> (&'static str, String) {
    match path {
        "/version" => (
            "200 OK",
            concat!(
                r#"{"major":"1","minor":"36","gitVersion":"v1.36.5","gitCommit":"synthetic","#,
                r#""gitTreeState":"clean","buildDate":"2026-10-11T00:00:00Z","#,
                r#""goVersion":"go1.27.2","compiler":"gc","platform":"linux/amd64"}"#
            )
            .to_owned(),
        ),
        "/api" => (
            "200 OK",
            r#"{"kind":"APIVersions","versions":["v1"],"serverAddressByClientCIDRs":[]}"#
                .to_owned(),
        ),
        "/api/v1" => (
            "200 OK",
            r#"{"kind":"APIResourceList","apiVersion":"v1","groupVersion":"v1","resources":[{"name":"pods","singularName":"pod","namespaced":true,"kind":"Pod","verbs":["get","list","watch"]}]}"#.to_owned(),
        ),
        path if path.starts_with("/api/v1/namespaces/workloads/pods?") => {
            if path.contains("labelSelector=bulk") {
                return bulk_pod_page(path);
            }
            let second_page = path.contains("continue=synthetic-next");
            let (continue_field, pod_name) = if second_page {
                ("", "second")
            } else {
                (r#","continue":"synthetic-next""#, "first")
            };
            (
                "200 OK",
                format!(
                    r#"{{"kind":"PodList","apiVersion":"v1","metadata":{{"resourceVersion":"42"{continue_field}}},"items":[{{"metadata":{{"name":"{pod_name}","namespace":"workloads","uid":"uid-{pod_name}","resourceVersion":"42"}},"status":{{"phase":"Running","containerStatuses":[{{"name":"app","ready":true}}]}}}}]}}"#
                ),
            )
        }
        _ => (
            "404 Not Found",
            status_body(404, "NotFound", "synthetic endpoint not found"),
        ),
    }
}

fn bulk_pod_page(path: &str) -> (&'static str, String) {
    let page = path
        .split_once("continue=bulk-")
        .and_then(|(_, suffix)| suffix.split('&').next())
        .and_then(|value| value.parse::<usize>().ok())
        .unwrap_or(0);
    let first_item = page * 200;
    let item_count = if page == 50 { 1 } else { 200 };
    let continue_field = if page < 50 {
        format!(",\"continue\":\"bulk-{}\"", page + 1)
    } else {
        String::new()
    };
    let items = (first_item..first_item + item_count)
        .map(|index| {
            format!(
                r#"{{"metadata":{{"name":"pod-{index:05}","namespace":"workloads","uid":"uid-{index:05}","resourceVersion":"42"}}}}"#
            )
        })
        .collect::<Vec<_>>()
        .join(",");
    (
        "200 OK",
        format!(
            r#"{{"kind":"PodList","apiVersion":"v1","metadata":{{"resourceVersion":"42"{continue_field}}},"items":[{items}]}}"#
        ),
    )
}

fn status_body(code: u16, reason: &str, message: &str) -> String {
    format!(
        r#"{{"kind":"Status","apiVersion":"v1","status":"Failure","message":"{message}","reason":"{reason}","code":{code}}}"#
    )
}

/// Builds a client from a synthetic kubeconfig through the production path.
///
/// The helper exists so module tests can reuse the adapter's own client
/// construction instead of duplicating it; it is compiled only in test builds.
#[cfg(test)]
pub(crate) fn build_test_client(kubeconfig: &str) -> Result<kube::Client, super::KubernetesError> {
    super::client::build_client(kubeconfig.as_bytes())
}

#[cfg(test)]
mod tests {
    use std::sync::{Arc, atomic::AtomicUsize};

    use super::{SyntheticApiserver, SyntheticResponse, build_test_client};
    use crate::kubernetes::{KubernetesError, list::collect_pods};

    #[tokio::test]
    async fn serves_a_version_read_and_records_the_authorization_header() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let kubeconfig = server.kubeconfig("synthetic-context", "synthetic-cluster");
        assert!(kubeconfig.contains("certificate-authority-data:"));
        assert!(kubeconfig.contains(server.endpoint()));

        let client = build_test_client(&kubeconfig)
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        let version = client
            .apiserver_version()
            .await
            .unwrap_or_else(|_| panic!("synthetic version read should succeed"));
        assert_eq!(version.git_version, "v1.36.5");
        assert_eq!(version.minor, "36");

        let requests = server.requests();
        assert_eq!(requests.len(), 1);
        assert_eq!(requests[0].path, "/version");
        assert_eq!(
            requests[0].authorization.as_deref(),
            Some(format!("Bearer {}", server.token()).as_str())
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn bounded_pod_collection_uses_continue_token_and_preserves_resource_version() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let client =
            build_test_client(&server.kubeconfig("synthetic-context", "synthetic-cluster"))
                .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));

        let snapshot = collect_pods(
            &client,
            Arc::new(AtomicUsize::new(0)),
            "workloads",
            Some("app=web"),
            None,
        )
        .await
        .unwrap_or_else(|_| panic!("both synthetic pages should be collected"));
        assert!(snapshot.complete);
        assert_eq!(snapshot.resource_version, "42");
        assert_eq!(snapshot.items.len(), 2);
        assert_eq!(snapshot.items[0].name, "first");
        assert_eq!(snapshot.items[1].name, "second");

        let requests = server.requests();
        assert_eq!(requests.len(), 3);
        assert_eq!(requests[0].path, "/api/v1");
        assert!(requests[1].path.contains("limit=200"));
        assert!(requests[1].path.contains("labelSelector=app%3Dweb"));
        assert!(requests[2].path.contains("continue=synthetic-next"));
        assert!(
            requests[1..]
                .iter()
                .all(|request| request.path.contains("/namespaces/workloads/pods?"))
        );

        let invalid = collect_pods(
            &client,
            Arc::new(AtomicUsize::new(0)),
            "bad/namespace",
            None,
            None,
        )
        .await;
        assert!(matches!(invalid, Err(KubernetesError::InvalidQuery)));
        assert_eq!(
            server.requests().len(),
            3,
            "invalid input must not dispatch a request"
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn retries_transient_list_failures_up_to_the_successful_page() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        server.set_transient_failures(2);
        let client =
            build_test_client(&server.kubeconfig("synthetic-context", "synthetic-cluster"))
                .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));

        let snapshot = collect_pods(
            &client,
            Arc::new(AtomicUsize::new(0)),
            "workloads",
            None,
            None,
        )
        .await
        .unwrap_or_else(|_| panic!("transient errors should retry before page collection"));
        assert!(snapshot.complete);
        let requests = server.requests();
        assert_eq!(
            requests.len(),
            5,
            "discovery, two retries, and two list pages"
        );
        assert_eq!(requests[0].path, "/api/v1");
        assert!(
            requests[1..4]
                .iter()
                .all(|request| !request.path.contains("continue="))
        );
        assert!(requests[4].path.contains("continue=synthetic-next"));

        drop(snapshot);
        server.set_transient_failures(3);
        let exhausted = collect_pods(
            &client,
            Arc::new(AtomicUsize::new(0)),
            "workloads",
            None,
            None,
        )
        .await;
        assert!(matches!(exhausted, Err(KubernetesError::Unavailable)));
        let requests = server.requests();
        assert_eq!(
            requests.len(),
            9,
            "three failed attempts must exhaust the page"
        );
        assert!(
            requests[6..]
                .iter()
                .all(|request| !request.path.contains("continue="))
        );
        server.stop().await;
    }

    #[tokio::test]
    async fn aggregate_object_cap_returns_an_incomplete_snapshot_and_releases_memory() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let client =
            build_test_client(&server.kubeconfig("synthetic-context", "synthetic-cluster"))
                .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        let budget = Arc::new(AtomicUsize::new(0));

        let snapshot = collect_pods(
            &client,
            Arc::clone(&budget),
            "workloads",
            Some("bulk"),
            None,
        )
        .await
        .unwrap_or_else(|_| panic!("the bounded synthetic pages should collect"));
        assert_eq!(snapshot.items.len(), 10_000);
        assert!(!snapshot.complete);
        assert!(budget.load(std::sync::atomic::Ordering::Acquire) > 0);
        assert_eq!(server.requests().len(), 52);
        drop(snapshot);
        assert_eq!(budget.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn list_errors_and_empty_results_have_distinct_outcomes() {
        let missing = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        missing.set_response(SyntheticResponse::MissingPodApi);
        let client = build_test_client(&missing.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        assert!(matches!(
            collect_pods(
                &client,
                Arc::new(AtomicUsize::new(0)),
                "workloads",
                None,
                None
            )
            .await,
            Err(KubernetesError::ApiNotFound)
        ));
        assert_eq!(
            missing.requests().len(),
            1,
            "discovery rejects the absent API"
        );
        missing.stop().await;

        let forbidden = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        forbidden.set_response(SyntheticResponse::RequestDenied);
        let client = build_test_client(&forbidden.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        assert!(matches!(
            collect_pods(
                &client,
                Arc::new(AtomicUsize::new(0)),
                "workloads",
                None,
                None
            )
            .await,
            Err(KubernetesError::Forbidden)
        ));
        assert_eq!(forbidden.requests().len(), 2, "403 must not retry");
        forbidden.stop().await;

        let unauthorized = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        unauthorized.set_response(SyntheticResponse::CredentialRejected);
        let client = build_test_client(&unauthorized.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        assert!(matches!(
            collect_pods(
                &client,
                Arc::new(AtomicUsize::new(0)),
                "workloads",
                None,
                None
            )
            .await,
            Err(KubernetesError::Unauthorized)
        ));
        assert_eq!(unauthorized.requests().len(), 2, "401 must not retry");
        unauthorized.stop().await;

        let trusted = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let wrong_authority = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("second synthetic server should start"));
        let kubeconfig = trusted.kubeconfig_with_authority(
            "context",
            "cluster",
            &wrong_authority.certificate_authority_base64(),
        );
        let client = build_test_client(&kubeconfig)
            .unwrap_or_else(|_| panic!("the wrong-authority client should be constructible"));
        assert!(matches!(
            collect_pods(
                &client,
                Arc::new(AtomicUsize::new(0)),
                "workloads",
                None,
                None
            )
            .await,
            Err(KubernetesError::CertificateInvalid)
        ));
        assert!(
            trusted.requests().is_empty(),
            "TLS failure must not reach HTTP"
        );
        trusted.stop().await;
        wrong_authority.stop().await;

        let expired = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        expired.set_response(SyntheticResponse::ExpiredContinuation);
        let client = build_test_client(&expired.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        let budget = Arc::new(AtomicUsize::new(0));
        assert!(matches!(
            collect_pods(&client, Arc::clone(&budget), "workloads", None, None).await,
            Err(KubernetesError::ContinuationExpired)
        ));
        assert_eq!(expired.requests().len(), 3);
        assert_eq!(budget.load(std::sync::atomic::Ordering::Acquire), 0);
        expired.stop().await;

        let missing_namespace = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        missing_namespace.set_response(SyntheticResponse::MissingNamespace);
        let client = build_test_client(&missing_namespace.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        assert!(matches!(
            collect_pods(
                &client,
                Arc::new(AtomicUsize::new(0)),
                "workloads",
                None,
                None
            )
            .await,
            Err(KubernetesError::NamespaceNotFound)
        ));
        assert_eq!(missing_namespace.requests().len(), 2);
        missing_namespace.stop().await;

        let empty = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        empty.set_response(SyntheticResponse::EmptyList);
        let client = build_test_client(&empty.kubeconfig("context", "cluster"))
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        let snapshot = collect_pods(
            &client,
            Arc::new(AtomicUsize::new(0)),
            "workloads",
            None,
            None,
        )
        .await
        .unwrap_or_else(|_| panic!("the empty list should be a valid snapshot"));
        assert!(snapshot.complete);
        assert!(snapshot.items.is_empty());
        assert_eq!(snapshot.resource_version, "42");
        empty.stop().await;
    }

    #[tokio::test]
    async fn rejects_an_unknown_credential_and_a_denied_request() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic server should start"));
        let kubeconfig = server.kubeconfig("synthetic-context", "synthetic-cluster");

        server.set_response(SyntheticResponse::CredentialRejected);
        let client = build_test_client(&kubeconfig)
            .unwrap_or_else(|_| panic!("synthetic kubeconfig should build a client"));
        let rejection = client
            .apiserver_version()
            .await
            .err()
            .unwrap_or_else(|| panic!("a rejected credential must fail"));
        assert!(matches!(rejection, kube::Error::Api(ref status) if status.code == 401));

        server.set_response(SyntheticResponse::RequestDenied);
        let denial = client
            .apiserver_version()
            .await
            .err()
            .unwrap_or_else(|| panic!("a denied request must fail"));
        assert!(matches!(denial, kube::Error::Api(ref status) if status.code == 403));
        server.stop().await;
    }
}
