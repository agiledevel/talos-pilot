//! Live preflight and list coverage for the single allowlisted Kubernetes fixture.
//!
//! The test reads credentials only through an explicit file reference, validates
//! the selected context, API endpoint, and CA fingerprint before opening the
//! production Kubernetes adapter, then reads the API version through that
//! adapter. Later F3 steps extend this same harness with namespaced setup,
//! restricted reads, and UID-anchored cleanup.

#![cfg(feature = "native-test")]

use std::{
    fs,
    io::Read,
    path::{Path, PathBuf},
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};
use k8s_openapi::api::core::v1::Namespace;
use kube::{
    Api,
    api::{DeleteParams, PostParams},
};
use secrecy::{ExposeSecret, SecretBox};
use sha2::{Digest, Sha256};
use talos_pilot::{
    kubernetes::KubernetesSessionStore,
    storage::{StorageRuntime, validate_kubeconfig},
};
use zeroize::Zeroizing;

const EXPECTED_ENDPOINT: &str = "https://10.79.0.1:6443";
const EXPECTED_VERSION: &str = "v1.36.5";
const EXPECTED_CONTEXT: &str = "admin@talos-pilot-c4-20261009";
const EXPECTED_NAMESPACE: &str = "talos-pilot-list-probe";
const MAX_CREDENTIAL_BYTES: u64 = 4 * 1024 * 1024;

#[tokio::test]
#[ignore = "requires the allowlisted Talos/Kubernetes fixture"]
async fn live_fixture_preflight_checks_identity_and_server_version() {
    assert!(
        std::env::var_os("KUBECONFIG").is_none(),
        "the live harness must not inherit ambient kube configuration"
    );
    let manifest_path = checked_manifest_input();
    let kubeconfig_path = external_input("TALOS_PILOT_KUBERNETES_FIXTURE_ADMIN_KUBECONFIG");
    let manifest = read_manifest(&manifest_path);
    let mut raw_kubeconfig = read_credential(&kubeconfig_path);
    let validation = validate_kubeconfig(&raw_kubeconfig).unwrap_or_else(|_| {
        panic!("the explicit fixture kubeconfig must pass the import validator")
    });
    assert_eq!(validation.context_name, EXPECTED_CONTEXT);

    // Read only identity metadata from the already-validated file. Endpoint and
    // CA mismatches fail before a client request or any fixture mutation.
    let text = std::str::from_utf8(&raw_kubeconfig)
        .unwrap_or_else(|_| panic!("fixture kubeconfig must be valid UTF-8"));
    let parsed = kube::config::Kubeconfig::from_yaml(text)
        .unwrap_or_else(|_| panic!("fixture kubeconfig must parse as one config"));
    assert_eq!(parsed.current_context.as_deref(), Some(EXPECTED_CONTEXT));
    let selected_context = parsed
        .contexts
        .iter()
        .find(|context| context.name == EXPECTED_CONTEXT)
        .and_then(|context| context.context.as_ref())
        .unwrap_or_else(|| panic!("fixture kubeconfig must select its allowlisted context"));
    let cluster = parsed
        .clusters
        .iter()
        .find(|cluster| cluster.name == selected_context.cluster)
        .and_then(|cluster| cluster.cluster.as_ref())
        .unwrap_or_else(|| panic!("fixture kubeconfig must define its selected cluster"));
    assert_eq!(cluster.server.as_deref(), Some(EXPECTED_ENDPOINT));
    assert_eq!(
        manifest["kubernetes"]["endpoint"].as_str(),
        Some(EXPECTED_ENDPOINT)
    );
    assert_eq!(
        manifest["kubernetes"]["contextName"].as_str(),
        Some(EXPECTED_CONTEXT)
    );
    let ca = cluster
        .certificate_authority_data
        .as_deref()
        .unwrap_or_else(|| panic!("fixture kubeconfig must contain inline CA data"));
    let decoded_ca = STANDARD
        .decode(ca)
        .unwrap_or_else(|_| panic!("fixture CA data must be base64"));
    let fingerprint = Sha256::digest(decoded_ca)
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    assert_eq!(
        manifest["kubernetes"]["certificateAuthoritySha256"].as_str(),
        Some(fingerprint.as_str()),
        "the checked manifest CA fingerprint must identify this fixture run"
    );

    let mut runtime = StorageRuntime::open_native_test()
        .unwrap_or_else(|_| panic!("isolated in-memory credential storage must open"));
    let source = SecretBox::new(std::mem::take(&mut *raw_kubeconfig).into_boxed_slice());
    let metadata = validate_kubeconfig(source.expose_secret())
        .unwrap_or_else(|_| panic!("fixture credential must remain valid at import"));
    let handle = runtime
        .store_kubeconfig(&metadata, source)
        .unwrap_or_else(|_| panic!("fixture credential must store in the isolated runtime"))
        .handle;
    let credential = runtime
        .resolve_kubeconfig_credential(&handle)
        .unwrap_or_else(|_| panic!("explicit fixture credential must resolve"));
    let sessions = KubernetesSessionStore::new();
    let session = sessions
        .open(&credential)
        .unwrap_or_else(|_| panic!("fixture Kubernetes session must open"));

    let version = sessions
        .apiserver_version(&session.session_id)
        .await
        .unwrap_or_else(|_| panic!("allowlisted Kubernetes version request must succeed"));
    assert_eq!(version.version, EXPECTED_VERSION);
    assert_eq!(
        manifest["kubernetes"]["expectedServerVersion"].as_str(),
        Some(EXPECTED_VERSION)
    );
    assert_eq!(version.major, "1");
    assert_eq!(version.minor, "36");
    // Fixture mutations use the validated admin session only. The namespace
    // UID returned by create is the cleanup anchor; a pre-existing namespace
    // or a replacement with another UID is never deleted.
    let admin_client = sessions
        .client_for_fixture_harness(&session.session_id)
        .unwrap_or_else(|_| panic!("the fixture admin session must remain available"));
    let namespace_uid = create_fixture_namespace(&admin_client).await;
    cleanup_fixture_namespace(&admin_client, &namespace_uid).await;
    assert_eq!(sessions.close(&session.session_id), Ok(true));
    println!(
        "fixture preflight and UID-anchored namespace lifecycle passed: Kubernetes {} at the allowlisted endpoint",
        version.version
    );
}

async fn create_fixture_namespace(client: &kube::Client) -> String {
    let namespaces: Api<Namespace> = Api::all(client.clone());
    let existing = namespaces
        .get_opt(EXPECTED_NAMESPACE)
        .await
        .unwrap_or_else(|_| panic!("the allowlisted namespace existence check must succeed"));
    assert!(
        existing.is_none(),
        "the harness must not adopt an existing namespace"
    );
    let created = namespaces
        .create(
            &PostParams::default(),
            &Namespace {
                metadata: kube::core::ObjectMeta {
                    name: Some(EXPECTED_NAMESPACE.to_owned()),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the allowlisted namespace must be created"));
    created
        .metadata
        .uid
        .filter(|uid| !uid.is_empty() && uid.len() <= 64)
        .unwrap_or_else(|| panic!("the created namespace must have a bounded UID"))
}

async fn cleanup_fixture_namespace(client: &kube::Client, expected_uid: &str) {
    let namespaces: Api<Namespace> = Api::all(client.clone());
    let current = namespaces
        .get_opt(EXPECTED_NAMESPACE)
        .await
        .unwrap_or_else(|_| panic!("the namespace UID check must succeed"));
    let Some(current) = current else {
        panic!("the harness-created namespace must still exist before cleanup");
    };
    assert_eq!(
        current.metadata.uid.as_deref(),
        Some(expected_uid),
        "namespace cleanup must be anchored to the UID returned at creation"
    );
    namespaces
        .delete(
            EXPECTED_NAMESPACE,
            &DeleteParams {
                preconditions: Some(kube::api::Preconditions {
                    uid: Some(expected_uid.to_owned()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the UID-matched namespace must be deleted"));
    let gone = tokio::time::timeout(Duration::from_secs(15), async {
        loop {
            let current = namespaces
                .get_opt(EXPECTED_NAMESPACE)
                .await
                .unwrap_or_else(|_| panic!("namespace deletion must be verifiable"));
            if current.is_none() {
                break true;
            }
            tokio::time::sleep(Duration::from_millis(250)).await;
        }
    })
    .await
    .unwrap_or(false);
    assert!(gone, "the fixture namespace must be absent after cleanup");
}

fn external_input(name: &str) -> PathBuf {
    let path = std::env::var_os(name)
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("the harness must pass the {name} file reference"));
    let canonical = path
        .canonicalize()
        .unwrap_or_else(|_| panic!("the {name} file reference must exist"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| panic!("the repository root must exist"))
        .canonicalize()
        .unwrap_or_else(|_| panic!("the repository root must resolve"));
    assert!(
        !canonical.starts_with(root),
        "the {name} file reference must stay outside the repository"
    );
    canonical
}

fn checked_manifest_input() -> PathBuf {
    let path = std::env::var_os("TALOS_PILOT_KUBERNETES_FIXTURE_MANIFEST")
        .map(PathBuf::from)
        .unwrap_or_else(|| panic!("the harness must pass the checked manifest file reference"));
    let canonical = path
        .canonicalize()
        .unwrap_or_else(|_| panic!("the checked manifest file reference must exist"));
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| panic!("the repository root must exist"))
        .canonicalize()
        .unwrap_or_else(|_| panic!("the repository root must resolve"));
    assert_eq!(canonical, root.join("tests/fixtures/talos-c4.json"));
    canonical
}

fn read_manifest(path: &Path) -> serde_json::Value {
    let root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| panic!("the repository root must exist"))
        .canonicalize()
        .unwrap_or_else(|_| panic!("the repository root must resolve"));
    assert_eq!(
        path,
        root.join("tests/fixtures/talos-c4.json"),
        "the harness must use the checked Talos fixture manifest"
    );
    let bytes = fs::read(path).unwrap_or_else(|_| panic!("the checked manifest must be readable"));
    serde_json::from_slice(&bytes).unwrap_or_else(|_| panic!("the checked manifest must be JSON"))
}

fn read_credential(path: &Path) -> Zeroizing<Vec<u8>> {
    let metadata = fs::metadata(path)
        .unwrap_or_else(|_| panic!("the explicit kubeconfig metadata must be readable"));
    assert!(
        metadata.is_file(),
        "the explicit kubeconfig must be a regular file"
    );
    assert!(
        metadata.len() > 0 && metadata.len() <= MAX_CREDENTIAL_BYTES,
        "the explicit kubeconfig must fit the documented credential size bound"
    );
    let mut bytes = Zeroizing::new(Vec::new());
    fs::File::open(path)
        .unwrap_or_else(|_| panic!("the explicit kubeconfig must be readable"))
        .take(MAX_CREDENTIAL_BYTES + 1)
        .read_to_end(&mut bytes)
        .unwrap_or_else(|_| panic!("the explicit kubeconfig must be readable"));
    assert!(
        (bytes.len() as u64) <= MAX_CREDENTIAL_BYTES,
        "the explicit kubeconfig grew beyond its bound while being read"
    );
    bytes
}
