// Command probehelper is a deterministic private-protocol stream fixture.
package main

import (
	"bufio"
	"errors"
	"io"
	"os"

	"github.com/agiledevel/talos-pilot/helper/internal/protocol"
	protocolv1 "github.com/agiledevel/talos-pilot/helper/internal/protocol/helper/v1"
	"google.golang.org/protobuf/proto"
)

func main() {
	if err := serve(os.Stdin, os.Stdout); err != nil {
		os.Exit(2)
	}
}

func serve(input io.Reader, output io.Writer) error {
	reader := bufio.NewReader(input)
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
			if err := send(output, &protocolv1.Envelope{
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
			clear(probe.TalosConfig)
			if err := send(output, &protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_PROBE_RESPONSE,
				RequestId:     request.RequestId,
				Payload: &protocolv1.Envelope_TalosProbeResponse{TalosProbeResponse: &protocolv1.TalosProbeResponse{
					Version: "v1.14.1", Stage: "running", Ready: true,
				}},
			}); err != nil {
				return err
			}
			if err := send(output, &protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STATUS_EVENT,
				RequestId:     request.RequestId,
				Sequence:      1,
				Payload: &protocolv1.Envelope_TalosStatusEvent{TalosStatusEvent: &protocolv1.TalosStatusEvent{
					Stage: "running", Ready: true,
				}},
			}); err != nil {
				return err
			}
		case protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_REQUEST:
			if err := send(output, &protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_CANCEL_RESPONSE,
				RequestId:     request.RequestId,
				Payload:       &protocolv1.Envelope_TalosCancelResponse{TalosCancelResponse: &protocolv1.TalosCancelResponse{}},
			}); err != nil {
				return err
			}
			if err := send(output, &protocolv1.Envelope{
				ProtocolMajor: 1,
				Kind:          protocolv1.MessageKind_MESSAGE_KIND_TALOS_STREAM_ENDED,
				RequestId:     request.GetTalosCancelRequest().SubscriptionRequestId,
				Sequence:      2,
				Payload:       &protocolv1.Envelope_TalosStreamEnded{TalosStreamEnded: &protocolv1.TalosStreamEnded{Code: "cancelled"}},
			}); err != nil {
				return err
			}
		case protocolv1.MessageKind_MESSAGE_KIND_SHUTDOWN_REQUEST:
			return send(output, &protocolv1.Envelope{
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

func send(writer io.Writer, envelope *protocolv1.Envelope) error {
	data, err := proto.Marshal(envelope)
	if err != nil {
		return err
	}
	return protocol.WriteFrame(writer, data)
}
