// Command talos-pilot-helper serves the private Rust-to-Go protocol over stdio.
package main

import (
	"bufio"
	"context"
	"errors"
	"fmt"
	"io"
	"math/rand/v2"
	"os"
	"strings"
	"sync"
	"sync/atomic"
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
	// reconnectMaxAttempts bounds the reconnection of one subscription in
	// total. Reaching it ends the stream with a terminal unavailable outcome;
	// the bound is never raised to lengthen a stream or a test.
	reconnectMaxAttempts = 3
	// reconnectAttemptDeadline bounds one reconnect attempt: re-establishing
	// the node-pinned watch and obtaining its replacement snapshot.
	reconnectAttemptDeadline = 15 * time.Second
	// reconnectMaxJitter scales a backoff by at most ±20%.
	reconnectMaxJitter = 0.2
	// stallDetectionWindow is the silence after which one bounded liveness read
	// runs on the subscription's node-pinned session. It is twice the attempt
	// deadline, so the documented stale bound is 30 s + 15 s = 45 s and the
	// documented terminal bound is about 92 s (decision 0013).
	stallDetectionWindow = 30 * time.Second
	// streamJoinWindow bounds waiting for a failed watch to stop before the
	// stream emits the stale marker or starts another watch. A callback still
	// blocked on an undrained output pipe after the bound cannot be followed
	// by any further frame.
	streamJoinWindow = 5 * time.Second
)

// reconnectBackoffs are the waits before the second and third reconnect
// attempts of one subscription. The first attempt starts immediately after the
// interruption is classified.
var reconnectBackoffs = [reconnectMaxAttempts - 1]time.Duration{
	500 * time.Millisecond,
	time.Second,
}

// reconnectPolicy is the injectable mid-stream policy of one probe
// subscription: the silence window and bounded liveness check of decision 0013
// plus the reconnection backoffs, jitter, and deadlines of decision 0011. Tests
// inject tiny backoffs, an injected clock, and identity jitter while keeping
// the attempt accounting identical to production.
type reconnectPolicy struct {
	backoffs        [reconnectMaxAttempts - 1]time.Duration
	jitter          func(time.Duration) time.Duration
	attemptDeadline time.Duration
	// stallWindow is the silence window after which one liveness check runs on
	// the node-pinned session.
	stallWindow time.Duration
	// joinWindow bounds waiting for a failed watch to stop before the stream
	// emits its next frame or starts another watch.
	joinWindow time.Duration
	// clock owns the subscription's window, join, and backoff waits.
	// Deterministic tests inject a clock they advance explicitly; production
	// uses realClock.
	clock subscriptionClock
}

// defaultReconnectPolicy is the policy documented in docs/protocol/helper-v1.md.
func defaultReconnectPolicy() reconnectPolicy {
	return reconnectPolicy{
		backoffs:        reconnectBackoffs,
		jitter:          jitterDuration,
		attemptDeadline: reconnectAttemptDeadline,
		stallWindow:     stallDetectionWindow,
		joinWindow:      streamJoinWindow,
		clock:           realClock{},
	}
}

// subscriptionClock abstracts the waits of one subscription so deterministic
// tests can advance time explicitly instead of sleeping.
type subscriptionClock interface {
	NewTimer(time.Duration) subscriptionTimer
}

// subscriptionTimer is one wait that must be stopped when abandoned so no
// timer outlives the subscription that created it.
type subscriptionTimer interface {
	C() <-chan time.Time
	Stop()
}

// realClock is the production subscriptionClock.
type realClock struct{}

// NewTimer starts a real timer.
func (realClock) NewTimer(after time.Duration) subscriptionTimer {
	return realTimer{timer: time.NewTimer(after)}
}

type realTimer struct {
	timer *time.Timer
}

func (timer realTimer) C() <-chan time.Time { return timer.timer.C }

// Stop releases the timer whether or not it had fired.
func (timer realTimer) Stop() { timer.timer.Stop() }

// jitterDuration scales one backoff by a factor in [0.8, 1.2], which is the
// documented maximum jitter of ±20%. The randomness quality is irrelevant: the
// jitter only spreads reconnect attempts in time.
func jitterDuration(duration time.Duration) time.Duration {
	factor := 1 - reconnectMaxJitter + rand.Float64()*(2*reconnectMaxJitter)
	return time.Duration(float64(duration) * factor)
}

var buildIdentity = "development"

type probeSession interface {
	ReadVersion(context.Context) (string, error)
	// CheckLiveness performs one bounded liveness read on the session's
	// node-pinned connection (decision 0013).
	CheckLiveness(context.Context) error
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
	}, probeStartDeadline, defaultReconnectPolicy())
}

func serveWithProbe(input io.Reader, output io.Writer, openProbe probeFactory, startupDeadline time.Duration, reconnect reconnectPolicy) error {
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
				go runProbe(streamContext, request, probeRequest, writer, openProbe, startupDeadline, reconnect, &streams, finished)
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
	reconnect reconnectPolicy,
	streams *sync.WaitGroup,
	finished chan<- string,
) {
	defer streams.Done()
	defer func() { finished <- request.RequestId }()
	defer clear(probe.TalosConfig)

	startupContext, cancelStartup := context.WithTimeout(ctx, startupDeadline)
	defer cancelStartup()
	// A probe cancelled during startup is silent. Cancellation is acknowledged
	// on its own request ID (or the helper is stopping), so the error an
	// interrupted step returns is not a probe failure and must not reach the pipe.
	reportStartupFailure := func(err error) {
		if ctx.Err() != nil {
			return
		}
		code := talosprobe.FailureCode(err)
		_ = writer.send(errorResponse(request, code, talosFailureMessage(code), talosFailureRetryable(code)))
	}
	session, err := openProbe(ctx, probe.TalosConfig, probe.Endpoints, probe.Node)
	if err != nil {
		reportStartupFailure(err)
		return
	}
	defer func() { _ = session.Close() }()

	version, err := session.ReadVersion(startupContext)
	if err != nil {
		reportStartupFailure(err)
		return
	}

	stream := &subscriptionStream{
		writer:     writer,
		requestID:  request.RequestId,
		policy:     reconnect,
		generation: 1,
		activity:   make(chan struct{}, 1),
	}
	firstStatus := make(chan talosprobe.Status, 1)
	allowStream := make(chan struct{})
	watchDone := make(chan error, 1)
	watchContext, cancelWatch := context.WithCancel(ctx)
	defer cancelWatch()
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
			return stream.sendEvent(status)
		})
	}()

	var initial talosprobe.Status
	select {
	case initial = <-firstStatus:
	case err = <-watchDone:
		// A cancelled watch can finish before this select observes ctx.Done.
		reportStartupFailure(err)
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
			Generation: stream.generation,
		}},
	}); err != nil {
		return
	}
	close(allowStream)

	stream.run(ctx, session, watchDone, cancelWatch)
}

// subscriptionStream emits the frames of one probe subscription after its
// bootstrap snapshot and owns the bounded mid-stream reconnection.
//
// Wire invariants (docs/protocol/helper-v1.md): the sequence advances by one
// per data frame and stays continuous across generations; a mid-stream failure
// marks the previously delivered projection stale before anything else; only a
// replacement snapshot may advance the generation, and it is the first frame of
// that generation. All bookkeeping lives here so one implementation owns the
// invariants.
type subscriptionStream struct {
	writer     *frameWriter
	requestID  string
	policy     reconnectPolicy
	generation uint64
	sequence   uint64
	staleSent  bool
	attempts   int
	// activity is signalled whenever a data frame is delivered, which resets
	// the stall-detection window (decision 0013). It is buffered so the watch
	// callback never blocks on it.
	activity chan struct{}
}

// noteActivity records that a data frame is being delivered so the stall
// detection measures silence from the last projection; an actively updating
// stream is never probed. A full buffer coalesces the signal, which is enough
// because the window restarts from the newest activity.
func (stream *subscriptionStream) noteActivity() {
	select {
	case stream.activity <- struct{}{}:
	default:
	}
}

// sendEvent projects one MachineStatus update of the current generation.
func (stream *subscriptionStream) sendEvent(status talosprobe.Status) error {
	if stream.sequence == ^uint64(0) {
		return errors.New("Talos status sequence limit reached")
	}
	nextSequence := stream.sequence + 1
	stream.noteActivity()
	if err := stream.writer.send(&protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT,
		RequestId:     stream.requestID,
		Sequence:      nextSequence,
		Payload: &protocolv1.Envelope_TalosStatusEvent{TalosStatusEvent: &protocolv1.TalosStatusEvent{
			Stage: status.Stage, Ready: status.Ready, Deleted: status.Deleted,
			Generation: stream.generation,
		}},
	}); err != nil {
		return err
	}
	stream.sequence = nextSequence
	return nil
}

// sendSnapshot publishes a replacement snapshot as the first frame of the next
// generation and closes the stale marking. The sequence continues unchanged.
func (stream *subscriptionStream) sendSnapshot(status talosprobe.Status, generation uint64) error {
	if stream.sequence == ^uint64(0) {
		return errors.New("Talos status sequence limit reached")
	}
	nextSequence := stream.sequence + 1
	stream.noteActivity()
	if err := stream.writer.send(&protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT,
		RequestId:     stream.requestID,
		Sequence:      nextSequence,
		Payload: &protocolv1.Envelope_TalosStatusEvent{TalosStatusEvent: &protocolv1.TalosStatusEvent{
			Stage: status.Stage, Ready: status.Ready, Deleted: status.Deleted,
			Generation: generation, Snapshot: true,
		}},
	}); err != nil {
		return err
	}
	stream.sequence = nextSequence
	stream.generation = generation
	stream.staleSent = false
	return nil
}

// sendStale marks the projection of the current sequence stale without
// consuming a sequence value.
func (stream *subscriptionStream) sendStale() error {
	return stream.writer.send(&protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_STALE,
		RequestId:     stream.requestID,
		Sequence:      stream.sequence,
		Payload:       &protocolv1.Envelope_TalosStreamStale{TalosStreamStale: &protocolv1.TalosStreamStale{}},
	})
}

func (stream *subscriptionStream) sendEnd(code string) error {
	return stream.writer.send(&protocolv1.Envelope{
		ProtocolMajor: protocolMajor,
		Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
		RequestId:     stream.requestID,
		Sequence:      stream.sequence + 1,
		Payload:       &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{Code: code}},
	})
}

func (stream *subscriptionStream) sendFailure(code string) error {
	return stream.writer.send(errorResponse(
		&protocolv1.Envelope{RequestId: stream.requestID},
		code, talosFailureMessage(code), talosFailureRetryable(code),
	))
}

// run streams the subscription's watch generations until the stream ends.
//
// The first generation's watch is already running when run is called. Silence
// beyond the policy's stall window triggers one bounded liveness check on the
// node-pinned session; a failed check is an interruption exactly like a failed
// watch (decision 0013). An interruption marks the projection stale; a
// retryable failure then re-establishes the node-pinned watch through the same
// session, at most reconnectMaxAttempts times in total, waiting the bounded
// jittered backoff before attempts two and three and bounding each attempt by
// the policy deadline. A permission, TLS, or input failure never retries, and
// an exhausted budget ends the subscription with a terminal unavailable
// outcome. The old projection stays stale until a replacement snapshot arrives.
func (stream *subscriptionStream) run(
	ctx context.Context,
	session probeSession,
	done chan error,
	cancelWatch context.CancelFunc,
) {
	defer cancelWatch()
	for {
		var watchErr error
		window := stream.policy.clock.NewTimer(stream.policy.stallWindow)
		select {
		case watchErr = <-done:
			window.Stop()
		case <-stream.activity:
			// A delivered projection proves liveness by itself; measure the
			// next silence window from it.
			window.Stop()
			continue
		case <-window.C():
			checkErr := stream.check(ctx, session)
			if ctx.Err() != nil {
				// The parent cancelled while the check was in flight; the
				// cancelled check has already returned.
				stream.finishCancelled(done, cancelWatch)
				return
			}
			if checkErr == nil {
				// The node answered on the pinned connection, so the silence
				// was legitimate and the projection stays current.
				continue
			}
			// The node stopped responding. Stop the watch before the stale
			// marker so no callback can emit a data frame after it. A real
			// watch failure that crossed the check is the better diagnosis.
			joinedErr, joined := stream.joinWatch(done, cancelWatch)
			if !joined {
				// The watch callback is still blocked on an undrained output
				// pipe, so emitting a frame or starting another watch could
				// corrupt the sequence. Mirror the cancellation join-timeout
				// disposition and end without a terminal frame; the parent's
				// own cancellation or exit bound handles a pipe it stopped
				// draining.
				return
			}
			watchErr = checkErr
			if !errors.Is(joinedErr, context.Canceled) {
				// The watch ended by itself or failed on its own while the
				// check ran; that outcome takes precedence over the cancelled
				// check and keeps the established dispositions.
				watchErr = joinedErr
			}
		case <-ctx.Done():
			window.Stop()
			stream.finishCancelled(done, cancelWatch)
			return
		}
		cancelWatch()

		if watchErr == nil {
			_ = stream.sendEnd("stream_complete")
			return
		}
		if ctx.Err() != nil {
			// The parent cancelled while the watch was ending; this preserves
			// the terminal/cancel race dispositions of the original stream.
			if !errors.Is(watchErr, context.Canceled) {
				_ = stream.sendFailure(talosprobe.FailureCode(watchErr))
				return
			}
			_ = stream.sendEnd("stream_complete")
			return
		}

		// A failed watch or liveness check with the parent alive is either a
		// mid-stream failure or a failed reconnect attempt. Either way the
		// projection is stale until a valid replacement snapshot arrives.
		if !stream.staleSent {
			if err := stream.sendStale(); err != nil {
				return
			}
			stream.staleSent = true
		}
		code := talosprobe.FailureCode(watchErr)
		if errors.Is(watchErr, context.Canceled) {
			// Only the attempt deadline cancels a watch while the parent is
			// alive, so the attempt failed as a retryable timeout.
			code = "talos_unavailable"
		}
		if !talosFailureRetryable(code) {
			_ = stream.sendFailure(code)
			return
		}
		if stream.attempts >= reconnectMaxAttempts {
			_ = stream.sendFailure("talos_unavailable")
			return
		}
		if stream.attempts > 0 {
			delay := stream.policy.jitter(stream.policy.backoffs[stream.attempts-1])
			backoff := stream.policy.clock.NewTimer(delay)
			select {
			case <-ctx.Done():
				backoff.Stop()
				_ = stream.sendEnd("cancelled")
				return
			case <-backoff.C():
				backoff.Stop()
			}
		}
		stream.attempts++

		// Reconnect through the official Talos client on the same node-pinned
		// session, preserving node and credential identity (decision 0007).
		done, cancelWatch = stream.attemptWatch(ctx, session, stream.generation+1)
	}
}

// check performs one bounded liveness read on the subscription's node-pinned
// session (decision 0013). It runs in the subscription's single loop, so at
// most one check is ever in flight. The check context carries the policy's
// attempt deadline, and cancelling the subscription cancels the call, which
// then returns promptly. It returns nil when the node answered and the
// classified failure otherwise.
func (stream *subscriptionStream) check(ctx context.Context, session probeSession) error {
	checkContext, cancelCheck := context.WithTimeout(ctx, stream.policy.attemptDeadline)
	defer cancelCheck()

	return session.CheckLiveness(checkContext)
}

// finishCancelled ends a stream whose parent was cancelled. It stops the
// current watch inside the policy's join window and reports a real watch
// failure that crossed the cancellation; otherwise it sends the clean terminal
// frame, and only after the watch ended, so no callback can emit a frame after
// it.
func (stream *subscriptionStream) finishCancelled(done chan error, cancelWatch context.CancelFunc) {
	err, joined := stream.joinWatch(done, cancelWatch)
	if !joined {
		return
	}
	if err != nil && !errors.Is(err, context.Canceled) {
		_ = stream.sendFailure(talosprobe.FailureCode(err))
		return
	}
	_ = stream.sendEnd("cancelled")
}

// joinWatch cancels the current watch and waits up to the policy's join window
// for its goroutine to end. It reports the watch outcome and whether the watch
// ended inside the bound. A timed-out join means the watch callback is still
// blocked on an undrained output pipe, so the caller must not emit any further
// frame or start another watch; the parent's own cancellation or exit bound
// handles a pipe it stopped draining.
func (stream *subscriptionStream) joinWatch(done chan error, cancelWatch context.CancelFunc) (error, bool) {
	cancelWatch()
	join := stream.policy.clock.NewTimer(stream.policy.joinWindow)
	defer join.Stop()
	select {
	case err := <-done:
		return err, true
	case <-join.C():
		return nil, false
	}
}

// attemptWatch starts one reconnect attempt: a fresh node-pinned MachineStatus
// watch whose replacement snapshot advances to the given generation. The
// attempt deadline covers re-establishing the watch and obtaining that
// snapshot; it never cuts the lifetime of an established watch.
func (stream *subscriptionStream) attemptWatch(
	ctx context.Context,
	session probeSession,
	generation uint64,
) (chan error, context.CancelFunc) {
	attemptContext, cancelAttempt := context.WithCancel(ctx)
	done := make(chan error, 1)
	established := &atomic.Bool{}
	timer := time.AfterFunc(stream.policy.attemptDeadline, func() {
		if !established.Load() {
			cancelAttempt()
		}
	})
	go func() {
		first := true
		watchErr := session.WatchMachineStatus(attemptContext, func(status talosprobe.Status) error {
			if first {
				first = false
				if err := stream.sendSnapshot(status, generation); err != nil {
					return err
				}
				established.Store(true)
				return nil
			}
			return stream.sendEvent(status)
		})
		timer.Stop()
		done <- watchErr
	}()
	return done, cancelAttempt
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
