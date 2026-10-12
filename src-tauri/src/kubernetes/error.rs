//! Stable, redacted failure categories for Kubernetes clients and sessions.

use std::error::Error as _;

/// Safe failure category for Kubernetes client and session operations.
///
/// Every variant maps to one stable application error code in the native
/// command layer. A variant never carries an SDK message, a credential, a
/// kubeconfig, or a raw cluster response, so a failure cannot leak cluster or
/// credential content into application IPC or logs.
#[derive(Clone, Copy, Debug, Eq, PartialEq, thiserror::Error)]
pub enum KubernetesError {
    /// The stored bytes no longer select a supported kubeconfig credential.
    #[error("the Kubernetes credential is not a supported kubeconfig")]
    CredentialInvalid,
    /// The adapter already owns its maximum number of sessions.
    #[error("the Kubernetes session limit is reached")]
    SessionLimit,
    /// The named session is unknown or was already closed.
    #[error("the Kubernetes session is unknown")]
    SessionUnknown,
    /// Every admitted-request slot is in use.
    #[error("the Kubernetes request capacity is exhausted")]
    CapacityExceeded,
    /// The API server rejected the credential itself.
    #[error("the Kubernetes API server rejected the credential")]
    Unauthorized,
    /// The API server authenticated the caller but denied the request.
    #[error("the Kubernetes API server denied the request")]
    Forbidden,
    /// TLS validation rejected the API server certificate.
    #[error("Kubernetes TLS validation failed")]
    CertificateInvalid,
    /// The API server could not be reached, did not answer in time, or answered
    /// with a transient server-side failure.
    #[error("the Kubernetes API server is unavailable")]
    Unavailable,
    /// The API server answered with a status or payload this adapter does not
    /// support, which is not a transient condition.
    #[error("the Kubernetes API response is not supported")]
    UnsupportedResponse,
    /// The adapter could not construct a client for the selected credential.
    #[error("the Kubernetes client could not be constructed")]
    ClientUnavailable,
    /// The backend session registry is inaccessible after a panic.
    #[error("the Kubernetes session registry is unavailable")]
    RegistryUnavailable,
}

impl KubernetesError {
    /// Maps one `kube` client failure onto a stable safe category.
    ///
    /// Classification inspects the SDK error and its source chain. The resulting
    /// category is what reaches the renderer; the SDK message is never
    /// forwarded, and the caller drops the raw error.
    ///
    /// An API status is mapped by class rather than lumped together: a rejected
    /// credential, a denial, and a transient server-side failure are distinct
    /// outcomes, and only the transient class may be retried. Any other status
    /// is a response this adapter does not support, and is never retried. A
    /// decode failure is likewise a response problem rather than an unavailable
    /// server. Every remaining failure — a refused connection, a stalled
    /// handshake, a transport error — is treated as an unavailable endpoint,
    /// which is the only server-side category here that invites a retry.
    pub(super) fn from_kube(error: &kube::Error) -> Self {
        match error {
            kube::Error::Api(status) => match status.code {
                401 => Self::Unauthorized,
                403 => Self::Forbidden,
                429 | 500 | 502 | 503 | 504 => Self::Unavailable,
                _ => Self::UnsupportedResponse,
            },
            kube::Error::SerdeError(_) => Self::UnsupportedResponse,
            _ if describes_certificate_failure(error) => Self::CertificateInvalid,
            _ => Self::Unavailable,
        }
    }
}

/// Reports whether an SDK error chain names a TLS or certificate failure.
///
/// A certificate verification failure reaches the client wrapped in one or more
/// transport errors whose own messages vary, and the concrete Rustls error type
/// is not nameable from this crate without taking a direct dependency on the
/// TLS stack. The chain is therefore matched against the Rustls text for a
/// rejected peer certificate, which the mismatched-authority integration test
/// exercises against the real client, and the unit tests below pin both the
/// matching and the non-matching case.
fn describes_certificate_failure(error: &kube::Error) -> bool {
    const MARKERS: [&str; 5] = [
        "invalid peer certificate",
        "unknownissuer",
        "certificateexpired",
        "notvalidfor",
        "certificate verify failed",
    ];

    let mut current = error.source();
    while let Some(source) = current {
        let message = source.to_string().to_ascii_lowercase();
        if MARKERS.iter().any(|marker| message.contains(marker)) {
            return true;
        }
        current = source.source();
    }
    false
}

#[cfg(test)]
mod tests {
    use super::KubernetesError;

    /// Stands in for a Rustls verification failure inside an SDK error chain.
    #[derive(Debug)]
    struct SyntheticCertificateFailure;

    impl std::fmt::Display for SyntheticCertificateFailure {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("invalid peer certificate: UnknownIssuer")
        }
    }

    impl std::error::Error for SyntheticCertificateFailure {}

    /// Wraps a cause without naming it, as the transport layers do.
    #[derive(Debug)]
    struct NeutralTransportContext(SyntheticCertificateFailure);

    impl std::fmt::Display for NeutralTransportContext {
        fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
            formatter.write_str("synthetic transport context")
        }
    }

    impl std::error::Error for NeutralTransportContext {
        fn source(&self) -> Option<&(dyn std::error::Error + 'static)> {
            Some(&self.0)
        }
    }

    #[test]
    fn api_status_codes_map_to_permission_categories() {
        for (code, expected) in [
            (401, KubernetesError::Unauthorized),
            (403, KubernetesError::Forbidden),
            (429, KubernetesError::Unavailable),
            (500, KubernetesError::Unavailable),
            (503, KubernetesError::Unavailable),
            (404, KubernetesError::UnsupportedResponse),
            (405, KubernetesError::UnsupportedResponse),
        ] {
            let status = kube::core::Status {
                code,
                ..kube::core::Status::default()
            };
            let error = kube::Error::Api(Box::new(status));
            assert_eq!(KubernetesError::from_kube(&error), expected);
        }
    }

    #[test]
    fn certificate_failures_are_classified_from_the_error_chain() {
        let certificate = kube::Error::Service(Box::new(SyntheticCertificateFailure));
        assert_eq!(
            KubernetesError::from_kube(&certificate),
            KubernetesError::CertificateInvalid
        );

        // The certificate text sits behind a layer that does not name it, so
        // classification has to walk the chain rather than read one message.
        let wrapped = kube::Error::Service(Box::new(NeutralTransportContext(
            SyntheticCertificateFailure,
        )));
        assert_eq!(
            KubernetesError::from_kube(&wrapped),
            KubernetesError::CertificateInvalid
        );

        let deeper = kube::Error::Service(Box::new(std::io::Error::other(
            NeutralTransportContext(SyntheticCertificateFailure),
        )));
        assert_eq!(
            KubernetesError::from_kube(&deeper),
            KubernetesError::CertificateInvalid
        );

        let transport = kube::Error::Service(Box::new(std::io::Error::other(
            "synthetic transport failure",
        )));
        assert_eq!(
            KubernetesError::from_kube(&transport),
            KubernetesError::Unavailable
        );

        // A malformed response body is a payload problem, not an unavailable
        // server, so it must not invite a retry.
        let malformed = serde_json::from_str::<u32>("not a number")
            .err()
            .map(kube::Error::SerdeError)
            .unwrap_or_else(|| panic!("synthetic payload must fail to decode"));
        assert_eq!(
            KubernetesError::from_kube(&malformed),
            KubernetesError::UnsupportedResponse
        );
    }
}
