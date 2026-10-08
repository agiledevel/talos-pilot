// Package talosprobe contains the allowlisted, read-only Talos feasibility probe.
package talosprobe

import (
	"context"
	"errors"
	"net"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/cosi-project/runtime/pkg/resource"
	"github.com/cosi-project/runtime/pkg/safe"
	"github.com/cosi-project/runtime/pkg/state"
	"github.com/siderolabs/talos/pkg/machinery/client"
	clientconfig "github.com/siderolabs/talos/pkg/machinery/client/config"
	runtime "github.com/siderolabs/talos/pkg/machinery/resources/runtime"
)

const (
	// MaxConfigBytes bounds the in-memory talosconfig transferred over the helper pipe.
	MaxConfigBytes = 64 * 1024
	// MaxEndpoints limits the backend-provided API failover set.
	MaxEndpoints = 8
	// MaxEvents bounds queued COSI updates while the helper writes to its parent.
	MaxEvents = 16
)

// Status is the bounded projection of Talos MachineStatus. It deliberately
// excludes the source resource, addresses, conditions, and other raw fields.
type Status struct {
	Stage   string
	Ready   bool
	Deleted bool
}

// Session owns one authenticated Talos client and its connection lifecycle.
type Session struct {
	client *client.Client
}

// Open parses an in-memory talosconfig and creates a client restricted to the
// supplied API endpoints. Config bytes are cleared before this function
// returns; the client retains only the credentials it needs for this session.
func Open(ctx context.Context, configBytes []byte, endpoints []string) (*Session, error) {
	defer clear(configBytes)
	if len(configBytes) == 0 || len(configBytes) > MaxConfigBytes {
		return nil, errors.New("Talos configuration size is invalid")
	}
	if err := validateEndpoints(endpoints); err != nil {
		return nil, err
	}

	config, err := clientconfig.FromBytes(configBytes)
	if err != nil {
		return nil, errors.New("Talos configuration is invalid")
	}
	connection, err := client.New(ctx, client.WithConfig(config), client.WithEndpoints(endpoints...))
	if err != nil {
		return nil, errors.New("Talos client could not be initialized")
	}

	return &Session{client: connection}, nil
}

// ReadVersion reads the Talos version from exactly one target node.
func (session *Session) ReadVersion(ctx context.Context, node string) (string, error) {
	if session == nil || session.client == nil {
		return "", errors.New("Talos session is closed")
	}
	if !validNode(node) {
		return "", errors.New("Talos target node is invalid")
	}
	response, err := session.client.Version(client.WithNodes(ctx, node))
	if err != nil || response == nil || len(response.GetMessages()) != 1 {
		return "", errors.New("Talos version read failed")
	}
	message := response.GetMessages()[0]
	if message == nil || message.GetVersion() == nil {
		return "", errors.New("Talos version response is invalid")
	}
	version := message.GetVersion().GetTag()
	if len(version) == 0 || len(version) > 64 || !utf8.ValidString(version) || strings.ContainsAny(version, "\r\n\x00") {
		return "", errors.New("Talos version response is invalid")
	}

	return version, nil
}

// WatchMachineStatus subscribes to the official COSI MachineStatus resource.
// The event queue and projection are bounded, and canceling ctx closes the
// upstream subscription owned by the Talos client.
func (session *Session) WatchMachineStatus(ctx context.Context, node string, emit func(Status) error) error {
	if session == nil || session.client == nil {
		return errors.New("Talos session is closed")
	}
	if !validNode(node) || emit == nil {
		return errors.New("Talos stream request is invalid")
	}
	ctx = client.WithNodes(ctx, node)
	events := make(chan safe.WrappedStateEvent[*runtime.MachineStatus], MaxEvents)
	kind := resource.NewMetadata(runtime.NamespaceName, runtime.MachineStatusType, "", resource.VersionUndefined)
	if err := safe.StateWatchKind[*runtime.MachineStatus](ctx, session.client.COSI, &kind, events, state.WithBootstrapContents(true)); err != nil {
		return errors.New("Talos MachineStatus subscription failed")
	}

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case wrapped, ok := <-events:
			if !ok {
				return nil
			}
			if err := wrapped.Error(); err != nil {
				return errors.New("Talos MachineStatus stream failed")
			}
			if wrapped.Type() == state.Bootstrapped || wrapped.Type() == state.Noop {
				continue
			}
			if wrapped.Type() == state.Destroyed {
				if err := emit(Status{Stage: "unknown", Deleted: true}); err != nil {
					return errors.New("Talos MachineStatus consumer stopped")
				}
				continue
			}
			resource, err := wrapped.Resource()
			if err != nil || resource == nil {
				return errors.New("Talos MachineStatus event is invalid")
			}
			projection := projectStatus(resource)
			if err := emit(projection); err != nil {
				return errors.New("Talos MachineStatus consumer stopped")
			}
		}
	}
}

// Close releases client transports and credentials retained for this session.
func (session *Session) Close() error {
	if session == nil || session.client == nil {
		return nil
	}
	return session.client.Close()
}

func projectStatus(resource *runtime.MachineStatus) Status {
	if resource == nil || resource.TypedSpec() == nil {
		return Status{Stage: "unknown"}
	}
	spec := resource.TypedSpec()
	stage := spec.Stage.String()
	if stage == "" || len(stage) > 32 || !utf8.ValidString(stage) {
		stage = "unknown"
	}

	return Status{Stage: stage, Ready: spec.Status.Ready}
}

func validateEndpoints(endpoints []string) error {
	if len(endpoints) == 0 || len(endpoints) > MaxEndpoints {
		return errors.New("Talos API endpoint list is invalid")
	}
	seen := make(map[string]struct{}, len(endpoints))
	for _, endpoint := range endpoints {
		if !validEndpoint(endpoint) {
			return errors.New("Talos API endpoint is invalid")
		}
		if _, exists := seen[endpoint]; exists {
			return errors.New("Talos API endpoint list contains duplicates")
		}
		seen[endpoint] = struct{}{}
	}

	return nil
}

func validEndpoint(value string) bool {
	if value == "" || len(value) > 253 || strings.TrimSpace(value) != value {
		return false
	}
	if net.ParseIP(value) != nil {
		return true
	}
	if host, port, err := net.SplitHostPort(value); err == nil {
		parsedPort, parseErr := strconv.Atoi(port)
		return net.ParseIP(host) != nil && parseErr == nil && parsedPort > 0 && parsedPort <= 65535
	}

	return false
}

func validNode(value string) bool {
	if net.ParseIP(value) == nil {
		return false
	}
	return value != "0.0.0.0" && value != "::"
}
