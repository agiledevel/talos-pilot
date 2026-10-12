package main

import (
	"bytes"
	"context"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"sync"
	"sync/atomic"
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

func (fakeProbeSession) CheckLiveness(context.Context) error { return nil }

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

func (slowProbeSession) CheckLiveness(context.Context) error { return nil }

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
// The stall window is an hour so the pre-existing tests never trigger a
// liveness check; the stall tests inject their own clock and window.
func testReconnectPolicy() reconnectPolicy {
	return reconnectPolicy{
		backoffs:        [reconnectMaxAttempts - 1]time.Duration{time.Millisecond, 2 * time.Millisecond},
		jitter:          func(duration time.Duration) time.Duration { return duration },
		attemptDeadline: time.Second,
		stallWindow:     time.Hour,
		joinWindow:      5 * time.Second,
		clock:           realClock{},
	}
}

// watchScript describes one WatchMachineStatus invocation of a scriptedSession.
type watchScript struct {
	statuses []talosprobe.Status
	err      error
	// gates, when set, are awaited before the status at the same index is
	// emitted; a nil entry does not wait. Tests use a gate to deliver an event
	// at a controlled moment.
	gates []chan struct{}
	// block keeps the watch open until its context is cancelled, after the
	// scripted statuses have been emitted.
	block bool
	// returned, when set, is closed when this watch invocation returns. Tests
	// use it to prove a watch callback that ignored cancellation eventually
	// ended.
	returned chan struct{}
}

// scriptedSession replays one watchScript per WatchMachineStatus call, counts
// its calls, and answers liveness checks through an optional script, so tests
// can assert the bounded reconnect and that one session - the node and
// credential identity - serves every generation.
type scriptedSession struct {
	mu      sync.Mutex
	watches []watchScript
	// check answers CheckLiveness; a nil check passes. It is called with the
	// check context so it can block until the caller cancels.
	check  func(context.Context) error
	calls  int
	checks int
	opens  int
	closes int
}

func (session *scriptedSession) ReadVersion(context.Context) (string, error) {
	return "v1.14.1", nil
}

func (session *scriptedSession) CheckLiveness(ctx context.Context) error {
	session.mu.Lock()
	session.checks++
	check := session.check
	session.mu.Unlock()
	if check == nil {
		return nil
	}
	return check(ctx)
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
	if watch.returned != nil {
		defer close(watch.returned)
	}
	for index, status := range watch.statuses {
		if index < len(watch.gates) && watch.gates[index] != nil {
			select {
			case <-watch.gates[index]:
			case <-ctx.Done():
				return ctx.Err()
			}
		}
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

func (session *scriptedSession) Close() error {
	session.mu.Lock()
	defer session.mu.Unlock()
	session.closes++
	return nil
}

func (session *scriptedSession) counts() (opens, calls int) {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.opens, session.calls
}

func (session *scriptedSession) checkCount() int {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.checks
}

func (session *scriptedSession) closeCount() int {
	session.mu.Lock()
	defer session.mu.Unlock()
	return session.closes
}

// startScriptedProbe serves the helper with one scriptedSession and returns the
// pipe ends plus the session for assertions.
func startScriptedProbe(
	t *testing.T,
	watches []watchScript,
	reconnect reconnectPolicy,
) (*io.PipeWriter, *io.PipeReader, *sync.WaitGroup, *scriptedSession) {
	t.Helper()
	return startStallProbe(t, &scriptedSession{watches: watches}, reconnect)
}

// startStallProbe serves the helper with a prepared scripted session so tests
// can script liveness checks as well as watches; it returns the pipe ends plus
// the session for assertions.
func startStallProbe(
	t *testing.T,
	session *scriptedSession,
	reconnect reconnectPolicy,
) (*io.PipeWriter, *io.PipeReader, *sync.WaitGroup, *scriptedSession) {
	t.Helper()
	inputWriter, outputReader, serveDone := startProbe(t, time.Hour, func(context.Context, []byte, []string, string) (probeSession, error) {
		session.mu.Lock()
		session.opens++
		session.mu.Unlock()
		return session, nil
	}, reconnect)
	return inputWriter, outputReader, serveDone, session
}

// stallTestPolicy uses the production stall window, attempt deadline, and
// backoffs with an injected deterministic clock and identity jitter, so the
// tests exercise the documented bounds without sleeping.
func stallTestPolicy(clock subscriptionClock) reconnectPolicy {
	policy := defaultReconnectPolicy()
	policy.jitter = func(duration time.Duration) time.Duration { return duration }
	policy.clock = clock
	return policy
}

// requireBoundedCheck asserts the check context carries a positive deadline no
// later than the policy's attempt deadline, proving the 15-second bound instead
// of assuming it. It runs inside the helper's subscription goroutine, so it
// reports with Error rather than Fatal.
func requireBoundedCheck(t *testing.T, ctx context.Context, bound time.Duration) {
	t.Helper()
	deadline, ok := ctx.Deadline()
	if !ok {
		t.Error("liveness check context has no deadline")
		return
	}
	if remaining := time.Until(deadline); remaining <= 0 || remaining > bound {
		t.Errorf("liveness check deadline %v from now is outside (0, %v]", remaining, bound)
	}
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
		stallWindow:     time.Hour,
		joinWindow:      5 * time.Second,
		clock:           realClock{},
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
	if policy.stallWindow != 30*time.Second {
		t.Fatalf("stallWindow = %v, want 30 s (decision 0013)", policy.stallWindow)
	}
	if policy.stallWindow != 2*policy.attemptDeadline {
		t.Fatalf("stallWindow = %v, want twice the %v attempt deadline", policy.stallWindow, policy.attemptDeadline)
	}
	if policy.clock == nil {
		t.Fatal("default policy must carry a clock")
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

// fakeClock is a deterministic subscriptionClock. Tests advance it explicitly
// and wait for its timer counts, so the stall tests never sleep; the bounded
// watchdogs in wait only fail a stuck test.
type fakeClock struct {
	mu      sync.Mutex
	now     time.Time
	pending map[*fakeTimer]struct{}
	created int
	changed chan struct{}
}

func newFakeClock() *fakeClock {
	return &fakeClock{
		now:     time.Unix(0, 0),
		pending: make(map[*fakeTimer]struct{}),
		changed: make(chan struct{}),
	}
}

func (clock *fakeClock) NewTimer(after time.Duration) subscriptionTimer {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	timer := &fakeTimer{clock: clock, after: after, deadline: clock.now.Add(after), ch: make(chan time.Time, 1)}
	clock.pending[timer] = struct{}{}
	clock.created++
	clock.broadcastLocked()
	return timer
}

// Advance moves the clock forward and fires every timer whose deadline is
// reached.
func (clock *fakeClock) Advance(elapsed time.Duration) {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	clock.now = clock.now.Add(elapsed)
	for timer := range clock.pending {
		if !timer.deadline.After(clock.now) {
			delete(clock.pending, timer)
			timer.ch <- clock.now
		}
	}
	clock.broadcastLocked()
}

// wait blocks until ready returns true or a bounded watchdog fails the test.
func (clock *fakeClock) wait(t *testing.T, description string, ready func() bool) {
	t.Helper()
	watchdog := time.After(2 * time.Second)
	for {
		clock.mu.Lock()
		ok := ready()
		changed := clock.changed
		clock.mu.Unlock()
		if ok {
			return
		}
		select {
		case <-changed:
		case <-watchdog:
			t.Fatalf("timed out waiting for %s", description)
		}
	}
}

// waitPendingDuration waits until exactly count timers created with the given
// duration are pending. It distinguishes the backoff waits from the transient
// window timers the loop creates before it consumes an already-ready event.
func (clock *fakeClock) waitPendingDuration(t *testing.T, after time.Duration, count int) {
	t.Helper()
	clock.wait(t, fmt.Sprintf("%d pending %v timers", count, after), func() bool {
		pending := 0
		for timer := range clock.pending {
			if timer.after == after {
				pending++
			}
		}
		return pending == count
	})
}

// waitCreated waits until the clock created count timers in total, which
// detects that the helper replaced a timer after it consumed one.
func (clock *fakeClock) waitCreated(t *testing.T, count int) {
	t.Helper()
	clock.wait(t, fmt.Sprintf("%d created timers", count), func() bool { return clock.created == count })
}

func (clock *fakeClock) pendingCount() int {
	clock.mu.Lock()
	defer clock.mu.Unlock()
	return len(clock.pending)
}

func (clock *fakeClock) broadcastLocked() {
	close(clock.changed)
	clock.changed = make(chan struct{})
}

type fakeTimer struct {
	clock    *fakeClock
	after    time.Duration
	deadline time.Time
	ch       chan time.Time
}

func (timer *fakeTimer) C() <-chan time.Time { return timer.ch }

func (timer *fakeTimer) Stop() {
	clock := timer.clock
	clock.mu.Lock()
	defer clock.mu.Unlock()
	if _, pending := clock.pending[timer]; pending {
		delete(clock.pending, timer)
		clock.broadcastLocked()
	}
}

func cancelRequest(requestID string) *protocolv1.Envelope {
	return &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST,
		RequestId:     requestID,
		Payload: &protocolv1.Envelope_TalosCancelRequest{TalosCancelRequest: &protocolv1.TalosCancelRequest{
			SubscriptionRequestId: "probe-1",
		}},
	}
}

// expectCancelledStream asserts the two terminal frames of a cancelled stream
// whose last data sequence is wantSequence.
func expectCancelledStream(t *testing.T, outputReader *io.PipeReader, wantSequence uint64) {
	t.Helper()
	for remaining := 2; remaining > 0; remaining-- {
		switch frame := readResponse(t, outputReader); frame.Kind {
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE:
			if frame.RequestId != "cancel-1" {
				t.Fatalf("cancel reply = %#v", frame)
			}
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED:
			endFrameCode(t, frame)
			if frame.Sequence != wantSequence {
				t.Fatalf("stream end sequence = %d, want %d", frame.Sequence, wantSequence)
			}
		default:
			t.Fatalf("unexpected frame after cancellation: %#v", frame)
		}
	}
}

// TestStallCheckFailureMarksStaleThenExhaustsTheBudget drives the documented
// stall path: an established silent watch, a failed liveness check at the
// window bound, one stale marker, and then the unchanged three-attempt budget
// ending in terminal talos_unavailable.
func TestStallCheckFailureMarksStaleThenExhaustsTheBudget(t *testing.T) {
	clock := newFakeClock()
	unavailable := status.Error(codes.Unavailable, "connection refused")
	session := &scriptedSession{
		watches: []watchScript{
			{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true},
			{err: unavailable},
			{err: unavailable},
			{err: unavailable},
		},
		check: func(ctx context.Context) error {
			requireBoundedCheck(t, ctx, reconnectAttemptDeadline)
			return status.Error(codes.DeadlineExceeded, "liveness read timed out")
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	clock.waitCreated(t, 1)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow)

	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE || stale.Sequence != 0 {
		t.Fatalf("stale marker = %#v, want sequence 0", stale)
	}
	// Attempt one starts immediately; the next attempts wait their backoffs.
	clock.waitPendingDuration(t, 500*time.Millisecond, 1)
	clock.Advance(500 * time.Millisecond)
	clock.waitPendingDuration(t, time.Second, 1)
	clock.Advance(time.Second)

	terminal := readResponse(t, outputReader)
	if terminal.Kind != protocolv1.MessageKind_MESSAGE_KIND_ERROR ||
		terminal.GetError().GetCode() != "talos_unavailable" ||
		!terminal.GetError().GetRetryable() {
		t.Fatalf("terminal frame = %#v, want retryable talos_unavailable", terminal)
	}
	opens, calls := session.counts()
	if opens != 1 || calls != 4 {
		t.Fatalf("session opens = %d, watch calls = %d; want one session and four watches (bootstrap plus three attempts)", opens, calls)
	}
	if checks := session.checkCount(); checks != 1 {
		t.Fatalf("liveness checks = %d, want exactly one", checks)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame after exhaustion: %d bytes", len(extra))
	}
	serveDone.Wait()
}

// TestStallCheckPassingKeepsAnIdleStreamCurrent proves silence alone is not a
// stall: passing checks keep the projection current across several windows.
func TestStallCheckPassingKeepsAnIdleStreamCurrent(t *testing.T) {
	clock := newFakeClock()
	var active atomic.Int32
	session := &scriptedSession{
		watches: []watchScript{{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true}},
		check: func(ctx context.Context) error {
			requireBoundedCheck(t, ctx, reconnectAttemptDeadline)
			if active.Add(1) != 1 {
				t.Error("more than one liveness check ran at once")
			}
			defer active.Add(-1)
			return nil
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	const windows = 3
	for window := 1; window <= windows; window++ {
		clock.waitCreated(t, window)
		clock.waitPendingDuration(t, stallDetectionWindow, 1)
		clock.Advance(stallDetectionWindow)
		// The next window only exists after the check passed and the loop
		// continued.
		clock.waitCreated(t, window+1)
		if checks := session.checkCount(); checks != window {
			t.Fatalf("after window %d, liveness checks = %d", window, checks)
		}
	}

	if err := writeRequest(inputWriter, cancelRequest("cancel-1")); err != nil {
		t.Fatal(err)
	}
	expectCancelledStream(t, outputReader, 1)
	opens, calls := session.counts()
	if opens != 1 || calls != 1 {
		t.Fatalf("session opens = %d, watch calls = %d; the stream must stay on its one generation", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame on a current stream: %d bytes", len(extra))
	}
	serveDone.Wait()
	if pending := clock.pendingCount(); pending != 0 {
		t.Fatalf("pending timers after the stream ended = %d, want 0", pending)
	}
}

// TestStallCheckClearingRecoversUnderTheNextGeneration clears a stall through
// the existing budget: the check-driven stale marker is followed by an
// immediate first attempt whose replacement snapshot advances the generation.
func TestStallCheckClearingRecoversUnderTheNextGeneration(t *testing.T) {
	clock := newFakeClock()
	session := &scriptedSession{
		watches: []watchScript{
			{statuses: []talosprobe.Status{{Stage: "running", Ready: true}, {Stage: "rebooting"}}, block: true},
			{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true},
		},
		check: func(context.Context) error {
			return status.Error(codes.DeadlineExceeded, "liveness read timed out")
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	event := readResponse(t, outputReader)
	if event.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT ||
		event.Sequence != 1 || event.GetTalosStatusEvent().GetGeneration() != 1 ||
		event.GetTalosStatusEvent().GetSnapshot() {
		t.Fatalf("first event = %#v", event)
	}
	// The event's activity reset the window, so a second window timer exists.
	clock.waitCreated(t, 2)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow)

	stale := readResponse(t, outputReader)
	if stale.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE || stale.Sequence != 1 {
		t.Fatalf("stale marker = %#v, want the sequence of the last delivered event", stale)
	}
	snapshot := readResponse(t, outputReader)
	if snapshot.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT ||
		snapshot.Sequence != 2 || snapshot.GetTalosStatusEvent().GetGeneration() != 2 ||
		!snapshot.GetTalosStatusEvent().GetSnapshot() {
		t.Fatalf("replacement snapshot = %#v", snapshot)
	}
	if checks := session.checkCount(); checks != 1 {
		t.Fatalf("liveness checks = %d, want exactly one", checks)
	}

	if err := writeRequest(inputWriter, cancelRequest("cancel-1")); err != nil {
		t.Fatal(err)
	}
	expectCancelledStream(t, outputReader, 3)
	opens, calls := session.counts()
	if opens != 1 || calls != 2 {
		t.Fatalf("session opens = %d, watch calls = %d; want one recovery attempt", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

// TestStallCheckWindowRestartsAfterADeliveredEvent proves the window measures
// silence from the last delivered projection: an event halfway through the
// window postpones the check past the original deadline.
func TestStallCheckWindowRestartsAfterADeliveredEvent(t *testing.T) {
	clock := newFakeClock()
	gate := make(chan struct{})
	started := make(chan struct{}, 1)
	session := &scriptedSession{
		watches: []watchScript{{
			statuses: []talosprobe.Status{{Stage: "running", Ready: true}, {Stage: "rebooting"}},
			gates:    []chan struct{}{nil, gate},
			block:    true,
		}},
		check: func(context.Context) error {
			started <- struct{}{}
			return nil
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	clock.waitCreated(t, 1)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow / 2)

	// Deliver an event halfway through the window; its activity resets the
	// window, which must now end a full window after the event.
	close(gate)
	event := readResponse(t, outputReader)
	if event.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT || event.Sequence != 1 {
		t.Fatalf("mid-window event = %#v", event)
	}
	clock.waitCreated(t, 2)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)

	// Past the original deadline the old timer must be gone; the restarted
	// window is not due yet.
	clock.Advance(stallDetectionWindow/2 + time.Nanosecond)
	select {
	case <-started:
		t.Fatal("liveness check ran before the restarted window elapsed")
	default:
	}
	if checks := session.checkCount(); checks != 0 {
		t.Fatalf("liveness checks = %d before the restarted window, want 0", checks)
	}

	clock.Advance(stallDetectionWindow/2 - time.Nanosecond)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness check did not run after the restarted window")
	}

	if err := writeRequest(inputWriter, cancelRequest("cancel-1")); err != nil {
		t.Fatal(err)
	}
	expectCancelledStream(t, outputReader, 2)
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

// TestStallCheckCancellationEndsPromptly cancels while a liveness check is in
// flight: the check must end with the subscription, cleanly and without
// starting a reconnect attempt.
func TestStallCheckCancellationEndsPromptly(t *testing.T) {
	clock := newFakeClock()
	started := make(chan struct{}, 1)
	session := &scriptedSession{
		watches: []watchScript{{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true}},
		check: func(ctx context.Context) error {
			started <- struct{}{}
			<-ctx.Done()
			return ctx.Err()
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	clock.waitCreated(t, 1)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness check did not start")
	}

	if err := writeRequest(inputWriter, cancelRequest("cancel-1")); err != nil {
		t.Fatal(err)
	}
	cancelledStreamEnd(t, outputReader)
	opens, calls := session.counts()
	if opens != 1 || calls != 1 {
		t.Fatalf("session opens = %d, watch calls = %d; cancellation must not start an attempt", opens, calls)
	}
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
	if pending := clock.pendingCount(); pending != 0 {
		t.Fatalf("pending timers after the stream ended = %d, want 0", pending)
	}
}

// TestStallCheckPermissionAndTLSFailuresAreTerminal proves a check that fails
// with a permission or TLS class is stale-marked and then terminal without any
// retry, exactly like the same watch-failure classes.
func TestStallCheckPermissionAndTLSFailuresAreTerminal(t *testing.T) {
	for _, test := range []struct {
		name     string
		checkErr error
		code     string
	}{
		{
			name:     "permission",
			checkErr: status.Error(codes.PermissionDenied, "not authorized"),
			code:     "talos_unauthorized",
		},
		{
			name:     "tls",
			checkErr: errors.New("x509: certificate signed by unknown authority"),
			code:     "talos_certificate_invalid",
		},
	} {
		t.Run(test.name, func(t *testing.T) {
			clock := newFakeClock()
			checkErr := test.checkErr
			session := &scriptedSession{
				watches: []watchScript{{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true}},
				check:   func(context.Context) error { return checkErr },
			}
			inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

			probeResponse := readResponse(t, outputReader)
			if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
				t.Fatalf("probe response = %#v", probeResponse)
			}
			clock.waitCreated(t, 1)
			clock.waitPendingDuration(t, stallDetectionWindow, 1)
			clock.Advance(stallDetectionWindow)

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
			if checks := session.checkCount(); checks != 1 {
				t.Fatalf("liveness checks = %d, want exactly one", checks)
			}
			_ = inputWriter.Close()
			if extra, err := protocol.ReadFrame(outputReader); err == nil {
				t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
			}
			serveDone.Wait()
		})
	}
}

// TestStallCheckExitWithACheckInFlightLeavesNothingBehind closes the helper's
// input while a liveness check is in flight: the subscription must end, join
// the check and watch, close the session, and leave no timer pending.
func TestStallCheckExitWithACheckInFlightLeavesNothingBehind(t *testing.T) {
	clock := newFakeClock()
	started := make(chan struct{}, 1)
	finished := make(chan struct{})
	session := &scriptedSession{
		watches: []watchScript{{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true}},
		check: func(ctx context.Context) error {
			defer close(finished)
			started <- struct{}{}
			<-ctx.Done()
			return ctx.Err()
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	clock.waitCreated(t, 1)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness check did not start")
	}

	// Close the output first so the helper's terminal frame fails fast, then
	// end the helper with EOF while the check is still in flight.
	_ = outputReader.Close()
	_ = inputWriter.Close()
	serveDone.Wait()
	select {
	case <-finished:
	case <-time.After(2 * time.Second):
		t.Fatal("the in-flight check was not joined")
	}
	if checks := session.checkCount(); checks != 1 {
		t.Fatalf("liveness checks = %d, want exactly one", checks)
	}
	if closes := session.closeCount(); closes != 1 {
		t.Fatalf("session closes = %d, want exactly one", closes)
	}
	if pending := clock.pendingCount(); pending != 0 {
		t.Fatalf("pending timers after the helper exited = %d, want 0", pending)
	}
}

// TestStallCheckWindowTriggersExactlyAtItsBound freezes an idle established
// watch and advances the injected clock to one nanosecond before the window
// and then exactly onto it.
func TestStallCheckWindowTriggersExactlyAtItsBound(t *testing.T) {
	clock := newFakeClock()
	started := make(chan struct{}, 1)
	session := &scriptedSession{
		watches: []watchScript{{statuses: []talosprobe.Status{{Stage: "running", Ready: true}}, block: true}},
		check: func(context.Context) error {
			started <- struct{}{}
			return nil
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	clock.waitCreated(t, 1)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow - time.Nanosecond)
	select {
	case <-started:
		t.Fatal("liveness check ran before the detection window elapsed")
	default:
	}
	if checks := session.checkCount(); checks != 0 {
		t.Fatalf("liveness checks = %d before the window bound, want 0", checks)
	}

	clock.Advance(time.Nanosecond)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness check did not run at the detection window bound")
	}

	if err := writeRequest(inputWriter, cancelRequest("cancel-1")); err != nil {
		t.Fatal(err)
	}
	expectCancelledStream(t, outputReader, 1)
	_ = inputWriter.Close()
	if extra, err := protocol.ReadFrame(outputReader); err == nil {
		t.Fatalf("unexpected trailing frame: %d bytes", len(extra))
	}
	serveDone.Wait()
}

// TestStallCheckUnjoinedWatchEndsWithoutReconnecting drives the case where the
// failed watch cannot be stopped inside the join window because its callback is
// blocked on an undrained output pipe: the helper must emit no stale marker and
// start no second watch, and the callback must end once the pipe is closed.
func TestStallCheckUnjoinedWatchEndsWithoutReconnecting(t *testing.T) {
	clock := newFakeClock()
	started := make(chan struct{}, 1)
	returned := make(chan struct{})
	session := &scriptedSession{
		watches: []watchScript{{
			statuses: []talosprobe.Status{{Stage: "running", Ready: true}, {Stage: "rebooting"}},
			block:    true,
			returned: returned,
		}},
		check: func(context.Context) error {
			started <- struct{}{}
			return status.Error(codes.DeadlineExceeded, "liveness read timed out")
		},
	}
	inputWriter, outputReader, serveDone, _ := startStallProbe(t, session, stallTestPolicy(clock))

	probeResponse := readResponse(t, outputReader)
	if probeResponse.Kind != protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE {
		t.Fatalf("probe response = %#v", probeResponse)
	}
	// The second status is written into the undrained pipe, so its delivery
	// blocks the watch callback after signalling activity.
	clock.waitCreated(t, 2)
	clock.waitPendingDuration(t, stallDetectionWindow, 1)
	clock.Advance(stallDetectionWindow)
	select {
	case <-started:
	case <-time.After(2 * time.Second):
		t.Fatal("liveness check did not start")
	}

	clock.waitPendingDuration(t, streamJoinWindow, 1)
	clock.Advance(streamJoinWindow)

	// The stream must end without a stale marker or an attempt. Closing the
	// output releases the blocked write, which is the only way to prove the
	// callback ends and nothing was attempted.
	_ = outputReader.Close()
	select {
	case <-returned:
	case <-time.After(2 * time.Second):
		t.Fatal("the blocked watch callback did not end after the pipe closed")
	}
	_ = inputWriter.Close()
	serveDone.Wait()
	if opens, calls := session.counts(); opens != 1 || calls != 1 {
		t.Fatalf("session opens = %d, watch calls = %d; an unjoined watch must not reconnect", opens, calls)
	}
	if checks := session.checkCount(); checks != 1 {
		t.Fatalf("liveness checks = %d, want exactly one", checks)
	}
	if closes := session.closeCount(); closes != 1 {
		t.Fatalf("session closes = %d, want exactly one", closes)
	}
	if pending := clock.pendingCount(); pending != 0 {
		t.Fatalf("pending timers after the stream ended = %d, want 0", pending)
	}
}
