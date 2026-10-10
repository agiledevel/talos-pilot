// Command talos-pilot-helper serves the private Rust-to-Go protocol over stdio.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"github.com/agiledevel/talos-pilot/helper/internal/talosprobe"
	"google.golang.org/protobuf/proto"
)

const (
	protocolMajor    uint32 = 1
	maxSubscriptions        = 4
	// probeStartDeadline bounds the whole probe startup: the Talos version read
	// and the first MachineStatus snapshot share it. It must stay strictly
	// shorter than the parent's TALOS_PROBE_STARTUP_DEADLINE (15 s, in
	// src-tauri/src/helper/service.rs) so the helper answers with a classified
	// timeout before the parent gives up and restarts it.
	probeStartDeadline = 12 * time.Second
)

var buildIdentity = "development"

type probeSession interface {
	ReadVersion(context.Context) (string, error)
	WatchMachineStatus(context.Context, func(talosprobe.Status) error) error
	Close() error
}

type probeFactory func(context.Context, []byte, []string, string) (probeSession, error)

type inbound struct {
	message *protocolv1.Envelope
	err     error
}

type frameWriter struct {
	mu     sync.Mutex
	output io.Writer
}

func main() {
	if err := serve(os.Stdin, os.Stdout); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "helper stopped after a protocol or pipe error")
		os.Exit(2)
	}
}

func serve(input io.Reader, output io.Writer) error {
	return serveWithProbe(input, output, func(ctx context.Context, config []byte, endpoints []string, node string) (probeSession, error) {
		return talosprobe.Open(ctx, config, endpoints, node)
	}, probeStartDeadline)
}

func serveWithProbe(input io.Reader, output io.Writer, openProbe probeFactory, startupDeadline time.Duration) error {
	writer := &frameWriter{output: output}
	incoming := make(chan inbound, 1)
	stopReader := make(chan struct{})
	go readMessages(input, incoming, stopReader)

	active := make(map[string]context.CancelFunc, maxSubscriptions)
	finished := make(chan string, maxSubscriptions)
	var streams sync.WaitGroup
	handshakeComplete := false

	stopStreams := func() {
		for _, cancel := range active {
			cancel()
		}
		streams.Wait()
	}
	defer close(stopReader)
	defer stopStreams()

	for {
		select {
		case result, ok := <-incoming:
			if !ok {
				stopStreams()
				return nil
			}
			if result.err != nil {
				stopStreams()
				if errors.Is(result.err, protocol.ErrCleanEOF) {
					return nil
				}
				return result.err
			}
			request := result.message
			if request == nil || request.ProtocolMajor != protocolMajor || !validRequestID(request.RequestId) {
				clearTalosConfig(request)
				if err := writer.send(errorResponse(request, "invalid_request", "The helper request is invalid.", false)); err != nil {
					return err
				}
				continue
			}
			var probeRequest *protocolv1.TalosProbeRequest
			if request.Kind == protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_REQUEST {
				if payload, ok := request.Payload.(*protocolv1.Envelope_TalosProbeRequest); ok && payload.TalosProbeRequest != nil {
					owned := &protocolv1.TalosProbeRequest{
						TalosConfig: payload.TalosProbeRequest.TalosConfig,
						Endpoints:   payload.TalosProbeRequest.Endpoints,
						Node:        payload.TalosProbeRequest.Node,
					}
					payload.TalosProbeRequest.TalosConfig = nil
					probeRequest = owned
				} else {
					clearTalosConfig(request)
				}
			} else {
				clearTalosConfig(request)
			}

			switch request.Kind {
			case protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_REQUEST:
				if !handshakeComplete {
					if probeRequest != nil {
						clear(probeRequest.TalosConfig)
					}
					if err := writer.send(errorResponse(request, "handshake_required", "The helper handshake must succeed before Talos probes.", false)); err != nil {
						return err
					}
					continue
				}
				if len(active) >= maxSubscriptions || active[request.RequestId] != nil {
					if probeRequest != nil {
						clear(probeRequest.TalosConfig)
					}
					if err := writer.send(errorResponse(request, "subscription_limit", "The Talos probe limit has been reached.", true)); err != nil {
						return err
					}
					continue
				}
				if probeRequest == nil {
					if err := writer.send(errorResponse(request, "invalid_message", "The Talos probe request is invalid.", false)); err != nil {
						return err
					}
					continue
				}
				streamContext, cancel := context.WithCancel(context.Background())
				active[request.RequestId] = cancel
				streams.Add(1)
				go runProbe(streamContext, request, probeRequest, writer, openProbe, startupDeadline, &streams, finished)
			case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST:
				payload, ok := request.Payload.(*protocolv1.Envelope_TalosCancelRequest)
				if !handshakeComplete || !ok || payload.TalosCancelRequest == nil || !validRequestID(payload.TalosCancelRequest.SubscriptionRequestId) {
					if err := writer.send(errorResponse(request, "invalid_cancel", "The Talos cancellation request is invalid.", false)); err != nil {
						return err
					}
					continue
				}
				cancel, exists := active[payload.TalosCancelRequest.SubscriptionRequestId]
				if !exists {
					if err := writer.send(errorResponse(request, "unknown_subscription", "The Talos subscription is no longer active.", false)); err != nil {
						return err
					}
					continue
				}
				if err := writer.send(&protocolv1.Envelope{
					ProtocolMajor: protocolMajor,
					Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE,
					RequestId:     request.RequestId,
					Payload:       &protocolv1.Envelope_TalosCancelResponse{TalosCancelResponse: &protocolv1.TalosCancelResponse{}},
				}); err != nil {
					return err
				}
				cancel()
			case protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_REQUEST,
				protocolv1.MessageKind_MESSAGE_KIND_STATUS_REQUEST,
				protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_REQUEST:
				response, shutdown, accepted := handle(request, handshakeComplete)
				if shutdown {
					stopStreams()
				}
				if err := writer.send(response); err != nil {
					return err
				}
				handshakeComplete = handshakeComplete || accepted
				if shutdown {
					return nil
				}
			default:
				if err := writer.send(errorResponse(request, "unsupported_message", "The helper message is not supported.", false)); err != nil {
					return err
				}
			}
		case requestID := <-finished:
			if cancel, exists := active[requestID]; exists {
				cancel()
				delete(active, requestID)
			}
		}
	}
}

func readMessages(input io.Reader, incoming chan<- inbound, stop <-chan struct{}) {
	reader := bufio.NewReader(input)
	for {
		payload, err := protocol.ReadFrame(reader)
		if err != nil {
			select {
			case incoming <- inbound{err: err}:
			case <-stop:
			}
			return
		}
		request := new(protocolv1.Envelope)
		decodeErr := proto.Unmarshal(payload, request)
		clear(payload)
		if decodeErr != nil {
			select {
			case incoming <- inbound{err: errors.New("helper received malformed protocol message")}:
			case <-stop:
			}
			return
		}
		select {
		case incoming <- inbound{message: request}:
		case <-stop:
			return
		}
	}
}

func (writer *frameWriter) send(response *protocolv1.Envelope) error {
	encoded, err := proto.Marshal(response)
	if err != nil {
		return errors.New("helper could not encode protocol response")
	}
	writer.mu.Lock()
	defer writer.mu.Unlock()
	if err := protocol.WriteFrame(writer.output, encoded); err != nil {
		return err
	}
	return nil
}

func runProbe(
	ctx context.Context,
	request *protocolv1.Envelope,
	probe *protocolv1.TalosProbeRequest,
	writer *frameWriter,
	openProbe probeFactory,
	startupDeadline time.Duration,
	streams *sync.WaitGroup,
	finished chan<- string,
) {
	defer streams.Done()
	defer func() { finished <- request.RequestId }()
	defer clear(probe.TalosConfig)

	startupContext, cancelStartup := context.WithTimeout(ctx, startupDeadline)
	defer cancelStartup()
	session, err := openProbe(ctx, probe.TalosConfig, probe.Endpoints, probe.Node)
	if err != nil {
		code := talosprobe.FailureCode(err)
		_ = writer.send(errorResponse(request, code, talosFailureMessage(code), talosFailureRetryable(code)))
		return
	}
	defer func() { _ = session.Close() }()

	version, err := session.ReadVersion(startupContext)
	if err != nil {
		code := talosprobe.FailureCode(err)
		_ = writer.send(errorResponse(request, code, talosFailureMessage(code), talosFailureRetryable(code)))
		return
	}

	firstStatus := make(chan talosprobe.Status, 1)
	allowStream := make(chan struct{})
	watchDone := make(chan error, 1)
	watchContext, cancelWatch := context.WithCancel(ctx)
	defer cancelWatch()
	var sequence uint64
	go func() {
		first := true
		watchDone <- session.WatchMachineStatus(watchContext, func(status talosprobe.Status) error {
			if first {
				first = false
				firstStatus <- status
				select {
				case <-allowStream:
					return nil
				case <-watchContext.Done():
					return watchContext.Err()
				}
			}
			if sequence == ^uint64(0) {
				return errors.New("Talos status sequence limit reached")
			}
			nextSequence := sequence + 1
			if err := writer.send(&protocolv1.Envelope{
				ProtocolMajor: protocolMajor,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT,
				RequestId:     request.RequestId,
				Sequence:      nextSequence,
				Payload: &protocolv1.Envelope_TalosStatusEvent{TalosStatusEvent: &protocolv1.TalosStatusEvent{
					Stage: status.Stage, Ready: status.Ready, Deleted: status.Deleted,
				}},
			}); err != nil {
				return err
			}
			sequence = nextSequence
			return nil
		})
	}()

	var initial talosprobe.Status
	select {
	case initial = <-firstStatus:
	case err = <-watchDone:
		code := talosprobe.FailureCode(err)
		_ = writer.send(errorResponse(request, code, talosFailureMessage(code), talosFailureRetryable(code)))
		return
	case <-startupContext.Done():
		cancelWatch()
		select {
		case <-watchDone:
		case <-time.After(5 * time.Second):
		}
		// The startup context derives from ctx; a cancelled probe sends nothing.
		if ctx.Err() != nil {
			return
		}
		_ = writer.send(errorResponse(request, "talos_probe_timeout", "The Talos probe exceeded its startup deadline.", true))
		return
	case <-ctx.Done():
		cancelWatch()
		select {
		case <-watchDone:
		case <-time.After(5 * time.Second):
		}
		return
	}

	if err := writer.send(&protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE,
		RequestId:     request.RequestId,
		Payload: &protocolv1.Envelope_TalosProbeResponse{TalosProbeResponse: &protocolv1.TalosProbeResponse{
			Version: version, Stage: initial.Stage, Ready: initial.Ready,
		}},
	}); err != nil {
		return
	}
	close(allowStream)

	select {
	case err := <-watchDone:
		if err != nil && !errors.Is(err, context.Canceled) {
			code := talosprobe.FailureCode(err)
			_ = writer.send(errorResponse(request, code, talosFailureMessage(code), talosFailureRetryable(code)))
			return
		}
		_ = writer.send(&protocolv1.Envelope{
			ProtocolMajor: protocolMajor,
			Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
			RequestId:     request.RequestId,
			Sequence:      sequence + 1,
			Payload: &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{
				Code: "stream_complete",
			}},
		})
	case <-ctx.Done():
		select {
		case err := <-watchDone:
			code := "cancelled"
			if err != nil && !errors.Is(err, context.Canceled) {
				failureCode := talosprobe.FailureCode(err)
				_ = writer.send(errorResponse(request, failureCode, talosFailureMessage(failureCode), talosFailureRetryable(failureCode)))
				return
			}
			_ = writer.send(&protocolv1.Envelope{
				ProtocolMajor: protocolMajor,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
				RequestId:     request.RequestId,
				Sequence:      sequence + 1,
				Payload: &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{
					Code: code,
				}},
			})
		case <-time.After(5 * time.Second):
		}
	}
}

func handle(request *protocolv1.Envelope, handshakeComplete bool) (*protocolv1.Envelope, bool, bool) {
	if request == nil || request.ProtocolMajor != protocolMajor || !validRequestID(request.RequestId) {
		return errorResponse(request, "invalid_request", "The helper request is invalid.", false), false, false
	}
	switch request.Kind {
	case protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_REQUEST:
		payload, ok := request.Payload.(*protocolv1.Envelope_HandshakeRequest)
		if !ok || payload.HandshakeRequest == nil || payload.HandshakeRequest.ProtocolMajor != protocolMajor {
			return errorResponse(request, "invalid_handshake", "The helper handshake is invalid.", false), false, false
		}
		if payload.HandshakeRequest.ExpectedBuildIdentity != buildIdentity {
			return errorResponse(request, "build_mismatch", "The packaged helper build does not match this application.", false), false, false
		}
		return &protocolv1.Envelope{
			ProtocolMajor: protocolMajor,
			Kind:          protocolv1.MessageKind_MESSAGE_KIND_HANDSHAKE_RESPONSE,
			RequestId:     request.RequestId,
			Payload: &protocolv1.Envelope_HandshakeResponse{HandshakeResponse: &protocolv1.HandshakeResponse{
				ProtocolMajor: protocolMajor,
				BuildIdentity: buildIdentity,
				Capabilities:  []string{"status", "talos_probe"},
			}},
		}, false, true
	case protocolv1.MessageKind_MESSAGE_KIND_STATUS_REQUEST:
		if !handshakeComplete {
			return errorResponse(request, "handshake_required", "The helper handshake must succeed before status requests.", false), false, false
		}
		if _, ok := request.Payload.(*protocolv1.Envelope_StatusRequest); !ok {
			return errorResponse(request, "invalid_message", "The helper status request is invalid.", false), false, false
		}
		return &protocolv1.Envelope{
			ProtocolMajor: protocolMajor,
			Kind:          protocolv1.MessageKind_MESSAGE_KIND_STATUS_RESPONSE,
			RequestId:     request.RequestId,
			Payload: &protocolv1.Envelope_StatusResponse{StatusResponse: &protocolv1.StatusResponse{
				BuildIdentity: buildIdentity,
				Capabilities:  []string{"status", "talos_probe"},
			}},
		}, false, false
	case protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_REQUEST:
		if !handshakeComplete {
			return errorResponse(request, "handshake_required", "The helper handshake must succeed before shutdown.", false), false, false
		}
		if _, ok := request.Payload.(*protocolv1.Envelope_ShutdownRequest); !ok {
			return errorResponse(request, "invalid_message", "The helper shutdown request is invalid.", false), false, false
		}
		return &protocolv1.Envelope{
			ProtocolMajor: protocolMajor,
			Kind:          protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_RESPONSE,
			RequestId:     request.RequestId,
			Payload:       &protocolv1.Envelope_ShutdownResponse{ShutdownResponse: &protocolv1.ShutdownResponse{}},
		}, true, false
	default:
		return errorResponse(request, "unsupported_message", "The helper message is not supported.", false), false, false
	}
}

func errorResponse(request *protocolv1.Envelope, code, message string, retryable bool) *protocolv1.Envelope {
	requestID := "invalid"
	if request != nil && validRequestID(request.RequestId) {
		requestID = request.RequestId
	}
	return &protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_ERROR,
		RequestId:     requestID,
		Payload: &protocolv1.Envelope_Error{Error: &protocolv1.ProtocolError{
			Code: code, SafeMessage: message, Retryable: retryable,
		}},
	}
}

func clearTalosConfig(request *protocolv1.Envelope) {
	if request == nil {
		return
	}
	if payload, ok := request.Payload.(*protocolv1.Envelope_TalosProbeRequest); ok && payload.TalosProbeRequest != nil {
		clear(payload.TalosProbeRequest.TalosConfig)
		payload.TalosProbeRequest.TalosConfig = nil
	}
}

func talosFailureMessage(code string) string {
	switch code {
	case "talos_config_invalid":
		return "The Talos client configuration is invalid."
	case "talos_invalid_target":
		return "The Talos node target is invalid."
	case "talos_unauthorized":
		return "Talos rejected the configured permissions."
	case "talos_certificate_invalid":
		return "Talos TLS verification failed."
	case "talos_unavailable":
		return "The selected Talos endpoint or node is unavailable."
	default:
		return "The authenticated Talos read probe failed."
	}
}

func talosFailureRetryable(code string) bool {
	return code == "talos_unavailable" || code == "talos_probe_failed"
}

func validRequestID(value string) bool {
	if value == "" || len(value) > 128 {
		return false
	}
	return strings.IndexFunc(value, func(character rune) bool {
		return !(character >= 'a' && character <= 'z' ||
			character >= 'A' && character <= 'Z' ||
			character >= '0' && character <= '9' || character == '-' || character == '_')
	}) == -1
}
