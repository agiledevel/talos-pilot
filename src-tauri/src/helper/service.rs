//! Application service for the single owned helper process.

use std::{path::Path, time::Duration};

use tokio::sync::Mutex;

use crate::contracts::{ApplicationErrorDto, HelperCapability, HelperState, HelperStatusDto};

use super::supervisor::{HelperSupervisor, SupervisorError};

const HELPER_DEADLINE: Duration = Duration::from_secs(5);

/// Owns the helper used by read-only feasibility operations.
///
/// The supervisor is started on the first status request and remains owned by
/// this application state until an exchange fails or the application shuts
/// down. The mutex serializes status requests so the private protocol always
/// has one in-flight exchange.
#[derive(Default)]
pub struct HelperService {
    supervisor: Mutex<Option<HelperSupervisor>>,
}

impl HelperService {
    /// Starts or refreshes helper status and returns only its safe projection.
    ///
    /// # Errors
    ///
    /// Returns a stable, nonsensitive application error when the packaged
    /// helper cannot start, fails its protocol exchange, or reports an
    /// incompatible identity. The supervisor terminates and reaps failed
    /// processes before the error is returned.
    pub async fn status(&self, executable: &Path) -> Result<HelperStatusDto, ApplicationErrorDto> {
        let mut owned = self.supervisor.lock().await;
        if let Some(supervisor) = owned.as_mut() {
            match supervisor.refresh_status(HELPER_DEADLINE).await {
                Ok(status) => {
                    return Ok(project_status(status.build_identity, status.protocol_major));
                }
                Err(error) => {
                    owned.take();
                    return Err(application_error(error));
                }
            }
        }

        let supervisor =
            HelperSupervisor::start(executable, env!("TALOS_PILOT_BUILD_ID"), HELPER_DEADLINE)
                .await
                .map_err(application_error)?;
        let status = supervisor.status();
        let projection = project_status(status.build_identity.clone(), status.protocol_major);
        *owned = Some(supervisor);
        Ok(projection)
    }

    /// Requests graceful helper shutdown and waits for process cleanup.
    pub async fn shutdown(&self) {
        let supervisor = self.supervisor.lock().await.take();
        if let Some(supervisor) = supervisor {
            let _ = supervisor.shutdown(HELPER_DEADLINE).await;
        }
    }
}

fn project_status(build_identity: String, protocol_major: u32) -> HelperStatusDto {
    HelperStatusDto {
        state: HelperState::Ready,
        build_identity: Some(build_identity),
        protocol_major: Some(protocol_major),
        capabilities: vec![HelperCapability::Status],
    }
}

fn application_error(error: SupervisorError) -> ApplicationErrorDto {
    let retryable = matches!(
        error,
        SupervisorError::Timeout | SupervisorError::Pipe(_) | SupervisorError::ChildExited
    );
    ApplicationErrorDto {
        code: "HELPER_UNAVAILABLE".to_owned(),
        action: "get_helper_status".to_owned(),
        target: None,
        retryable,
        message: "The bundled helper is unavailable. Restart the application and try again."
            .to_owned(),
    }
}

#[cfg(test)]
mod tests {
    use std::{io, path::PathBuf, process::Command};

    use crate::contracts::{HelperCapability, HelperState};

    use super::{HelperService, application_error, project_status};
    use crate::helper::supervisor::SupervisorError;

    #[test]
    fn projects_only_validated_status_fields() {
        let status = project_status("build-identity".to_owned(), 1);
        assert_eq!(status.state, HelperState::Ready);
        assert_eq!(status.build_identity.as_deref(), Some("build-identity"));
        assert_eq!(status.protocol_major, Some(1));
        assert_eq!(status.capabilities, [HelperCapability::Status]);
    }

    #[test]
    fn error_projection_redacts_private_process_causes() {
        let error = application_error(SupervisorError::Pipe(io::Error::other(
            "synthetic-secret-marker",
        )));
        assert!(error.retryable);
        assert!(!error.message.contains("synthetic-secret-marker"));
        assert_eq!(error.action, "get_helper_status");
        assert_eq!(error.target, None);
    }

    #[tokio::test]
    async fn service_owns_and_refreshes_the_real_helper() {
        let helper_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../helper");
        let executable = std::env::temp_dir().join(format!(
            "talos-pilot-helper-service-test-{}{}",
            std::process::id(),
            std::env::consts::EXE_SUFFIX
        ));
        let build_identity = env!("TALOS_PILOT_BUILD_ID");
        let result = Command::new("go")
            .args(["build", "-trimpath", "-ldflags"])
            .arg(format!("-X main.buildIdentity={build_identity}"))
            .arg("-o")
            .arg(&executable)
            .arg("./cmd/talos-pilot-helper")
            .current_dir(helper_dir)
            .output();
        let output =
            result.unwrap_or_else(|_| panic!("pinned Go toolchain must build test helper"));
        assert!(output.status.success(), "Go helper build must succeed");

        let service = HelperService::default();
        let status = service
            .status(&executable)
            .await
            .unwrap_or_else(|_| panic!("service must start its identity-matched helper"));
        assert_eq!(status.state, HelperState::Ready);
        assert_eq!(status.build_identity.as_deref(), Some(build_identity));

        let refreshed = service
            .status(&executable)
            .await
            .unwrap_or_else(|_| panic!("service must refresh helper status"));
        assert_eq!(refreshed, status);

        service.shutdown().await;
        std::fs::remove_file(executable)
            .unwrap_or_else(|_| panic!("temporary helper binary must be removable"));
    }
}
