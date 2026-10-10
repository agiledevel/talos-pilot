//! Owns the bundled helper process and its private protocol pipes.

use std::{io, path::Path, process::Stdio, time::Duration};

use prost::Message;
use thiserror::Error;
use tokio::sync::watch;
use zeroize::{Zeroize, Zeroizing};

use crate::contracts::{TalosProbeEventDto, TalosProbeState};
use tokio::{
    io::{AsyncRead, AsyncReadExt, AsyncWrite, AsyncWriteExt},
    process::{Child, ChildStdin, ChildStdout, Command},
    task::JoinHandle,
    time::{Instant, timeout, timeout_at},
};

use super::protocol::{
    EnvelopeError, FrameError, MAX_FRAME_BYTES,
    generated::{
        Envelope, HandshakeRequest, MessageKind, ProtocolError, ShutdownRequest, StatusRequest,
        StatusResponse, TalosCancelRequest, TalosProbeRequest, TalosProbeResponse,
        TalosStatusEvent, TalosStreamEnded, envelope,
    },
    validate_envelope,
};

const HELPER_PROTOCOL_MAJOR: u32 = 1;
const STDERR_READ_BYTES: usize = 4096;
const REQUIRED_CAPABILITY: &str = "status";
const MAX_TALOS_STATUS_EVENTS: u64 = 256;

/// Upper bound for a helper cancellation acknowledgement and stream-end marker.
pub const TALOS_CANCEL_ACK_DEADLINE: Duration = Duration::from_secs(2);

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
    /// The helper rejected or failed an authenticated Talos probe.
    #[error("the Talos probe failed")]
    TalosProbeFailed(TalosProbeFailure),
    /// A Talos stream contained an invalid sequence or projection.
    #[error("the Talos stream is incompatible")]
    TalosStreamInvalid,
}

/// Stable class of Talos probe failure accepted from the helper.
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum TalosProbeFailure {
    /// The Talos client role was denied.
    Unauthorized,
    /// Peer or client certificate TLS validation failed.
    CertificateInvalid,
    /// The endpoint or node could not be reached before the deadline.
    Unavailable,
    /// A config or target invariant failed.
    InvalidInput,
    /// The read or stream failed for another safe reason.
    General,
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

/// Backend-selected Talos target and zeroizing session credential material.
pub struct TalosProbeInput {
    /// Inline talosconfig bytes owned by the current native session.
    pub config: Zeroizing<Vec<u8>>,
    /// API endpoints explicitly allowed for connection failover.
    pub endpoints: Vec<String>,
    /// One Talos node IP to receive the version read and COSI watch.
    pub node: String,
    /// Backend session identity associated with emitted projections.
    pub session_id: String,
}

/// A single owned helper process with one outstanding exchange at a time.
///
/// Mutable access serializes requests and bounds in-flight protocol work to
/// one. Dropping the supervisor asks Tokio to kill the child; callers should
/// use [`shutdown`](Self::shutdown) to await graceful exit and reaping.
pub struct HelperSupervisor {
    child: Child,
    stdin: ChildStdin,
    stdout: FrameReader<ChildStdout>,
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
            stdout: FrameReader::new(stdout),
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
            let mut capabilities = vec![REQUIRED_CAPABILITY.to_owned()];
            if response
                .capabilities
                .iter()
                .any(|item| item == "talos_probe")
            {
                capabilities.push("talos_probe".to_owned());
            }
            supervisor.status = HelperStatus {
                build_identity: response.build_identity,
                protocol_major: response.protocol_major,
                capabilities,
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

    /// Reads Talos version and streams bounded MachineStatus projections until
    /// the caller cancels, the helper ends the stream, or a protocol fault occurs.
    ///
    /// The full talosconfig remains in zeroizing memory and crosses only the
    /// private helper pipe. `on_event` receives no raw Talos resource fields.
    ///
    /// # Errors
    ///
    /// Returns a safe error for invalid helper responses, a failed Talos read,
    /// stream sequence faults, pipe failures, or helper exit. Any protocol
    /// failure terminates and reaps the helper before returning.
    pub async fn talos_probe<F>(
        &mut self,
        request: TalosProbeInput,
        mut cancellation: watch::Receiver<bool>,
        mut on_event: F,
        startup_deadline: Duration,
    ) -> Result<(), SupervisorError>
    where
        F: FnMut(TalosProbeEventDto) -> Result<(), ()>,
    {
        let result = self
            .talos_probe_inner(request, &mut cancellation, &mut on_event, startup_deadline)
            .await;
        if result.is_err() {
            self.terminate().await;
        }

        result
    }

    async fn talos_probe_inner<F>(
        &mut self,
        request: TalosProbeInput,
        cancellation: &mut watch::Receiver<bool>,
        on_event: &mut F,
        startup_deadline: Duration,
    ) -> Result<(), SupervisorError>
    where
        F: FnMut(TalosProbeEventDto) -> Result<(), ()>,
    {
        let TalosProbeInput {
            config,
            endpoints,
            node,
            session_id,
        } = request;
        let request_id = self.next_request_id()?;
        let mut request = Envelope {
            protocol_major: HELPER_PROTOCOL_MAJOR,
            kind: MessageKind::TalosProbeRequest as i32,
            request_id: request_id.clone(),
            payload: Some(envelope::Payload::TalosProbeRequest(TalosProbeRequest {
                talos_config: config.as_slice().to_vec(),
                endpoints,
                node,
            })),
            ..Envelope::default()
        };
        validate_envelope(&request)?;
        let mut encoded = Zeroizing::new(Vec::with_capacity(256));
        let encode_result = request.encode(&mut *encoded);
        if let Some(envelope::Payload::TalosProbeRequest(payload)) = request.payload.as_mut() {
            payload.talos_config.zeroize();
        }
        encode_result.map_err(SupervisorError::Encode)?;
        write_async_frame(&mut self.stdin, encoded.as_slice()).await?;
        encoded.zeroize();

        let initial = timeout(startup_deadline, read_envelope(&mut self.stdout)).await;
        let initial = match initial {
            Ok(Ok(response)) => response,
            Ok(Err(error)) => return Err(error),
            Err(_) => return Err(SupervisorError::Timeout),
        };
        if initial.request_id != request_id {
            return Err(SupervisorError::ResponseMismatch);
        }
        if initial.sequence != 0 {
            return Err(SupervisorError::TalosStreamInvalid);
        }
        let Some(envelope::Payload::TalosProbeResponse(TalosProbeResponse {
            version,
            stage,
            ready,
        })) = initial.payload
        else {
            if let Some(envelope::Payload::Error(error)) = initial.payload {
                return Err(talos_probe_failure(error));
            }
            return Err(SupervisorError::ResponseMismatch);
        };
        let mut consumer_closed = emit_probe_event(
            on_event,
            TalosProbeEventDto {
                session_id: session_id.clone(),
                state: TalosProbeState::Healthy,
                version: Some(version),
                stage: Some(stage),
                ready: Some(ready),
                deleted: false,
                sequence: "0".to_owned(),
            },
        )
        .is_err();

        let stdin = &mut self.stdin;
        let stdout = &mut self.stdout;
        let request_counter = &mut self.request_counter;
        let mut last_sequence = 0_u64;
        let mut cancel_request_id = None;
        let mut cancel_acknowledged = false;
        let mut cancel_deadline = None;
        if consumer_closed {
            cancel_request_id = Some(send_talos_cancel(stdin, request_counter, &request_id).await?);
            cancel_deadline = Some(Instant::now() + TALOS_CANCEL_ACK_DEADLINE);
        }
        // A frame read interrupted by cancellation must not lose bytes already
        // consumed from the pipe: `FrameReader` keeps its progress across drops.
        loop {
            tokio::select! {
                changed = cancellation.changed(), if cancel_request_id.is_none() => {
                    if changed.is_err() || *cancellation.borrow_and_update() {
                        cancel_request_id = Some(send_talos_cancel(stdin, request_counter, &request_id).await?);
                        cancel_deadline = Some(Instant::now() + TALOS_CANCEL_ACK_DEADLINE);
                    }
                }
                received = read_probe_envelope(stdout, cancel_deadline) => {
                    let response = received?;
                    if Some(response.request_id.as_str()) == cancel_request_id.as_deref() {
                        if response.kind != MessageKind::TalosCancelResponse as i32 {
                            return Err(SupervisorError::ResponseMismatch);
                        }
                        cancel_acknowledged = true;
                        continue;
                    }
                    if response.request_id != request_id {
                        return Err(SupervisorError::ResponseMismatch);
                    }
                    match response.payload {
                        Some(envelope::Payload::TalosStatusEvent(TalosStatusEvent { stage, ready, deleted })) => {
                            let expected = last_sequence.checked_add(1).ok_or(SupervisorError::TalosStreamInvalid)?;
                            if response.kind != MessageKind::TalosStatusEvent as i32 || response.sequence != expected {
                                return Err(SupervisorError::TalosStreamInvalid);
                            }
                            last_sequence = expected;
                            if !consumer_closed && emit_probe_event(on_event, TalosProbeEventDto {
                                session_id: session_id.clone(),
                                state: TalosProbeState::Healthy,
                                version: None,
                                stage: Some(stage),
                                ready: Some(ready),
                                deleted,
                                sequence: expected.to_string(),
                            }).is_err() {
                                consumer_closed = true;
                            }
                            if expected >= MAX_TALOS_STATUS_EVENTS {
                                consumer_closed = true;
                            }
                            if consumer_closed && cancel_request_id.is_none() {
                                cancel_request_id = Some(send_talos_cancel(stdin, request_counter, &request_id).await?);
                                cancel_deadline = Some(Instant::now() + TALOS_CANCEL_ACK_DEADLINE);
                            }
                        }
                        Some(envelope::Payload::TalosStreamEnded(TalosStreamEnded { code })) => {
                            let expected = last_sequence.checked_add(1).ok_or(SupervisorError::TalosStreamInvalid)?;
                            if response.kind != MessageKind::TalosStreamEnded as i32 || response.sequence != expected {
                                return Err(SupervisorError::TalosStreamInvalid);
                            }
                            if cancel_request_id.is_some() && !cancel_acknowledged {
                                return Err(SupervisorError::TalosStreamInvalid);
                            }
                            return match code.as_str() {
                                "cancelled" | "stream_complete" => Ok(()),
                                "stream_failed" => Err(SupervisorError::TalosProbeFailed(
                                    TalosProbeFailure::General,
                                )),
                                _ => Err(SupervisorError::TalosStreamInvalid),
                            };
                        }
                        Some(envelope::Payload::Error(error)) => return Err(talos_probe_failure(error)),
                        _ => return Err(SupervisorError::ResponseMismatch),
                    }
                }
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
        let bytes = self.stdout.read_frame().await?;
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

fn talos_probe_failure(error: ProtocolError) -> SupervisorError {
    let failure = match error.code.as_str() {
        "talos_unauthorized" => TalosProbeFailure::Unauthorized,
        "talos_certificate_invalid" => TalosProbeFailure::CertificateInvalid,
        "talos_unavailable" => TalosProbeFailure::Unavailable,
        "talos_config_invalid" | "talos_invalid_target" => TalosProbeFailure::InvalidInput,
        _ => TalosProbeFailure::General,
    };
    SupervisorError::TalosProbeFailed(failure)
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
        capabilities: if capabilities.iter().any(|item| item == "talos_probe") {
            vec![REQUIRED_CAPABILITY.to_owned(), "talos_probe".to_owned()]
        } else {
            vec![REQUIRED_CAPABILITY.to_owned()]
        },
    })
}

/// Reads length-prefixed helper frames from a pipe.
///
/// Cancel safety: progress is stored in `self` and only the cancel-safe
/// `AsyncReadExt::read` is awaited, so dropping [`read_frame`](Self::read_frame)
/// (for example in a `select!` branch or under a timeout) loses no consumed
/// bytes. The next call resumes the same frame. After an error the reader must
/// not be reused; the supervisor always terminates the helper on a read error.
struct FrameReader<R> {
    inner: R,
    header: [u8; 4],
    header_filled: usize,
    body: Vec<u8>,
    body_filled: usize,
}

impl<R: AsyncRead + Unpin> FrameReader<R> {
    fn new(inner: R) -> Self {
        Self {
            inner,
            header: [0; 4],
            header_filled: 0,
            body: Vec::new(),
            body_filled: 0,
        }
    }

    /// Reads one frame payload, resuming any frame interrupted by a drop.
    ///
    /// The body is allocated only after its length passes validation.
    async fn read_frame(&mut self) -> Result<Vec<u8>, SupervisorError> {
        while self.header_filled < self.header.len() {
            let count = self
                .inner
                .read(&mut self.header[self.header_filled..])
                .await
                .map_err(SupervisorError::Pipe)?;
            if count == 0 {
                return Err(SupervisorError::ChildExited);
            }
            self.header_filled += count;
        }
        if self.body.is_empty() {
            let length = u32::from_be_bytes(self.header) as usize;
            if length == 0 || length > MAX_FRAME_BYTES {
                return Err(SupervisorError::Frame(FrameError::InvalidLength));
            }
            self.body = vec![0; length];
            self.body_filled = 0;
        }
        while self.body_filled < self.body.len() {
            let count = self
                .inner
                .read(&mut self.body[self.body_filled..])
                .await
                .map_err(SupervisorError::Pipe)?;
            if count == 0 {
                return Err(SupervisorError::ChildExited);
            }
            self.body_filled += count;
        }
        self.header_filled = 0;
        self.body_filled = 0;
        Ok(std::mem::take(&mut self.body))
    }
}

async fn read_envelope(
    reader: &mut FrameReader<impl AsyncRead + Unpin>,
) -> Result<Envelope, SupervisorError> {
    let bytes = reader.read_frame().await?;
    let response = Envelope::decode(bytes.as_slice()).map_err(SupervisorError::Decode)?;
    validate_envelope(&response)?;
    Ok(response)
}

/// Reads the next Talos stream envelope, bounding the wait after cancellation.
///
/// Once the parent has asked the helper to stop a subscription, both the
/// cancellation acknowledgement and the stream-end marker must arrive within
/// [`TALOS_CANCEL_ACK_DEADLINE`]; otherwise the caller reports a timeout and the
/// supervisor terminates and reaps the child instead of waiting forever.
async fn read_probe_envelope(
    reader: &mut FrameReader<impl AsyncRead + Unpin>,
    cancel_deadline: Option<Instant>,
) -> Result<Envelope, SupervisorError> {
    match cancel_deadline {
        Some(deadline) => timeout_at(deadline, read_envelope(reader))
            .await
            .map_err(|_| SupervisorError::Timeout)?,
        None => read_envelope(reader).await,
    }
}

async fn send_talos_cancel(
    stdin: &mut (impl AsyncWrite + Unpin),
    request_counter: &mut u64,
    subscription_request_id: &str,
) -> Result<String, SupervisorError> {
    *request_counter = request_counter
        .checked_add(1)
        .ok_or(SupervisorError::ResponseMismatch)?;
    let request_id = format!("helper-{}", *request_counter);
    let request = Envelope {
        protocol_major: HELPER_PROTOCOL_MAJOR,
        kind: MessageKind::TalosCancelRequest as i32,
        request_id: request_id.clone(),
        payload: Some(envelope::Payload::TalosCancelRequest(TalosCancelRequest {
            subscription_request_id: subscription_request_id.to_owned(),
        })),
        ..Envelope::default()
    };
    let encoded = request.encode_to_vec();
    write_async_frame(stdin, &encoded).await?;

    Ok(request_id)
}

fn emit_probe_event<F>(on_event: &mut F, event: TalosProbeEventDto) -> Result<(), ()>
where
    F: FnMut(TalosProbeEventDto) -> Result<(), ()>,
{
    on_event(event)
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

    use tokio::{sync::watch, time::Instant};
    use zeroize::Zeroizing;

    use super::{
        FrameReader, HelperSupervisor, SupervisorError, TALOS_CANCEL_ACK_DEADLINE,
        TalosProbeFailure, read_probe_envelope,
    };

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

    fn build_delayed_helper() -> PathBuf {
        let helper_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../helper");
        let binary = std::env::temp_dir().join(format!(
            "talos-pilot-delayed-helper-test-{}{}",
            std::process::id(),
            std::env::consts::EXE_SUFFIX
        ));
        let result = Command::new("go")
            .args(["build", "-o"])
            .arg(&binary)
            .arg("./testdata/delayedhelper")
            .current_dir(helper_dir)
            .output();
        let output =
            result.unwrap_or_else(|_| panic!("pinned Go toolchain must build timeout fixture"));
        assert!(
            output.status.success(),
            "Go timeout fixture build must succeed"
        );
        binary
    }

    fn build_probe_fixture() -> PathBuf {
        let helper_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../helper");
        let binary = std::env::temp_dir().join(format!(
            "talos-pilot-probe-fixture-test-{}{}",
            std::process::id(),
            std::env::consts::EXE_SUFFIX
        ));
        let result = Command::new("go")
            .args(["build", "-o"])
            .arg(&binary)
            .arg("./testdata/probehelper")
            .current_dir(helper_dir)
            .output();
        let output = result.unwrap_or_else(|_| panic!("Go stream fixture must build"));
        assert!(output.status.success(), "Go stream fixture must build");
        binary
    }

    fn remove_helper(binary: PathBuf) {
        std::fs::remove_file(binary)
            .unwrap_or_else(|_| panic!("temporary helper binary must be removable"));
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
        assert_eq!(status.capabilities, ["status", "talos_probe"]);
        supervisor
            .shutdown(Duration::from_secs(5))
            .await
            .unwrap_or_else(|_| panic!("real Go helper must exit after shutdown"));
        remove_helper(helper);
    }

    #[tokio::test]
    async fn rejects_build_identity_mismatch_and_reaps_child() {
        let helper = build_helper("build-mismatch");
        let error = HelperSupervisor::start(&helper, "wrong-build", Duration::from_secs(5))
            .await
            .err();
        assert!(matches!(error, Some(SupervisorError::HandshakeRejected)));
        remove_helper(helper);
    }

    #[tokio::test]
    async fn startup_deadline_terminates_a_started_helper() {
        let helper = build_delayed_helper();
        assert!(matches!(
            HelperSupervisor::start(&helper, "development", Duration::from_millis(50)).await,
            Err(SupervisorError::Timeout)
        ));
        remove_helper(helper);
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
        remove_helper(helper);
    }

    #[tokio::test]
    async fn sends_talosconfig_only_over_helper_pipe_and_redacts_probe_errors() {
        let helper = build_helper("talos-probe-redaction");
        let mut supervisor =
            HelperSupervisor::start(&helper, "development", Duration::from_secs(5))
                .await
                .unwrap_or_else(|_| panic!("real Go helper handshake must succeed"));
        let (_cancel, cancellation) = watch::channel(false);
        let secret = b"synthetic-taloscfg-secret".to_vec();
        let error = supervisor
            .talos_probe(
                super::TalosProbeInput {
                    config: Zeroizing::new(secret),
                    endpoints: vec!["10.79.0.2".to_owned()],
                    node: "10.79.0.2".to_owned(),
                    session_id: "session-1".to_owned(),
                },
                cancellation,
                |_| Ok(()),
                Duration::from_secs(5),
            )
            .await;
        assert!(matches!(
            error,
            Err(SupervisorError::TalosProbeFailed(
                TalosProbeFailure::InvalidInput
            ))
        ));
        assert!(
            supervisor.child.try_wait().ok().flatten().is_some(),
            "failed Talos exchanges must reap the helper"
        );
        remove_helper(helper);
    }

    #[tokio::test]
    async fn cancellation_acknowledgement_wait_is_bounded() {
        assert_eq!(TALOS_CANCEL_ACK_DEADLINE, Duration::from_secs(2));

        // An expired cancellation deadline must fail the stream read instead of
        // pinning the probe gate and the supervised helper forever.
        let (stalled, _active) = tokio::io::duplex(64);
        let mut stalled = FrameReader::new(stalled);
        let expired = Instant::now() - Duration::from_millis(5);
        let error = read_probe_envelope(&mut stalled, Some(expired)).await;
        assert!(matches!(error, Err(SupervisorError::Timeout)));
    }

    #[tokio::test]
    async fn interrupted_frame_read_keeps_consumed_bytes() {
        use tokio::io::AsyncWriteExt;

        let (mut writer, reader) = tokio::io::duplex(64);
        let mut reader = FrameReader::new(reader);
        writer
            .write_all(&3_u32.to_be_bytes())
            .await
            .unwrap_or_else(|_| panic!("header must be written"));
        let interrupted =
            tokio::time::timeout(Duration::from_millis(20), reader.read_frame()).await;
        assert!(
            interrupted.is_err(),
            "the withheld body must stall the read"
        );
        writer
            .write_all(b"abc")
            .await
            .unwrap_or_else(|_| panic!("body must be written"));
        let frame = reader
            .read_frame()
            .await
            .unwrap_or_else(|_| panic!("the resumed read must stay frame aligned"));
        assert_eq!(frame, b"abc");
    }

    #[tokio::test]
    async fn interrupted_header_read_keeps_consumed_bytes() {
        use tokio::io::AsyncWriteExt;

        let (mut writer, reader) = tokio::io::duplex(64);
        let mut reader = FrameReader::new(reader);
        let header = 3_u32.to_be_bytes();
        writer
            .write_all(&header[..2])
            .await
            .unwrap_or_else(|_| panic!("partial header must be written"));
        let interrupted =
            tokio::time::timeout(Duration::from_millis(20), reader.read_frame()).await;
        assert!(interrupted.is_err(), "a partial header must stall the read");
        writer
            .write_all(&header[2..])
            .await
            .unwrap_or_else(|_| panic!("header remainder must be written"));
        writer
            .write_all(b"xyz")
            .await
            .unwrap_or_else(|_| panic!("body must be written"));
        let frame = reader
            .read_frame()
            .await
            .unwrap_or_else(|_| panic!("the resumed read must stay frame aligned"));
        assert_eq!(frame, b"xyz");
    }

    #[tokio::test]
    async fn frame_reader_maps_eof_and_invalid_lengths() {
        use tokio::io::AsyncWriteExt;

        let (writer, reader) = tokio::io::duplex(64);
        let mut reader = FrameReader::new(reader);
        drop(writer);
        assert!(matches!(
            reader.read_frame().await,
            Err(SupervisorError::ChildExited)
        ));

        for length in [0_u32, u32::MAX] {
            let (mut writer, reader) = tokio::io::duplex(64);
            let mut reader = FrameReader::new(reader);
            writer
                .write_all(&length.to_be_bytes())
                .await
                .unwrap_or_else(|_| panic!("header must be written"));
            assert!(matches!(
                reader.read_frame().await,
                Err(SupervisorError::Frame(_))
            ));
        }
    }

    #[tokio::test]
    async fn streams_validated_status_and_cancels_the_helper_subscription() {
        let helper = build_probe_fixture();
        let mut supervisor =
            HelperSupervisor::start(&helper, "development", Duration::from_secs(5))
                .await
                .unwrap_or_else(|_| panic!("protocol fixture handshake must succeed"));
        let (cancel_sender, cancel_receiver) = watch::channel(false);
        let mut events = Vec::new();
        supervisor
            .talos_probe(
                super::TalosProbeInput {
                    config: Zeroizing::new(b"synthetic-private-config".to_vec()),
                    endpoints: vec!["10.79.0.2".to_owned()],
                    node: "10.79.0.2".to_owned(),
                    session_id: "session-1".to_owned(),
                },
                cancel_receiver,
                |event| {
                    let should_cancel = event.sequence == "1";
                    events.push(event);
                    if should_cancel {
                        let _ = cancel_sender.send(true);
                    }
                    Ok(())
                },
                Duration::from_secs(5),
            )
            .await
            .unwrap_or_else(|_| panic!("protocol fixture stream must cancel cleanly"));
        assert_eq!(events.len(), 2);
        assert_eq!(events[0].version.as_deref(), Some("v1.14.1"));
        assert_eq!(events[0].stage.as_deref(), Some("running"));
        assert_eq!(events[0].sequence, "0");
        assert_eq!(events[1].sequence, "1");
        assert_eq!(events[1].ready, Some(true));
        supervisor
            .shutdown(Duration::from_secs(5))
            .await
            .unwrap_or_else(|_| panic!("protocol fixture helper must exit cleanly"));
        remove_helper(helper);
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
        remove_helper(helper);
    }
}
