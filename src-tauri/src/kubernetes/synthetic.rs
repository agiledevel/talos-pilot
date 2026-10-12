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
        atomic::{AtomicU8, Ordering},
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
        let requests = Arc::new(Mutex::new(Vec::new()));
        let (shutdown, mut shutdown_signal) = tokio::sync::oneshot::channel();

        let task_response = Arc::clone(&response);
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
                        let requests = Arc::clone(&task_requests);
                        let token = task_token.clone();
                        tokio::spawn(async move {
                            let _ = tokio::time::timeout(
                                CONNECTION_DEADLINE,
                                serve_connection(stream, acceptor, response, requests, token),
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
        }
    }

    fn from_code(code: u8) -> Self {
        match code {
            1 => Self::CredentialRejected,
            2 => Self::RequestDenied,
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

    let selected = SyntheticResponse::from_code(response.load(Ordering::SeqCst));
    let authorised = request
        .authorization
        .as_deref()
        .is_some_and(|value| value == format!("Bearer {token}"));
    let (status, body) = match selected {
        SyntheticResponse::Success if authorised => version_response(&request.path),
        SyntheticResponse::Success => (
            "401 Unauthorized",
            status_body(401, "Unauthorized", "synthetic rejection"),
        ),
        SyntheticResponse::CredentialRejected => (
            "401 Unauthorized",
            status_body(401, "Unauthorized", "synthetic rejection"),
        ),
        SyntheticResponse::RequestDenied => (
            "403 Forbidden",
            status_body(403, "Forbidden", "synthetic denial"),
        ),
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
        _ => (
            "404 Not Found",
            status_body(404, "NotFound", "synthetic endpoint not found"),
        ),
    }
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
    use super::{SyntheticApiserver, SyntheticResponse, build_test_client};

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
