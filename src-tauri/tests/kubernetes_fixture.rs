//! Live preflight and list coverage for the single allowlisted Kubernetes fixture.
//!
//! The test reads credentials only through an explicit file reference, validates
//! the selected context, API endpoint, and CA fingerprint before opening the
//! production Kubernetes adapter, then reads the API version through that
//! adapter, then lists through the restricted reader and cleans up by UID.

#![cfg(feature = "native-test")]

use std::{
    fs,
    io::{Read, Write},
    panic::{AssertUnwindSafe, resume_unwind},
    path::{Path, PathBuf},
    process::Command,
    time::Duration,
};

use base64::{Engine, engine::general_purpose::STANDARD};
use futures_util::FutureExt;
use k8s_openapi::api::{
    authentication::v1::{TokenRequest, TokenRequestSpec},
    core::v1::{Container, Namespace, Pod, PodSpec, PodStatus, ServiceAccount},
    rbac::v1::{PolicyRule, Role, RoleBinding, RoleRef, Subject},
};
use kube::{
    Api,
    api::{DeleteParams, PostParams, Preconditions},
};
use secrecy::{ExposeSecret, SecretBox, SecretString};
use sha2::{Digest, Sha256};
use talos_pilot::{
    kubernetes::{KubernetesSessionStore, PodWatchChange, PodWatchEnd, PodWatchReceiver},
    storage::{StorageRuntime, validate_kubeconfig},
};
use zeroize::Zeroizing;

const EXPECTED_ENDPOINT: &str = "https://10.79.0.1:6443";
const EXPECTED_VERSION: &str = "v1.36.5";
const EXPECTED_CLUSTER_NAME: &str = "talos-pilot-c4-20261009";
const EXPECTED_CONTEXT: &str = "admin@talos-pilot-c4-20261009";
const EXPECTED_READER_CONTEXT: &str = "reader@talos-pilot-c4-20261009";
const EXPECTED_NAMESPACE: &str = "talos-pilot-list-probe";
const EXPECTED_SERVICE_ACCOUNT: &str = "list-reader";
const EXPECTED_ROLE: &str = "list-reader";
const EXPECTED_ROLE_BINDING: &str = "list-reader";
const EXPECTED_POD_PREFIX: &str = "list-probe-";
const EXPECTED_POD_COUNT: usize = 201;
const WATCH_POD_NAME: &str = "watch-probe-primary";
const RESUMED_WATCH_POD_NAME: &str = "watch-probe-resumed";
const MAX_CREDENTIAL_BYTES: u64 = 4 * 1024 * 1024;

#[tokio::test]
#[ignore = "requires the allowlisted Talos/Kubernetes fixture"]
async fn live_fixture_sets_up_restricted_reader_and_cleans_up_by_uid() {
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
    assert_eq!(
        manifest["kubernetes"]["namespace"].as_str(),
        Some(EXPECTED_NAMESPACE)
    );
    assert_eq!(
        manifest["kubernetes"]["serviceAccount"].as_str(),
        Some(EXPECTED_SERVICE_ACCOUNT)
    );
    assert_eq!(manifest["kubernetes"]["role"].as_str(), Some(EXPECTED_ROLE));
    assert_eq!(
        manifest["kubernetes"]["roleBinding"].as_str(),
        Some(EXPECTED_ROLE_BINDING)
    );
    assert_eq!(
        manifest["kubernetes"]["podNamePrefix"].as_str(),
        Some(EXPECTED_POD_PREFIX)
    );
    assert_eq!(
        manifest["kubernetes"]["podCount"].as_u64(),
        Some(EXPECTED_POD_COUNT as u64)
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

    validate_fixture_identity(
        &manifest,
        parsed.current_context.as_deref(),
        cluster.server.as_deref(),
        &fingerprint,
    )
    .unwrap_or_else(|_| panic!("fixture identity must match before any request"));

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
    let (namespace_uid, reader_token) = create_fixture_namespace(&admin_client).await;
    let reader_kubeconfig = write_reader_kubeconfig(EXPECTED_ENDPOINT, ca, &reader_token);
    drop(reader_token);
    let mut reader_bytes = read_credential(reader_kubeconfig.path());
    let reader_metadata = validate_kubeconfig(&reader_bytes).unwrap_or_else(|_| {
        panic!("the restricted fixture kubeconfig must pass import validation")
    });
    assert_eq!(reader_metadata.context_name, EXPECTED_READER_CONTEXT);
    let reader_yaml = std::str::from_utf8(&reader_bytes)
        .unwrap_or_else(|_| panic!("the restricted fixture kubeconfig must be UTF-8"));
    let reader_config = kube::config::Kubeconfig::from_yaml(reader_yaml)
        .unwrap_or_else(|_| panic!("the restricted fixture kubeconfig must parse"));
    let reader_user = reader_config
        .auth_infos
        .iter()
        .find(|user| user.name == EXPECTED_SERVICE_ACCOUNT)
        .and_then(|user| user.auth_info.as_ref())
        .unwrap_or_else(|| panic!("the restricted kubeconfig must select its ServiceAccount"));
    assert!(reader_user.token.is_some());
    assert!(reader_user.client_certificate.is_none());
    assert!(reader_user.client_certificate_data.is_none());
    assert!(reader_user.client_key.is_none());
    assert!(reader_user.client_key_data.is_none());
    let reader_source = SecretBox::new(std::mem::take(&mut *reader_bytes).into_boxed_slice());
    let reader_handle = runtime
        .store_kubeconfig(&reader_metadata, reader_source)
        .unwrap_or_else(|_| panic!("the restricted credential must store in isolated memory"))
        .handle;
    let reader_credential = runtime
        .resolve_kubeconfig_credential(&reader_handle)
        .unwrap_or_else(|_| panic!("the restricted fixture credential must resolve"));
    let reader_session = sessions
        .open(&reader_credential)
        .unwrap_or_else(|_| panic!("the restricted fixture session must open"));
    let snapshot = sessions
        .list_pods(&reader_session.session_id, EXPECTED_NAMESPACE, None, None)
        .await;
    let snapshot =
        snapshot.unwrap_or_else(|_| panic!("restricted paginated Pod list must succeed"));
    assert_eq!(snapshot.items.len(), EXPECTED_POD_COUNT);
    assert!(snapshot.complete);
    assert!(!snapshot.resource_version.is_empty());
    let names = snapshot
        .items
        .iter()
        .map(|pod| pod.name.as_str())
        .collect::<std::collections::BTreeSet<_>>();
    let expected_names = (0..EXPECTED_POD_COUNT)
        .map(|index| format!("{EXPECTED_POD_PREFIX}{index:03}"))
        .collect::<std::collections::BTreeSet<_>>();
    assert_eq!(
        names.len(),
        EXPECTED_POD_COUNT,
        "list must contain no duplicates"
    );
    assert!(
        names
            .iter()
            .copied()
            .eq(expected_names.iter().map(String::as_str)),
        "list must contain exactly the allowlisted names"
    );
    let watch_result = AssertUnwindSafe(async {
        delete_fixture_list_pods(&admin_client).await;
        run_live_watch_case(&sessions, &reader_session.session_id, &admin_client).await;
    })
    .catch_unwind()
    .await;
    if let Err(failure) = watch_result {
        let _ = sessions.close(&reader_session.session_id).await;
        cleanup_fixture_namespace(&admin_client, &namespace_uid).await;
        resume_unwind(failure);
    }
    // The namespace UID anchors cleanup of the exact list and watch objects.
    cleanup_fixture_namespace(&admin_client, &namespace_uid).await;
    println!(
        "restricted list: items={}, unique={}, complete={}, resource_version_present={}",
        snapshot.items.len(),
        names.len(),
        snapshot.complete,
        !snapshot.resource_version.is_empty()
    );
    assert_eq!(sessions.close(&reader_session.session_id).await, Ok(true));
    drop(reader_kubeconfig);
    assert_eq!(sessions.close(&session.session_id).await, Ok(true));
    println!(
        "fixture admin setup, restricted paginated Pod list, and UID-anchored cleanup passed: Kubernetes {} at the allowlisted endpoint",
        version.version
    );
}

async fn run_live_watch_case(
    sessions: &KubernetesSessionStore,
    reader_session_id: &str,
    admin_client: &kube::Client,
) {
    let subscription_id = sessions
        .start_pod_watch(reader_session_id, EXPECTED_NAMESPACE, None, None)
        .await
        .unwrap_or_else(|_| panic!("the fixture reader must open a Pod watch"));
    let mut receiver = sessions
        .take_pod_watch_receiver(reader_session_id, &subscription_id)
        .unwrap_or_else(|_| panic!("the live fixture watch receiver must be available"));
    let initial_generation = loop {
        let message = next_watch_message(&mut receiver, Duration::from_secs(60)).await;
        if matches!(message.change, PodWatchChange::SnapshotComplete) {
            break message.generation;
        }
    };

    let pods: Api<Pod> = Api::namespaced(admin_client.clone(), EXPECTED_NAMESPACE);
    let created = create_watch_probe(&pods, WATCH_POD_NAME).await;
    let original_uid = created
        .metadata
        .uid
        .as_deref()
        .unwrap_or_else(|| panic!("the watch probe must have a server UID"))
        .to_owned();
    wait_for_watch_change(&mut receiver, Duration::from_secs(30), |change| {
        matches!(change, PodWatchChange::Upsert(pod) if pod.name == WATCH_POD_NAME && pod.uid == original_uid)
    })
    .await;

    let mut changed = pods
        .get(WATCH_POD_NAME)
        .await
        .unwrap_or_else(|_| panic!("the watch probe must be readable for its update"));
    changed.status = Some(PodStatus {
        phase: Some("Running".to_owned()),
        ..Default::default()
    });
    pods.replace_status(WATCH_POD_NAME, &PostParams::default(), &changed)
        .await
        .unwrap_or_else(|_| panic!("the watch probe status update must succeed"));
    wait_for_watch_change(&mut receiver, Duration::from_secs(30), |change| {
        matches!(change, PodWatchChange::Upsert(pod) if pod.name == WATCH_POD_NAME && pod.phase == "Running")
    })
    .await;

    pods.delete(WATCH_POD_NAME, &DeleteParams::default())
        .await
        .unwrap_or_else(|_| panic!("the exact watch probe Pod must be deleted"));
    wait_for_watch_change(&mut receiver, Duration::from_secs(30), |change| {
        matches!(change, PodWatchChange::Delete { uid, name } if name == WATCH_POD_NAME && uid == &original_uid)
    })
    .await;

    let recreated = create_watch_probe(&pods, WATCH_POD_NAME).await;
    let recreated_uid = recreated
        .metadata
        .uid
        .as_deref()
        .unwrap_or_else(|| panic!("the recreated watch probe must have a new UID"));
    assert_ne!(recreated_uid, original_uid);
    wait_for_watch_change(&mut receiver, Duration::from_secs(30), |change| {
        matches!(change, PodWatchChange::Upsert(pod) if pod.name == WATCH_POD_NAME && pod.uid == recreated_uid)
    })
    .await;
    println!("live watch: add, status change, delete, and same-name recreation passed");

    interrupt_fixture_watch();
    let resumed = create_watch_probe(&pods, RESUMED_WATCH_POD_NAME).await;
    let resumed_uid = resumed
        .metadata
        .uid
        .as_deref()
        .unwrap_or_else(|| panic!("the resumed watch probe must have a UID"))
        .to_owned();
    wait_for_resumed_watch_pod(&mut receiver, initial_generation, &resumed_uid).await;
    assert_eq!(
        sessions
            .stop_pod_watch(reader_session_id, &subscription_id)
            .await,
        Ok(true)
    );
    println!("live watch: recovered after endpoint socket reset and delivered the resumed Pod UID");
}

fn interrupt_fixture_watch() {
    let matches = Command::new("sudo")
        .args([
            "-n",
            "ss",
            "-H",
            "-nt",
            "state",
            "established",
            "dst",
            "10.79.0.1",
            "dport",
            "=",
            ":6443",
        ])
        .output()
        .unwrap_or_else(|_| panic!("fixture watch socket inspection must succeed"));
    assert!(matches.status.success());
    let active_sockets = String::from_utf8_lossy(&matches.stdout)
        .lines()
        .filter(|line| !line.starts_with("Netid "))
        .count();
    assert!(
        active_sockets > 0,
        "an established fixture API socket must be active before interruption"
    );

    let reset = Command::new("sudo")
        .args([
            "-n",
            "ss",
            "-K",
            "state",
            "established",
            "dst",
            "10.79.0.1",
            "dport",
            "=",
            ":6443",
        ])
        .output()
        .unwrap_or_else(|_| panic!("fixture watch socket reset must run"));
    assert!(
        reset.status.success(),
        "only the established fixture API socket may be reset"
    );
    println!("live watch: reset an established connection to 10.79.0.1:6443");
}

async fn wait_for_resumed_watch_pod(
    receiver: &mut PodWatchReceiver,
    initial_generation: u64,
    expected_uid: &str,
) {
    tokio::time::timeout(Duration::from_secs(30), async {
        loop {
            let message = next_watch_message(receiver, Duration::from_secs(30)).await;
            if message.generation < initial_generation {
                panic!("the recovered watch returned a stale generation");
            }
            match &message.change {
                PodWatchChange::SnapshotBatch(items)
                    if items.iter().any(|pod| pod.uid == expected_uid) =>
                {
                    break;
                }
                PodWatchChange::Upsert(pod) if pod.uid == expected_uid => {
                    break;
                }
                PodWatchChange::Stale => {
                    panic!("the interrupted watch became stale before the resumed Pod arrived");
                }
                _ => {}
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("the recovered live watch must deliver the resumed Pod"));
}

async fn delete_fixture_list_pods(client: &kube::Client) {
    let pods: Api<Pod> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    for index in 0..EXPECTED_POD_COUNT {
        let name = format!("{EXPECTED_POD_PREFIX}{index:03}");
        pods.delete(
            &name,
            &DeleteParams {
                grace_period_seconds: Some(0),
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("only the exact allowlisted list-probe Pod may be deleted"));
    }
}

async fn create_watch_probe(pods: &Api<Pod>, name: &str) -> Pod {
    pods.create(
        &PostParams::default(),
        &Pod {
            metadata: kube::core::ObjectMeta {
                name: Some(name.to_owned()),
                ..Default::default()
            },
            spec: Some(PodSpec {
                automount_service_account_token: Some(false),
                containers: vec![Container {
                    name: "pause".to_owned(),
                    image: Some("fixture.invalid/talos-pilot-watch-probe:never".to_owned()),
                    image_pull_policy: Some("Never".to_owned()),
                    ..Default::default()
                }],
                restart_policy: Some("Never".to_owned()),
                ..Default::default()
            }),
            ..Default::default()
        },
    )
    .await
    .unwrap_or_else(|_| panic!("only the named watch probe Pod may be created"))
}

async fn wait_for_watch_change(
    receiver: &mut PodWatchReceiver,
    deadline: Duration,
    matches: impl Fn(&PodWatchChange) -> bool,
) {
    tokio::time::timeout(deadline, async {
        loop {
            let message = next_watch_message(receiver, deadline).await;
            if matches(&message.change) {
                break;
            }
        }
    })
    .await
    .unwrap_or_else(|_| panic!("the fixture watch did not deliver the expected change"));
}

async fn next_watch_message(
    receiver: &mut PodWatchReceiver,
    timeout: Duration,
) -> talos_pilot::kubernetes::PodWatchMessage {
    tokio::time::timeout(timeout, receiver.messages.recv())
        .await
        .unwrap_or_else(|_| panic!("the fixture watch event deadline expired"))
        .unwrap_or_else(|| {
            let end = receiver
                .terminal
                .try_recv()
                .ok()
                .unwrap_or(PodWatchEnd::Failed);
            panic!("the fixture watch ended before the expected event: {end:?}")
        })
}

async fn create_fixture_namespace(client: &kube::Client) -> (String, Zeroizing<String>) {
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
    let namespace_uid = created
        .metadata
        .uid
        .filter(|uid| !uid.is_empty() && uid.len() <= 64)
        .unwrap_or_else(|| panic!("the created namespace must have a bounded UID"));

    create_fixture_reader(client).await;
    create_fixture_pods(client).await;
    let reader_token = issue_reader_token(client).await;
    (namespace_uid, reader_token)
}

async fn create_fixture_reader(client: &kube::Client) {
    let accounts: Api<ServiceAccount> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    accounts
        .create(
            &PostParams::default(),
            &ServiceAccount {
                automount_service_account_token: Some(false),
                metadata: kube::core::ObjectMeta {
                    name: Some(EXPECTED_SERVICE_ACCOUNT.to_owned()),
                    ..Default::default()
                },
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the allowlisted ServiceAccount must be created"));

    let roles: Api<Role> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    roles
        .create(
            &PostParams::default(),
            &Role {
                metadata: kube::core::ObjectMeta {
                    name: Some(EXPECTED_ROLE.to_owned()),
                    ..Default::default()
                },
                rules: Some(vec![PolicyRule {
                    api_groups: Some(vec![String::new()]),
                    resources: Some(vec!["pods".to_owned()]),
                    verbs: vec!["get".to_owned(), "list".to_owned(), "watch".to_owned()],
                    ..Default::default()
                }]),
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the Pod-only namespace Role must be created"));

    let bindings: Api<RoleBinding> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    bindings
        .create(
            &PostParams::default(),
            &RoleBinding {
                metadata: kube::core::ObjectMeta {
                    name: Some(EXPECTED_ROLE_BINDING.to_owned()),
                    ..Default::default()
                },
                role_ref: RoleRef {
                    api_group: Some("rbac.authorization.k8s.io".to_owned()),
                    kind: "Role".to_owned(),
                    name: EXPECTED_ROLE.to_owned(),
                },
                subjects: Some(vec![Subject {
                    kind: "ServiceAccount".to_owned(),
                    name: EXPECTED_SERVICE_ACCOUNT.to_owned(),
                    namespace: Some(EXPECTED_NAMESPACE.to_owned()),
                    ..Default::default()
                }]),
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the allowlisted RoleBinding must be created"));
}

async fn create_fixture_pods(client: &kube::Client) {
    let pods: Api<Pod> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    for index in 0..EXPECTED_POD_COUNT {
        let name = format!("{EXPECTED_POD_PREFIX}{index:03}");
        pods.create(
            &PostParams::default(),
            &Pod {
                metadata: kube::core::ObjectMeta {
                    name: Some(name),
                    labels: Some(std::collections::BTreeMap::from([(
                        "app".to_owned(),
                        "list-probe".to_owned(),
                    )])),
                    ..Default::default()
                },
                spec: Some(PodSpec {
                    automount_service_account_token: Some(false),
                    containers: vec![Container {
                        name: "pause".to_owned(),
                        image: Some("fixture.invalid/talos-pilot-list-probe:never".to_owned()),
                        image_pull_policy: Some("Never".to_owned()),
                        ..Default::default()
                    }],
                    restart_policy: Some("Never".to_owned()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the allowlisted synthetic Pod must be created"));
    }
}

async fn issue_reader_token(client: &kube::Client) -> Zeroizing<String> {
    let accounts: Api<ServiceAccount> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    let token_request = TokenRequest {
        spec: Some(TokenRequestSpec {
            expiration_seconds: Some(600),
            ..Default::default()
        }),
        ..Default::default()
    };
    let response: TokenRequest = accounts
        .create_subresource(
            "token",
            EXPECTED_SERVICE_ACCOUNT,
            &PostParams::default(),
            &token_request,
        )
        .await
        .unwrap_or_else(|_| panic!("the allowlisted short-lived token request must succeed"));
    let token = response
        .status
        .and_then(|status| status.token)
        .filter(|token| !token.is_empty() && token.len() <= 16 * 1024)
        .unwrap_or_else(|| panic!("the short-lived reader token must be bounded"));
    Zeroizing::new(token)
}

fn write_reader_kubeconfig(
    endpoint: &str,
    certificate_authority_data: &str,
    token: &str,
) -> tempfile::NamedTempFile {
    let config = kube::config::Kubeconfig {
        clusters: vec![kube::config::NamedCluster {
            name: EXPECTED_CLUSTER_NAME.to_owned(),
            cluster: Some(kube::config::Cluster {
                server: Some(endpoint.to_owned()),
                certificate_authority_data: Some(certificate_authority_data.to_owned()),
                ..Default::default()
            }),
            ..Default::default()
        }],
        contexts: vec![kube::config::NamedContext {
            name: EXPECTED_READER_CONTEXT.to_owned(),
            context: Some(kube::config::Context {
                cluster: EXPECTED_CLUSTER_NAME.to_owned(),
                user: Some(EXPECTED_SERVICE_ACCOUNT.to_owned()),
                namespace: Some(EXPECTED_NAMESPACE.to_owned()),
                ..Default::default()
            }),
            ..Default::default()
        }],
        current_context: Some(EXPECTED_READER_CONTEXT.to_owned()),
        kind: Some("Config".to_owned()),
        api_version: Some("v1".to_owned()),
        auth_infos: vec![kube::config::NamedAuthInfo {
            name: EXPECTED_SERVICE_ACCOUNT.to_owned(),
            auth_info: Some(kube::config::AuthInfo {
                token: Some(SecretString::from(token)),
                ..Default::default()
            }),
            ..Default::default()
        }],
        ..Default::default()
    };
    let serialized = Zeroizing::new(
        serde_json::to_vec(&config)
            .unwrap_or_else(|_| panic!("the restricted kubeconfig must serialize")),
    );
    let mut file = tempfile::NamedTempFile::new()
        .unwrap_or_else(|_| panic!("a private temporary restricted kubeconfig must be created"));
    file.write_all(serialized.as_slice())
        .unwrap_or_else(|_| panic!("the restricted kubeconfig must be written"));
    file.as_file()
        .sync_all()
        .unwrap_or_else(|_| panic!("the restricted kubeconfig must be flushed"));
    let repository_root = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .unwrap_or_else(|| panic!("the repository root must exist"));
    assert!(
        !file.path().starts_with(repository_root),
        "the restricted kubeconfig must stay outside the repository"
    );
    file
}

async fn cleanup_fixture_namespace(client: &kube::Client, expected_uid: &str) {
    let pods: Api<Pod> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    for index in 0..EXPECTED_POD_COUNT {
        let name = format!("{EXPECTED_POD_PREFIX}{index:03}");
        delete_named_fixture_pod(&pods, &name).await;
    }
    for name in [WATCH_POD_NAME, RESUMED_WATCH_POD_NAME] {
        delete_named_fixture_pod(&pods, name).await;
    }
    let bindings: Api<RoleBinding> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    bindings
        .delete(EXPECTED_ROLE_BINDING, &DeleteParams::default())
        .await
        .unwrap_or_else(|_| panic!("the allowlisted RoleBinding must be deleted"));
    let roles: Api<Role> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    roles
        .delete(EXPECTED_ROLE, &DeleteParams::default())
        .await
        .unwrap_or_else(|_| panic!("the allowlisted Role must be deleted"));
    let accounts: Api<ServiceAccount> = Api::namespaced(client.clone(), EXPECTED_NAMESPACE);
    accounts
        .delete(EXPECTED_SERVICE_ACCOUNT, &DeleteParams::default())
        .await
        .unwrap_or_else(|_| panic!("the allowlisted ServiceAccount must be deleted"));

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
                preconditions: Some(Preconditions {
                    uid: Some(expected_uid.to_owned()),
                    ..Default::default()
                }),
                ..Default::default()
            },
        )
        .await
        .unwrap_or_else(|_| panic!("the UID-matched namespace must be deleted"));
    let gone = tokio::time::timeout(Duration::from_secs(60), async {
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
    println!("fixture namespace gone: true");
}

async fn delete_named_fixture_pod(pods: &Api<Pod>, name: &str) {
    match pods
        .delete(
            name,
            &DeleteParams {
                grace_period_seconds: Some(0),
                ..Default::default()
            },
        )
        .await
    {
        Ok(_) => {}
        Err(kube::Error::Api(status)) if status.code == 404 => {}
        Err(_) => panic!("only the exact allowlisted fixture Pod may be deleted"),
    }
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

// Pure preflight: this must run before opening a client or requesting /version.
fn validate_fixture_identity(
    manifest: &serde_json::Value,
    context: Option<&str>,
    endpoint: Option<&str>,
    fingerprint: &str,
) -> Result<(), &'static str> {
    if manifest["fixtureId"].as_str() != Some(EXPECTED_CLUSTER_NAME)
        || manifest["kubernetes"]["expectedServerVersion"].as_str() != Some(EXPECTED_VERSION)
        || manifest["kubernetes"]["contextName"].as_str() != Some(EXPECTED_CONTEXT)
        || context != Some(EXPECTED_CONTEXT)
        || manifest["kubernetes"]["endpoint"].as_str() != Some(EXPECTED_ENDPOINT)
        || endpoint != Some(EXPECTED_ENDPOINT)
        || manifest["kubernetes"]["certificateAuthoritySha256"].as_str() != Some(fingerprint)
    {
        return Err("fixture identity mismatch");
    }
    Ok(())
}

#[tokio::test]
async fn wrong_fixture_id_version_ca_and_context_are_rejected_before_requests() {
    let server = talos_pilot::kubernetes::synthetic::SyntheticApiserver::start()
        .await
        .unwrap_or_else(|_| panic!("synthetic server must start"));
    let valid = serde_json::json!({
        "fixtureId": EXPECTED_CLUSTER_NAME,
        "kubernetes": {"endpoint": EXPECTED_ENDPOINT, "contextName": EXPECTED_CONTEXT,
            "expectedServerVersion": EXPECTED_VERSION, "certificateAuthoritySha256": "a".repeat(64)}
    });
    assert!(
        validate_fixture_identity(
            &valid,
            Some(EXPECTED_CONTEXT),
            Some(EXPECTED_ENDPOINT),
            &"a".repeat(64)
        )
        .is_ok()
    );
    for field in [
        "fixtureId",
        "expectedServerVersion",
        "certificateAuthoritySha256",
        "contextName",
    ] {
        let mut wrong = valid.clone();
        if field == "fixtureId" {
            wrong[field] = serde_json::json!("wrong");
        } else {
            wrong["kubernetes"][field] = serde_json::json!("b".repeat(64));
        }
        assert!(
            validate_fixture_identity(
                &wrong,
                Some(EXPECTED_CONTEXT),
                Some(EXPECTED_ENDPOINT),
                &"a".repeat(64)
            )
            .is_err()
        );
        assert_eq!(server.requests().len(), 0);
    }
    assert!(
        validate_fixture_identity(
            &valid,
            Some("wrong-context"),
            Some(EXPECTED_ENDPOINT),
            &"a".repeat(64)
        )
        .is_err()
    );
    assert_eq!(server.requests().len(), 0);
    server.stop().await;
}
