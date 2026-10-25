//! Construction of a TLS-validating Kubernetes client from a selected kubeconfig.

use std::time::Duration;

use kube::client::ClientBuilder;
use kube::config::{AuthInfo, Config};
use secrecy::SecretString;

use super::KubernetesError;
use super::session::REQUEST_DEADLINE;
use super::watch_transport::WatchResponseLimitLayer;
use crate::storage::{KubeconfigError, KubeconfigIdentity, select_kubeconfig};

/// Connect deadline for one API server connection, shorter than the attempt.
///
/// A connection that cannot be established in ten seconds is treated as an
/// unavailable endpoint, so a black-holed address cannot consume the whole
/// fifteen-second request attempt before any byte is written.
const CONNECT_DEADLINE: Duration = Duration::from_secs(10);

/// Builds a client from exactly the supported fields of one validated kubeconfig.
///
/// The client is assembled field by field from
/// [`select_kubeconfig`](crate::storage::select_kubeconfig) rather than from
/// the raw document, so a Kubernetes SDK never sees exec plugins, legacy
/// `auth-provider` blocks, external file references, proxy settings, or an
/// insecure TLS flag: those are rejected during selection, before this function
/// can return a client.
///
/// The returned configuration deliberately differs from an inferred one:
///
/// - TLS verification is always on (`accept_invalid_certs` is false and no
///   root-CA file path is set, so an inline certificate authority is the only
///   trust source, with the operating-system verifier used when the kubeconfig
///   supplies none);
/// - no proxy, TLS server-name override, or extra header is taken from the
///   document or the environment;
/// - the SDK's own transient-failure retry is disabled, because the adapter
///   owns bounded retries rather than the transport;
/// - connect, read, and write timeouts are bounded by the attempt deadline.
///
/// # Errors
///
/// Returns [`KubernetesError::CredentialInvalid`] when the bytes no longer
/// select a supported credential, and [`KubernetesError::ClientUnavailable`]
/// when the transport cannot be constructed. No partial client is returned.
pub(super) fn build_client(source: &[u8]) -> Result<kube::Client, KubernetesError> {
    build_client_with_timeouts(source, Some(REQUEST_DEADLINE), Some(REQUEST_DEADLINE), None)
}

/// Builds the same validated client for a long-lived watch stream.
///
/// Kubernetes watches have no response-read deadline; their server-side
/// lifetime and watcher idle timeout bound the stream. Connection setup is
/// capped at ten seconds and request writes at five seconds. A Tower response
/// deadline bounds the whole attempt through response headers, and a body
/// wrapper caps each newline-delimited event before kube's JSON decoder while
/// leaving the established stream open during quiet periods.
pub(super) fn build_watch_client(source: &[u8]) -> Result<kube::Client, KubernetesError> {
    build_client_with_timeouts(
        source,
        None,
        Some(Duration::from_secs(5)),
        Some(REQUEST_DEADLINE),
    )
}

#[cfg(test)]
pub(super) fn build_watch_client_with_deadline(
    source: &[u8],
    deadline: Duration,
) -> Result<kube::Client, KubernetesError> {
    build_client_with_timeouts(source, None, Some(Duration::from_secs(5)), Some(deadline))
}

fn build_client_with_timeouts(
    source: &[u8],
    read_timeout: Option<Duration>,
    write_timeout: Option<Duration>,
    response_deadline: Option<Duration>,
) -> Result<kube::Client, KubernetesError> {
    let selected = select_kubeconfig(source).map_err(selection_error)?;
    let cluster_url = selected
        .server
        .as_str()
        .parse::<http::Uri>()
        .map_err(|_| KubernetesError::CredentialInvalid)?;

    let mut config = Config::new(cluster_url);
    config.root_cert = match &selected.certificate_authority_pem {
        Some(pem) => Some(certificate_roots(pem)?),
        None => None,
    };
    config.auth_info = auth_info(&selected.identity)?;
    config.accept_invalid_certs = false;
    config.root_cert_file = None;
    config.proxy_url = None;
    config.tls_server_name = None;
    config.default_retry = false;
    config.connect_timeout = Some(CONNECT_DEADLINE);
    config.read_timeout = read_timeout;
    config.write_timeout = write_timeout;

    let builder =
        ClientBuilder::try_from(config).map_err(|_| KubernetesError::ClientUnavailable)?;
    match response_deadline {
        Some(deadline) => Ok(builder
            .with_layer(&WatchResponseLimitLayer::new(deadline))
            .build()),
        None => Ok(builder.build()),
    }
}

/// Maps a kubeconfig selection failure onto the client error surface.
///
/// Import has already rejected every one of these categories, so reaching them
/// here means stored bytes no longer match what was imported.
fn selection_error(_error: KubeconfigError) -> KubernetesError {
    KubernetesError::CredentialInvalid
}

/// Parses an inline certificate authority bundle into its DER certificates.
///
/// Only `CERTIFICATE` blocks are kept: a bundle that carries no certificate, or
/// one that is not PEM at all, is a credential the adapter will not use.
fn certificate_roots(pem_bundle: &[u8]) -> Result<Vec<Vec<u8>>, KubernetesError> {
    let roots = pem::parse_many(pem_bundle)
        .map_err(|_| KubernetesError::CredentialInvalid)?
        .into_iter()
        .filter(|block| block.tag() == "CERTIFICATE")
        .map(pem::Pem::into_contents)
        .collect::<Vec<_>>();
    if roots.is_empty() {
        return Err(KubernetesError::CredentialInvalid);
    }
    Ok(roots)
}

/// Builds SDK authentication info from one supported inline identity.
///
/// Exactly one form is set, and the remaining credential fields stay at their
/// defaults, so a token file path, an exec plugin, or an impersonation header
/// cannot be inherited from anywhere.
fn auth_info(identity: &KubeconfigIdentity) -> Result<AuthInfo, KubernetesError> {
    let mut info = AuthInfo::default();
    match identity {
        KubeconfigIdentity::Token(token) => {
            info.token = Some(SecretString::from(token.as_str()));
        }
        KubeconfigIdentity::Basic { username, password } => {
            info.username = Some(username.to_string());
            info.password = Some(SecretString::from(password.as_str()));
        }
        KubeconfigIdentity::ClientCertificate {
            certificate_data,
            key_data,
        } => {
            // The SDK decodes these base64 fields itself, so the encoded form is
            // carried through unchanged rather than being re-encoded here.
            info.client_certificate_data = Some(certificate_data.to_string());
            info.client_key_data = Some(SecretString::from(key_data.as_str()));
        }
    }
    Ok(info)
}

#[cfg(test)]
mod tests {
    use super::{build_client, certificate_roots};
    use crate::kubernetes::KubernetesError;

    const KUBECONFIG_WITH_TOKEN: &str = r#"
apiVersion: v1
kind: Config
current-context: synthetic
clusters:
  - name: cluster-a
    cluster:
      server: https://127.0.0.1:6443
contexts:
  - name: synthetic
    context:
      cluster: cluster-a
      user: user-a
users:
  - name: user-a
    user:
      token: synthetic-token
"#;

    #[tokio::test]
    async fn builds_a_client_only_for_supported_inline_credentials() {
        assert!(build_client(KUBECONFIG_WITH_TOKEN.as_bytes()).is_ok());

        let exec = KUBECONFIG_WITH_TOKEN.replace(
            "      token: synthetic-token",
            "      exec:\n        command: /synthetic/plugin",
        );
        assert!(matches!(
            build_client(exec.as_bytes()),
            Err(KubernetesError::CredentialInvalid)
        ));

        let external = KUBECONFIG_WITH_TOKEN.replace(
            "      token: synthetic-token",
            "      client-key: /synthetic/key.pem",
        );
        assert!(matches!(
            build_client(external.as_bytes()),
            Err(KubernetesError::CredentialInvalid)
        ));

        let insecure = KUBECONFIG_WITH_TOKEN.replace(
            "      server: https://127.0.0.1:6443",
            "      server: https://127.0.0.1:6443\n      insecure-skip-tls-verify: true",
        );
        assert!(matches!(
            build_client(insecure.as_bytes()),
            Err(KubernetesError::CredentialInvalid)
        ));
    }

    #[test]
    fn rejects_a_certificate_authority_that_is_not_a_certificate() {
        let invalid_ca = KUBECONFIG_WITH_TOKEN.replace(
            "      server: https://127.0.0.1:6443",
            "      server: https://127.0.0.1:6443\n      certificate-authority-data: ZmFrZS1jYQ==",
        );
        assert!(matches!(
            build_client(invalid_ca.as_bytes()),
            Err(KubernetesError::CredentialInvalid)
        ));
    }

    #[test]
    fn rejects_an_empty_or_non_certificate_authority_bundle() {
        assert!(matches!(
            certificate_roots(b"not a certificate bundle"),
            Err(KubernetesError::CredentialInvalid)
        ));
        assert!(matches!(
            certificate_roots(&[]),
            Err(KubernetesError::CredentialInvalid)
        ));
    }
}
