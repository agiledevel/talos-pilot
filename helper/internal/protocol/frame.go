// Package protocol implements bounded private helper frames.
package protocol

import (
	"encoding/binary"
	"errors"
	"fmt"
	"io"
)

// MaxFrameBytes is the maximum protobuf payload accepted from the peer.
const MaxFrameBytes = 1 << 20

var (
	// ErrCleanEOF indicates that no header bytes were available for a new frame.
	ErrCleanEOF = errors.New("helper stream reached EOF")
	// ErrInvalidLength indicates a zero or oversized frame length.
	ErrInvalidLength = errors.New("helper frame length is invalid")
	// ErrTruncated indicates that a frame ended before its header or body completed.
	ErrTruncated = errors.New("helper frame is truncated")
)

// ReadFrame reads one four-byte big-endian length-prefixed payload. It validates
// the length before allocating the payload buffer.
func ReadFrame(reader io.Reader) ([]byte, error) {
	var header [4]byte
	read, err := io.ReadFull(reader, header[:])
	if err != nil {
		if errors.Is(err, io.EOF) && read == 0 {
			return nil, ErrCleanEOF
		}
		if errors.Is(err, io.ErrUnexpectedEOF) || errors.Is(err, io.EOF) {
			return nil, ErrTruncated
		}
		return nil, fmt.Errorf("read helper frame header: %w", err)
	}

	length := binary.BigEndian.Uint32(header[:])
	if length == 0 || length > MaxFrameBytes {
		return nil, ErrInvalidLength
	}

	payload := make([]byte, int(length))
	if _, err := io.ReadFull(reader, payload); err != nil {
		if errors.Is(err, io.EOF) || errors.Is(err, io.ErrUnexpectedEOF) {
			return nil, ErrTruncated
		}
		return nil, fmt.Errorf("read helper frame payload: %w", err)
	}
	return payload, nil
}

// WriteFrame writes one nonempty payload with its four-byte big-endian length.
func WriteFrame(writer io.Writer, payload []byte) error {
	if len(payload) == 0 || len(payload) > MaxFrameBytes {
		return ErrInvalidLength
	}
	var header [4]byte
	binary.BigEndian.PutUint32(header[:], uint32(len(payload)))
	if err := writeAll(writer, header[:]); err != nil {
		return fmt.Errorf("write helper frame header: %w", err)
	}
	if err := writeAll(writer, payload); err != nil {
		return fmt.Errorf("write helper frame payload: %w", err)
	}
	return nil
}

func writeAll(writer io.Writer, bytes []byte) error {
	for len(bytes) > 0 {
		written, err := writer.Write(bytes)
		if err != nil {
			return err
		}
		if written < 0 || written > len(bytes) {
			return errors.New("writer returned an invalid byte count")
		}
		if written <= 0 {
			return io.ErrShortWrite
		}
		bytes = bytes[written:]
	}
	return nil
}
