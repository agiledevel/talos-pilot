// Command talos-pilot-helper serves the private Rust-to-Go protocol over stdio.
package main

import (
	"bufio"
	"errors"
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"google.golang.org/protobuf/proto"
)

const protocolMajor uint32 = 1

var buildIdentity = "development"

func main() {
	if err := serve(os.Stdin, os.Stdout); err != nil {
		_, _ = fmt.Fprintln(os.Stderr, "helper stopped after a protocol or pipe error")
		os.Exit(2)
	}
}

func serve(input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
	writer := bufio.NewWriter(output)
	handshakeComplete := false
	for {
		payload, err := protocol.ReadFrame(reader)
		if errors.Is(err, protocol.ErrCleanEOF) {
			return nil
		}
		if err != nil {
			return err
		}

		request := new(protocolv1.Envelope)
		if err := proto.Unmarshal(payload, request); err != nil {
			return errors.New("helper received malformed protocol message")
		}
		response, shutdown, handshakeAccepted := handle(request, handshakeComplete)
		encoded, err := proto.Marshal(response)
		if err != nil {
			return errors.New("helper could not encode protocol response")
		}
		if err := protocol.WriteFrame(writer, encoded); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
		handshakeComplete = handshakeComplete || handshakeAccepted
		if shutdown {
			return nil
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
				Capabilities:  []string{"status"},
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
				Capabilities:  []string{"status"},
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
			Code:        code,
			SafeMessage: message,
			Retryable:   retryable,
		}},
	}
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
