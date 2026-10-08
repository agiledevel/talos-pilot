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
    use super::{ApplicationErrorDto, HelperState};

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
}
