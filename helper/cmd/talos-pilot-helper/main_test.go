package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"github.com/agiledevel/talos-pilot/helper/internal/talosprobe"
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
	if got := responses[0].GetHandshakeResponse().GetCapabilities(); len(got) != 2 || got[0] != "status" || got[1] != "talos_probe" {
		t.Fatalf("handshake capabilities = %v", got)
	}
	if responses[1].Kind != protocolv1.MessageKind_MESSAGE_KIND_STATUS_RESPONSE {
		t.Fatalf("status response kind = %v", responses[1].Kind)
	}
	if responses[2].Kind != protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_RESPONSE {
		t.Fatalf("shutdown response kind = %v", responses[2].Kind)
	}
}

func TestServeTalosProbeStreamsBoundedEventsAndCancels(t *testing.T) {
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	config := []byte("synthetic-taloscfg-secret")
	outputCapture := &recordingWriter{next: outputWriter}
	var observedConfig []byte
	var serveError error
	var serveDone sync.WaitGroup
	serveDone.Add(1)
	go func() {
		defer serveDone.Done()
		serveError = serveWithProbe(inputReader, outputCapture, func(_ context.Context, received []byte, _ []string, _ string) (probeSession, error) {
			observedConfig = received
			return fakeProbeSession{}, nil
		}, probeStartDeadline)
	}()

	if err := writeRequest(inputWriter, handshake("handshake", buildIdentity)); err != nil {
		t.Fatal(err)
	}
	if response := readResponse(t, outputReader); response.Kind != protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_RESPONSE {
		t.Fatalf("handshake response = %v", response.Kind)
	}
	probeRequest := &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_REQUEST,
		RequestId:     "probe-1",
		Payload: &protocolv1.Envelope_TalosProbeRequest{TalosProbeRequest: &protocolv1.TalosProbeRequest{
			TalosConfig: append([]byte(nil), config...), Endpoints: []string{"10.79.0.2"}, Node: "10.79.0.2",
		}},
	}
	if err := writeRequest(inputWriter, probeRequest); err != nil {
		t.Fatal(err)
	}
	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %v", probeResponse.Kind)
	}
	if got := probeResponse.GetTalosProbeResponse(); got.Version != "v1.14.1" || got.Stage != "running" || !got.Ready {
		t.Fatalf("probe projection = %#v", got)
	}
	streamEvent := readResponse(t, outputReader)
	if streamEvent.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT || streamEvent.Sequence != 1 {
		t.Fatalf("stream event = %#v", streamEvent)
	}
	if got := streamEvent.GetTalosStatusEvent(); got.Stage != "rebooting" || got.Ready {
		t.Fatalf("stream projection = %#v", got)
	}
	cancel := &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST,
		RequestId:     "cancel-1",
		Payload: &protocolv1.Envelope_TalosCancelRequest{TalosCancelRequest: &protocolv1.TalosCancelRequest{
			SubscriptionRequestId: "probe-1",
		}},
	}
	if err := writeRequest(inputWriter, cancel); err != nil {
		t.Fatal(err)
	}
	cancelResponse := readResponse(t, outputReader)
	if cancelResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE {
		t.Fatalf("cancel response = %v", cancelResponse.Kind)
	}
	streamEnd := readResponse(t, outputReader)
	if streamEnd.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED || streamEnd.Sequence != 2 {
		t.Fatalf("stream end = %#v", streamEnd)
	}
	_ = inputWriter.Close()
	_ = outputReader.Close()
	serveDone.Wait()
	if serveError != nil {
		t.Fatalf("serve error = %v", serveError)
	}
	if !bytes.Equal(observedConfig, make([]byte, len(config))) {
		t.Fatal("helper did not clear the talosconfig bytes after cancellation")
	}
	if bytes.Contains(outputCapture.bytes.Bytes(), config) {
		t.Fatal("helper output contained the private talosconfig bytes")
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

type fakeProbeSession struct{}

func (fakeProbeSession) ReadVersion(context.Context) (string, error) {
	return "v1.14.1", nil
}

func (fakeProbeSession) WatchMachineStatus(ctx context.Context, emit func(talosprobe.Status) error) error {
	if err := emit(talosprobe.Status{Stage: "running", Ready: true}); err != nil {
		return err
	}
	if err := emit(talosprobe.Status{Stage: "rebooting"}); err != nil {
		return err
	}
	<-ctx.Done()
	return ctx.Err()
}

func (fakeProbeSession) Close() error { return nil }

func writeRequest(writer io.Writer, request *protocolv1.Envelope) error {
	encoded, err := proto.Marshal(request)
	if err != nil {
		return err
	}
	return protocol.WriteFrame(writer, encoded)
}

func readResponse(t *testing.T, reader io.Reader) *protocolv1.Envelope {
	t.Helper()
	frame, err := protocol.ReadFrame(reader)
	if err != nil {
		t.Fatal(err)
	}
	response := new(protocolv1.Envelope)
	if err := proto.Unmarshal(frame, response); err != nil {
		t.Fatal(err)
	}
	return response
}

type recordingWriter struct {
	next  io.Writer
	bytes bytes.Buffer
}

func (writer *recordingWriter) Write(data []byte) (int, error) {
	writer.bytes.Write(data)
	return writer.next.Write(data)
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

// slowProbeSession spends part of the startup budget in ReadVersion and then
// never produces a MachineStatus snapshot.
type slowProbeSession struct {
	versionDelay time.Duration
}

func (session slowProbeSession) ReadVersion(ctx context.Context) (string, error) {
	select {
	case <-time.After(session.versionDelay):
		return "v1.14.1", nil
	case <-ctx.Done():
		return "", ctx.Err()
	}
}

func (slowProbeSession) WatchMachineStatus(ctx context.Context, _ func(talosprobe.Status) error) error {
	<-ctx.Done()
	return ctx.Err()
}

func (slowProbeSession) Close() error { return nil }

func startSlowProbe(t *testing.T, deadline time.Duration, versionDelay time.Duration) (
	inputWriter *io.PipeWriter, outputReader *io.PipeReader, serveDone *sync.WaitGroup,
) {
	t.Helper()
	inputReader, inputWriter := io.Pipe()
	outputReader, outputWriter := io.Pipe()
	serveDone = &sync.WaitGroup{}
	serveDone.Add(1)
	go func() {
		defer serveDone.Done()
		defer func() { _ = outputWriter.Close() }()
		_ = serveWithProbe(inputReader, outputWriter, func(context.Context, []byte, []string, string) (probeSession, error) {
			return slowProbeSession{versionDelay: versionDelay}, nil
		}, deadline)
	}()
	if err := writeRequest(inputWriter, handshake("handshake", buildIdentity)); err != nil {
		t.Fatal(err)
	}
	if response := readResponse(t, outputReader); response.Kind != protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_RESPONSE {
		t.Fatalf("handshake response = %v", response.Kind)
	}
	probeRequest := &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_REQUEST,
		RequestId:     "probe-1",
		Payload: &protocolv1.Envelope_TalosProbeRequest{TalosProbeRequest: &protocolv1.TalosProbeRequest{
			TalosConfig: []byte("synthetic"), Endpoints: []string{"10.79.0.2"}, Node: "10.79.0.2",
		}},
	}
	if err := writeRequest(inputWriter, probeRequest); err != nil {
		t.Fatal(err)
	}
	return inputWriter, outputReader, serveDone
}

func TestProbeStartupSharesOneDeadlineBetweenVersionAndFirstStatus(t *testing.T) {
	const deadline = 200 * time.Millisecond
	inputWriter, outputReader, serveDone := startSlowProbe(t, deadline, 120*time.Millisecond)
	started := time.Now()
	response := readResponse(t, outputReader)
	elapsed := time.Since(started)
	if response.GetError().GetCode() != "talos_probe_timeout" {
		t.Fatalf("response = %v, want talos_probe_timeout", response)
	}
	// Separate budgets would answer after about 120 ms + 200 ms.
	if elapsed > deadline+60*time.Millisecond {
		t.Fatalf("timeout arrived after %v, want one shared %v budget", elapsed, deadline)
	}
	_ = inputWriter.Close()
	serveDone.Wait()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected extra frame of %d bytes after the timeout", len(extra))
	}
}

func TestProbeCancelledDuringFirstStatusSendsNoTimeoutFrame(t *testing.T) {
	inputWriter, outputReader, serveDone := startSlowProbe(t, time.Hour, 0)
	cancel := &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST,
		RequestId:     "cancel-1",
		Payload: &protocolv1.Envelope_TalosCancelRequest{TalosCancelRequest: &protocolv1.TalosCancelRequest{
			SubscriptionRequestId: "probe-1",
		}},
	}
	if err := writeRequest(inputWriter, cancel); err != nil {
		t.Fatal(err)
	}
	if response := readResponse(t, outputReader); response.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE {
		t.Fatalf("cancel response = %v", response.Kind)
	}
	_ = inputWriter.Close()
	serveDone.Wait()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected frame after cancellation (%d bytes)", len(extra))
	}
}
