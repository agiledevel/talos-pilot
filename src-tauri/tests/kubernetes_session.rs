//! Integration coverage for the Kubernetes credential and session boundary.
//!
//! Every case here runs the real storage boundary, the real credential handle,
//! the real `kube` client, and real TLS against the synthetic API server in
//! `kubernetes::synthetic`. No cluster is involved: the first live cluster read
//! belongs to the following packet. The file is compiled only with the
//! `native-test` feature, because the synthetic server and the isolated storage
//! runtime are test-only.

#![cfg(feature = "native-test")]

use secrecy::{ExposeSecret, SecretBox};
use talos_pilot::kubernetes::synthetic::{SyntheticApiserver, SyntheticResponse};
use talos_pilot::kubernetes::{KubernetesError, KubernetesSessionStore};
use talos_pilot::storage::{StorageRuntime, validate_kubeconfig};

/// A synthetic bearer token that must never appear in an error or a listing.
const SENTINEL_TOKEN: &str = "synthetic-credential-sentinel-value";

/// Imports one kubeconfig into an isolated runtime and returns its handle.
fn import(runtime: &mut StorageRuntime, kubeconfig: &str) -> String {
    let source = SecretBox::new(kubeconfig.as_bytes().to_vec().into_boxed_slice());
    let metadata = validate_kubeconfig(source.expose_secret())
        .unwrap_or_else(|_| panic!("synthetic kubeconfig should validate"));
    runtime
        .store_kubeconfig(&metadata, source)
        .unwrap_or_else(|_| panic!("synthetic kubeconfig should store"))
        .handle
}

#[tokio::test]
async fn imports_a_synthetic_credential_and_reads_the_version_through_the_real_client() {
    let server = SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("synthetic server should start"));
    let kubeconfig = server.kubeconfig("synthetic-context", "synthetic-cluster");
    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated runtime should open"));

    let handle = import(&mut runtime, &kubeconfig);
    assert!(handle.starts_with("kubecred-"));

    // The listing is an explicit action and reports the credential's own mode.
    let listing = runtime
        .list_kubeconfig_credentials()
        .unwrap_or_else(|_| panic!("explicit listing should succeed"));
    assert_eq!(listing.len(), 1);
    assert_eq!(listing[0].handle, handle);
    assert_eq!(listing[0].context_label, "synthetic-context");

    let resolved = runtime
        .resolve_kubeconfig_credential(&handle)
        .unwrap_or_else(|_| panic!("imported handle should resolve"));
    assert_eq!(resolved.context_label, "synthetic-context");
    let sessions = KubernetesSessionStore::new();
    let session = sessions
        .open(&resolved)
        .unwrap_or_else(|_| panic!("session should open"));
    let version = sessions
        .apiserver_version(&session.session_id)
        .await
        .unwrap_or_else(|_| panic!("version read should succeed"));
    assert_eq!(version.version, "v1.36.5");
    assert_eq!(version.major, "1");
    assert_eq!(version.minor, "36");

    // The read reached the injected endpoint exactly once, authenticated with
    // the imported credential: no ambient configuration was consulted.
    let requests = server.requests();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].path, "/version");
    assert_eq!(
        requests[0].authorization.as_deref(),
        Some(format!("Bearer {}", server.token()).as_str())
    );

    assert_eq!(sessions.close(&session.session_id), Ok(true));
    assert_eq!(
        sessions.apiserver_version(&session.session_id).await.err(),
        Some(KubernetesError::SessionUnknown)
    );
    server.stop().await;
}

#[tokio::test]
async fn rejects_a_certificate_authority_that_does_not_match_the_endpoint() {
    let server = SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("synthetic server should start"));
    let other = SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("second synthetic server should start"));
    let mismatched = server.kubeconfig_with_authority(
        "synthetic-context",
        "synthetic-cluster",
        &other.certificate_authority_base64(),
    );

    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated runtime should open"));
    let handle = import(&mut runtime, &mismatched);
    let resolved = runtime
        .resolve_kubeconfig_credential(&handle)
        .unwrap_or_else(|_| panic!("imported handle should resolve"));
    let sessions = KubernetesSessionStore::new();
    let session = sessions
        .open(&resolved)
        .unwrap_or_else(|_| panic!("session should open before the handshake"));

    assert_eq!(
        sessions.apiserver_version(&session.session_id).await.err(),
        Some(KubernetesError::CertificateInvalid),
        "a mismatched authority must fail TLS validation, never downgrade it"
    );
    server.stop().await;
    other.stop().await;
}

#[tokio::test]
async fn classifies_rejected_and_denied_requests_without_leaking_credential_material() {
    let server = SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("synthetic server should start"));
    let kubeconfig = server
        .kubeconfig("synthetic-context", "synthetic-cluster")
        .replace(server.token(), SENTINEL_TOKEN);
    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated runtime should open"));
    let handle = import(&mut runtime, &kubeconfig);
    let resolved = runtime
        .resolve_kubeconfig_credential(&handle)
        .unwrap_or_else(|_| panic!("imported handle should resolve"));
    let sessions = KubernetesSessionStore::new();
    let session = sessions
        .open(&resolved)
        .unwrap_or_else(|_| panic!("session should open"));

    server.set_response(SyntheticResponse::CredentialRejected);
    let rejection = sessions
        .apiserver_version(&session.session_id)
        .await
        .err()
        .unwrap_or_else(|| panic!("a rejected credential must fail"));
    assert_eq!(rejection, KubernetesError::Unauthorized);
    let rejection_text = format!("{rejection} {rejection:?}");
    assert!(
        !rejection_text.contains(SENTINEL_TOKEN),
        "an error must never carry credential material"
    );

    server.set_response(SyntheticResponse::RequestDenied);
    assert_eq!(
        sessions.apiserver_version(&session.session_id).await.err(),
        Some(KubernetesError::Forbidden)
    );

    // The listing reports the label but never the token or the raw kubeconfig.
    server.set_response(SyntheticResponse::Success);
    for summary in runtime
        .list_kubeconfig_credentials()
        .unwrap_or_else(|_| panic!("explicit listing should succeed"))
    {
        let rendered = format!("{} {}", summary.handle, summary.context_label);
        assert!(!rendered.contains(SENTINEL_TOKEN));
        assert!(!rendered.contains("apiVersion"));
    }
    server.stop().await;
}

#[tokio::test]
async fn reports_an_unreachable_endpoint_as_unavailable() {
    let server = SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("synthetic server should start"));
    let kubeconfig = server.kubeconfig("synthetic-context", "synthetic-cluster");
    assert!(
        server.requests().is_empty(),
        "the synthetic endpoint must not be contacted before the read"
    );

    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated runtime should open"));
    let handle = import(&mut runtime, &kubeconfig);
    let resolved = runtime
        .resolve_kubeconfig_credential(&handle)
        .unwrap_or_else(|_| panic!("imported handle should resolve"));

    // Stopping the server releases its listener without leaving the port bound,
    // so the read below is refused rather than served or time-limited.
    server.stop().await;
    let sessions = KubernetesSessionStore::new();
    let session = sessions
        .open(&resolved)
        .unwrap_or_else(|_| panic!("session should open before the connection attempt"));

    let started = std::time::Instant::now();
    let outcome = sessions.apiserver_version(&session.session_id).await;
    assert_eq!(
        outcome.err(),
        Some(KubernetesError::Unavailable),
        "a refused connection must be reported as an unavailable endpoint"
    );
    // A refused connection fails immediately; only a stalled handshake would
    // consume the attempt deadline, so this separates the two causes.
    assert!(
        started.elapsed() < std::time::Duration::from_secs(10),
        "an unreachable endpoint must fail without waiting for the attempt deadline"
    );
}

#[tokio::test]
async fn resolves_no_ambient_credential_for_an_unknown_handle() {
    let sessions = KubernetesSessionStore::new();
    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated runtime should open"));

    // An empty store resolves nothing, and an unknown handle is refused rather
    // than replaced by a default or in-cluster credential.
    assert!(
        runtime
            .list_kubeconfig_credentials()
            .unwrap_or_else(|_| panic!("empty listing should succeed"))
            .is_empty()
    );
    for handle in [
        "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
        "kubecred-",
        "synthetic-token",
        "",
    ] {
        assert!(matches!(
            runtime.resolve_kubeconfig_credential(handle),
            Err(talos_pilot::storage::StorageError::UnknownCredential)
        ));
    }
    assert_eq!(sessions.close("kube-session-1"), Ok(false));
    assert_eq!(
        sessions.apiserver_version("kube-session-1").await.err(),
        Some(KubernetesError::SessionUnknown)
    );
}
