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
        CredentialStorageModeDto, HelperState,
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
}
