package main

import (
	"bytes"
	"encoding/hex"
	"os"
	"path/filepath"
	"testing"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"google.golang.org/protobuf/proto"
)

func TestServeHandshakeStatusAndShutdown(t *testing.T) {
	input := encodeRequests(t,
		handshake("request-1", buildIdentity),
		status("request-2"),
		shutdown("request-3"),
	)
	var output bytes.Buffer
	if err := serve(bytes.NewReader(input), &output); err != nil {
		t.Fatalf("serve() error = %v", err)
	}

	responses := decodeResponses(t, output.Bytes())
	if len(responses) != 3 {
		t.Fatalf("got %d responses, want 3", len(responses))
	}
	if responses[0].GetHandshakeResponse().GetBuildIdentity() != buildIdentity {
		t.Fatalf("handshake build = %q", responses[0].GetHandshakeResponse().GetBuildIdentity())
	}
	if got := responses[0].GetHandshakeResponse().GetCapabilities(); len(got) != 1 || got[0] != "status" {
		t.Fatalf("handshake capabilities = %v", got)
	}
	if responses[1].Kind != protocolv1.MessageKind_MESSAGE_KIND_STATUS_RESPONSE {
		t.Fatalf("status response kind = %v", responses[1].Kind)
	}
	if responses[2].Kind != protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_RESPONSE {
		t.Fatalf("shutdown response kind = %v", responses[2].Kind)
	}
}

func TestServeRejectsStatusBeforeHandshake(t *testing.T) {
	input := encodeRequests(t, status("request-1"))
	var output bytes.Buffer
	if err := serve(bytes.NewReader(input), &output); err != nil {
		t.Fatalf("serve() error = %v", err)
	}
	responses := decodeResponses(t, output.Bytes())
	if len(responses) != 1 || responses[0].GetError().GetCode() != "handshake_required" {
		t.Fatalf("responses = %v", responses)
	}
}

func TestHandleRejectsWrongBuildAndPayloadKind(t *testing.T) {
	wrongBuild := handshake("request-1", "different-build")
	response, _, accepted := handle(wrongBuild, false)
	if accepted || response.GetError().GetCode() != "build_mismatch" {
		t.Fatalf("wrong build response = %v, accepted=%v", response, accepted)
	}

	wrongPayload := status("request-2")
	wrongPayload.Payload = &protocolv1.Envelope_ShutdownRequest{ShutdownRequest: &protocolv1.ShutdownRequest{}}
	response, _, _ = handle(wrongPayload, true)
	if response.GetError().GetCode() != "invalid_message" {
		t.Fatalf("payload mismatch response = %v", response)
	}
}

func TestMalformedMessageDoesNotEchoInput(t *testing.T) {
	secret := []byte("synthetic-secret-marker")
	input := make([]byte, 4+len(secret))
	input[3] = byte(len(secret))
	copy(input[4:], secret)
	var output bytes.Buffer
	err := serve(bytes.NewReader(input), &output)
	if err == nil {
		t.Fatal("serve() accepted malformed protobuf")
	}
	if bytes.Contains(output.Bytes(), secret) {
		t.Fatal("helper echoed malformed input")
	}
}

func TestDecodesSharedRustWireFixture(t *testing.T) {
	fixturePath := filepath.Join("..", "..", "..", "proto", "testdata", "helper-v1-rust.hex")
	encoded, err := os.ReadFile(fixturePath)
	if err != nil {
		t.Fatal(err)
	}
	data, err := hex.DecodeString(string(bytes.TrimSpace(encoded)))
	if err != nil {
		t.Fatal(err)
	}
	message := new(protocolv1.Envelope)
	if err := proto.Unmarshal(data, message); err != nil {
		t.Fatal(err)
	}
	if message.GetRequestId() != "fixture-1" || message.GetSequence() != ^uint64(0) {
		t.Fatalf("unexpected fixture fields: %v", message)
	}
	if message.GetSessionId() != "" || message.GetOperationId() != "operation-1" {
		t.Fatalf("unexpected optional fixture fields: %v", message)
	}
	if message.GetHandshakeRequest().GetExpectedBuildIdentity() != "fixture-build" {
		t.Fatalf("unexpected handshake fixture: %v", message.GetPayload())
	}
}

func TestRequestIDValidation(t *testing.T) {
	for _, test := range []struct {
		id    string
		valid bool
	}{
		{id: "valid-01", valid: true},
		{id: "", valid: false},
		{id: "has space", valid: false},
		{id: string(bytes.Repeat([]byte{'a'}, 129)), valid: false},
	} {
		if got := validRequestID(test.id); got != test.valid {
			t.Errorf("validRequestID(%q) = %v, want %v", test.id, got, test.valid)
		}
	}
}

func handshake(requestID, expectedBuild string) *protocolv1.Envelope {
	return &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_REQUEST,
		RequestId:     requestID,
		Payload: &protocolv1.Envelope_HandshakeRequest{HandshakeRequest: &protocolv1.HandshakeRequest{
			ProtocolMajor:         protocolMajor,
			ExpectedBuildIdentity: expectedBuild,
		}},
	}
}

func status(requestID string) *protocolv1.Envelope {
	return &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_STATUS_REQUEST,
		RequestId:     requestID,
		Payload:       &protocolv1.Envelope_StatusRequest{StatusRequest: &protocolv1.StatusRequest{}},
	}
}

func shutdown(requestID string) *protocolv1.Envelope {
	return &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_REQUEST,
		RequestId:     requestID,
		Payload:       &protocolv1.Envelope_ShutdownRequest{ShutdownRequest: &protocolv1.ShutdownRequest{}},
	}
}

func encodeRequests(t *testing.T, requests ...*protocolv1.Envelope) []byte {
	t.Helper()
	var input bytes.Buffer
	for _, request := range requests {
		payload, err := proto.Marshal(request)
		if err != nil {
			t.Fatal(err)
		}
		if err := protocol.WriteFrame(&input, payload); err != nil {
			t.Fatal(err)
		}
	}
	return input.Bytes()
}

func decodeResponses(t *testing.T, data []byte) []*protocolv1.Envelope {
	t.Helper()
	reader := bytes.NewReader(data)
	var responses []*protocolv1.Envelope
	for reader.Len() > 0 {
		payload, err := protocol.ReadFrame(reader)
		if err != nil {
			t.Fatal(err)
		}
		response := new(protocolv1.Envelope)
		if err := proto.Unmarshal(payload, response); err != nil {
			t.Fatal(err)
		}
		responses = append(responses, response)
	}
	return responses
}
