//! Application service for the single owned helper process.

use std::{path::Path, sync::Mutex as StdMutex, time::Duration};

use tokio::sync::{Mutex, watch};
use zeroize::Zeroizing;

use crate::contracts::{
    ApplicationErrorDto, HelperCapability, HelperState, HelperStatusDto, TalosProbeEventDto,
};

use super::supervisor::{HelperSupervisor, SupervisorError, TalosProbeFailure, TalosProbeInput};

const HELPER_DEADLINE: Duration = Duration::from_secs(5);
/// Parent bound for the helper's first probe answer.
///
/// The helper's own `probeStartDeadline` (12 s, `helper/cmd/talos-pilot-helper`)
/// must stay strictly shorter so a slow probe is answered with a classified
/// `talos_probe_timeout` instead of being killed by this deadline.
const TALOS_PROBE_STARTUP_DEADLINE: Duration = Duration::from_secs(15);

/// Owns the helper used by read-only feasibility operations.
///
/// The supervisor is started on the first status request and remains owned by
/// this application state until an exchange fails or the application shuts
/// down. The mutex serializes status requests so the private protocol always
/// has one in-flight exchange.
#[derive(Default)]
pub struct HelperService {
    supervisor: Mutex<Option<HelperSupervisor>>,
    probe_gate: Mutex<()>,
    active_probe: StdMutex<Option<(String, watch::Sender<bool>)>>,
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
                    return Ok(project_status(
                        status.build_identity,
                        status.protocol_major,
                        &status.capabilities,
                    ));
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
        let projection = project_status(
            status.build_identity.clone(),
            status.protocol_major,
            &status.capabilities,
        );
        *owned = Some(supervisor);
        Ok(projection)
    }

    /// Starts one authenticated Talos probe and forwards only bounded DTOs.
    ///
    /// The service owns both the supervised helper and cancellation sender. A
    /// second probe waits for the active subscription to finish. The event
    /// callback should be the native channel adapter; a closed renderer
    /// channel cancels the helper subscription.
    ///
    /// # Errors
    ///
    /// Returns a stable, redacted application error if helper startup,
    /// authentication, Talos transport, or protocol validation fails.
    pub async fn talos_probe<F>(
        &self,
        executable: &Path,
        config: Zeroizing<Vec<u8>>,
        endpoints: Vec<String>,
        node: String,
        session_id: String,
        on_event: F,
    ) -> Result<(), ApplicationErrorDto>
    where
        F: FnMut(TalosProbeEventDto) -> Result<(), ()>,
    {
        let _probe_guard = self.probe_gate.lock().await;
        let (cancel_sender, cancel_receiver) = watch::channel(false);
        let owner_id = session_id.clone();
        *self
            .active_probe
            .lock()
            .map_err(|_| talos_probe_error(SupervisorError::ResponseMismatch))? =
            Some((owner_id.clone(), cancel_sender));

        let result = async {
            let mut owned = self.supervisor.lock().await;
            if owned.is_none() {
                let supervisor = HelperSupervisor::start(
                    executable,
                    env!("TALOS_PILOT_BUILD_ID"),
                    HELPER_DEADLINE,
                )
                .await
                .map_err(talos_probe_error)?;
                *owned = Some(supervisor);
            }
            let Some(supervisor) = owned.as_mut() else {
                return Err(talos_probe_error(SupervisorError::ChildExited));
            };
            if !supervisor
                .status()
                .capabilities
                .iter()
                .any(|capability| capability == "talos_probe")
            {
                return Err(talos_probe_error(SupervisorError::CapabilityMissing));
            }
            match supervisor
                .talos_probe(
                    TalosProbeInput {
                        config,
                        endpoints,
                        node,
                        session_id,
                    },
                    cancel_receiver,
                    on_event,
                    TALOS_PROBE_STARTUP_DEADLINE,
                )
                .await
            {
                Ok(()) => Ok(()),
                Err(error) => {
                    owned.take();
                    Err(talos_probe_error(error))
                }
            }
        }
        .await;
        if let Ok(mut active) = self.active_probe.lock()
            && active.as_ref().is_some_and(|(id, _)| *id == owner_id)
        {
            active.take();
        }

        result
    }

    /// Cancels the Talos subscription owned by one backend session.
    ///
    /// An unknown session identifier, or a session that no longer owns the
    /// active subscription, releases no helper work and affects no other
    /// session. Repeated calls for the owning session are idempotent.
    pub fn stop_talos_probe(&self, session_id: &str) -> bool {
        let Ok(active) = self.active_probe.lock() else {
            return false;
        };
        let Some((active_session, cancel)) = active.as_ref() else {
            return false;
        };
        if active_session != session_id {
            return false;
        }

        cancel.send(true).is_ok()
    }

    /// Requests graceful helper shutdown and waits for process cleanup.
    pub async fn shutdown(&self) {
        if let Ok(active) = self.active_probe.lock()
            && let Some((_, cancel)) = active.as_ref()
        {
            let _ = cancel.send(true);
        }
        let supervisor = self.supervisor.lock().await.take();
        if let Some(supervisor) = supervisor {
            let _ = supervisor.shutdown(HELPER_DEADLINE).await;
        }
    }
}

fn talos_probe_error(error: SupervisorError) -> ApplicationErrorDto {
    let (code, message, retryable) = match error {
        SupervisorError::TalosProbeFailed(TalosProbeFailure::Unauthorized) => (
            "TALOS_UNAUTHORIZED",
            "Talos rejected the configured permissions.",
            false,
        ),
        SupervisorError::TalosProbeFailed(TalosProbeFailure::CertificateInvalid) => (
            "TALOS_CERTIFICATE_INVALID",
            "Talos TLS verification failed. Check the endpoint and certificate.",
            false,
        ),
        SupervisorError::TalosProbeFailed(TalosProbeFailure::Unavailable)
        | SupervisorError::Timeout
        | SupervisorError::ChildExited => (
            "TALOS_UNAVAILABLE",
            "The selected Talos endpoint or node is unavailable.",
            true,
        ),
        SupervisorError::TalosProbeFailed(TalosProbeFailure::InvalidInput) => (
            "TALOS_UNSUPPORTED",
            "The Talos client configuration or selected target is invalid.",
            false,
        ),
        // An incompatible or incapable helper disables this connection instead of
        // offering a retry that cannot succeed against the same build.
        SupervisorError::CapabilityMissing
        | SupervisorError::BuildMismatch
        | SupervisorError::HandshakeRejected => (
            "TALOS_UNSUPPORTED",
            "The bundled helper cannot run this Talos probe. Update or restart the application.",
            false,
        ),
        SupervisorError::TalosProbeFailed(TalosProbeFailure::General)
        | SupervisorError::Pipe(_)
        | SupervisorError::Envelope(_)
        | SupervisorError::Decode(_)
        | SupervisorError::Encode(_)
        | SupervisorError::Frame(_)
        | SupervisorError::ResponseMismatch
        | SupervisorError::TalosStreamInvalid
        | SupervisorError::Spawn(_)
        | SupervisorError::MissingPipe => (
            "TALOS_PROBE_FAILED",
            "The authenticated Talos read probe failed.",
            true,
        ),
    };
    ApplicationErrorDto {
        code: code.to_owned(),
        action: "start_talos_probe".to_owned(),
        target: None,
        retryable,
        message: message.to_owned(),
    }
}

fn project_status(
    build_identity: String,
    protocol_major: u32,
    capabilities: &[String],
) -> HelperStatusDto {
    HelperStatusDto {
        state: HelperState::Ready,
        build_identity: Some(build_identity),
        protocol_major: Some(protocol_major),
        capabilities: std::iter::once(HelperCapability::Status)
            .chain(
                capabilities
                    .iter()
                    .any(|capability| capability == "talos_probe")
                    .then_some(HelperCapability::TalosProbe),
            )
            .collect(),
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

    use super::{HelperService, application_error, project_status, talos_probe_error};
    use crate::helper::supervisor::SupervisorError;
    use tokio::sync::watch;

    #[test]
    fn projects_only_validated_status_fields() {
        let status = project_status("build-identity".to_owned(), 1, &["talos_probe".to_owned()]);
        assert_eq!(status.state, HelperState::Ready);
        assert_eq!(status.build_identity.as_deref(), Some("build-identity"));
        assert_eq!(status.protocol_major, Some(1));
        assert_eq!(
            status.capabilities,
            [HelperCapability::Status, HelperCapability::TalosProbe]
        );
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

    #[test]
    fn an_incapable_helper_disables_the_talos_connection() {
        for error in [
            SupervisorError::CapabilityMissing,
            SupervisorError::BuildMismatch,
            SupervisorError::HandshakeRejected,
        ] {
            let projected = talos_probe_error(error);
            assert_eq!(projected.code, "TALOS_UNSUPPORTED");
            assert!(
                !projected.retryable,
                "a mismatched helper must not invite retry"
            );
            assert_eq!(projected.action, "start_talos_probe");
            assert_eq!(projected.target, None);
        }
    }

    #[test]
    fn cancellation_releases_only_the_subscription_owning_session() {
        let service = HelperService::default();
        assert!(!service.stop_talos_probe("talos-session-1"));

        let (sender, mut receiver) = watch::channel(false);
        *service
            .active_probe
            .lock()
            .unwrap_or_else(|_| panic!("probe registry must be accessible")) =
            Some(("talos-session-1".to_owned(), sender));

        assert!(
            !service.stop_talos_probe("talos-session-2"),
            "an unknown session must cancel no helper work"
        );
        assert!(
            !*receiver.borrow_and_update(),
            "another session's cancellation must not affect this subscription"
        );
        assert!(service.stop_talos_probe("talos-session-1"));
        assert!(*receiver.borrow_and_update());
        assert!(
            service.stop_talos_probe("talos-session-1"),
            "repeated cancellation for the owning session stays successful"
        );
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
