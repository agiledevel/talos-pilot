//! Length-delimited protobuf frame I/O with allocation bounds.

use std::io::{self, Read, Write};

/// Maximum serialized protobuf payload, including the length header separately.
pub const MAX_FRAME_BYTES: usize = 1_048_576;

/// Frame errors preserve whether the stream ended cleanly or was truncated.
#[derive(Debug, thiserror::Error)]
pub enum FrameError {
    /// The peer closed the stream before a new header began.
    #[error("helper stream reached end of file")]
    Eof,
    /// A header declared an invalid payload size.
    #[error("helper frame length is invalid")]
    InvalidLength,
    /// A header or body ended before the declared frame was complete.
    #[error("helper frame was truncated")]
    Truncated,
    /// A frame could not be read or written.
    #[error("helper frame I/O failed: {0}")]
    Io(#[from] io::Error),
}

/// Reads one bounded big-endian length-prefixed payload.
///
/// A clean EOF before any header byte returns [`FrameError::Eof`]. A partial
/// header or body is reported as truncated. The size is checked before the
/// payload buffer is allocated.
///
/// # Errors
///
/// Returns [`FrameError::Eof`] for a clean stream close, [`FrameError::InvalidLength`]
/// for zero or oversized frames, [`FrameError::Truncated`] for incomplete frames,
/// or [`FrameError::Io`] for other read failures.
pub fn read_frame<R: Read>(reader: &mut R) -> Result<Vec<u8>, FrameError> {
    let mut header = [0_u8; 4];
    loop {
        match reader.read(&mut header[..1]) {
            Ok(0) => return Err(FrameError::Eof),
            Ok(1) => break,
            Ok(_) => return Err(FrameError::InvalidLength),
            Err(error) if error.kind() == io::ErrorKind::Interrupted => continue,
            Err(error) => return Err(FrameError::Io(error)),
        }
    }
    read_exact_part(reader, &mut header[1..])?;
    let length = u32::from_be_bytes(header) as usize;
    if length == 0 || length > MAX_FRAME_BYTES {
        return Err(FrameError::InvalidLength);
    }

    let mut payload = vec![0; length];
    read_exact_part(reader, &mut payload)?;
    Ok(payload)
}

fn read_exact_part<R: Read>(reader: &mut R, bytes: &mut [u8]) -> Result<(), FrameError> {
    match reader.read_exact(bytes) {
        Ok(()) => Ok(()),
        Err(error) if error.kind() == io::ErrorKind::UnexpectedEof => Err(FrameError::Truncated),
        Err(error) => Err(FrameError::Io(error)),
    }
}

/// Writes one bounded payload as a four-byte big-endian length plus bytes.
///
/// # Errors
///
/// Returns [`FrameError::InvalidLength`] for empty or oversized payloads and
/// [`FrameError::Io`] when the destination cannot be written completely.
pub fn write_frame<W: Write>(writer: &mut W, payload: &[u8]) -> Result<(), FrameError> {
    if payload.is_empty() || payload.len() > MAX_FRAME_BYTES {
        return Err(FrameError::InvalidLength);
    }
    let length = u32::try_from(payload.len()).map_err(|_| FrameError::InvalidLength)?;
    writer.write_all(&length.to_be_bytes())?;
    writer.write_all(payload)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use std::io::{self, Cursor, Read};

    use super::{FrameError, MAX_FRAME_BYTES, read_frame, write_frame};

    #[test]
    fn reads_split_header_and_body_and_consecutive_frames() {
        let mut encoded = Vec::new();
        assert!(write_frame(&mut encoded, b"first").is_ok());
        assert!(write_frame(&mut encoded, b"second").is_ok());
        let mut reader = SplitReader::new(encoded, 2);

        assert_eq!(
            read_frame(&mut reader).unwrap_or_else(|_| panic!("first frame must decode")),
            b"first"
        );
        assert_eq!(
            read_frame(&mut reader).unwrap_or_else(|_| panic!("second frame must decode")),
            b"second"
        );
        assert!(matches!(read_frame(&mut reader), Err(FrameError::Eof)));
    }

    #[test]
    fn rejects_zero_and_oversized_lengths_before_reading_body() {
        for length in [0_u32, (MAX_FRAME_BYTES as u32) + 1] {
            let mut reader = Cursor::new(length.to_be_bytes().to_vec());
            assert!(matches!(
                read_frame(&mut reader),
                Err(FrameError::InvalidLength)
            ));
            assert_eq!(reader.position(), 4);
        }
    }

    #[test]
    fn distinguishes_truncated_header_and_payload() {
        let mut short_header = Cursor::new([0_u8, 0]);
        assert!(matches!(
            read_frame(&mut short_header),
            Err(FrameError::Truncated)
        ));

        let mut short_payload = Cursor::new([0_u8, 0, 0, 2, b'x']);
        assert!(matches!(
            read_frame(&mut short_payload),
            Err(FrameError::Truncated)
        ));
    }

    #[test]
    fn refuses_empty_and_oversized_outbound_payloads() {
        let mut sink = Vec::new();
        assert!(matches!(
            write_frame(&mut sink, b""),
            Err(FrameError::InvalidLength)
        ));
        assert!(matches!(
            write_frame(&mut sink, &vec![0; MAX_FRAME_BYTES + 1]),
            Err(FrameError::InvalidLength)
        ));
    }

    struct SplitReader {
        inner: Cursor<Vec<u8>>,
        maximum: usize,
    }

    impl SplitReader {
        fn new(data: Vec<u8>, maximum: usize) -> Self {
            Self {
                inner: Cursor::new(data),
                maximum,
            }
        }
    }

    impl Read for SplitReader {
        fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
            let count = output.len().min(self.maximum);
            self.inner.read(&mut output[..count])
        }
    }
}
