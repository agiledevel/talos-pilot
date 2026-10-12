//! Real allowlisted C4 Talos fixture harness.
//!
//! These tests are ignored by default and run only when an operator supplies the
//! disposable fixture recorded in
//! `docs/verification/fixtures/talos-c4-disposable.md`. `pnpm talos:fixture`
//! passes file *references* through the environment, so credential content is
//! never an argument or an environment value. The harness fails closed when the
//! fixture identity or the endpoint/node allowlist is absent, empty, oversized,
//! or mismatched with the imported talosconfig.

use std::{
    env,
    path::PathBuf,
    sync::{Arc, Mutex},
    time::Duration,
};

use serde::Deserialize;
use talos_pilot::{
    contracts::{
        ApplicationErrorDto, CredentialStorageModeDto, HelperCapability, HelperState,
        TalosProbeEventDto, TalosProbeState,
    },
    helper::{service::HelperService, supervisor::TalosProbeInput},
    talos::{self, TalosSessionStore},
};
use zeroize::Zeroizing;

const MANIFEST_ENV: &str = "TALOS_PILOT_FIXTURE_MANIFEST";
const TALOSCONFIG_ENV: &str = "TALOS_PILOT_FIXTURE_TALOSCONFIG";
const READER_TALOSCONFIG_ENV: &str = "TALOS_PILOT_FIXTURE_READER_TALOSCONFIG";
const DENIED_TALOSCONFIG_ENV: &str = "TALOS_PILOT_FIXTURE_DENIED_TALOSCONFIG";
const HELPER_ENV: &str = "TALOS_PILOT_FIXTURE_HELPER";
const TALOSCTL_ENV: &str = "TALOS_PILOT_FIXTURE_TALOSCTL";
const FIXTURE_ID: &str = "talos-pilot-c4-20261009";
const FIRST_EVENT_DEADLINE: Duration = Duration::from_secs(30);
/// Grace given to a second live projection before the harness cancels, so stream
/// ordering is observed rather than assumed when the fixture reports a change.
const STREAM_SETTLE: Duration = Duration::from_secs(12);

/// A synthetic self-signed authority. It is public, unrelated to the fixture, and
/// exists so the real Talos client must reject the fixture peer chain.
const SYNTHETIC_AUTHORITY: &str = include_str!("../../tests/fixtures/synthetic-ca.base64");

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct FixtureManifest {
    schema_version: u8,
    fixture_id: String,
    context_name: String,
    talos_version: String,
    kubernetes_version: String,
    state_dir: String,
    /// Context label `config new --roles os:reader` derives for this cluster.
    reader_context: String,
    /// Context label `config new --roles os:etcd:backup` derives for this cluster.
    denied_context: String,
    allowed_endpoints: Vec<String>,
    allowed_nodes: Vec<String>,
    /// One unassigned address inside the fixture CIDR, used only to prove the
    /// unreachable-target classification.
    negative_endpoint: String,
}

struct Fixture {
    manifest: FixtureManifest,
    config: Zeroizing<Vec<u8>>,
    reader_config: Zeroizing<Vec<u8>>,
    denied_config: Zeroizing<Vec<u8>>,
    helper: PathBuf,
}

/// Loads and validates the fixture references, failing closed on any gap.
fn fixture() -> Fixture {
    let manifest_path = reference(MANIFEST_ENV);
    let config_path = reference(TALOSCONFIG_ENV);
    let helper_path = reference(HELPER_ENV);

    let raw = std::fs::read_to_string(&manifest_path)
        .unwrap_or_else(|_| panic!("{MANIFEST_ENV} must reference a readable manifest"));
    let manifest: FixtureManifest = serde_json::from_str(&raw)
        .unwrap_or_else(|error| panic!("fixture manifest is invalid: {error}"));
    validate_identity(&manifest);

    let config = talos::read_talosconfig(&config_path).unwrap_or_else(|_| {
        panic!("{TALOSCONFIG_ENV} must reference a readable bounded talosconfig")
    });
    let reader_config =
        talos::read_talosconfig(&reference(READER_TALOSCONFIG_ENV)).unwrap_or_else(|_| {
            panic!("{READER_TALOSCONFIG_ENV} must reference a readable bounded talosconfig")
        });
    let denied_config =
        talos::read_talosconfig(&reference(DENIED_TALOSCONFIG_ENV)).unwrap_or_else(|_| {
            panic!("{DENIED_TALOSCONFIG_ENV} must reference a readable bounded talosconfig")
        });
    if !helper_path.exists() {
        panic!(
            "{HELPER_ENV} must reference the built helper, {} is absent",
            helper_path.display()
        );
    }

    Fixture {
        manifest,
        config,
        reader_config,
        denied_config,
        helper: helper_path,
    }
}

fn reference(name: &str) -> PathBuf {
    PathBuf::from(
        env::var(name).unwrap_or_else(|_| panic!("{name} must be set by pnpm talos:fixture")),
    )
}

fn validate_identity(manifest: &FixtureManifest) {
    assert_eq!(manifest.schema_version, 1, "only manifest v1 is accepted");
    assert_eq!(
        manifest.fixture_id, FIXTURE_ID,
        "the manifest must name the allowlisted fixture"
    );
    assert_eq!(
        manifest.context_name, manifest.fixture_id,
        "the selected context must be the allowlisted cluster"
    );
    assert_eq!(
        manifest.talos_version, "v1.14.2",
        "C4 targets the pinned Talos patch"
    );
    assert_eq!(
        manifest.kubernetes_version, "v1.36.5",
        "C4 targets the pinned development Kubernetes baseline"
    );
    assert!(
        !manifest.allowed_endpoints.is_empty() && manifest.allowed_endpoints.len() <= 8,
        "the endpoint allowlist must be present and bounded"
    );
    assert!(
        !manifest.allowed_nodes.is_empty() && manifest.allowed_nodes.len() <= 64,
        "the node allowlist must be present and bounded"
    );
    for address in manifest
        .allowed_endpoints
        .iter()
        .chain(&manifest.allowed_nodes)
        .chain(std::iter::once(&manifest.negative_endpoint))
    {
        let parsed: std::net::IpAddr = address
            .parse()
            .unwrap_or_else(|_| panic!("{address} must be a literal fixture address"));
        assert!(
            parsed.is_ipv4() && !parsed.is_unspecified(),
            "fixture addresses must be literal IPv4 host addresses"
        );
    }
}

/// Imports a credential through the production session path and proves it stays
/// inside the recorded allowlist.
///
/// `expected_context` is the label the allowlist records for this credential, so
/// a config generated for the wrong cluster or the wrong role is rejected here
/// rather than silently probed under an unverified identity.
fn import(
    fixture: &Fixture,
    config: &Zeroizing<Vec<u8>>,
    expected_context: &str,
) -> (TalosSessionStore, TalosProbeInput) {
    let store = TalosSessionStore::default();
    let session = store
        .insert(Zeroizing::new(config.to_vec()))
        .unwrap_or_else(|_| {
            panic!("the fixture talosconfig must import as a session-only context")
        });
    assert_eq!(session.context_name, expected_context);
    assert_eq!(session.endpoints, fixture.manifest.allowed_endpoints);
    assert!(matches!(
        session.storage_mode,
        CredentialStorageModeDto::SessionOnly
    ));
    for node in &session.nodes {
        assert!(
            fixture.manifest.allowed_nodes.contains(node),
            "node {node} is outside the recorded allowlist"
        );
    }
    let input = store
        .probe_input(&session.session_id, &session.nodes[0])
        .unwrap_or_else(|_| panic!("the first fixture node must be selectable"));
    (store, input)
}

/// Runs one probe. With `cancel_on_first_event`, the owning session requests
/// cancellation as soon as the live stream projects anything, so the helper must
/// acknowledge and end the stream instead of the test waiting for a natural end.
async fn probe(
    service: &HelperService,
    fixture: &Fixture,
    input: &TalosProbeInput,
    endpoints: Vec<String>,
    cancel_on_first_event: bool,
) -> Result<Vec<TalosProbeEventDto>, ApplicationErrorDto> {
    let events = Arc::new(Mutex::new(Vec::new()));
    let sink = Arc::clone(&events);
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(input.config.to_vec()),
        endpoints,
        input.node.clone(),
        input.session_id.clone(),
        move |event| {
            if let Ok(mut held) = sink.lock() {
                held.push(event);
            }
            Ok(())
        },
    );

    let result = if cancel_on_first_event {
        let watched = Arc::clone(&events);
        let session_id = input.session_id.clone();
        let canceller = async move {
            let first_deadline = tokio::time::Instant::now() + FIRST_EVENT_DEADLINE;
            while watched.lock().map(|held| held.is_empty()).unwrap_or(false) {
                if tokio::time::Instant::now() >= first_deadline {
                    eprintln!(
                        "no live projection within the deadline; letting the stream result speak"
                    );
                    return;
                }
                tokio::time::sleep(Duration::from_millis(50)).await;
            }
            // Wait a bounded window for a second live projection so stream
            // ordering is observed on the fixture instead of only assumed.
            let settle_deadline = tokio::time::Instant::now() + STREAM_SETTLE;
            while tokio::time::Instant::now() < settle_deadline
                && watched.lock().map(|held| held.len() < 2).unwrap_or(false)
            {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            let released = service.stop_talos_probe(&session_id);
            assert!(released, "the owning session must release its live stream");
        };
        let (stream_result, ()) = tokio::join!(stream, canceller);
        stream_result
    } else {
        stream.await
    };

    result.map(|()| {
        Arc::try_unwrap(events)
            .unwrap_or_else(|_| panic!("the probe callback must be released"))
            .into_inner()
            .unwrap_or_else(|_| panic!("the event buffer must be usable"))
    })
}

fn describe(error: &ApplicationErrorDto) -> String {
    format!(
        "{} (retryable: {}, message: {})",
        error.code, error.retryable, error.message
    )
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn reads_and_streams_the_allowlisted_fixture() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();

    let status = service
        .status(&fixture.helper)
        .await
        .unwrap_or_else(|_| panic!("the built helper must complete the real handshake"));
    assert_eq!(status.state, HelperState::Ready);
    assert!(
        status.capabilities.contains(&HelperCapability::TalosProbe),
        "the fixture helper must advertise the probe capability"
    );

    let events = match probe(&service, &fixture, &input, input.endpoints.clone(), true).await {
        Ok(events) => events,
        Err(error) => panic!(
            "the authenticated fixture read failed: {}",
            describe(&error)
        ),
    };

    assert!(!events.is_empty(), "the fixture must project status");
    let first = events
        .first()
        .unwrap_or_else(|| panic!("at least one projection"));
    assert_eq!(first.state, TalosProbeState::Healthy);
    assert_eq!(first.sequence, "0");
    let version = first
        .version
        .clone()
        .unwrap_or_else(|| panic!("an authenticated version"));
    assert_eq!(
        version, fixture.manifest.talos_version,
        "the fixture must report the pinned Talos version"
    );
    for window in events.windows(2) {
        let left: u64 = window[0]
            .sequence
            .parse()
            .unwrap_or_else(|_| panic!("decimal sequence"));
        let right: u64 = window[1]
            .sequence
            .parse()
            .unwrap_or_else(|_| panic!("decimal sequence"));
        assert!(right > left, "the live stream sequence must advance");
    }
    for event in &events {
        assert_eq!(event.session_id, input.session_id);
        if let Some(stage) = &event.stage {
            assert!(
                stage
                    .bytes()
                    .all(|byte| byte.is_ascii_alphanumeric() || byte == b'_'),
                "the stage projection must stay bounded"
            );
        }
    }
    println!(
        "fixture read: Talos {version}, stage {:?}, ready {:?}, projected events: {}",
        first.stage,
        first.ready,
        events.len()
    );

    // Prove the endpoint/node identity split against a target that is not one of
    // the API endpoints: the read proxies to it and the stream pins to it.
    let worker = fixture
        .manifest
        .allowed_nodes
        .iter()
        .find(|node| !fixture.manifest.allowed_endpoints.contains(node))
        .unwrap_or_else(|| panic!("the fixture manifest must record a non-endpoint node"));
    let worker_input = store
        .probe_input(&input.session_id, worker)
        .unwrap_or_else(|_| panic!("the recorded worker node must be selectable"));
    assert_eq!(&worker_input.node, worker);
    let worker_events = match probe(
        &service,
        &fixture,
        &worker_input,
        worker_input.endpoints.clone(),
        true,
    )
    .await
    {
        Ok(events) => events,
        Err(error) => panic!("the worker-node fixture read failed: {}", describe(&error)),
    };
    let worker_first = worker_events
        .first()
        .unwrap_or_else(|| panic!("the worker node must project status"));
    assert_eq!(worker_first.state, TalosProbeState::Healthy);
    assert_eq!(
        worker_first.version.as_deref(),
        Some(fixture.manifest.talos_version.as_str())
    );
    println!(
        "worker node {worker} read: stage {:?}, ready {:?}",
        worker_first.stage, worker_first.ready
    );

    service.shutdown().await;
}

/// The restricted identities the fixture issues from its admin credential.
///
/// `os:reader` is granted `/machine.MachineService/Version` and
/// `/cosi.resource.State/Watch`, so an authenticated read and the node-pinned
/// `MachineStatus` stream must both succeed. `os:etcd:backup` is granted only
/// `/machine.MachineService/EtcdAlarmList`, `EtcdMemberList`, `EtcdSnapshot`,
/// and `EtcdStatus`; every other method falls back to `os:admin`, so neither
/// the version read nor the watch is permitted. The pinned upstream rules are
/// [`machined.go`](https://github.com/siderolabs/talos/blob/v1.14.2/internal/app/machined/pkg/system/services/machined.go),
/// and the denial is asserted through the production path rather than a
/// synthetic one.
#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn reads_with_a_reader_identity_and_denies_a_credential_without_the_probe_roles() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let service = HelperService::default();

    let (_, reader_input) = import(
        &fixture,
        &fixture.reader_config,
        &fixture.manifest.reader_context,
    );
    let reader_events = match probe(
        &service,
        &fixture,
        &reader_input,
        reader_input.endpoints.clone(),
        true,
    )
    .await
    {
        Ok(events) => events,
        Err(error) => panic!(
            "the os:reader identity must complete the probe: {}",
            describe(&error)
        ),
    };
    let reader_first = reader_events
        .first()
        .unwrap_or_else(|| panic!("the os:reader identity must project status"));
    assert_eq!(reader_first.state, TalosProbeState::Healthy);
    assert_eq!(reader_first.sequence, "0");
    assert_eq!(
        reader_first.version.as_deref(),
        Some(fixture.manifest.talos_version.as_str()),
        "the reader identity must read the pinned Talos version"
    );
    println!(
        "os:reader read: Talos {:?}, stage {:?}, projected events: {}",
        reader_first.version,
        reader_first.stage,
        reader_events.len()
    );

    let (_, denied_input) = import(
        &fixture,
        &fixture.denied_config,
        &fixture.manifest.denied_context,
    );
    let started = std::time::Instant::now();
    let error = match probe(
        &service,
        &fixture,
        &denied_input,
        denied_input.endpoints.clone(),
        false,
    )
    .await
    {
        Ok(events) => panic!(
            "os:etcd:backup holds neither probe role, yet {} projections were accepted",
            events.len()
        ),
        Err(error) => error,
    };
    assert_eq!(
        error.code,
        "TALOS_UNAUTHORIZED",
        "the denial must surface as the permission state: {}",
        describe(&error)
    );
    assert!(
        !error.retryable,
        "a permission denial must not be retryable: {}",
        describe(&error)
    );
    println!(
        "os:etcd:backup denied: {} after {:?}",
        describe(&error),
        started.elapsed()
    );

    service.shutdown().await;
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn fails_closed_on_targets_and_authority_that_do_not_match() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);

    assert!(
        store
            .probe_input(&input.session_id, &fixture.manifest.negative_endpoint)
            .is_err(),
        "a node outside the imported config must create no helper work"
    );
    assert!(
        store
            .probe_input("talos-session-99999", &input.node)
            .is_err(),
        "an unknown session must create no helper work"
    );

    let service = HelperService::default();
    let (_foreign_store, foreign_input) = import(
        &fixture,
        &foreign_authority(&fixture.config),
        &fixture.manifest.context_name,
    );
    let error = match probe(
        &service,
        &fixture,
        &foreign_input,
        foreign_input.endpoints.clone(),
        false,
    )
    .await
    {
        Ok(events) => panic!(
            "an unrelated certificate authority must not establish trust, saw {} projections",
            events.len()
        ),
        Err(error) => error,
    };
    assert_eq!(
        error.code,
        "TALOS_CERTIFICATE_INVALID",
        "{}",
        describe(&error)
    );
    assert!(
        !error.retryable,
        "a TLS verification failure is not retryable"
    );

    let unreachable = match probe(
        &service,
        &fixture,
        &input,
        vec![fixture.manifest.negative_endpoint.clone()],
        false,
    )
    .await
    {
        Ok(events) => panic!(
            "an unreachable fixture endpoint must fail rather than hang, saw {} projections",
            events.len()
        ),
        Err(error) => error,
    };
    assert_eq!(
        unreachable.code,
        "TALOS_UNAVAILABLE",
        "{}",
        describe(&unreachable)
    );
    assert!(
        unreachable.retryable,
        "an unavailable target is classified retryable"
    );

    service.shutdown().await;
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn fails_over_to_a_reachable_allowlisted_endpoint() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (_store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();

    // The dead address leads the list on purpose: an ordinary read that still
    // succeeds proves the client fails over inside the backend allowlist instead
    // of depending on the first endpoint.
    let mut endpoints = vec![fixture.manifest.negative_endpoint.clone()];
    endpoints.extend(input.endpoints.iter().cloned());
    let events = match probe(&service, &fixture, &input, endpoints, true).await {
        Ok(events) => events,
        Err(error) => panic!(
            "the read must survive an unreachable leading endpoint: {}",
            describe(&error)
        ),
    };

    let first = events
        .first()
        .unwrap_or_else(|| panic!("a failover read must still project status"));
    assert_eq!(first.state, TalosProbeState::Healthy);
    assert_eq!(
        first.version.as_deref(),
        Some(fixture.manifest.talos_version.as_str())
    );
    println!(
        "failover read with a dead leading endpoint: stage {:?}, ready {:?}",
        first.stage, first.ready
    );

    service.shutdown().await;
}

/// Swaps the pinned fixture authority for an unrelated valid self-signed one, so
/// the real client must reject the peer chain during the TLS handshake.
fn foreign_authority(config: &Zeroizing<Vec<u8>>) -> Zeroizing<Vec<u8>> {
    let text = String::from_utf8(config.to_vec())
        .unwrap_or_else(|_| panic!("the fixture talosconfig must be UTF-8"));
    let authority = SYNTHETIC_AUTHORITY.trim();
    let lines = text.lines().collect::<Vec<_>>();
    let index = lines
        .iter()
        .position(|line| line.trim_start().starts_with("ca: "))
        .unwrap_or_else(|| panic!("the fixture context must carry inline authority"));
    let mutated = lines
        .iter()
        .enumerate()
        .map(|(position, line)| {
            if position == index {
                let indent = line.len() - line.trim_start().len();
                format!("{}ca: {authority}", " ".repeat(indent))
            } else {
                (*line).to_owned()
            }
        })
        .collect::<Vec<_>>()
        .join("\n");
    assert_ne!(mutated, text, "the authority must actually change");
    Zeroizing::new(mutated.into_bytes())
}

// ---------------------------------------------------------------------------
// F1 live evidence: multi-event, real interruption, reconnect outcome, and
// cancellation during reconnect.
//
// Interruptions use only the allowlisted worker reboot or its fixture-owned
// QEMU SIGSTOP/SIGCONT pair. Every case that changes worker availability waits
// for a fresh probe to report running before it finishes.
// ---------------------------------------------------------------------------

/// Serializes live cases: an interrupted worker would corrupt parallel reads.
/// The lock is held across awaits on purpose, so it is a Tokio mutex.
static LIVE_SERIAL: tokio::sync::Mutex<()> = tokio::sync::Mutex::const_new(());

fn worker_node(fixture: &Fixture) -> String {
    fixture
        .manifest
        .allowed_nodes
        .iter()
        .find(|node| !fixture.manifest.allowed_endpoints.contains(node))
        .unwrap_or_else(|| panic!("the fixture manifest must record a non-endpoint worker"))
        .clone()
}

fn worker_machine_name(fixture: &Fixture) -> String {
    format!("{}-worker-1", fixture.manifest.fixture_id)
}

/// Resolves this fixture's worker QEMU process by its state directory and
/// machine name. Requiring one match prevents signals from reaching any other VM.
fn worker_qemu_pid(fixture: &Fixture) -> u32 {
    let machine = worker_machine_name(fixture);
    let mut matches = Vec::new();
    for entry in std::fs::read_dir("/proc").unwrap_or_else(|_| panic!("/proc must be readable")) {
        let Ok(entry) = entry else { continue };
        let Ok(pid) = entry.file_name().to_string_lossy().parse::<u32>() else {
            continue;
        };
        let Ok(command) = std::fs::read_to_string(entry.path().join("cmdline")) else {
            continue;
        };
        let command = command.replace('\0', " ");
        if command.contains("qemu-system")
            && command.contains(&fixture.manifest.state_dir)
            && command.contains(&machine)
        {
            matches.push(pid);
        }
    }
    assert_eq!(
        matches.len(),
        1,
        "exactly one QEMU process must match state {} and machine {machine}",
        fixture.manifest.state_dir
    );
    matches[0]
}

fn signal_worker_qemu(fixture: &Fixture, signal: &str) -> u32 {
    let pid = worker_qemu_pid(fixture);
    let output = std::process::Command::new("sudo")
        .args(["-n", "kill", &format!("-{signal}"), &pid.to_string()])
        .output()
        .unwrap_or_else(|_| panic!("sudo must signal the identified worker QEMU process"));
    assert!(
        output.status.success(),
        "SIG{signal} of worker QEMU {pid} must be accepted: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    println!("worker QEMU {pid} received SIG{signal}");
    pid
}

/// Owns a suspended worker and resumes it on every drop path.
struct SuspendedWorker {
    pid: u32,
}

impl SuspendedWorker {
    fn stop(fixture: &Fixture) -> Self {
        Self {
            pid: signal_worker_qemu(fixture, "STOP"),
        }
    }

    fn resume(&self) {
        let output = std::process::Command::new("sudo")
            .args(["-n", "kill", "-CONT", &self.pid.to_string()])
            .output()
            .unwrap_or_else(|_| panic!("sudo must resume the identified worker QEMU process"));
        assert!(
            output.status.success(),
            "SIGCONT of worker QEMU {} must be accepted: {}",
            self.pid,
            String::from_utf8_lossy(&output.stderr)
        );
        println!("worker QEMU {} resumed", self.pid);
    }
}

impl Drop for SuspendedWorker {
    fn drop(&mut self) {
        let _ = std::process::Command::new("sudo")
            .args(["-n", "kill", "-CONT", &self.pid.to_string()])
            .output();
    }
}

/// Reboots the fixture's worker through its admin identity: the allowlisted
/// lifecycle action that generates real status events and interrupts the
/// authenticated stream.
async fn reboot_worker(fixture: &Fixture, worker: &str) {
    assert!(
        fixture
            .manifest
            .allowed_nodes
            .iter()
            .any(|node| node == worker),
        "the reboot target must be a recorded fixture node"
    );
    assert!(
        !fixture
            .manifest
            .allowed_endpoints
            .contains(&worker.to_owned()),
        "only the worker may be rebooted; a control-plane node is never a lifecycle target"
    );
    assert_eq!(
        worker,
        worker_node(fixture),
        "the reboot target must be the fixture's single worker"
    );
    let talosctl = reference(TALOSCTL_ENV);
    let config = reference(TALOSCONFIG_ENV);
    let worker = worker.to_owned();
    let command_worker = worker.clone();
    let output = tokio::task::spawn_blocking(move || {
        std::process::Command::new("sudo")
            .args(["-n", "-E"])
            .arg(&talosctl)
            .args(["--talosconfig"])
            .arg(&config)
            .args(["--nodes", &command_worker, "reboot"])
            .output()
    })
    .await
    .unwrap_or_else(|_| panic!("the blocking reboot task must complete"))
    .unwrap_or_else(|_| panic!("sudo must run the pinned talosctl for the allowlisted reboot"));
    assert!(
        output.status.success(),
        "the allowlisted worker reboot must be accepted: {}",
        String::from_utf8_lossy(&output.stderr)
    );
    println!("worker {worker} rebooted through the fixture admin identity");
}

/// Waits until a fresh probe projects the worker running again, so a later
/// live case starts from a healthy fixture.
async fn wait_for_worker_running(
    fixture: &Fixture,
    service: &HelperService,
    store: &TalosSessionStore,
    session_id: &str,
    worker: &str,
) {
    let deadline = tokio::time::Instant::now() + Duration::from_secs(240);
    loop {
        let input = store
            .probe_input(session_id, worker)
            .unwrap_or_else(|_| panic!("the worker node must stay selectable"));
        if let Ok(events) = probe(service, fixture, &input, input.endpoints.clone(), true).await
            && events.iter().any(|event| {
                event.state == TalosProbeState::Healthy && event.stage.as_deref() == Some("running")
            })
        {
            println!("worker {worker} reports running again");
            return;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "the worker must return to running within {deadline:?}"
        );
        tokio::time::sleep(Duration::from_secs(10)).await;
    }
}

#[derive(Default)]
struct Collector {
    events: Arc<Mutex<Vec<TalosProbeEventDto>>>,
    stale_at: Arc<Mutex<Option<tokio::time::Instant>>>,
}

impl Collector {
    fn sink(&self) -> impl FnMut(TalosProbeEventDto) -> Result<(), ()> + 'static {
        let sink = Arc::clone(&self.events);
        let stale_at = Arc::clone(&self.stale_at);
        move |event| {
            if event.state == TalosProbeState::Stale
                && let Ok(mut timestamp) = stale_at.lock()
            {
                *timestamp = Some(tokio::time::Instant::now());
            }
            if let Ok(mut held) = sink.lock() {
                held.push(event);
            }
            Ok(())
        }
    }

    fn snapshot(&self) -> Vec<TalosProbeEventDto> {
        self.events
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    /// Waits (bounded) until at least `count` events arrived.
    async fn wait_for_count(&self, count: usize, budget: Duration) {
        let deadline = tokio::time::Instant::now() + budget;
        loop {
            if self.snapshot().len() >= count {
                return;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "expected {count} projected events within {budget:?}"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    /// Waits (bounded) for the first stale marker of the stream.
    async fn wait_for_stale(&self, budget: Duration) -> tokio::time::Instant {
        let deadline = tokio::time::Instant::now() + budget;
        loop {
            if self
                .snapshot()
                .iter()
                .any(|event| event.state == TalosProbeState::Stale)
                && let Some(timestamp) = self.stale_at.lock().ok().and_then(|time| *time)
            {
                return timestamp;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "the interrupted projection must be marked stale within {budget:?}"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }

    async fn wait_for_replacement_snapshot(&self, budget: Duration) -> TalosProbeEventDto {
        let deadline = tokio::time::Instant::now() + budget;
        loop {
            if let Some(snapshot) = self.snapshot().into_iter().find(|event| {
                event.snapshot && event.state == TalosProbeState::Healthy && event.sequence != "0"
            }) {
                return snapshot;
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "the interrupted stream must recover with a replacement snapshot within {budget:?}"
            );
            tokio::time::sleep(Duration::from_millis(50)).await;
        }
    }
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn live_stall_exhausts_while_the_worker_is_suspended() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();
    let worker = worker_node(&fixture);
    let worker_input = store
        .probe_input(&input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable"));
    let collector = Collector::default();
    let session_id = worker_input.session_id.clone();
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(worker_input.config.to_vec()),
        worker_input.endpoints.clone(),
        worker_input.node.clone(),
        session_id.clone(),
        collector.sink(),
    );
    tokio::pin!(stream);
    collector.wait_for_count(1, FIRST_EVENT_DEADLINE).await;
    let last_projection = tokio::time::Instant::now();
    let suspended = SuspendedWorker::stop(&fixture);

    // Five seconds covers scheduling under the fixture's four-VM load and the
    // collector's 50 ms poll interval while keeping margin small relative to
    // the 45-second detection bound.
    let stale_at = collector.wait_for_stale(Duration::from_secs(50)).await;
    assert!(stale_at.duration_since(last_projection) <= Duration::from_secs(50));
    let elapsed = tokio::time::Instant::now().duration_since(last_projection);
    let terminal_budget = Duration::from_secs(97).saturating_sub(elapsed);
    let result = tokio::time::timeout(terminal_budget, &mut stream).await
        .unwrap_or_else(|_| panic!("stalled stream must terminate within 92 seconds plus 5 seconds of scheduling margin"));
    let error = result
        .err()
        .unwrap_or_else(|| panic!("a held worker suspension must exhaust the reconnect budget"));
    assert_eq!(error.code, "TALOS_UNAVAILABLE", "{}", describe(&error));
    let events = collector.snapshot();
    let stale_at_index = events
        .iter()
        .position(|event| event.state == TalosProbeState::Stale)
        .unwrap_or_else(|| panic!("the stalled stream must emit a stale marker"));
    assert!(
        events
            .iter()
            .skip(stale_at_index + 1)
            .all(|event| event.state != TalosProbeState::Healthy),
        "no projection may be current after stale: {events:?}"
    );
    println!(
        "suspended worker: stale after {:?}, terminal after {:?}: {}",
        stale_at.duration_since(last_projection),
        tokio::time::Instant::now().duration_since(last_projection),
        describe(&error)
    );

    suspended.resume();
    wait_for_worker_running(&fixture, &service, &store, &input.session_id, &worker).await;
    service.shutdown().await;
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn live_stall_recovers_when_the_worker_resumes() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();
    let worker = worker_node(&fixture);
    let worker_input = store
        .probe_input(&input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable"));
    let collector = Collector::default();
    let session_id = worker_input.session_id.clone();
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(worker_input.config.to_vec()),
        worker_input.endpoints.clone(),
        worker_input.node.clone(),
        session_id.clone(),
        collector.sink(),
    );
    tokio::pin!(stream);
    collector.wait_for_count(1, FIRST_EVENT_DEADLINE).await;
    let suspended = SuspendedWorker::stop(&fixture);
    collector.wait_for_stale(Duration::from_secs(50)).await;
    suspended.resume();

    let deadline = tokio::time::Instant::now() + Duration::from_secs(20);
    let snapshot = loop {
        if let Some(snapshot) = collector.snapshot().into_iter().find(|event| {
            event.snapshot && event.state == TalosProbeState::Healthy && event.sequence != "0"
        }) {
            break snapshot;
        }
        assert!(
            tokio::time::Instant::now() < deadline,
            "the resumed worker must deliver a replacement snapshot"
        );
        tokio::time::sleep(Duration::from_millis(50)).await;
    };
    let events = collector.snapshot();
    let stale_index = events
        .iter()
        .position(|event| event.state == TalosProbeState::Stale)
        .unwrap_or_else(|| panic!("the interruption must mark the projection stale"));
    let previous = events
        .get(stale_index.saturating_sub(1))
        .unwrap_or_else(|| panic!("the stale marker must follow a projection"));
    let sequence = previous
        .sequence
        .parse::<u64>()
        .unwrap_or_else(|_| panic!("decimal sequence"));
    let generation = previous
        .generation
        .parse::<u64>()
        .unwrap_or_else(|_| panic!("decimal generation"));
    assert_eq!(
        snapshot
            .generation
            .parse::<u64>()
            .unwrap_or_else(|_| panic!("decimal generation")),
        generation + 1
    );
    assert_eq!(
        snapshot
            .sequence
            .parse::<u64>()
            .unwrap_or_else(|_| panic!("decimal sequence")),
        sequence + 1
    );
    assert_eq!(snapshot.session_id, session_id);
    assert!(
        service.stop_talos_probe(&session_id),
        "the owning session must release its recovered stream"
    );
    assert!(
        tokio::time::timeout(Duration::from_secs(5), &mut stream)
            .await
            .unwrap_or_else(|_| panic!("the recovered stream must cancel promptly"))
            .is_ok()
    );
    wait_for_worker_running(&fixture, &service, &store, &input.session_id, &worker).await;
    println!(
        "resumed worker recovered under generation {} with sequence {}",
        snapshot.generation, snapshot.sequence
    );
    service.shutdown().await;
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn live_idle_stream_stays_current() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();
    let worker = worker_node(&fixture);
    let worker_input = store
        .probe_input(&input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable"));
    let collector = Collector::default();
    let session_id = worker_input.session_id.clone();
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(worker_input.config.to_vec()),
        worker_input.endpoints.clone(),
        worker_input.node.clone(),
        session_id.clone(),
        collector.sink(),
    );
    tokio::pin!(stream);
    collector.wait_for_count(1, FIRST_EVENT_DEADLINE).await;
    let observation = async { tokio::time::sleep(Duration::from_secs(65)).await };
    tokio::select! {
        result = &mut stream => panic!("an idle healthy stream ended: {result:?}"),
        () = observation => {}
    }
    let events = collector.snapshot();
    assert!(
        events
            .iter()
            .all(|event| event.state == TalosProbeState::Healthy),
        "idle stream must remain current: {events:?}"
    );
    let sequences = events
        .iter()
        .map(|event| {
            event
                .sequence
                .parse::<u64>()
                .unwrap_or_else(|_| panic!("decimal sequence"))
        })
        .collect::<Vec<_>>();
    assert!(
        sequences.windows(2).all(|pair| pair[1] >= pair[0]),
        "sequence must never go backwards: {sequences:?}"
    );
    assert!(
        service.stop_talos_probe(&session_id),
        "the owning session must release the idle stream"
    );
    assert!(
        tokio::time::timeout(Duration::from_secs(5), &mut stream)
            .await
            .unwrap_or_else(|_| panic!("the idle stream must cancel promptly"))
            .is_ok()
    );
    service.shutdown().await;
}

/// Asserts the real status changes and stale identity in the reboot row, then
/// returns the identity of the last data projection.
fn assert_live_interruption_shape(events: &[TalosProbeEventDto]) -> (u64, u64) {
    let stale_at = events
        .iter()
        .position(|event| event.state == TalosProbeState::Stale)
        .unwrap_or_else(|| panic!("the interruption must mark the projection stale"));
    let before = &events[..stale_at];
    assert!(
        before.len() >= 2,
        "the reboot must project several real status events before the interruption, saw {before:?}"
    );
    let bootstrap = &before[0];
    assert!(
        before[1..]
            .iter()
            .any(|event| { event.stage != bootstrap.stage || event.ready != bootstrap.ready }),
        "at least one real status change must be observed, saw {before:?}"
    );
    let stale = &events[stale_at];
    let previous = &events[stale_at - 1];
    assert_eq!(
        stale.sequence, previous.sequence,
        "a stale marker repeats the sequence it invalidates"
    );
    assert_eq!(stale.generation, previous.generation);
    assert!(!stale.snapshot, "a stale marker carries no snapshot");
    (
        previous
            .sequence
            .parse()
            .unwrap_or_else(|_| panic!("decimal sequence")),
        previous
            .generation
            .parse()
            .unwrap_or_else(|_| panic!("decimal generation")),
    )
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn live_reboot_asserts_outcome_against_measured_outage() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();
    let worker = worker_node(&fixture);
    let worker_input = store
        .probe_input(&input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable"));
    let collector = Collector::default();
    let session_id = worker_input.session_id.clone();
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(worker_input.config.to_vec()),
        worker_input.endpoints.clone(),
        worker_input.node.clone(),
        session_id.clone(),
        collector.sink(),
    );
    tokio::pin!(stream);

    collector.wait_for_count(1, FIRST_EVENT_DEADLINE).await;
    let reboot_started_at = tokio::time::Instant::now();
    let reboot = reboot_worker(&fixture, &worker);
    tokio::pin!(reboot);
    let mut terminal = None;
    let mut stale_at = None;
    tokio::select! {
        result = &mut stream => terminal = Some(result),
        _ = async {
            (&mut reboot).await;
            stale_at = Some(collector.wait_for_stale(Duration::from_secs(60)).await);
        } => {}
    }
    if stale_at.is_none() {
        reboot.await;
        stale_at = Some(collector.wait_for_stale(Duration::from_secs(60)).await);
    }
    let stale_at = stale_at
        .or_else(|| collector.stale_at.lock().ok().and_then(|value| *value))
        .unwrap_or_else(|| panic!("the reboot interruption must produce a stale marker"));
    let stale_after_reboot = stale_at.duration_since(reboot_started_at);

    // A separate service owns the fresh probe so it cannot cancel or replace
    // the stream whose reboot outcome is being measured.
    let (fresh_store, fresh_input) =
        import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let fresh_worker_input = fresh_store
        .probe_input(&fresh_input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable for the fresh probe"));
    let fresh_service = HelperService::default();
    let fresh_probe = async {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(240);
        loop {
            if let Ok(events) = probe(
                &fresh_service,
                &fixture,
                &fresh_worker_input,
                fresh_worker_input.endpoints.clone(),
                true,
            )
            .await
                && events.iter().any(|event| {
                    event.state == TalosProbeState::Healthy
                        && event.stage.as_deref() == Some("running")
                })
            {
                return tokio::time::Instant::now();
            }
            assert!(
                tokio::time::Instant::now() < deadline,
                "the rebooted worker must become probeable within four minutes after talosctl reboot completes"
            );
            tokio::time::sleep(Duration::from_secs(2)).await;
        }
    };
    tokio::pin!(fresh_probe);
    let replacement = collector.wait_for_replacement_snapshot(Duration::from_secs(90));
    tokio::pin!(replacement);
    let mut fresh_at = None;
    let mut replacement_snapshot = None;
    while fresh_at.is_none() || (terminal.is_none() && replacement_snapshot.is_none()) {
        tokio::select! {
            result = &mut stream, if terminal.is_none() => terminal = Some(result),
            ready_at = &mut fresh_probe, if fresh_at.is_none() => fresh_at = Some(ready_at),
            snapshot = &mut replacement, if replacement_snapshot.is_none() => replacement_snapshot = Some(snapshot),
        }
    }
    let outage =
        fresh_at.unwrap_or_else(|| panic!("the fresh worker probe must complete")) - stale_at;
    // Three 15-second attempts plus the 0.5s and 1s backoffs, with maximum
    // jitter, cover 46.8 seconds; the extra margin covers scheduling only.
    let budget = Duration::from_millis(46_800);
    let events = collector.snapshot();
    let (sequence, generation) = assert_live_interruption_shape(&events);
    let snapshot = replacement_snapshot.or_else(|| {
        events
            .iter()
            .find(|event| {
                event.snapshot && event.state == TalosProbeState::Healthy && event.sequence != "0"
            })
            .cloned()
    });
    if outage > budget {
        let error = terminal.and_then(Result::err)
            .unwrap_or_else(|| panic!("reboot outage {outage:?} exceeded reconnect budget but stream did not end terminally"));
        assert_eq!(error.code, "TALOS_UNAVAILABLE", "{}", describe(&error));
        println!(
            "reboot stale marker arrived {stale_after_reboot:?} after reboot start; outage to fresh worker probe: {outage:?}; terminal outcome: {}",
            describe(&error)
        );
    } else {
        let snapshot = snapshot.unwrap_or_else(|| panic!("reboot outage {outage:?} fit the reconnect budget but no replacement snapshot arrived"));
        assert_eq!(
            snapshot
                .generation
                .parse::<u64>()
                .unwrap_or_else(|_| panic!("decimal generation")),
            generation + 1
        );
        assert_eq!(
            snapshot
                .sequence
                .parse::<u64>()
                .unwrap_or_else(|_| panic!("decimal sequence")),
            sequence + 1
        );
        assert_eq!(snapshot.session_id, session_id);
        assert!(
            service.stop_talos_probe(&session_id),
            "the owning session must release the recovered stream"
        );
        assert!(
            stream.await.is_ok(),
            "the recovered reboot stream must cancel cleanly"
        );
        println!(
            "reboot stale marker arrived {stale_after_reboot:?} after reboot start; outage to fresh worker probe: {outage:?}; recovered under generation {}",
            snapshot.generation
        );
    }

    wait_for_worker_running(&fixture, &service, &store, &input.session_id, &worker).await;
    fresh_service.shutdown().await;
    drop(fresh_store);
    service.shutdown().await;
}

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn live_cancellation_during_reconnect_ends_promptly() {
    let _serial = LIVE_SERIAL.lock().await;
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config, &fixture.manifest.context_name);
    let service = HelperService::default();
    let worker = worker_node(&fixture);
    let worker_input = store
        .probe_input(&input.session_id, &worker)
        .unwrap_or_else(|_| panic!("the worker node must be selectable"));
    let collector = Collector::default();
    let session_id = worker_input.session_id.clone();
    let stream = service.talos_probe(
        &fixture.helper,
        Zeroizing::new(worker_input.config.to_vec()),
        worker_input.endpoints.clone(),
        worker_input.node.clone(),
        session_id.clone(),
        collector.sink(),
    );
    tokio::pin!(stream);

    let cancel = async {
        collector.wait_for_count(1, FIRST_EVENT_DEADLINE).await;
        reboot_worker(&fixture, &worker).await;
        collector.wait_for_stale(Duration::from_secs(60)).await;
        // The helper is now in its backoff or a reconnect attempt: cancelling
        // must be acknowledged instead of waiting out the policy.
        let started = tokio::time::Instant::now();
        assert!(
            service.stop_talos_probe(&session_id),
            "the owning session must release its reconnecting stream"
        );
        started
    };

    let started;
    tokio::select! {
        _ = &mut stream => {
            panic!("the stream may not end before the cancellation");
        }
        begin = cancel => {
            started = begin;
        }
    }
    let result = tokio::time::timeout(Duration::from_secs(5), &mut stream)
        .await
        .unwrap_or_else(|_| panic!("cancellation must end the stream within five seconds"));
    assert!(
        result.is_ok(),
        "a cancelled stream ends cleanly: {result:?}"
    );
    println!(
        "live cancellation during reconnect acknowledged in {:?}",
        started.elapsed()
    );

    wait_for_worker_running(&fixture, &service, &store, &input.session_id, &worker).await;
    service.shutdown().await;
}
