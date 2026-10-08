//! Validates message identity and kind/payload agreement after protobuf decode.

use super::generated::{Envelope, MessageKind, envelope};

/// Safe protocol validation failures that never include message payloads.
#[derive(Debug, thiserror::Error, Eq, PartialEq)]
pub enum EnvelopeError {
    /// The sender used a protocol major this process does not implement.
    #[error("helper protocol major is unsupported")]
    UnsupportedVersion,
    /// The request identifier is empty, too long, or outside the allowed alphabet.
    #[error("helper request identifier is invalid")]
    InvalidRequestId,
    /// The enum value is unknown or explicitly unspecified.
    #[error("helper message kind is unsupported")]
    UnsupportedKind,
    /// The oneof payload does not match the message kind.
    #[error("helper message kind and payload do not match")]
    PayloadMismatch,
}

/// Validates the stable envelope header and oneof relationship.
///
/// Unknown protobuf fields are ignored by Prost, following v1's additive-field
/// policy. Unknown enum numbers and absent or mismatched payloads fail closed.
///
/// # Errors
///
/// Returns a safe [`EnvelopeError`] for unsupported versions, invalid request
/// IDs, unknown kinds, and payload mismatches. No raw message content is exposed.
pub fn validate_envelope(envelope: &Envelope) -> Result<MessageKind, EnvelopeError> {
    if envelope.protocol_major != 1 {
        return Err(EnvelopeError::UnsupportedVersion);
    }
    if !valid_request_id(&envelope.request_id) {
        return Err(EnvelopeError::InvalidRequestId);
    }
    let kind = MessageKind::try_from(envelope.kind).map_err(|_| EnvelopeError::UnsupportedKind)?;
    if kind == MessageKind::Unspecified {
        return Err(EnvelopeError::UnsupportedKind);
    }
    let matches = matches!(
        (&envelope.payload, kind),
        (
            Some(envelope::Payload::HandshakeRequest(_)),
            MessageKind::HandshakeRequest
        ) | (
            Some(envelope::Payload::HandshakeResponse(_)),
            MessageKind::HandshakeResponse
        ) | (
            Some(envelope::Payload::StatusRequest(_)),
            MessageKind::StatusRequest
        ) | (
            Some(envelope::Payload::StatusResponse(_)),
            MessageKind::StatusResponse
        ) | (
            Some(envelope::Payload::ShutdownRequest(_)),
            MessageKind::ShutdownRequest
        ) | (
            Some(envelope::Payload::ShutdownResponse(_)),
            MessageKind::ShutdownResponse
        ) | (Some(envelope::Payload::Error(_)), MessageKind::Error)
    );
    if !matches {
        return Err(EnvelopeError::PayloadMismatch);
    }
    Ok(kind)
}

fn valid_request_id(request_id: &str) -> bool {
    !request_id.is_empty()
        && request_id.len() <= 128
        && request_id.bytes().all(|character| {
            character.is_ascii_alphanumeric() || character == b'-' || character == b'_'
        })
}

#[cfg(test)]
mod tests {
    use prost::Message;

    use super::{EnvelopeError, validate_envelope};
    use crate::helper::protocol::generated::{Envelope, HandshakeRequest, MessageKind, envelope};

    fn valid_request() -> Envelope {
        Envelope {
            protocol_major: 1,
            kind: MessageKind::HandshakeRequest as i32,
            request_id: "request_01".to_owned(),
            payload: Some(envelope::Payload::HandshakeRequest(HandshakeRequest {
                protocol_major: 1,
                expected_build_identity: "synthetic".to_owned(),
            })),
            ..Envelope::default()
        }
    }

    #[test]
    fn rejects_unknown_enum_value_and_kind_payload_mismatch() {
        let mut unknown = valid_request();
        unknown.kind = 999;
        assert_eq!(
            validate_envelope(&unknown),
            Err(EnvelopeError::UnsupportedKind)
        );

        let mut mismatch = valid_request();
        mismatch.kind = MessageKind::StatusRequest as i32;
        assert_eq!(
            validate_envelope(&mismatch),
            Err(EnvelopeError::PayloadMismatch)
        );
    }

    #[test]
    fn rejects_missing_invalid_and_oversized_request_ids() {
        let mut invalid = valid_request();
        invalid.request_id.clear();
        assert_eq!(
            validate_envelope(&invalid),
            Err(EnvelopeError::InvalidRequestId)
        );
        invalid.request_id = "bad id".to_owned();
        assert_eq!(
            validate_envelope(&invalid),
            Err(EnvelopeError::InvalidRequestId)
        );
        invalid.request_id = "x".repeat(129);
        assert_eq!(
            validate_envelope(&invalid),
            Err(EnvelopeError::InvalidRequestId)
        );
    }

    #[test]
    fn rejects_version_mismatch_and_tolerates_unknown_fields() {
        let valid = valid_request();
        let mut wrong_version = valid.clone();
        wrong_version.protocol_major = 2;
        assert_eq!(
            validate_envelope(&wrong_version),
            Err(EnvelopeError::UnsupportedVersion)
        );

        let mut encoded = valid.encode_to_vec();
        encoded.extend_from_slice(&[0xa0, 0x06, 0x01]); // field 100, varint 1
        let decoded = Envelope::decode(encoded.as_slice())
            .unwrap_or_else(|_| panic!("protobuf with additive unknown field must decode"));
        assert_eq!(
            validate_envelope(&decoded),
            Ok(MessageKind::HandshakeRequest)
        );
    }

    #[test]
    fn rejects_malformed_protobuf() {
        assert!(Envelope::decode([0x0f, 0xff].as_slice()).is_err());
    }

    #[test]
    fn decodes_the_shared_rust_to_go_wire_fixture() {
        let mut bytes = Vec::new();
        let fixture = include_str!("../../../../proto/testdata/helper-v1-rust.hex");
        let (pairs, remainder) = fixture.trim().as_bytes().as_chunks::<2>();
        assert!(remainder.is_empty(), "hex fixture must have complete bytes");
        for pair in pairs {
            let text = std::str::from_utf8(pair)
                .unwrap_or_else(|_| panic!("hex fixture must contain ASCII"));
            bytes.push(
                u8::from_str_radix(text, 16)
                    .unwrap_or_else(|_| panic!("hex fixture must contain valid bytes")),
            );
        }
        let envelope = Envelope::decode(bytes.as_slice())
            .unwrap_or_else(|_| panic!("shared protobuf fixture must decode"));
        assert_eq!(
            validate_envelope(&envelope),
            Ok(MessageKind::HandshakeRequest)
        );
        assert_eq!(envelope.sequence, u64::MAX);
        assert_eq!(envelope.session_id, None);
        assert_eq!(envelope.operation_id.as_deref(), Some("operation-1"));
    }
}
