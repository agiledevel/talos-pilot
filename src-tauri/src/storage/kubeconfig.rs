//! Bounded validation of imported Kubernetes kubeconfig documents.

use serde::Deserialize;
use serde::de::IgnoredAny;
use serde_saphyr::{from_slice_with_options, options};

use crate::secret::{SensitiveString, decodes_to_nonempty_base64};

const MAX_DOCUMENT_BYTES: usize = 4 * 1024 * 1024;
const MAX_NAMED_ENTRIES: usize = 256;
const MAX_NAME_BYTES: usize = 128;

/// A safe reason that a selected file is not an importable kubeconfig.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum KubeconfigError {
    /// The file is empty or exceeds the import size bound.
    #[error("the selected file exceeds the supported size")]
    TooLarge,
    /// The YAML document is malformed, duplicate-keyed, or structurally invalid.
    #[error("the selected file is not a valid kubeconfig")]
    InvalidDocument,
    /// The document selects a context that has no supported inline credentials.
    #[error("the selected kubeconfig context has no supported credentials")]
    MissingCredentials,
    /// The file contains an executable authentication plugin.
    #[error("kubeconfig exec authentication is not supported")]
    ExecAuthentication,
    /// The file contains legacy external auth-provider configuration.
    #[error("kubeconfig auth-provider authentication is not supported")]
    AuthProvider,
    /// Credentials or certificate authorities refer to external files.
    #[error("external credential file references are not supported")]
    ExternalFileReference,
    /// The kubeconfig uses an insecure or unsupported cluster endpoint.
    #[error("the kubeconfig cluster endpoint is invalid or insecure")]
    InvalidEndpoint,
}

/// Nonsensitive identity of the current kubeconfig context after validation.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct KubeconfigMetadata {
    /// Bounded display name selected by `current-context`.
    pub context_name: String,
}

/// Validates a bounded kubeconfig and returns only its selected context label.
///
/// Secret fields deserialize into zeroizing strings. Arbitrary exec, legacy
/// provider, and external-path values use `IgnoredAny`, so validation can
/// reject them without allocating their contents into ordinary strings.
/// Unknown YAML tags and multi-document streams are rejected; parser budgets
/// are tighter than the file-size limit.
///
/// # Errors
///
/// Returns a static category for size, YAML, unsupported authentication,
/// external path, endpoint, or context validation failures. Parser details and
/// source snippets are never included in the error value.
pub fn validate_kubeconfig(bytes: &[u8]) -> Result<KubeconfigMetadata, KubeconfigError> {
    if bytes.is_empty() || bytes.len() > MAX_DOCUMENT_BYTES {
        return Err(KubeconfigError::TooLarge);
    }
    let config: Kubeconfig = from_slice_with_options(
        bytes,
        options! {
            emit_comments: false,
            reject_unsupported_tags: true,
            budget: serde_saphyr::budget! {
                max_documents: 1,
                max_depth: 32,
                max_events: 100_000,
                max_nodes: 50_000,
                max_total_scalar_bytes: MAX_DOCUMENT_BYTES,
                max_total_comment_bytes: 0,
                max_anchors: 256,
                max_aliases: 512,
                max_recorded_anchor_bytes: MAX_DOCUMENT_BYTES,
                max_recorded_anchor_events: 50_000,
                max_merge_keys: 256,
            },
        },
    )
    .map_err(|_| KubeconfigError::InvalidDocument)?;

    if config.api_version != "v1" || config.kind != "Config" {
        return Err(KubeconfigError::InvalidDocument);
    }
    if config.clusters.is_empty()
        || config.contexts.is_empty()
        || config.users.is_empty()
        || config.clusters.len() > MAX_NAMED_ENTRIES
        || config.contexts.len() > MAX_NAMED_ENTRIES
        || config.users.len() > MAX_NAMED_ENTRIES
        || !bounded_name(&config.current_context)
    {
        return Err(KubeconfigError::InvalidDocument);
    }

    unique_names(config.clusters.iter().map(|entry| entry.name.as_str()))?;
    unique_names(config.contexts.iter().map(|entry| entry.name.as_str()))?;
    unique_names(config.users.iter().map(|entry| entry.name.as_str()))?;

    for cluster in &config.clusters {
        if cluster.cluster.certificate_authority.is_some() {
            return Err(KubeconfigError::ExternalFileReference);
        }
        if cluster
            .cluster
            .certificate_authority_data
            .as_ref()
            .is_some_and(|value| !decodes_to_nonempty_base64(value.expose()))
        {
            return Err(KubeconfigError::InvalidDocument);
        }
        if cluster.cluster.insecure_skip_tls_verify.unwrap_or(false)
            || !valid_endpoint(cluster.cluster.server.expose())
        {
            return Err(KubeconfigError::InvalidEndpoint);
        }
    }

    for user in &config.users {
        if user.user.exec.is_some() {
            return Err(KubeconfigError::ExecAuthentication);
        }
        if user.user.auth_provider.is_some() {
            return Err(KubeconfigError::AuthProvider);
        }
        if user.user.client_certificate.is_some()
            || user.user.client_key.is_some()
            || user.user.token_file.is_some()
        {
            return Err(KubeconfigError::ExternalFileReference);
        }
        let has_client_certificate = user
            .user
            .client_certificate_data
            .as_ref()
            .is_some_and(|value| !value.is_empty());
        let has_client_key = user
            .user
            .client_key_data
            .as_ref()
            .is_some_and(|value| !value.is_empty());
        if has_client_certificate != has_client_key {
            return Err(KubeconfigError::MissingCredentials);
        }
        if user
            .user
            .client_certificate_data
            .as_ref()
            .is_some_and(|value| !decodes_to_nonempty_base64(value.expose()))
            || user
                .user
                .client_key_data
                .as_ref()
                .is_some_and(|value| !decodes_to_nonempty_base64(value.expose()))
        {
            return Err(KubeconfigError::InvalidDocument);
        }
    }

    for context in &config.contexts {
        if !config
            .clusters
            .iter()
            .any(|cluster| cluster.name == context.context.cluster)
            || context
                .context
                .user
                .as_ref()
                .is_some_and(|user_name| !config.users.iter().any(|user| user.name == *user_name))
        {
            return Err(KubeconfigError::InvalidDocument);
        }
    }

    let selected_context = config
        .contexts
        .iter()
        .find(|context| context.name == config.current_context)
        .ok_or(KubeconfigError::InvalidDocument)?;
    let selected_user_name = selected_context
        .context
        .user
        .as_deref()
        .ok_or(KubeconfigError::MissingCredentials)?;
    let selected_user = config
        .users
        .iter()
        .find(|user| user.name == selected_user_name)
        .ok_or(KubeconfigError::InvalidDocument)?;
    if !selected_user.user.has_supported_credentials() {
        return Err(KubeconfigError::MissingCredentials);
    }

    Ok(KubeconfigMetadata {
        context_name: config.current_context,
    })
}

fn bounded_name(name: &str) -> bool {
    !name.is_empty()
        && name.len() <= MAX_NAME_BYTES
        && !name.chars().any(|character| {
            character.is_control()
                || matches!(
                    character,
                    '\u{202a}'..='\u{202e}' | '\u{2066}'..='\u{2069}'
                )
        })
}

fn unique_names<'a>(names: impl Iterator<Item = &'a str>) -> Result<(), KubeconfigError> {
    let mut seen = std::collections::HashSet::new();
    for name in names {
        if !bounded_name(name) || !seen.insert(name) {
            return Err(KubeconfigError::InvalidDocument);
        }
    }
    Ok(())
}

fn valid_endpoint(endpoint: &str) -> bool {
    let Some((scheme, authority_and_path)) = endpoint.split_once("://") else {
        return false;
    };
    let Some(authority) = authority_and_path.split('/').next() else {
        return false;
    };
    if scheme != "https"
        || authority.contains('@')
        || endpoint.contains('?')
        || endpoint.contains('#')
    {
        return false;
    }
    url::Url::parse(endpoint).is_ok_and(|url| {
        url.scheme() == "https"
            && url.host_str().is_some_and(|host| !host.is_empty())
            && url.username().is_empty()
            && url.password().is_none()
            && url.fragment().is_none()
    })
}

#[derive(Deserialize)]
struct Kubeconfig {
    #[serde(rename = "apiVersion")]
    api_version: String,
    kind: String,
    #[serde(rename = "current-context")]
    current_context: String,
    clusters: Vec<NamedCluster>,
    contexts: Vec<NamedContext>,
    users: Vec<NamedUser>,
}

#[derive(Deserialize)]
struct NamedCluster {
    name: String,
    cluster: Cluster,
}

#[derive(Deserialize)]
struct Cluster {
    server: SensitiveString,
    #[serde(rename = "certificate-authority-data")]
    certificate_authority_data: Option<SensitiveString>,
    #[serde(rename = "certificate-authority")]
    certificate_authority: Option<IgnoredAny>,
    #[serde(rename = "insecure-skip-tls-verify")]
    insecure_skip_tls_verify: Option<bool>,
}

#[derive(Deserialize)]
struct NamedContext {
    name: String,
    context: Context,
}

#[derive(Deserialize)]
struct Context {
    cluster: String,
    user: Option<String>,
}

#[derive(Deserialize)]
struct NamedUser {
    name: String,
    user: User,
}

#[derive(Deserialize)]
struct User {
    token: Option<SensitiveString>,
    username: Option<SensitiveString>,
    password: Option<SensitiveString>,
    #[serde(rename = "client-certificate-data")]
    client_certificate_data: Option<SensitiveString>,
    #[serde(rename = "client-key-data")]
    client_key_data: Option<SensitiveString>,
    #[serde(rename = "client-certificate")]
    client_certificate: Option<IgnoredAny>,
    #[serde(rename = "client-key")]
    client_key: Option<IgnoredAny>,
    #[serde(rename = "tokenFile")]
    token_file: Option<IgnoredAny>,
    #[serde(rename = "auth-provider")]
    auth_provider: Option<IgnoredAny>,
    exec: Option<IgnoredAny>,
}

impl User {
    fn has_supported_credentials(&self) -> bool {
        self.token.as_ref().is_some_and(|value| !value.is_empty())
            || (self
                .username
                .as_ref()
                .is_some_and(|value| !value.is_empty())
                && self
                    .password
                    .as_ref()
                    .is_some_and(|value| !value.is_empty()))
            || (self
                .client_certificate_data
                .as_ref()
                .is_some_and(|value| !value.is_empty())
                && self
                    .client_key_data
                    .as_ref()
                    .is_some_and(|value| !value.is_empty()))
    }
}

#[cfg(test)]
mod tests {
    use super::{KubeconfigError, validate_kubeconfig};

    const VALID_CONFIG: &str = r#"
apiVersion: v1
kind: Config
current-context: demo
clusters:
  - name: cluster-a
    cluster:
      server: https://127.0.0.1:6443
      certificate-authority-data: ZmFrZS1jYQ==
contexts:
  - name: demo
    context:
      cluster: cluster-a
      user: user-a
users:
  - name: user-a
    user:
      token: synthetic-token
"#;

    #[test]
    fn validates_inline_credentials_and_returns_only_context_metadata() {
        assert_eq!(
            validate_kubeconfig(VALID_CONFIG.as_bytes()),
            Ok(super::KubeconfigMetadata {
                context_name: "demo".to_owned()
            })
        );
    }

    #[test]
    fn rejects_exec_before_any_client_can_process_the_document() {
        let config = VALID_CONFIG.replace(
            "      token: synthetic-token",
            "      exec:\n        command: /synthetic/plugin",
        );
        assert_eq!(
            validate_kubeconfig(config.as_bytes()),
            Err(KubeconfigError::ExecAuthentication)
        );
    }

    #[test]
    fn rejects_auth_provider_and_external_secret_paths() {
        let auth_provider = VALID_CONFIG.replace(
            "      token: synthetic-token",
            "      auth-provider:\n        name: synthetic",
        );
        assert_eq!(
            validate_kubeconfig(auth_provider.as_bytes()),
            Err(KubeconfigError::AuthProvider)
        );
        let external = VALID_CONFIG.replace(
            "      token: synthetic-token",
            "      client-key: /synthetic/key.pem",
        );
        assert_eq!(
            validate_kubeconfig(external.as_bytes()),
            Err(KubeconfigError::ExternalFileReference)
        );
    }

    #[test]
    fn rejects_duplicate_keys_invalid_tls_and_missing_current_credentials() {
        let duplicate = VALID_CONFIG.replace(
            "current-context: demo",
            "current-context: demo\ncurrent-context: other",
        );
        assert_eq!(
            validate_kubeconfig(duplicate.as_bytes()),
            Err(KubeconfigError::InvalidDocument)
        );
        let insecure = VALID_CONFIG.replace(
            "      server: https://127.0.0.1:6443",
            "      server: https://127.0.0.1:6443\n      insecure-skip-tls-verify: true",
        );
        assert_eq!(
            validate_kubeconfig(insecure.as_bytes()),
            Err(KubeconfigError::InvalidEndpoint)
        );
        let plaintext = VALID_CONFIG.replace("https://127.0.0.1", "http://127.0.0.1");
        assert_eq!(
            validate_kubeconfig(plaintext.as_bytes()),
            Err(KubeconfigError::InvalidEndpoint)
        );
        let missing = VALID_CONFIG.replace("user: user-a", "user: missing");
        assert_eq!(
            validate_kubeconfig(missing.as_bytes()),
            Err(KubeconfigError::InvalidDocument)
        );
        let invalid_certificate = VALID_CONFIG.replace(
            "certificate-authority-data: ZmFrZS1jYQ==",
            "certificate-authority-data: invalid-base64",
        );
        assert_eq!(
            validate_kubeconfig(invalid_certificate.as_bytes()),
            Err(KubeconfigError::InvalidDocument)
        );
    }

    #[test]
    fn rejects_malformed_documents_and_size_overflow() {
        assert_eq!(
            validate_kubeconfig(b"not: [valid"),
            Err(KubeconfigError::InvalidDocument)
        );
        assert_eq!(
            validate_kubeconfig(&vec![b' '; 4 * 1024 * 1024 + 1]),
            Err(KubeconfigError::TooLarge)
        );
        let unsafe_name = VALID_CONFIG.replace("demo", "unsafe\ncontext");
        assert_eq!(
            validate_kubeconfig(unsafe_name.as_bytes()),
            Err(KubeconfigError::InvalidDocument)
        );
    }
}
