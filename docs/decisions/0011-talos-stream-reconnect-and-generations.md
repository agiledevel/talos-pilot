# 0011: Reconnect Talos status streams through bounded helper-side generations

Date: 2026-10-11. Status: accepted.

## Context

F1 step 4 requires that an authenticated `MachineStatus` stream which fails
mid-flight becomes stale, reconnects through the official Talos client within
the foundation plan's bounded policy, and delivers a replacement snapshot under
a new generation with the same subscription, node, and credential identity and
a continuous sequence. Permission, TLS, and input failures must never retry;
the 256-event cap counts replacement events and is never raised; old data stays
stale until a valid replacement snapshot arrives.

Three placements were possible for the reconnection:

1. In the Go helper, beside the official Talos client and the session from
   [decision 0007](0007-pin-talos-streams-to-the-node-api.md).
2. In the Rust supervisor, by re-issuing `TALOS_PROBE_REQUEST` after a failure.
3. In the renderer, by restarting the probe command from the view.

## Decision

The helper owns the reconnection. One `TALOS_PROBE_REQUEST` still yields one
subscription, and the subscription's node-pinned session survives the failure:
the helper re-runs `WatchMachineStatus` on the same session, so node and
credential identity cannot change and the wire contract stays one stream. The
wire gains three additive facts:

- `TalosProbeResponse.generation` is always 1;
- `TalosStatusEvent` carries `generation` and `snapshot`, and a replacement
  snapshot is the only frame allowed to advance the generation;
- `TalosStreamStale` marks the invalidated projection without consuming a
  sequence value.

The retry policy is exactly the foundation plan's section 4 policy: at most
three reconnect attempts in total per subscription, waits of 0.5 s and 1 s
before attempts two and three with at most ±20% jitter, and a 15-second
deadline per attempt covering watch re-establishment and the replacement
snapshot. The first attempt starts immediately after the interruption.
Permission, TLS, and input failure classes are terminal immediately; an
exhausted budget ends the subscription with terminal `talos_unavailable`.
Rust validates the generation/sequence invariants strictly and forwards
bounded DTOs with the same identities; the renderer keeps the retained values
marked stale until a replacement snapshot arrives.

## Alternatives considered

- **Rust-orchestrated resync** would have required a new request kind that
  re-targets one subscription, duplicating session ownership across processes
  and re-deriving the 0007 session shape in the parent. Rejected.
- **Renderer restart** would create a new subscription and reset the sequence,
  lose the stale marking, and put cluster transport policy in the UI. Rejected.
- **Retry in the COSI watch layer** could not preserve the observable stale
  marking or the generation identity, and would hide the policy from the
  protocol contract. Rejected.

## Consequences

The helper protocol's generation/sequence invariants are enforced in one place
(`subscriptionStream` in the helper) and re-validated in the Rust supervisor,
so a confused or malicious frame cannot present old data as current. A long
freeze of the target machine is not detected as a failure (TCP keepalive
defaults are far above the probe's bounds), so staleness follows observed
failures, not silence; stall detection is out of scope for the v1 probe. The
256-event cap now counts replacement snapshots, which slightly shortens the
usable window after a reconnect; the cap is never raised to compensate.
Milestone 2 subscriptions must reuse these generation semantics rather than
re-deriving them.

## Verification

`helper/cmd/talos-pilot-helper/main_test.go` proves the framed reconnect,
exhaustion, no-retry, and cancellation behavior with scripted sessions and an
injected policy; `src-tauri/src/helper/supervisor.rs` tests prove the
order/gap/duplicate/stale-generation rejection and terminal mapping against a
scripted helper fixture; `src/lib/state/talosProbe.test.ts` proves the stale
until replacement snapshot state machine. Live evidence against the
allowlisted disposable fixture is recorded in the
[milestone 1 ledger](../verification/milestone-1.md).
