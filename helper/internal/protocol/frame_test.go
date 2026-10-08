package protocol

import (
	"bytes"
	"encoding/binary"
	"errors"
	"io"
	"testing"
)

func TestFramesSplitAndConsecutiveReads(t *testing.T) {
	var encoded bytes.Buffer
	if err := WriteFrame(&encoded, []byte("first")); err != nil {
		t.Fatal(err)
	}
	if err := WriteFrame(&encoded, []byte("second")); err != nil {
		t.Fatal(err)
	}
	reader := &limitedReader{reader: bytes.NewReader(encoded.Bytes()), limit: 2}
	for _, expected := range []string{"first", "second"} {
		got, err := ReadFrame(reader)
		if err != nil {
			t.Fatal(err)
		}
		if string(got) != expected {
			t.Fatalf("ReadFrame() = %q, want %q", got, expected)
		}
	}
	if _, err := ReadFrame(reader); !errors.Is(err, ErrCleanEOF) {
		t.Fatalf("ReadFrame() after frames = %v, want clean EOF", err)
	}
}

func TestReadFrameRejectsInvalidLengthsBeforeBodyRead(t *testing.T) {
	for _, length := range []uint32{0, MaxFrameBytes + 1} {
		header := make([]byte, 4)
		binary.BigEndian.PutUint32(header, length)
		reader := bytes.NewReader(header)
		if _, err := ReadFrame(reader); !errors.Is(err, ErrInvalidLength) {
			t.Fatalf("ReadFrame(%d) = %v, want invalid length", length, err)
		}
		if reader.Len() != 0 {
			t.Fatalf("ReadFrame(%d) consumed %d bytes after header", length, 4-reader.Len())
		}
	}
}

func TestReadFrameReportsTruncatedHeaderAndPayload(t *testing.T) {
	for name, data := range map[string][]byte{
		"header":  {0, 0},
		"payload": {0, 0, 0, 2, 'x'},
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := ReadFrame(bytes.NewReader(data)); !errors.Is(err, ErrTruncated) {
				t.Fatalf("ReadFrame() = %v, want truncated", err)
			}
		})
	}
}

func TestWriteFrameRejectsInvalidLengths(t *testing.T) {
	for _, payload := range [][]byte{nil, make([]byte, MaxFrameBytes+1)} {
		if err := WriteFrame(io.Discard, payload); !errors.Is(err, ErrInvalidLength) {
			t.Fatalf("WriteFrame(length=%d) = %v, want invalid length", len(payload), err)
		}
	}
}

type limitedReader struct {
	reader io.Reader
	limit  int
}

func (reader *limitedReader) Read(output []byte) (int, error) {
	if len(output) > reader.limit {
		output = output[:reader.limit]
	}
	return reader.reader.Read(output)
}
