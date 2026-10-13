//! Kubernetes client and credential-session ownership.
//!
//! Rust owns the Kubernetes adapter. It selects a supported field set from an
//! already validated kubeconfig, constructs a TLS-validating client from that
//! selection, and owns the sessions that carry the client. Credential bytes,
//! kubeconfig files, bearer tokens, and SDK objects never leave this module
//! through application IPC, which receives only bounded session and version
//! projections.
//!
//! The adapter never reads ambient configuration: there is no
//! `Config::infer`, `Kubeconfig::read`, in-cluster, or `$KUBECONFIG` path in
//! this module, and no code path here can fall back to a default credential.
//! See [decision 0012](../../../docs/decisions/0012-kubernetes-client-session-boundary.md)
//! for the boundary, the limits, and their verification.

mod client;
mod error;
mod list;
mod session;
mod watch;

#[cfg(any(test, feature = "native-test"))]
pub mod synthetic;

pub use error::KubernetesError;
pub use list::{PodProjection, PodSnapshot, ReadySummary};
pub use session::{
    ApiserverVersion, KubernetesSessionStore, MAX_ADMITTED_REQUESTS, MAX_KUBERNETES_SESSIONS,
    OwnedSession, REQUEST_DEADLINE,
};
pub use watch::{
    MAX_KUBERNETES_WATCHES, MAX_WATCH_EVENT_BYTES, MAX_WATCH_PODS, PodWatchChange, PodWatchEnd,
    PodWatchMessage, PodWatchReceiver, WATCH_BATCH_ITEMS, WATCH_QUEUE_BYTES, WATCH_QUEUE_MESSAGES,
};
