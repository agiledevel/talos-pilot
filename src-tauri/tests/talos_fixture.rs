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
const HELPER_ENV: &str = "TALOS_PILOT_FIXTURE_HELPER";
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
    allowed_endpoints: Vec<String>,
    allowed_nodes: Vec<String>,
    /// One unassigned address inside the fixture CIDR, used only to prove the
    /// unreachable-target classification.
    negative_endpoint: String,
}

struct Fixture {
    manifest: FixtureManifest,
    config: Zeroizing<Vec<u8>>,
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
    if !helper_path.exists() {
        panic!(
            "{HELPER_ENV} must reference the built helper, {} is absent",
            helper_path.display()
        );
    }

    Fixture {
        manifest,
        config,
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
        manifest.talos_version, "v1.14.1",
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
fn import(fixture: &Fixture, config: &Zeroizing<Vec<u8>>) -> (TalosSessionStore, TalosProbeInput) {
    let store = TalosSessionStore::default();
    let session = store
        .insert(Zeroizing::new(config.to_vec()))
        .unwrap_or_else(|_| {
            panic!("the fixture talosconfig must import as a session-only context")
        });
    assert_eq!(session.context_name, fixture.manifest.context_name);
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
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config);
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

#[tokio::test]
#[ignore = "requires the allowlisted disposable Talos fixture"]
async fn fails_closed_on_targets_and_authority_that_do_not_match() {
    let fixture = fixture();
    let (store, input) = import(&fixture, &fixture.config);

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
    let (_foreign_store, foreign_input) = import(&fixture, &foreign_authority(&fixture.config));
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
    let fixture = fixture();
    let (_store, input) = import(&fixture, &fixture.config);
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
