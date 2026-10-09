package talosprobe

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/siderolabs/talos/pkg/machinery/resources/runtime"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func TestOpenRejectsAndClearsInvalidConfiguration(t *testing.T) {
	config := []byte("synthetic-private-config")
	if _, err := Open(context.Background(), config, []string{"10.79.0.2"}, "10.79.0.2"); err == nil {
		t.Fatal("invalid config must be rejected")
	}
	if !reflect.DeepEqual(config, make([]byte, len(config))) {
		t.Fatal("config buffer must be cleared on failure")
	}
}

func TestOpenRejectsEveryTargetOutsideTheNodeContract(t *testing.T) {
	for _, node := range []string{"", "node.internal", "0.0.0.0", "::", "10.79.0.2:bad"} {
		config := []byte("synthetic-private-config")
		if _, err := Open(context.Background(), config, []string{"10.79.0.2"}, node); err == nil {
			t.Fatalf("invalid node target accepted: %q", node)
		}
		if !reflect.DeepEqual(config, make([]byte, len(config))) {
			t.Fatalf("config buffer must be cleared for rejected node %q", node)
		}
	}
}

func TestEndpointValidationRequiresBoundedUniqueIPIdentities(t *testing.T) {
	valid := []string{"10.79.0.2", "[2001:db8::2]:50000"}
	if err := validateEndpoints(valid); err != nil {
		t.Fatalf("valid endpoint allowlist rejected: %v", err)
	}
	for _, endpoints := range [][]string{
		{},
		{"cluster.example"},
		{"10.79.0.2", "10.79.0.2"},
		{"10.79.0.2:bad"},
		{"10.79.0.2", "10.79.0.3", "10.79.0.4", "10.79.0.5", "10.79.0.6", "10.79.0.7", "10.79.0.8", "10.79.0.9", "10.79.0.10"},
	} {
		if err := validateEndpoints(endpoints); err == nil {
			t.Errorf("invalid endpoint allowlist accepted: %v", endpoints)
		}
	}
}

func TestVersionAndNodeValidation(t *testing.T) {
	for _, node := range []string{"10.79.0.2", "2001:db8::2"} {
		if !validNode(node) {
			t.Errorf("valid node rejected: %q", node)
		}
	}
	for _, node := range []string{"", "node.example", "0.0.0.0", "::"} {
		if validNode(node) {
			t.Errorf("invalid node accepted: %q", node)
		}
	}
}

func TestMachineStatusProjectionOmitsUnmetConditions(t *testing.T) {
	resource := runtime.NewMachineStatus()
	resource.TypedSpec().Stage = runtime.MachineStageRunning
	resource.TypedSpec().Status.Ready = true
	resource.TypedSpec().Status.UnmetConditions = []runtime.UnmetCondition{{
		Name: "private-condition", Reason: "synthetic-sensitive-reason",
	}}

	got := projectStatus(resource)
	want := Status{Stage: "running", Ready: true}
	if got != want {
		t.Fatalf("projection = %#v, want %#v", got, want)
	}
}

func TestFailureClassificationDoesNotExposeRawCauses(t *testing.T) {
	for _, test := range []struct {
		cause error
		want  string
	}{
		{cause: status.Error(codes.PermissionDenied, "synthetic secret denial"), want: "talos_unauthorized"},
		{cause: status.Error(codes.Unavailable, "synthetic endpoint detail"), want: "talos_unavailable"},
		{cause: errors.New("x509: certificate signed by unknown authority"), want: "talos_certificate_invalid"},
	} {
		if got := FailureCode(test.cause); got != test.want {
			t.Errorf("FailureCode() = %q, want %q", got, test.want)
		}
	}
}
