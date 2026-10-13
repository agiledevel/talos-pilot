//! Bounded Pod watch projection built on kube's recovering list/watch stream.

use std::{
    collections::BTreeMap,
    io,
    sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    },
    time::Duration,
};

use futures_util::StreamExt;
use k8s_openapi::api::core::v1::Pod;
use kube::{
    Client,
    api::Api,
    runtime::watcher::{self, Event as WatcherEvent},
};
use tokio::sync::{mpsc, oneshot};

use super::list;

/// Maximum number of watch subscriptions across all Kubernetes sessions.
pub const MAX_KUBERNETES_WATCHES: usize = 7;
/// Maximum queued watch messages for one subscription.
pub const WATCH_QUEUE_MESSAGES: usize = 64;
/// Maximum queued projected bytes for one subscription.
pub const WATCH_QUEUE_BYTES: usize = 8 * 1024 * 1024;
/// Maximum projected Pods in one initial or replacement generation.
pub const MAX_WATCH_PODS: usize = 10_000;
/// Maximum serialized size accepted for one decoded Kubernetes Pod event.
pub const MAX_WATCH_EVENT_BYTES: usize = 2 * 1024 * 1024;
/// Maximum projected Pods in a snapshot batch.
pub const WATCH_BATCH_ITEMS: usize = 200;
const RELIST_LIMIT: usize = 3;
const SNAPSHOT_DEADLINE: Duration = Duration::from_secs(60);
const RETRY_DELAYS: [Duration; 2] = [Duration::from_millis(500), Duration::from_secs(1)];

/// One bounded projection event emitted by an owned Pod watch.
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PodWatchChange {
    /// A new complete generation is being assembled; previous data remains stale.
    SnapshotBegin,
    /// A bounded chunk from the complete generation being assembled.
    SnapshotBatch(Vec<list::PodProjection>),
    /// The complete snapshot generation is ready to replace the previous view.
    SnapshotComplete,
    /// A Pod was created or updated, keyed by its Kubernetes UID.
    Upsert(list::PodProjection),
    /// A Pod UID was deleted. A recreated name arrives as a different UID.
    Delete {
        /// Deleted object's server identity.
        uid: String,
        /// Deleted object's display name.
        name: String,
    },
    /// Recovery exhausted its relist or transient-failure budget.
    Stale,
}

/// Ordered watch event with backend-owned generation and sequence identities.
#[derive(Debug)]
pub struct PodWatchMessage {
    /// Generation of the snapshot or event.
    pub generation: u64,
    /// Monotonic sequence for this subscription, starting at one.
    pub sequence: u64,
    /// Projection change.
    pub change: PodWatchChange,
    _queue_lease: QueueLease,
}

/// Receiver and cancellation signal for one session-owned watch.
pub struct PodWatchReceiver {
    /// Backend-generated subscription identity.
    pub subscription_id: String,
    /// Receives ordered projection events. Dropping the receiver stops delivery.
    pub messages: mpsc::Receiver<PodWatchMessage>,
    /// Reports why the producer ended, including overflow when a full queue cannot carry a marker.
    pub terminal: oneshot::Receiver<PodWatchEnd>,
    pub(super) cancellation: tokio::sync::watch::Sender<bool>,
}

impl PodWatchReceiver {
    /// Creates a cancellation observer for a native channel delivery task.
    pub(crate) fn cancellation_receiver(&self) -> tokio::sync::watch::Receiver<bool> {
        self.cancellation.subscribe()
    }
}

impl Drop for PodWatchReceiver {
    fn drop(&mut self) {
        self.cancellation.send_replace(true);
    }
}

/// Terminal state delivered out of band so a full data queue cannot hide it.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum PodWatchEnd {
    /// The owner explicitly stopped the subscription.
    Stopped,
    /// Recovery exhausted its relist or transient failure budget.
    Stale,
    /// The API rejected the query, credentials, or watch capability.
    Failed,
    /// The bounded event queue filled or exceeded its byte budget.
    QueueOverflow,
    /// The API returned an unsupported Pod projection.
    InvalidProjection,
}

/// Inputs and owned resources for one running watch task.
pub(super) struct WatchRun {
    pub client: Client,
    pub namespace: String,
    pub label_selector: Option<String>,
    pub field_selector: Option<String>,
    pub projection_bytes: Arc<AtomicUsize>,
    pub cancellation: tokio::sync::watch::Receiver<bool>,
    pub messages: mpsc::Sender<PodWatchMessage>,
    pub queue_bytes: Arc<AtomicUsize>,
}

/// Starts one bounded kube watcher and translates recovery events into projections.
pub(super) async fn run_pod_watch(run: WatchRun) -> PodWatchEnd {
    let WatchRun {
        client,
        namespace,
        label_selector,
        field_selector,
        projection_bytes,
        cancellation,
        messages,
        queue_bytes,
    } = run;
    let api = Api::<Pod>::namespaced(client, &namespace);
    let mut config = watcher::Config {
        page_size: Some(list::PAGE_LIMIT),
        label_selector,
        field_selector,
        ..watcher::Config::default()
    };
    config.timeout = Some(290);
    let mut stream = Box::pin(watcher::watcher(api, config));
    let mut cancellation = Box::pin(cancellation);
    let mut current = BTreeMap::<String, list::PodProjection>::new();
    let mut staging = BTreeMap::<String, list::PodProjection>::new();
    let mut generation = 0_u64;
    let mut sequence = 0_u64;
    let mut relists_without_update = 0_usize;
    let mut failures = 0_usize;
    let mut snapshot_building = false;
    let snapshot_timer = tokio::time::sleep(SNAPSHOT_DEADLINE);
    tokio::pin!(snapshot_timer);
    let mut staging_lease = ProjectionLease::new(Arc::clone(&projection_bytes));
    let mut current_lease = ProjectionLease::new(Arc::clone(&projection_bytes));

    let mut end = PodWatchEnd::Stopped;
    loop {
        let item = tokio::select! {
            _ = cancellation.changed() => break,
            _ = &mut snapshot_timer, if snapshot_building => {
                end = PodWatchEnd::Stale;
                let _ = emit(
                    &messages,
                    &queue_bytes,
                    &mut sequence,
                    generation,
                    PodWatchChange::Stale,
                )
                .await;
                break;
            }
            item = stream.next() => item,
        };
        let Some(item) = item else {
            end = PodWatchEnd::Stale;
            break;
        };

        match item {
            Err(error) => {
                match classify_watch_error(&error) {
                    WatchErrorClass::Relist => continue,
                    WatchErrorClass::Fatal => {
                        end = PodWatchEnd::Failed;
                        let _ = emit(
                            &messages,
                            &queue_bytes,
                            &mut sequence,
                            generation,
                            PodWatchChange::Stale,
                        )
                        .await;
                        break;
                    }
                    WatchErrorClass::Transient => {}
                }
                failures += 1;
                if failures >= 3 {
                    end = PodWatchEnd::Stale;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                }
                let delay = RETRY_DELAYS[failures - 1];
                tokio::select! {
                    _ = cancellation.changed() => break,
                    _ = tokio::time::sleep(delay) => {}
                }
            }
            Ok(WatcherEvent::Init) => {
                snapshot_building = true;
                snapshot_timer
                    .as_mut()
                    .reset(tokio::time::Instant::now() + SNAPSHOT_DEADLINE);
                if generation > 0 {
                    if relists_without_update >= RELIST_LIMIT {
                        end = PodWatchEnd::Stale;
                        let _ = emit(
                            &messages,
                            &queue_bytes,
                            &mut sequence,
                            generation,
                            PodWatchChange::Stale,
                        )
                        .await;
                        break;
                    }
                    relists_without_update += 1;
                }
                staging.clear();
                staging_lease = ProjectionLease::new(Arc::clone(&projection_bytes));
                let Some(next_generation) = generation.checked_add(1) else {
                    end = PodWatchEnd::Stale;
                    break;
                };
                if emit(
                    &messages,
                    &queue_bytes,
                    &mut sequence,
                    next_generation,
                    PodWatchChange::SnapshotBegin,
                )
                .await
                .is_err()
                {
                    end = PodWatchEnd::QueueOverflow;
                    break;
                }
            }
            Ok(WatcherEvent::InitApply(pod)) => {
                if !within_decoded_event_limit(&pod) {
                    end = PodWatchEnd::InvalidProjection;
                    break;
                }
                let Ok(projection) = list::project_pod(pod) else {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                };
                if projection.namespace != namespace
                    || !insert_projection(&mut staging, &mut staging_lease, projection)
                {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                }
            }
            Ok(WatcherEvent::InitDone) => {
                snapshot_building = false;
                let Some(next_generation) = generation.checked_add(1) else {
                    return PodWatchEnd::Stale;
                };
                generation = next_generation;
                current = std::mem::take(&mut staging);
                current_lease = std::mem::replace(
                    &mut staging_lease,
                    ProjectionLease::new(Arc::clone(&projection_bytes)),
                );
                let mut batch = Vec::with_capacity(WATCH_BATCH_ITEMS);
                for projection in current.values() {
                    batch.push(projection.clone());
                    if batch.len() == WATCH_BATCH_ITEMS {
                        if emit(
                            &messages,
                            &queue_bytes,
                            &mut sequence,
                            generation,
                            PodWatchChange::SnapshotBatch(std::mem::take(&mut batch)),
                        )
                        .await
                        .is_err()
                        {
                            return PodWatchEnd::QueueOverflow;
                        }
                        batch = Vec::with_capacity(WATCH_BATCH_ITEMS);
                    }
                }
                if !batch.is_empty()
                    && emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::SnapshotBatch(batch),
                    )
                    .await
                    .is_err()
                {
                    return PodWatchEnd::QueueOverflow;
                }
                if emit(
                    &messages,
                    &queue_bytes,
                    &mut sequence,
                    generation,
                    PodWatchChange::SnapshotComplete,
                )
                .await
                .is_err()
                {
                    return PodWatchEnd::QueueOverflow;
                }
                failures = 0;
            }
            Ok(WatcherEvent::Apply(pod)) => {
                if !within_decoded_event_limit(&pod) {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                }
                let Ok(projection) = list::project_pod(pod) else {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                };
                if projection.namespace != namespace
                    || current.get(&projection.uid).is_some_and(|existing| {
                        existing.resource_version == projection.resource_version
                            && existing != &projection
                    })
                {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                }
                if current.get(&projection.uid).is_some_and(|existing| {
                    existing.resource_version == projection.resource_version
                }) {
                    // The list/watch boundary may repeat an object already
                    // present in the current generation; identical resource
                    // versions are ignored, while conflicting projections
                    // for one version are rejected above.
                    continue;
                }
                if !replace_current(&mut current, &mut current_lease, projection.clone()) {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                }
                relists_without_update = 0;
                failures = 0;
                if emit(
                    &messages,
                    &queue_bytes,
                    &mut sequence,
                    generation,
                    PodWatchChange::Upsert(projection),
                )
                .await
                .is_err()
                {
                    end = PodWatchEnd::QueueOverflow;
                    break;
                }
            }
            Ok(WatcherEvent::Delete(pod)) => {
                if !within_decoded_event_limit(&pod) {
                    end = PodWatchEnd::InvalidProjection;
                    break;
                }
                let Ok(projection) = list::project_pod(pod) else {
                    end = PodWatchEnd::InvalidProjection;
                    let _ = emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Stale,
                    )
                    .await;
                    break;
                };
                if projection.namespace != namespace {
                    end = PodWatchEnd::InvalidProjection;
                    break;
                }
                if let Some(removed) = current.remove(&projection.uid) {
                    current_lease.release(list::projection_size(&removed));
                    relists_without_update = 0;
                    failures = 0;
                    if emit(
                        &messages,
                        &queue_bytes,
                        &mut sequence,
                        generation,
                        PodWatchChange::Delete {
                            uid: removed.uid,
                            name: removed.name,
                        },
                    )
                    .await
                    .is_err()
                    {
                        end = PodWatchEnd::QueueOverflow;
                        break;
                    }
                }
            }
        }
    }
    end
}

fn within_decoded_event_limit(pod: &Pod) -> bool {
    struct BoundedCounter {
        count: usize,
    }

    impl io::Write for BoundedCounter {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            let Some(next) = self.count.checked_add(bytes.len()) else {
                return Err(io::Error::other("decoded event size overflow"));
            };
            if next > MAX_WATCH_EVENT_BYTES {
                return Err(io::Error::other("decoded event exceeds the size limit"));
            }
            self.count = next;
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    serde_json::to_writer(&mut BoundedCounter { count: 0 }, pod).is_ok()
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
enum WatchErrorClass {
    Relist,
    Transient,
    Fatal,
}

fn classify_watch_error(error: &watcher::Error) -> WatchErrorClass {
    use watcher::Error::{InitialListFailed, WatchError, WatchFailed, WatchStartFailed};

    if super::watch_transport::is_watch_event_too_large(error) {
        return WatchErrorClass::Fatal;
    }

    match error {
        InitialListFailed(error) | WatchFailed(error) | WatchStartFailed(error) => {
            if matches!(
                super::KubernetesError::from_kube(error),
                super::KubernetesError::Unavailable
            ) {
                WatchErrorClass::Transient
            } else {
                WatchErrorClass::Fatal
            }
        }
        WatchError(status) if status.code == 410 => WatchErrorClass::Relist,
        WatchError(status) if matches!(status.code, 429 | 500 | 502 | 503 | 504) => {
            WatchErrorClass::Transient
        }
        WatchError(_) | watcher::Error::NoResourceVersion => WatchErrorClass::Fatal,
    }
}

async fn emit(
    sender: &mpsc::Sender<PodWatchMessage>,
    queued_bytes: &Arc<AtomicUsize>,
    sequence: &mut u64,
    generation: u64,
    change: PodWatchChange,
) -> Result<(), ()> {
    let Some(next_sequence) = sequence.checked_add(1) else {
        return Err(());
    };
    let size = change_size(&change);
    let mut observed = queued_bytes.load(Ordering::Acquire);
    loop {
        let Some(next) = observed.checked_add(size) else {
            return Err(());
        };
        if next > WATCH_QUEUE_BYTES {
            return Err(());
        }
        match queued_bytes.compare_exchange_weak(
            observed,
            next,
            Ordering::AcqRel,
            Ordering::Acquire,
        ) {
            Ok(_) => break,
            Err(actual) => observed = actual,
        }
    }
    *sequence = next_sequence;
    let message = PodWatchMessage {
        generation,
        sequence: *sequence,
        change,
        _queue_lease: QueueLease {
            used: Arc::clone(queued_bytes),
            bytes: size,
        },
    };
    match sender.try_send(message) {
        Ok(()) => Ok(()),
        Err(error) => {
            drop(error.into_inner());
            Err(())
        }
    }
}

fn change_size(change: &PodWatchChange) -> usize {
    match change {
        PodWatchChange::SnapshotBatch(items) => items.iter().map(list::projection_size).sum(),
        PodWatchChange::Upsert(item) => list::projection_size(item),
        PodWatchChange::Delete { uid, name } => uid.len() + name.len(),
        PodWatchChange::SnapshotBegin
        | PodWatchChange::SnapshotComplete
        | PodWatchChange::Stale => 32,
    }
}

fn insert_projection(
    objects: &mut BTreeMap<String, list::PodProjection>,
    lease: &mut ProjectionLease,
    projection: list::PodProjection,
) -> bool {
    if objects.len() >= MAX_WATCH_PODS && !objects.contains_key(&projection.uid) {
        return false;
    }
    let previous = objects.remove(&projection.uid);
    if let Some(previous) = &previous {
        lease.release(list::projection_size(previous));
    }
    let size = list::projection_size(&projection);
    if !lease.reserve(size) {
        if let Some(previous) = previous {
            let previous_size = list::projection_size(&previous);
            if lease.reserve(previous_size) {
                objects.insert(previous.uid.clone(), previous);
            }
        }
        return false;
    }
    objects.insert(projection.uid.clone(), projection);
    true
}

fn replace_current(
    objects: &mut BTreeMap<String, list::PodProjection>,
    lease: &mut ProjectionLease,
    projection: list::PodProjection,
) -> bool {
    insert_projection(objects, lease, projection)
}

struct ProjectionLease {
    used: Arc<AtomicUsize>,
    bytes: usize,
}

impl ProjectionLease {
    fn new(used: Arc<AtomicUsize>) -> Self {
        Self { used, bytes: 0 }
    }

    fn reserve(&mut self, bytes: usize) -> bool {
        let mut observed = self.used.load(Ordering::Acquire);
        loop {
            let Some(next) = observed.checked_add(bytes) else {
                return false;
            };
            if next > list::MAX_PROJECTION_BYTES {
                return false;
            }
            match self.used.compare_exchange_weak(
                observed,
                next,
                Ordering::AcqRel,
                Ordering::Acquire,
            ) {
                Ok(_) => {
                    self.bytes = self.bytes.saturating_add(bytes);
                    return true;
                }
                Err(actual) => observed = actual,
            }
        }
    }

    fn release(&mut self, bytes: usize) {
        self.bytes = self.bytes.saturating_sub(bytes);
        self.used.fetch_sub(bytes, Ordering::AcqRel);
    }
}

impl Drop for ProjectionLease {
    fn drop(&mut self) {
        self.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}

#[derive(Debug)]
struct QueueLease {
    used: Arc<AtomicUsize>,
    bytes: usize,
}

impl Drop for QueueLease {
    fn drop(&mut self) {
        self.used.fetch_sub(self.bytes, Ordering::AcqRel);
    }
}

#[cfg(test)]
mod tests {
    use std::{
        collections::BTreeMap,
        sync::{Arc, atomic::AtomicUsize},
        time::Duration,
    };

    use tokio::{sync::mpsc, time::timeout};

    use super::{
        MAX_WATCH_EVENT_BYTES, PodWatchChange, PodWatchEnd, WATCH_QUEUE_MESSAGES, WatchRun,
        run_pod_watch, within_decoded_event_limit,
    };
    use crate::kubernetes::synthetic::{
        SyntheticApiserver, SyntheticResponse, build_test_watch_client,
        build_test_watch_client_with_deadline,
    };

    #[test]
    fn rejects_a_decoded_pod_event_over_two_mibibytes_without_building_a_second_large_buffer() {
        let mut pod = k8s_openapi::api::core::v1::Pod::default();
        pod.metadata.annotations = Some(BTreeMap::from([(
            "synthetic-size-check".to_owned(),
            "x".repeat(MAX_WATCH_EVENT_BYTES + 1),
        )]));
        assert!(!within_decoded_event_limit(&pod));
        assert!(within_decoded_event_limit(
            &k8s_openapi::api::core::v1::Pod::default()
        ));
    }

    #[tokio::test]
    async fn recovering_watcher_publishes_only_a_complete_bounded_initial_generation() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        let mut generation = Vec::new();
        let mut saw_begin = false;
        let completed = timeout(Duration::from_secs(5), async {
            loop {
                let Some(message) = receiver.recv().await else {
                    return false;
                };
                match &message.change {
                    PodWatchChange::SnapshotBegin => {
                        saw_begin = true;
                        generation.clear();
                    }
                    PodWatchChange::SnapshotBatch(items) => {
                        generation.extend(items.iter().cloned())
                    }
                    PodWatchChange::SnapshotComplete => return true,
                    _ => {}
                }
                assert!(message.sequence > 0);
                drop(message);
            }
        })
        .await;

        assert!(matches!(completed, Ok(true)));
        assert!(saw_begin);
        assert_eq!(generation.len(), 2);
        assert_eq!(generation[0].name, "first");
        assert_eq!(generation[1].name, "second");
        assert_eq!(generation[0].uid, "uid-first");
        assert_eq!(generation[1].uid, "uid-second");

        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("watch task should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn synthetic_watch_ignores_duplicate_updates_and_tracks_uid_recreation() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        let mut changes = Vec::new();
        let received = timeout(Duration::from_secs(5), async {
            while changes.len() < 6 {
                let Some(message) = receiver.recv().await else {
                    break;
                };
                changes.push(message.change.clone());
                drop(message);
            }
        })
        .await;
        assert!(
            received.is_ok(),
            "synthetic watch events should arrive promptly; changes={changes:?}; requests={:?}",
            server.requests()
        );
        assert!(matches!(
            changes.first(),
            Some(PodWatchChange::SnapshotBegin)
        ));
        assert!(
            matches!(changes.get(1), Some(PodWatchChange::SnapshotBatch(items)) if items.len() == 2)
        );
        assert!(matches!(
            changes.get(2),
            Some(PodWatchChange::SnapshotComplete)
        ));
        assert!(
            matches!(changes.get(3), Some(PodWatchChange::Upsert(pod)) if pod.uid == "uid-first" && pod.resource_version == "43")
        );
        assert!(
            matches!(changes.get(4), Some(PodWatchChange::Delete { uid, name }) if uid == "uid-second" && name == "second")
        );
        assert!(
            matches!(changes.get(5), Some(PodWatchChange::Upsert(pod)) if pod.name == "second" && pod.uid == "uid-second-recreated")
        );

        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("watch task should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn a_closed_watch_stream_reopens_and_delivers_new_events() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_response(SyntheticResponse::ClosingWatch);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        let mut initial_generation = None;
        let mut resumed_event = false;
        let received = timeout(Duration::from_secs(5), async {
            while initial_generation.is_none() || !resumed_event {
                let Some(message) = receiver.recv().await else {
                    break;
                };
                if matches!(&message.change, PodWatchChange::SnapshotComplete)
                    && initial_generation.is_none()
                {
                    initial_generation = Some(message.generation);
                }
                if matches!(&message.change, PodWatchChange::Upsert(pod) if pod.name == "resumed" && pod.uid == "uid-resumed")
                {
                    resumed_event = true;
                }
                drop(message);
            }
        })
        .await;
        assert!(
            received.is_ok(),
            "the closed watch should reconnect and deliver a distinct event; requests={:?}",
            server.requests()
        );
        assert!(initial_generation.is_some());
        assert!(resumed_event);
        assert!(
            server
                .requests()
                .iter()
                .filter(|request| request.path.contains("watch=true"))
                .count()
                >= 2,
            "the watcher should establish a replacement watch after stream closure"
        );

        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("watch task should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn watch_response_headers_are_bounded_without_timing_out_a_quiet_body() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_response(SyntheticResponse::StallWatchResponse);
        let client = build_test_watch_client_with_deadline(
            &server.kubeconfig("watch-context", "watch-cluster"),
            Duration::from_millis(100),
        )
        .unwrap_or_else(|_| panic!("synthetic watch client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        timeout(Duration::from_secs(3), async {
            loop {
                let watch_requests = server
                    .requests()
                    .iter()
                    .filter(|request| request.path.contains("watch=true"))
                    .count();
                if watch_requests >= 2 {
                    break;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("the bounded response timeout should permit a retry"));
        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("watch cancellation should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn established_quiet_watch_body_survives_past_the_header_deadline() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        let client = build_test_watch_client_with_deadline(
            &server.kubeconfig("watch-context", "watch-cluster"),
            Duration::from_millis(100),
        )
        .unwrap_or_else(|_| panic!("synthetic watch client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        timeout(Duration::from_secs(3), async {
            while let Some(message) = receiver.recv().await {
                let complete = matches!(message.change, PodWatchChange::SnapshotComplete);
                drop(message);
                if complete {
                    break;
                }
            }
        })
        .await
        .unwrap_or_else(|_| panic!("the initial list should finish"));
        tokio::time::sleep(Duration::from_millis(200)).await;
        assert!(
            !task.is_finished(),
            "quiet watch bodies have no idle read timeout"
        );
        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("watch cancellation should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn oversized_watch_line_fails_before_kube_decodes_the_pod() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_response(SyntheticResponse::OversizedWatchEvent);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic watch client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (_cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        assert_eq!(
            timeout(Duration::from_secs(5), task)
                .await
                .unwrap_or_else(|_| panic!("oversized watch event should be rejected promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Failed
        );
        assert!(
            server
                .requests()
                .iter()
                .any(|request| request.path.contains("watch=true")),
            "the synthetic watch event must reach the response body guard"
        );
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn closed_consumer_releases_queued_bytes_and_ends_the_producer() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (_cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));
        drop(receiver);
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("closed consumer should stop watch"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::QueueOverflow
        );
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn permission_denial_ends_without_retrying_the_watch_request() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_response(SyntheticResponse::RequestDenied);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (_cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("permission denial should end promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Failed
        );
        assert_eq!(server.requests().len(), 1);
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn expired_watch_versions_relist_three_complete_generations_then_go_stale() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_response(SyntheticResponse::ExpiredWatch);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (_cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        let mut complete_generations = 0;
        let mut previous_sequence = 0;
        let mut stale_marker = false;
        timeout(Duration::from_secs(5), async {
            while let Some(message) = receiver.recv().await {
                assert_eq!(message.sequence, previous_sequence + 1);
                previous_sequence = message.sequence;
                match message.change {
                    PodWatchChange::SnapshotComplete => complete_generations += 1,
                    PodWatchChange::Stale => stale_marker = true,
                    _ => {}
                }
                if stale_marker {
                    break;
                }
            }
        })
        .await
        .unwrap_or_else(|_| panic!("three expired resource versions should exhaust promptly"));
        assert!(stale_marker);
        assert_eq!(
            complete_generations, 4,
            "initial list plus three atomic relists"
        );
        assert_eq!(
            server
                .requests()
                .iter()
                .filter(|request| request.path.contains("watch=true"))
                .count(),
            4,
            "the fourth expiration stops before starting another replacement list"
        );
        assert_eq!(
            timeout(Duration::from_secs(2), task)
                .await
                .unwrap_or_else(|_| panic!("stale watch task should finish promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stale
        );
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn transient_watch_failures_use_three_attempts_then_end_stale() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_transient_failures(3);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (_cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        assert_eq!(
            timeout(Duration::from_secs(3), task)
                .await
                .unwrap_or_else(|_| panic!("three transient attempts should be bounded"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stale
        );
        assert_eq!(server.requests().len(), 3);
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        server.stop().await;
    }

    #[tokio::test]
    async fn cancellation_during_transient_backoff_releases_watch_state_promptly() {
        let server = SyntheticApiserver::start()
            .await
            .unwrap_or_else(|_| panic!("synthetic API server should start"));
        server.set_transient_failures(3);
        let client = build_test_watch_client(&server.kubeconfig("watch-context", "watch-cluster"))
            .unwrap_or_else(|_| panic!("synthetic client should build"));
        let retained_bytes = Arc::new(AtomicUsize::new(0));
        let queued_bytes = Arc::new(AtomicUsize::new(0));
        let (sender, mut receiver) = mpsc::channel(WATCH_QUEUE_MESSAGES);
        let (cancel_sender, cancellation) = tokio::sync::watch::channel(false);
        let task = tokio::spawn(run_pod_watch(WatchRun {
            client,
            namespace: "workloads".to_owned(),
            label_selector: None,
            field_selector: None,
            projection_bytes: Arc::clone(&retained_bytes),
            cancellation,
            messages: sender,
            queue_bytes: Arc::clone(&queued_bytes),
        }));

        timeout(Duration::from_secs(1), async {
            while server.requests().is_empty() {
                tokio::time::sleep(Duration::from_millis(5)).await;
            }
        })
        .await
        .unwrap_or_else(|_| panic!("the first transient watch failure should arrive"));
        cancel_sender.send_replace(true);
        assert_eq!(
            timeout(Duration::from_millis(250), task)
                .await
                .unwrap_or_else(|_| panic!("backoff cancellation should join promptly"))
                .unwrap_or_else(|_| panic!("watch task should not panic")),
            PodWatchEnd::Stopped
        );
        while let Some(message) = receiver.recv().await {
            drop(message);
        }
        assert_eq!(retained_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(queued_bytes.load(std::sync::atomic::Ordering::Acquire), 0);
        assert_eq!(server.requests().len(), 1);
        server.stop().await;
    }
}
