// Command probehelper is a deterministic private-protocol stream fixture.
//
// The TalosProbeRequest's configuration bytes are interpreted as a line-based
// frame script instead of credentials, so Rust integration tests can drive
// exact wire sequences through the real framing. Each script line is one
// action:
//
//	event <seq> <generation> <stage> <ready> <snapshot>
//	stale <seq>
//	ended <seq> <code>
//	error <code>
//	delay <milliseconds>
//	wait
//	exit
//
// `wait` blocks until the subscription is cancelled and then ends the stream
// as cancelled; `exit` terminates the process mid-stream. Cancellation is
// answered like the real helper: one cancel reply on the cancel request ID and
// one terminal frame for the subscription. No production code uses this
// fixture, and it never reads real credentials.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"google.golang.org/protobuf/proto"
)

func main() {
	if err := serve(os.Stdin, os.Stdout); err != nil {
		os.Exit(2)
	}
}

type frameWriter struct {
	mu     sync.Mutex
	output io.Writer
}

func (writer *frameWriter) send(envelope *protocolv1.Envelope) error {
	writer.mu.Lock()
	defer writer.mu.Unlock()
	data, err := proto.Marshal(envelope)
	if err != nil {
		return err
	}
	return protocol.WriteFrame(writer.output, data)
}

type action struct {
	kind       string
	sequence   uint64
	generation uint64
	stage      string
	ready      bool
	snapshot   bool
	code       string
	delay      time.Duration
}

type subscription struct {
	cancel     context.CancelFunc
	terminated bool
}

func serve(input io.Reader, output io.Writer) error {
	writer := &frameWriter{output: output}
	reader := bufio.NewReader(input)
	var active *subscription
	var activeMu sync.Mutex
	for {
		frame, err := protocol.ReadFrame(reader)
		if errors.Is(err, protocol.ErrCleanEOF) {
			return nil
		}
		if err != nil {
			return err
		}
		request := new(protocolv1.Envelope)
		if err := proto.Unmarshal(frame, request); err != nil {
			return err
		}
		clear(frame)
		switch request.Kind {
		case protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_REQUEST:
			if err := writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_RESPONSE,
				RequestId:     request.RequestId,
				Payload: &protocolv1.Envelope_HandshakeResponse{HandshakeResponse: &protocolv1.HandshakeResponse{
					ProtocolMajor: 1, BuildIdentity: "development", Capabilities: []string{"status", "talos_probe"},
				}},
			}); err != nil {
				return err
			}
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_REQUEST:
			probe := request.GetTalosProbeRequest()
			if probe == nil {
				return errors.New("probe request payload missing")
			}
			script, err := parseScript(probe.TalosConfig)
			clear(probe.TalosConfig)
			if err != nil {
				return err
			}
			if err := writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE,
				RequestId:     request.RequestId,
				Payload: &protocolv1.Envelope_TalosProbeResponse{TalosProbeResponse: &protocolv1.TalosProbeResponse{
					Version: "v1.14.1", Stage: "running", Ready: true, Generation: 1,
				}},
			}); err != nil {
				return err
			}
			activeMu.Lock()
			streamContext, cancel := context.WithCancel(context.Background())
			active = &subscription{cancel: cancel}
			owned := active
			activeMu.Unlock()
			go func() {
				runScript(streamContext, writer, request.RequestId, script)
				activeMu.Lock()
				owned.terminated = true
				activeMu.Unlock()
			}()
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST:
			activeMu.Lock()
			current := active
			activeMu.Unlock()
			if current == nil {
				if err := writer.send(errorResponse(request, "unknown_subscription", "The Talos subscription is not active.")); err != nil {
					return err
				}
				continue
			}
			current.cancel()
			if err := writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE,
				RequestId:     request.RequestId,
				Payload:       &protocolv1.Envelope_TalosCancelResponse{TalosCancelResponse: &protocolv1.TalosCancelResponse{}},
			}); err != nil {
				return err
			}
		case protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_REQUEST:
			return writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_RESPONSE,
				RequestId:     request.RequestId,
				Payload:       &protocolv1.Envelope_ShutdownResponse{ShutdownResponse: &protocolv1.ShutdownResponse{}},
			})
		default:
			return errors.New("unsupported protocol fixture request")
		}
	}
}

// runScript replays one script and reports whether it sent a terminal frame.
func runScript(ctx context.Context, writer *frameWriter, requestID string, script []action) {
	sequence := uint64(0)
	terminated := false
	defer func() {
		if !terminated {
			_ = writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
				RequestId:     requestID,
				Sequence:      sequence + 1,
				Payload:       &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{Code: "cancelled"}},
			})
		}
	}()
	for _, step := range script {
		select {
		case <-ctx.Done():
			return
		default:
		}
		switch step.kind {
		case "event":
			sequence = step.sequence
			_ = writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT,
				RequestId:     requestID,
				Sequence:      step.sequence,
				Payload: &protocolv1.Envelope_TalosStatusEvent{TalosStatusEvent: &protocolv1.TalosStatusEvent{
					Stage: step.stage, Ready: step.ready, Generation: step.generation, Snapshot: step.snapshot,
				}},
			})
		case "stale":
			sequence = step.sequence
			_ = writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE,
				RequestId:     requestID,
				Sequence:      step.sequence,
				Payload:       &protocolv1.Envelope_TalosStreamStale{TalosStreamStale: &protocolv1.TalosStreamStale{}},
			})
		case "ended":
			_ = writer.send(&protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
				RequestId:     requestID,
				Sequence:      step.sequence,
				Payload: &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{
					Code: step.code,
				}},
			})
			terminated = true
			return
		case "error":
			_ = writer.send(errorResponse(&protocolv1.Envelope{RequestId: requestID}, step.code, "scripted failure"))
			terminated = true
			return
		case "delay":
			select {
			case <-ctx.Done():
				return
			case <-time.After(step.delay):
			}
		case "wait":
			<-ctx.Done()
			return
		case "exit":
			os.Exit(3)
		}
	}
}

func parseScript(source []byte) ([]action, error) {
	var script []action
	for index, line := range strings.Split(string(source), "\n") {
		line = strings.TrimSpace(line)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		fields := strings.Fields(line)
		step := action{kind: fields[0], code: "stream_failed"}
		switch fields[0] {
		case "event":
			if len(fields) != 6 {
				return nil, fmt.Errorf("script line %d: event needs seq generation stage ready snapshot", index+1)
			}
			sequence, err := strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			generation, err := strconv.ParseUint(fields[2], 10, 64)
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			ready, err := strconv.ParseBool(fields[4])
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			snapshot, err := strconv.ParseBool(fields[5])
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			step.sequence, step.generation = sequence, generation
			step.stage, step.ready, step.snapshot = fields[3], ready, snapshot
		case "stale", "ended":
			if len(fields) < 2 {
				return nil, fmt.Errorf("script line %d: %s needs a sequence", index+1, fields[0])
			}
			sequence, err := strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			step.sequence = sequence
			if fields[0] == "ended" {
				if len(fields) != 3 {
					return nil, fmt.Errorf("script line %d: ended needs a code", index+1)
				}
				step.code = fields[2]
			}
		case "error":
			if len(fields) != 2 {
				return nil, fmt.Errorf("script line %d: error needs a code", index+1)
			}
			step.code = fields[1]
		case "delay":
			if len(fields) != 2 {
				return nil, fmt.Errorf("script line %d: delay needs milliseconds", index+1)
			}
			milliseconds, err := strconv.ParseUint(fields[1], 10, 64)
			if err != nil {
				return nil, fmt.Errorf("script line %d: %w", index+1, err)
			}
			step.delay = time.Duration(milliseconds) * time.Millisecond
		case "wait", "exit":
		default:
			return nil, fmt.Errorf("script line %d: unsupported action %q", index+1, fields[0])
		}
		script = append(script, step)
	}
	return script, nil
}

func errorResponse(request *protocolv1.Envelope, code, message string) *protocolv1.Envelope {
	return &protocolv1.Envelope{
		ProtocolMajor: 1,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_ERROR,
		RequestId:     request.RequestId,
		Payload: &protocolv1.Envelope_Error{Error: &protocolv1.ProtocolError{
			Code: code, SafeMessage: message, Retryable: true,
		}},
	}
}
