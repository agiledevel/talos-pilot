//! Owns the bundled helper process and its private protocol pipes.

use std::{io, path::Path, process::Stdio, time::Duration};

use prost::Message;
use thiserror::Error;
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    process::{Child, ChildStdin, ChildStdout, Command},
    task::JoinHandle,
    time::timeout,
};

use super::protocol::{
    EnvelopeError, FrameError, MAX_FRAME_BYTES,
    generated::{
        Envelope, HandshakeRequest, MessageKind, ShutdownRequest, StatusRequest, StatusResponse,
        envelope,
    },
    validate_envelope,
};

const HELPER_PROTOCOL_MAJOR: u32 = 1;
const STDERR_READ_BYTES: usize = 4096;
const REQUIRED_CAPABILITY: &str = "status";

/// Errors reported while starting, using, or closing the helper process.
#[derive(Debug, Error)]
pub enum SupervisorError {
    /// The helper process could not be started.
    #[error("could not start the bundled helper")]
    Spawn(#[source] io::Error),
    /// The process did not provide all three private pipes.
    #[error("the helper process pipes are unavailable")]
    MissingPipe,
    /// An operation exceeded its configured deadline.
    #[error("the helper operation exceeded its deadline")]
    Timeout,
    /// Reading or writing a private pipe failed.
    #[error("the helper private pipe failed")]
    Pipe(#[source] io::Error),
    /// A frame violated the protocol size or completeness rules.
    #[error("the helper frame is invalid")]
    Frame(#[from] FrameError),
    /// A frame did not decode as a Protobuf envelope.
    #[error("the helper message is malformed")]
    Decode(#[source] prost::DecodeError),
    /// The request could not be encoded as a Protobuf envelope.
    #[error("the helper request could not be encoded")]
    Encode(#[source] prost::EncodeError),
    /// An envelope failed protocol validation.
    #[error("the helper message is incompatible")]
    Envelope(#[from] EnvelopeError),
    /// The helper returned an unexpected response.
    #[error("the helper response did not match the request")]
    ResponseMismatch,
    /// The helper rejected the startup handshake.
    #[error("the helper rejected the startup handshake")]
    HandshakeRejected,
    /// The packaged helper build identity did not match the application.
    #[error("the helper build identity does not match this application")]
    BuildMismatch,
    /// The helper did not advertise the required status capability.
    #[error("the helper does not support status reporting")]
    CapabilityMissing,
    /// The helper exited before the requested response.
    #[error("the helper exited before responding")]
    ChildExited,
}

/// Nonsensitive status confirmed by the helper handshake.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct HelperStatus {
    /// Build identity compiled into the helper binary.
    pub build_identity: String,
    /// Protocol major version accepted by both processes.
    pub protocol_major: u32,
    /// Capabilities supported by the helper and accepted by this process.
    pub capabilities: Vec<String>,
}

/// A single owned helper process with one outstanding exchange at a time.
///
/// Mutable access serializes requests and bounds in-flight protocol work to
/// one. Dropping the supervisor asks Tokio to kill the child; callers should
/// use [`shutdown`](Self::shutdown) to await graceful exit and reaping.
pub struct HelperSupervisor {
    child: Child,
    stdin: ChildStdin,
    stdout: ChildStdout,
    stderr_drain: JoinHandle<()>,
    status: HelperStatus,
    request_counter: u64,
}

impl HelperSupervisor {
    /// Starts a fixed executable and accepts it only after identity-checked v1 handshake.
    ///
    /// The executable path must come from the application's resource resolver,
    /// never from renderer input. The caller owns the returned supervisor.
    ///
    /// # Errors
    ///
    /// Returns a safe error when process creation, pipe setup, handshake,
    /// identity validation, or the startup deadline fails. A started child is
    /// killed and awaited on every startup failure.
    pub async fn start(
        executable: &Path,
        expected_build_identity: &str,
        startup_timeout: Duration,
    ) -> Result<Self, SupervisorError> {
        let mut child = Command::new(executable)
            .stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .spawn()
            .map_err(SupervisorError::Spawn)?;
        let stdin = child.stdin.take().ok_or(SupervisorError::MissingPipe)?;
        let stdout = child.stdout.take().ok_or(SupervisorError::MissingPipe)?;
        let stderr = child.stderr.take().ok_or(SupervisorError::MissingPipe)?;
        let stderr_drain = tokio::spawn(drain_stderr(stderr));
        let mut supervisor = Self {
            child,
            stdin,
            stdout,
            stderr_drain,
            status: HelperStatus {
                build_identity: String::new(),
                protocol_major: 0,
                capabilities: Vec::new(),
            },
            request_counter: 0,
        };
        let handshake = async {
            let request_id = supervisor.next_request_id()?;
            let request = Envelope {
                protocol_major: HELPER_PROTOCOL_MAJOR,
                kind: MessageKind::HandshakeRequest as i32,
                request_id: request_id.clone(),
                payload: Some(envelope::Payload::HandshakeRequest(HandshakeRequest {
                    protocol_major: HELPER_PROTOCOL_MAJOR,
                    expected_build_identity: expected_build_identity.to_owned(),
                })),
                ..Envelope::default()
            };
            let response = supervisor.exchange(request, &request_id).await?;
            let Some(envelope::Payload::HandshakeResponse(response)) = response.payload else {
                if matches!(response.payload, Some(envelope::Payload::Error(_))) {
                    return Err(SupervisorError::HandshakeRejected);
                }
                return Err(SupervisorError::ResponseMismatch);
            };
            if response.protocol_major != HELPER_PROTOCOL_MAJOR {
                return Err(SupervisorError::Envelope(EnvelopeError::UnsupportedVersion));
            }
            if response.build_identity != expected_build_identity {
                return Err(SupervisorError::BuildMismatch);
            }
            if !response
                .capabilities
                .iter()
                .any(|item| item == REQUIRED_CAPABILITY)
            {
                return Err(SupervisorError::CapabilityMissing);
            }
            supervisor.status = HelperStatus {
                build_identity: response.build_identity,
                protocol_major: response.protocol_major,
                capabilities: vec![REQUIRED_CAPABILITY.to_owned()],
            };
            Ok(())
        };
        match timeout(startup_timeout, handshake).await {
            Ok(Ok(())) => Ok(supervisor),
            Ok(Err(error)) => {
                supervisor.terminate().await;
                Err(error)
            }
            Err(_) => {
                supervisor.terminate().await;
                Err(SupervisorError::Timeout)
            }
        }
    }

    /// Returns the validated nonsensitive identity and supported capability.
    pub fn status(&self) -> &HelperStatus {
        &self.status
    }

    /// Requests a live status response under a bounded deadline.
    ///
    /// A failed or timed-out exchange terminates the process because the byte
    /// stream can no longer be safely correlated with a later request.
    ///
    /// # Errors
    ///
    /// Returns a safe protocol, pipe, child-exit, or timeout error. On error,
    /// the owned child is killed and awaited before returning.
    pub async fn refresh_status(
        &mut self,
        deadline: Duration,
    ) -> Result<HelperStatus, SupervisorError> {
        let request_id = match self.next_request_id() {
            Ok(request_id) => request_id,
            Err(error) => {
                self.terminate().await;
                return Err(error);
            }
        };
        let request = Envelope {
            protocol_major: HELPER_PROTOCOL_MAJOR,
            kind: MessageKind::StatusRequest as i32,
            request_id: request_id.clone(),
            payload: Some(envelope::Payload::StatusRequest(StatusRequest {})),
            ..Envelope::default()
        };
        let result = timeout(deadline, self.exchange(request, &request_id)).await;
        let status = match result {
            Ok(Ok(response)) => status_response(response).and_then(|status| {
                if status.build_identity != self.status.build_identity {
                    Err(SupervisorError::BuildMismatch)
                } else {
                    Ok(status)
                }
            }),
            Ok(Err(error)) => Err(error),
            Err(_) => Err(SupervisorError::Timeout),
        };
        match status {
            Ok(status) => Ok(status),
            Err(error) => {
                self.terminate().await;
                Err(error)
            }
        }
    }

    /// Sends shutdown, waits for acknowledgement and child exit, then reaps it.
    ///
    /// A missed acknowledgement or exit deadline falls back to kill and wait.
    /// The timeout applies to the graceful request and process exit combined.
    ///
    /// # Errors
    ///
    /// Returns a safe protocol, pipe, or timeout error after ensuring the
    /// child is no longer running and has been awaited.
    pub async fn shutdown(mut self, deadline: Duration) -> Result<(), SupervisorError> {
        let request_id = match self.next_request_id() {
            Ok(request_id) => request_id,
            Err(error) => {
                self.terminate().await;
                return Err(error);
            }
        };
        let request = Envelope {
            protocol_major: HELPER_PROTOCOL_MAJOR,
            kind: MessageKind::ShutdownRequest as i32,
            request_id: request_id.clone(),
            payload: Some(envelope::Payload::ShutdownRequest(ShutdownRequest {})),
            ..Envelope::default()
        };
        let graceful = async {
            let response = self.exchange(request, &request_id).await?;
            if response.kind != MessageKind::ShutdownResponse as i32 {
                return Err(SupervisorError::ResponseMismatch);
            }
            self.stdin.shutdown().await.map_err(SupervisorError::Pipe)?;
            self.child.wait().await.map_err(SupervisorError::Pipe)?;
            Ok(())
        };
        match timeout(deadline, graceful).await {
            Ok(Ok(())) => {
                let _ = self.stderr_drain.await;
                Ok(())
            }
            Ok(Err(error)) => {
                self.terminate().await;
                Err(error)
            }
            Err(_) => {
                self.terminate().await;
                Err(SupervisorError::Timeout)
            }
        }
    }

    async fn exchange(
        &mut self,
        request: Envelope,
        request_id: &str,
    ) -> Result<Envelope, SupervisorError> {
        let mut encoded = Vec::with_capacity(128);
        request
            .encode(&mut encoded)
            .map_err(SupervisorError::Encode)?;
        write_async_frame(&mut self.stdin, &encoded).await?;
        let bytes = read_async_frame(&mut self.stdout).await?;
        let response = Envelope::decode(bytes.as_slice()).map_err(SupervisorError::Decode)?;
        validate_envelope(&response)?;
        if response.request_id != request_id {
            return Err(SupervisorError::ResponseMismatch);
        }
        if response.kind == MessageKind::Error as i32 {
            return Err(SupervisorError::HandshakeRejected);
        }
        Ok(response)
    }

    fn next_request_id(&mut self) -> Result<String, SupervisorError> {
        self.request_counter = self
            .request_counter
            .checked_add(1)
            .ok_or(SupervisorError::ResponseMismatch)?;
        Ok(format!("helper-{}", self.request_counter))
    }

    async fn terminate(&mut self) {
        let _ = self.child.kill().await;
        let _ = self.child.wait().await;
        let _ = (&mut self.stderr_drain).await;
    }
}

fn status_response(response: Envelope) -> Result<HelperStatus, SupervisorError> {
    if response.kind != MessageKind::StatusResponse as i32 {
        return Err(SupervisorError::ResponseMismatch);
    }
    let Some(envelope::Payload::StatusResponse(StatusResponse {
        build_identity,
        capabilities,
    })) = response.payload
    else {
        return Err(SupervisorError::ResponseMismatch);
    };
    if build_identity.is_empty() {
        return Err(SupervisorError::ResponseMismatch);
    }
    if !capabilities.iter().any(|item| item == REQUIRED_CAPABILITY) {
        return Err(SupervisorError::CapabilityMissing);
    }
    Ok(HelperStatus {
        build_identity,
        protocol_major: HELPER_PROTOCOL_MAJOR,
        capabilities: vec![REQUIRED_CAPABILITY.to_owned()],
    })
}

async fn read_async_frame(
    reader: &mut (impl AsyncRead + Unpin),
) -> Result<Vec<u8>, SupervisorError> {
    let mut length = [0_u8; 4];
    reader.read_exact(&mut length).await.map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            SupervisorError::ChildExited
        } else {
            SupervisorError::Pipe(error)
        }
    })?;
    let length = u32::from_be_bytes(length) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(SupervisorError::Frame(FrameError::InvalidLength));
    }
    let mut payload = vec![0; length];
    reader.read_exact(&mut payload).await.map_err(|error| {
        if error.kind() == io::ErrorKind::UnexpectedEof {
            SupervisorError::ChildExited
        } else {
            SupervisorError::Pipe(error)
        }
    })?;
    Ok(payload)
}

async fn write_async_frame(
    writer: &mut (impl AsyncWrite + Unpin),
    payload: &[u8],
) -> Result<(), SupervisorError> {
    if payload.is_empty() || payload.len() > MAX_FRAME_BYTES {
        return Err(SupervisorError::Frame(FrameError::InvalidLength));
    }
    let length = u32::try_from(payload.len())
        .map_err(|_| SupervisorError::Frame(FrameError::InvalidLength))?;
    writer
        .write_all(&length.to_be_bytes())
        .await
        .map_err(SupervisorError::Pipe)?;
    writer
        .write_all(payload)
        .await
        .map_err(SupervisorError::Pipe)?;
    writer.flush().await.map_err(SupervisorError::Pipe)
}

/// Drains stderr continuously while retaining no child-controlled text.
async fn drain_stderr(mut stderr: tokio::process::ChildStderr) {
    let mut scratch = [0_u8; STDERR_READ_BYTES];
    while stderr.read(&mut scratch).await.is_ok_and(|count| count > 0) {}
}

#[cfg(test)]
mod tests {
    use std::{path::PathBuf, process::Command, time::Duration};

    use super::{HelperSupervisor, SupervisorError};

    fn build_helper(test_name: &str) -> PathBuf {
        let helper_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../helper");
        let binary = std::env::temp_dir().join(format!(
            "talos-pilot-helper-test-{}-{}{}",
            std::process::id(),
            test_name,
            std::env::consts::EXE_SUFFIX
        ));
        let result = Command::new("go")
            .args(["build", "-o"])
            .arg(&binary)
            .arg("./cmd/talos-pilot-helper")
            .current_dir(helper_dir)
            .output();
        let output =
            result.unwrap_or_else(|_| panic!("pinned Go toolchain must build test helper"));
        assert!(output.status.success(), "Go helper build must succeed");
        binary
    }

    #[tokio::test]
    async fn performs_real_handshake_status_and_graceful_shutdown() {
        let helper = build_helper("handshake-status-shutdown");
        let mut supervisor =
            HelperSupervisor::start(&helper, "development", Duration::from_secs(5))
                .await
                .unwrap_or_else(|_| panic!("real Go helper handshake must succeed"));
        assert_eq!(supervisor.status().build_identity, "development");
        let status = supervisor
            .refresh_status(Duration::from_secs(5))
            .await
            .unwrap_or_else(|_| panic!("real Go helper status must succeed"));
        assert_eq!(status.capabilities, ["status"]);
        supervisor
            .shutdown(Duration::from_secs(5))
            .await
            .unwrap_or_else(|_| panic!("real Go helper must exit after shutdown"));
        let _ = std::fs::remove_file(helper);
    }

    #[tokio::test]
    async fn rejects_build_identity_mismatch_and_reaps_child() {
        let helper = build_helper("build-mismatch");
        let error = HelperSupervisor::start(&helper, "wrong-build", Duration::from_secs(5))
            .await
            .err();
        assert!(matches!(error, Some(SupervisorError::HandshakeRejected)));
        let _ = std::fs::remove_file(helper);
    }

    #[tokio::test]
    async fn startup_deadline_terminates_a_started_helper() {
        let helper = build_helper("startup-deadline");
        assert!(matches!(
            HelperSupervisor::start(&helper, "development", Duration::ZERO).await,
            Err(SupervisorError::Timeout)
        ));
        let _ = std::fs::remove_file(helper);
    }

    #[tokio::test]
    async fn helper_exit_during_status_exchange_is_reported_and_reaped() {
        let helper = build_helper("exit-during-status");
        let mut supervisor =
            HelperSupervisor::start(&helper, "development", Duration::from_secs(5))
                .await
                .unwrap_or_else(|_| panic!("real Go helper handshake must succeed"));
        supervisor
            .child
            .start_kill()
            .unwrap_or_else(|_| panic!("test helper must be terminable"));

        assert!(matches!(
            supervisor.refresh_status(Duration::from_secs(5)).await,
            Err(SupervisorError::ChildExited)
        ));
        let _ = std::fs::remove_file(helper);
    }

    #[tokio::test]
    async fn reaps_child_when_request_id_space_is_exhausted() {
        let helper = build_helper("request-id-exhaustion");
        let mut supervisor =
            HelperSupervisor::start(&helper, "development", Duration::from_secs(5))
                .await
                .unwrap_or_else(|_| panic!("real Go helper handshake must succeed"));
        supervisor.request_counter = u64::MAX;

        assert!(matches!(
            supervisor.shutdown(Duration::from_secs(5)).await,
            Err(SupervisorError::ResponseMismatch)
        ));
        let _ = std::fs::remove_file(helper);
    }
}
