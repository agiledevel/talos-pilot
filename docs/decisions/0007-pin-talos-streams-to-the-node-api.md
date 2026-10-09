# 0007: Pin Talos status streams to the selected node's own API

Date: 2026-10-09. Status: accepted.

## Context

C4 requires one authenticated `Version` read and one bounded `MachineStatus`
stream for exactly one backend-selected node, over the official Talos client.
The first implementation reused the probe's failover connection and added
`client.WithNodes(ctx, node)` to the COSI watch. Against the allowlisted
disposable fixture this failed on every variant, by resource kind and by
resource ID alike:

```text
rpc error: code = InvalidArgument desc = one-2-many proxying is not supported
for method /cosi.resource.State/Watch
```

`client.WithNodes` makes the request a proxied call from an API endpoint to a
target node. Talos supports that for unary reads — the version read through the
same endpoint set worked — but refuses it for `Watch`. The alternative, watching
the kind across the whole endpoint set without node metadata, registers
successfully yet cannot say which node produced a projected event, so it would
let a status from one machine be displayed as another machine's status. That
misattribution is unacceptable in an upgrade-oriented product where the operator
selects a specific machine.

## Decision

The helper probe owns two connections for one subscription:

- a read connection created with the backend-validated API endpoint allowlist,
  on which `Version` is called with `client.WithNodes(ctx, node)`, so the
  authenticated read keeps ordinary endpoint failover;
- a stream connection created with `WithEndpoints(node)` only, on which
  `safe.StateWatchKind` runs with no node metadata, so every projected
  `MachineStatus` provably belongs to the selected node.

`talosprobe.Open(ctx, configBytes, endpoints, node)` establishes both before the
transferred config buffer is cleared, `Session.Close()` closes both, and the
helper protocol is unchanged: one `TALOS_PROBE_REQUEST` still yields one probe
response, one ordered event stream, and one cancellation acknowledgement. A
node outside the literal-IPv4/IPv6 target contract is rejected before either
connection exists, so an unusable target cannot leave a half-open session.

## Consequences

Each active probe holds two authenticated connections, so the existing limits
still bound work explicitly: at most four helper subscriptions and one
application-owned stream. The stream cannot fail over between API endpoints while
its node is selected, which is the correct behaviour — a node's status must come
from that node — and endpoint failover remains available to the read path.
Milestone 2 resource browsing needs the same split per subscription and must
reuse this session shape instead of re-deriving it.

## Verification

`src-tauri/tests/talos_fixture.rs` runs against the disposable fixture and fails
if any of these regress: the control-plane read, the node-pinned stream
projection, session-scoped cancellation acknowledgement, a worker target that is
deliberately not an API endpoint, a read whose leading endpoint is unreachable,
an unrelated certificate authority rejected as
`TALOS_CERTIFICATE_INVALID`, and an unreachable endpoint reported as retryable
`TALOS_UNAVAILABLE`. `pnpm talos:fixture` is the documented harness command and
`helper/internal/talosprobe/client_test.go` keeps the offline contract checks.
See [decision 0006](0006-gtk3-advisory-applicability.md) for the unrelated GTK3
advisory record and [milestone 1 evidence](../verification/milestone-1.md) for
executed results.
