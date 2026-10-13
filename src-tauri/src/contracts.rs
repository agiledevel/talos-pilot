//! Safe, nonsensitive application IPC contracts generated to TypeScript.

use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Describes the helper process state shown to the application.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum HelperState {
    /// No helper process is owned.
    Stopped,
    /// The backend is starting and validating the helper.
    Starting,
    /// The helper handshake succeeded.
    Ready,
    /// Startup failed with a safe application error.
    Failed,
}

/// Identifies a read-only helper capability available in this build.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum HelperCapability {
    /// Reports nonsensitive helper build and protocol status.
    Status,
    /// Performs the bounded authenticated Talos version and status probe.
    TalosProbe,
}

/// Bounded, nonsensitive projection of the supervised helper status.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct HelperStatusDto {
    /// Current helper lifecycle state.
    pub state: HelperState,
    /// Build identity reported by the validated helper handshake, if ready.
    pub build_identity: Option<String>,
    /// Negotiated helper protocol major, if ready.
    pub protocol_major: Option<u32>,
    /// Capabilities accepted by the native backend.
    pub capabilities: Vec<HelperCapability>,
}

/// Describes the safe result state of the authenticated Talos read probe.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum TalosProbeState {
    /// The helper is establishing the authenticated Talos connection.
    Connecting,
    /// The authenticated read and status stream are active.
    Healthy,
    /// The previous probe data is retained while a reconnect is attempted.
    Stale,
    /// Talos rejected the caller's role or permissions.
    Unauthorized,
    /// TLS validation rejected the peer or client certificate.
    CertificateInvalid,
    /// The endpoint or target node could not be reached.
    Unavailable,
    /// The selected client configuration or target cannot be used by this probe.
    Unsupported,
}

/// Bounded Talos probe projection sent over native IPC.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct TalosProbeEventDto {
    /// Backend session that owns the Talos credentials.
    pub session_id: String,
    /// Connection state independent of any Kubernetes session.
    pub state: TalosProbeState,
    /// Authenticated Talos version when the read succeeded.
    pub version: Option<String>,
    /// Safe COSI MachineStatus stage.
    pub stage: Option<String>,
    /// Readiness from the COSI MachineStatus resource.
    pub ready: Option<bool>,
    /// Whether the source resource was removed.
    pub deleted: bool,
    /// Per-subscription sequence encoded as a decimal string.
    ///
    /// Data projections advance the sequence by exactly one and continue it
    /// across reconnect generations. A stale marker repeats the sequence of the
    /// projection it invalidates and carries no data fields.
    pub sequence: String,
    /// Snapshot generation encoded as a decimal string.
    ///
    /// Generation 1 is the authenticated bootstrap snapshot; every valid
    /// replacement snapshot after a reconnect advances the generation by one
    /// while the sequence stays continuous.
    pub generation: String,
    /// Whether this event is a snapshot (the bootstrap or a replacement).
    pub snapshot: bool,
}

/// Safe metadata for a native-imported, session-only Talos credential context.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct TalosCredentialSessionDto {
    /// Process-local identifier for the backend-owned credential.
    pub session_id: String,
    /// Bounded label of the selected talosconfig context.
    pub context_name: String,
    /// API endpoint identities used only for Talos client failover.
    pub endpoints: Vec<String>,
    /// Explicit node targets; kept separate from API endpoints.
    pub nodes: Vec<String>,
    /// Talos credential lifetime for this probe session.
    pub storage_mode: CredentialStorageModeDto,
}

/// Selects the renderer-visible appearance algorithm.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AppearanceTheme {
    /// Follow the operating system's light/dark preference.
    System,
    /// Always use the light color scheme.
    Light,
    /// Always use the dark color scheme.
    Dark,
}

/// Selects comfortable or compact component spacing independently of theme.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum AppearanceDensity {
    /// Use standard component spacing.
    Comfortable,
    /// Use the compact spacing and type scale.
    Compact,
}

/// Nonsensitive appearance settings persisted by the native backend.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct AppearanceSettingsDto {
    /// Selected system/light/dark theme.
    pub theme: AppearanceTheme,
    /// Selected component density.
    pub density: AppearanceDensity,
}

/// Credential handling state, including untested and combined persistence modes.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum CredentialStorageModeDto {
    /// The OS vault has not been accessed; an import will try it before writing.
    VaultNotChecked,
    /// Credentials are encrypted with a master key held by the OS vault.
    Persistent,
    /// Encrypted imports are active, with earlier session values still in memory.
    PersistentWithSessionOnly,
    /// The OS vault is unavailable and the user has not selected session-only.
    VaultUnavailable,
    /// Credentials are held only in zeroizing process memory.
    SessionOnly,
}

/// Nonsensitive summary of the active credential storage mode.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct CredentialStorageStatusDto {
    /// Current credential persistence state.
    pub mode: CredentialStorageModeDto,
}

/// Safe metadata returned after a kubeconfig import.
///
/// The handle is an opaque backend reference. It is not an authorization
/// grant, and it never contains credential bytes, a file path, or the raw
/// kubeconfig.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct CredentialImportResultDto {
    /// Opaque handle for the stored credential.
    pub credential_handle: String,
    /// Bounded current-context label from the imported kubeconfig.
    pub context_name: String,
    /// Whether the imported value is persistent or session-only.
    pub storage_mode: CredentialStorageModeDto,
}

/// One bounded entry of the stored Kubernetes credential listing.
///
/// A listing is produced only for an explicit user action, never at startup.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesCredentialSummaryDto {
    /// Opaque handle for the stored credential.
    pub credential_handle: String,
    /// Bounded context label derived from the credential's encrypted material.
    pub context_label: String,
    /// Whether this entry is persistent or session-only.
    pub storage_mode: CredentialStorageModeDto,
}

/// Safe metadata for one opened Kubernetes credential session.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesSessionDto {
    /// Process-local identifier for the backend-owned session.
    pub session_id: String,
    /// Bounded context label of the credential the session uses.
    pub context_label: String,
    /// Whether the session credential is persistent or session-only.
    pub storage_mode: CredentialStorageModeDto,
}

/// Nonsensitive API server version read through an opened session.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesVersionDto {
    /// Session that performed the read.
    pub session_id: String,
    /// Reported `gitVersion`, for example `v1.36.5`.
    pub version: String,
    /// Reported major version.
    pub major: String,
    /// Reported minor version.
    pub minor: String,
}

/// Readiness category derived from bounded Pod container status fields.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum KubernetesPodReadinessDto {
    /// At least one container is reported and all reported containers are ready.
    Ready,
    /// At least one reported container is not ready.
    NotReady,
    /// The API response omitted container status information.
    Unknown,
}

/// Bounded, nonsensitive projection of one Kubernetes Pod.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesPodDto {
    /// Kubernetes object name.
    pub name: String,
    /// Namespace that scoped the list request.
    pub namespace: String,
    /// Server identity that distinguishes a recreated Pod.
    pub uid: String,
    /// Opaque object resource version.
    pub resource_version: String,
    /// Bounded phase or `Unknown` when the server omitted it.
    pub phase: String,
    /// Readiness summary without container names or raw status fields.
    pub readiness: KubernetesPodReadinessDto,
}

/// Complete or explicitly partial result from one bounded namespaced Pod list.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesPodListDto {
    /// Session that performed the read.
    pub session_id: String,
    /// Namespace fixed for every page in this result.
    pub namespace: String,
    /// Resource version shared by all collected pages.
    pub resource_version: String,
    /// Whether every server-side page was collected before a bound was reached.
    pub complete: bool,
    /// Bounded, nonsensitive Pod summaries collected so far.
    pub items: Vec<KubernetesPodDto>,
}

/// Event kind for one session-owned Pod watch projection.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum KubernetesPodWatchChangeDto {
    /// A new snapshot generation is being assembled.
    SnapshotBegin,
    /// A bounded portion of a completed snapshot.
    SnapshotBatch,
    /// The completed generation may replace the previous view.
    SnapshotComplete,
    /// One Pod was added or changed.
    Upsert,
    /// One Pod UID was removed.
    Delete,
    /// The existing projection is stale and requires an explicit reconnect.
    Stale,
}

/// Identity returned before watch establishment so the owner can cancel it.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesPodWatchSubscriptionDto {
    /// Kubernetes credential session that owns the subscription.
    pub session_id: String,
    /// Backend-generated subscription identity.
    pub subscription_id: String,
}

/// Ordered, bounded Pod watch projection sent over a Tauri channel.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct KubernetesPodWatchEventDto {
    /// Session that owns this event.
    pub session_id: String,
    /// Subscription identity that owns this event.
    pub subscription_id: String,
    /// Complete snapshot generation encoded as a decimal string.
    pub generation: String,
    /// Strictly increasing per-subscription sequence encoded as a decimal string.
    pub sequence: String,
    /// Safe projection change.
    pub change: KubernetesPodWatchChangeDto,
    /// Populated only for a snapshot batch.
    pub items: Vec<KubernetesPodDto>,
    /// Populated only for an upsert.
    pub pod: Option<KubernetesPodDto>,
    /// Populated only for a delete.
    pub uid: Option<String>,
    /// Populated only for a delete.
    pub name: Option<String>,
}

/// Why one Pod watch stream ended.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
#[serde(rename_all = "snake_case")]
pub enum KubernetesPodWatchEndDto {
    /// Explicitly stopped by its owner.
    Stopped,
    /// The projection became stale and requires an explicit reconnect.
    Stale,
    /// The Kubernetes API rejected the request or projection.
    Failed,
    /// The bounded queue filled.
    QueueOverflow,
    /// The renderer did not acknowledge an event within five seconds.
    AcknowledgementTimeout,
    /// The Tauri channel closed.
    ChannelClosed,
}

/// A stable, nonsensitive error returned over application IPC.
#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize, TS)]
pub struct ApplicationErrorDto {
    /// Stable machine-readable error code.
    pub code: String,
    /// Operation that failed.
    pub action: String,
    /// Safe, user-visible target identity when one exists.
    pub target: Option<String>,
    /// Whether retrying the same read can succeed without changing scope.
    pub retryable: bool,
    /// Sanitized message that excludes SDK causes and secret-bearing input.
    pub message: String,
}

#[cfg(test)]
mod tests {
    use super::{
        AppearanceDensity, AppearanceSettingsDto, AppearanceTheme, ApplicationErrorDto,
        CredentialStorageModeDto, HelperState, KubernetesPodDto, KubernetesPodListDto,
        KubernetesPodReadinessDto,
    };

    #[test]
    fn ipc_dtos_use_explicit_null_and_snake_case_values() {
        let error = ApplicationErrorDto {
            code: "HELPER_UNAVAILABLE".to_owned(),
            action: "read_helper_status".to_owned(),
            target: None,
            retryable: true,
            message: "The helper is unavailable.".to_owned(),
        };
        let serialized =
            serde_json::to_value(error).unwrap_or_else(|_| panic!("safe DTO must serialize"));
        assert_eq!(serialized["target"], serde_json::Value::Null);
        assert_eq!(
            serde_json::to_value(HelperState::Ready)
                .unwrap_or_else(|_| panic!("state must serialize")),
            "ready"
        );
    }

    #[test]
    fn appearance_and_storage_dtos_use_stable_snake_case_values() {
        assert_eq!(
            serde_json::to_value(AppearanceSettingsDto {
                theme: AppearanceTheme::System,
                density: AppearanceDensity::Comfortable,
            })
            .unwrap_or_else(|_| panic!("appearance DTO must serialize")),
            serde_json::json!({"theme": "system", "density": "comfortable"})
        );
        assert_eq!(
            serde_json::to_value(CredentialStorageModeDto::VaultUnavailable)
                .unwrap_or_else(|_| panic!("storage mode must serialize")),
            "vault_unavailable"
        );
    }

    #[test]
    fn kubernetes_pod_list_wire_projection_is_bounded_and_snake_case() {
        let result = KubernetesPodListDto {
            session_id: "kube-session-7".to_owned(),
            namespace: "workloads".to_owned(),
            resource_version: "opaque-rv".to_owned(),
            complete: false,
            items: vec![KubernetesPodDto {
                name: "web-0".to_owned(),
                namespace: "workloads".to_owned(),
                uid: "uid-web-0".to_owned(),
                resource_version: "opaque-rv".to_owned(),
                phase: "Running".to_owned(),
                readiness: KubernetesPodReadinessDto::NotReady,
            }],
        };
        assert_eq!(
            serde_json::to_value(result).unwrap_or_else(|_| panic!("Pod list DTO must serialize")),
            serde_json::json!({
                "session_id": "kube-session-7",
                "namespace": "workloads",
                "resource_version": "opaque-rv",
                "complete": false,
                "items": [{
                    "name": "web-0",
                    "namespace": "workloads",
                    "uid": "uid-web-0",
                    "resource_version": "opaque-rv",
                    "phase": "Running",
                    "readiness": "not_ready"
                }]
            })
        );
    }
}
