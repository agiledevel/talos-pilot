package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"github.com/agiledevel/talos-pilot/helper/internal/talosprobe"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/proto"
)

func TestServeHandshakeStatusAndShutdown(t *testing.T) {
	input := encodeRequests(t,
		handshake("request-1", buildIdentity),
		statusRequest("request-2"),
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
		}, probeStartDeadline, testReconnectPolicy())
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
	input := encodeRequests(t, statusRequest("request-1"))
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

	wrongPayload := statusRequest("request-2")
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

func statusRequest(requestID string) *protocolv1.Envelope {
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
	return startProbe(t, deadline, func(context.Context, []byte, []string, string) (probeSession, error) {
		return slowProbeSession{versionDelay: versionDelay}, nil
	}, testReconnectPolicy())
}

// startProbe serves the helper over unbuffered pipes, completes the handshake,
// and sends one probe request. The output pipe closes when the helper returns.
func startProbe(t *testing.T, deadline time.Duration, openProbe probeFactory, reconnect reconnectPolicy) (
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
		_ = serveWithProbe(inputReader, outputWriter, openProbe, deadline, reconnect)
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
	// Read before waiting: the output pipe is unbuffered, so an extra frame
	// would otherwise block the helper and hang the test instead of failing it.
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected extra frame of %d bytes after the timeout", len(extra))
	}
	serveDone.Wait()
}

// A cancelled probe context makes whichever startup step is running return its
// own error. None of those errors is a probe failure: the helper answers the
// cancel request and sends nothing for the probe request.
func TestProbeCancelledDuringStartupSendsNoProbeFrame(t *testing.T) {
	session := func(versionDelay time.Duration) probeFactory {
		return func(context.Context, []byte, []string, string) (probeSession, error) {
			return slowProbeSession{versionDelay: versionDelay}, nil
		}
	}
	phases := []struct {
		name      string
		openProbe probeFactory
	}{
		{"open", func(ctx context.Context, _ []byte, _ []string, _ string) (probeSession, error) {
			<-ctx.Done()
			return nil, ctx.Err()
		}},
		{"version read", session(time.Hour)},
		{"first status", session(0)},
	}
	for _, phase := range phases {
		t.Run(phase.name, func(t *testing.T) {
			inputWriter, outputReader, serveDone := startProbe(t, time.Hour, phase.openProbe, testReconnectPolicy())
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
			// Read before waiting: the output pipe is unbuffered, so a stray
			// frame would otherwise block the helper and hang the test.
			if extra, err := protocol.ReadFrame(outputReader); err == nil {
				stray := new(protocolv1.Envelope)
				_ = proto.Unmarshal(extra, stray)
				t.Fatalf("unexpected frame after cancellation: kind %v, error code %q", stray.Kind, stray.GetError().GetCode())
			}
			serveDone.Wait()
		})
	}
}

// testReconnectPolicy makes reconnection deterministic: no jitter and nearly
// instant backoffs, while the attempt accounting stays identical to production.
func testReconnectPolicy() reconnectPolicy {
	return reconnectPolicy{
		backoffs:        [reconnectMaxAttempts - 1]time.Duration{time.Millisecond, 2 * time.Millisecond},
		jitter:          func(duration time.Duration) time.Duration { return duration },
		attemptDeadline: time.Second,
	}
}

// watchScript describes one WatchMachineStatus invocation of a scriptedSession.
type watchScript struct {
	statuses []talosprobe.Status
	err      error
	// block keeps the watch open until its context is cancelled, after the
	// scripted statuses have been emitted.
	block bool
}

// scriptedSession replays one watchScript per WatchMachineStatus call and
// counts its calls, so tests can assert the bounded reconnect and that one
// session - the node and credential identity - serves every generation.
type scriptedSession struct {
	mu      sync.Mutex
	watches []watchScript
	calls   int
	opens   int
}

func (session *scriptedSession) ReadVersion(context.Context) (string, error) {
	return "v1.14.1", nil
}

func (session *scriptedSession) WatchMachineStatus(ctx context.Context, emit func(talosprobe.Status) error) error {
	session.mu.Lock()
	index := session.calls
	session.calls++
	session.mu.Unlock()
	watch := watchScript{err: errors.New("no scripted watch left")}
	if index < len(session.watches) {
		watch = session.watches[index]
	}
	for _, status := range watch.statuses {
		if err := emit(status); err != nil {
			return err
		}
	}
	if watch.block {
		<-ctx.Done()
		return ctx.Err()
	}
	return watch.err
}

func (session *scriptedSession) Close() error { return nil }

func (session *scriptedSession) counts() (opens, calls int) {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.opens, session.calls
}

// startScriptedProbe serves the helper with one scriptedSession and returns the
// pipe ends plus the session for assertions.
func startScriptedProbe(
	t *testing.T,
	watches []watchScript,
	reconnect reconnectPolicy,
) (*io.PipeWriter, *io.PipeReader, *sync.WaitGroup, *scriptedSession) {
	t.Helper()
	session := &scriptedSession{watches: watches}
	inputWriter, outputReader, serveDone := startProbe(t, time.Hour, func(context.Context, []byte, []string, string) (probeSession, error) {
		session.mu.Lock()
		session.opens++
		session.mu.Unlock()
		return session, nil
	}, reconnect)
	return inputWriter, outputReader, serveDone, session
}

// endFrameCode accepts either clean terminal code: a natural end and a
// cancellation may cross on the pipe, and both are valid clean ends.
func endFrameCode(t *testing.T, frame *protocolv1.Envelope) string {
	t.Helper()
	code := frame.GetTalosStreamEnded().GetCode()
	if code != "cancelled" && code != "stream_complete" {
		t.Fatalf("stream end code = %q, want cancelled or stream_complete", code)
	}
	return code
}

func TestProbeReconnectsUnderANewGenerationWithAContinuousSequence(t *testing.T) {
	inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
		{
			statuses: []talosprobe.Status{{Stage: "running", Ready: true}, {Stage: "rebooting"}},
			err:      status.Error(codes.Unavailable, "connection refused"),
		},
		{
			statuses: []talosprobe.Status{{Stage: "running", Ready: true}},
			block:    true,
		},
	}, testReconnectPolicy())

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE ||
		probeResponse.GetTalosProbeResponse().GetGeneration() != 1 {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	event := readResponse(t, outputReader)
	if event.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT ||
		event.Sequence != 1 || event.GetTalosStatusEvent().GetGeneration() != 1 ||
		event.GetTalosStatusEvent().GetSnapshot() {
		t.Fatalf("first event = %#v", event)
	}
	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE || stale.Sequence != 1 {
		t.Fatalf("stale marker = %#v", stale)
	}
	snapshot := readResponse(t, outputReader)
	if snapshot.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT ||
		snapshot.Sequence != 2 || snapshot.GetTalosStatusEvent().GetGeneration() != 2 ||
		!snapshot.GetTalosStatusEvent().GetSnapshot() {
		t.Fatalf("replacement snapshot = %#v", snapshot)
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
	for remaining := 2; remaining > 0; remaining-- {
		switch frame := readResponse(t, outputReader); frame.Kind {
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE:
			if frame.RequestId != "cancel-1" {
				t.Fatalf("cancel reply = %#v", frame)
			}
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED:
			endFrameCode(t, frame)
			if frame.Sequence != 3 {
				t.Fatalf("stream end sequence = %d, want 3 (continuous)", frame.Sequence)
			}
		default:
			t.Fatalf("unexpected frame after cancellation: %#v", frame)
		}
	}
	opens, calls := session.counts()
	if opens != 1 || calls != 2 {
		t.Fatalf("session opens = %d, watch calls = %d; want one session and two watches", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame of %d bytes", len(extra))
	}
	serveDone.Wait()
}

func TestProbeReconnectBudgetExhaustsAfterThreeAttempts(t *testing.T) {
	unavailable := status.Error(codes.Unavailable, "connection refused")
	inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
		{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, err: unavailable},
		{err: unavailable},
		{err: unavailable},
		{err: unavailable},
	}, testReconnectPolicy())

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE || stale.Sequence != 0 {
		t.Fatalf("stale marker = %#v", stale)
	}
	terminal := readResponse(t, outputReader)
	if terminal.Kind != protocolv1.MessageKind_MESSAGE_KIND_ERROR ||
		terminal.GetError().GetCode() != "talos_unavailable" ||
		!terminal.GetError().GetRetryable() {
		t.Fatalf("terminal frame = %#v", terminal)
	}
	opens, calls := session.counts()
	if opens != 1 || calls != 4 {
		t.Fatalf("session opens = %d, watch calls = %d; want one session and four watches (bootstrap plus three attempts)", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame after exhaustion: %d bytes", len(extra))
	}
	serveDone.Wait()
}

func TestProbeNeverRetriesPermissionAndTLSFailures(t *testing.T) {
	for _, test := range []struct {
		name     string
		watchErr error
		code     string
	}{
		{
			name:     "permission",
			watchErr: status.Error(codes.PermissionDenied, "not authorized"),
			code:     "talos_unauthorized",
		},
		{
			name:     "tls",
			watchErr: errors.New("x509: certificate signed by unknown authority"),
			code:     "talos_certificate_invalid",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
				{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, err: test.watchErr},
			}, testReconnectPolicy())

			probeResponse := readResponse(t, outputReader)
			if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
				t.Fatalf("probe response = %#v", probeResponse)
			}
			stale := readResponse(t, outputReader)
			if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE {
				t.Fatalf("stale marker = %#v", stale)
			}
			terminal := readResponse(t, outputReader)
			if terminal.Kind != protocolv1.MessageKind_MESSAGE_KIND_ERROR ||
				terminal.GetError().GetCode() != test.code ||
				terminal.GetError().GetRetryable() {
				t.Fatalf("terminal frame = %#v, want non-retryable %s", terminal, test.code)
			}
			opens, calls := session.counts()
			if opens != 1 || calls != 1 {
				t.Fatalf("session opens = %d, watch calls = %d; the failure must not retry", opens, calls)
			}
			_ = inputWriter.Close()
			if extra, err := protocol.ReadFrame(outputReader); err == nil {
				t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
			}
			serveDone.Wait()
		})
	}
}

// cancelledStreamEnd asserts the two terminal frames of a cancelled stream and
// that they arrived promptly, well inside the cancellation deadline.
func cancelledStreamEnd(t *testing.T, outputReader *io.PipeReader) {
	t.Helper()
	started := time.Now()
	for remaining := 2; remaining > 0; remaining-- {
		switch frame := readResponse(t, outputReader); frame.Kind {
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE:
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED:
			endFrameCode(t, frame)
		default:
			t.Fatalf("unexpected frame after cancellation: %#v", frame)
		}
	}
	if elapsed := time.Since(started); elapsed > 2*time.Second {
		t.Fatalf("cancellation took %v, want at most the two-second bound", elapsed)
	}
}

func TestProbeCancellationDuringBackoffEndsCleanly(t *testing.T) {
	policy := reconnectPolicy{
		backoffs:        [reconnectMaxAttempts - 1]time.Duration{30 * time.Second, 30 * time.Second},
		jitter:          func(duration time.Duration) time.Duration { return duration },
		attemptDeadline: 30 * time.Second,
	}
	inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
		{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, err: status.Error(codes.Unavailable, "connection refused")},
		// Attempt one starts immediately after the interruption; the 30 s
		// backoff then holds before attempt two.
		{err: status.Error(codes.Unavailable, "connection refused")},
	}, policy)

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE {
		t.Fatalf("stale marker = %#v", stale)
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
	// The 30 s backoff is pending before attempt two: cancellation must
	// interrupt it well inside the two-second bound instead of waiting it out.
	cancelledStreamEnd(t, outputReader)
	opens, calls := session.counts()
	if opens != 1 || calls != 2 {
		t.Fatalf("session opens = %d, watch calls = %d; no attempt may start after cancellation", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

func TestProbeCancellationDuringReconnectAttemptEndsCleanly(t *testing.T) {
	policy := testReconnectPolicy()
	policy.attemptDeadline = 30 * time.Second
	inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
		{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, err: status.Error(codes.Unavailable, "connection refused")},
		{block: true},
	}, policy)

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE {
		t.Fatalf("stale marker = %#v", stale)
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
	// The reconnect attempt is blocked establishing its watch; cancellation
	// must interrupt it instead of waiting for the attempt deadline.
	cancelledStreamEnd(t, outputReader)
	opens, calls := session.counts()
	if opens != 1 || calls != 2 {
		t.Fatalf("session opens = %d, watch calls = %d; want one interrupted attempt", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

func TestProbeAttemptDeadlineRetriesAndEstablishedWatchesSurviveIt(t *testing.T) {
	policy := testReconnectPolicy()
	policy.attemptDeadline = 60 * time.Millisecond
	inputWriter, outputReader, serveDone, session := startScriptedProbe(t, []watchScript{
		{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, err: status.Error(codes.Unavailable, "connection refused")},
		{block: true},
		{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true},
	}, policy)

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE {
		t.Fatalf("stale marker = %#v", stale)
	}
	started := time.Now()
	snapshot := readResponse(t, outputReader)
	elapsed := time.Since(started)
	if snapshot.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT ||
		!snapshot.GetTalosStatusEvent().GetSnapshot() ||
		snapshot.GetTalosStatusEvent().GetGeneration() != 2 {
		t.Fatalf("replacement snapshot = %#v", snapshot)
	}
	if elapsed < 45*time.Millisecond {
		t.Fatalf("replacement snapshot arrived after %v, want the 60 ms attempt deadline to govern", elapsed)
	}

	// The established generation must outlive its own attempt deadline: only a
	// second watch call may exist after three deadlines worth of waiting.
	time.Sleep(200 * time.Millisecond)
	if _, calls := session.counts(); calls != 3 {
		t.Fatalf("watch calls = %d; an established watch must not be cut by the attempt deadline", calls)
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
	cancelledStreamEnd(t, outputReader)
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

func TestReconnectPolicyDefaultsAreBounded(t *testing.T) {
	policy := defaultReconnectPolicy()
	if reconnectMaxAttempts != 3 {
		t.Fatalf("reconnectMaxAttempts = %d, want 3 in total", reconnectMaxAttempts)
	}
	if policy.backoffs != [2]time.Duration{500 * time.Millisecond, time.Second} {
		t.Fatalf("backoffs = %v, want 0.5 s and 1 s", policy.backoffs)
	}
	if policy.attemptDeadline != 15*time.Second {
		t.Fatalf("attemptDeadline = %v, want 15 s", policy.attemptDeadline)
	}
	for range 200 {
		for _, base := range []time.Duration{500 * time.Millisecond, time.Second} {
			jittered := jitterDuration(base)
			if jittered < 4*base/5 || jittered > 6*base/5 {
				t.Fatalf("jitterDuration(%v) = %v, want at most ±20%%", base, jittered)
			}
		}
	}
}
