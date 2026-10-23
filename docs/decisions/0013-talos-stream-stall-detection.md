# 0013: Detect a stalled Talos status stream with a bounded node-pinned liveness read

Date: 2026-10-12. Status: accepted for milestone 1 packet F1a (steps 1–3); the
live fixture row is step 4 and is unexecuted.

Supersedes: the stall-detection consequence of
[0011](0011-talos-stream-reconnect-and-generations.md#consequences) ("stall
detection is out of scope for the v1 probe").

## Context

[0011](0011-talos-stream-reconnect-and-generations.md) reconnects a failed
`MachineStatus` watch through the helper, but a node that freezes, loses power,
or is partitioned without breaking the connection leaves the established watch
silent and its last projection presented as current. The owner decided on
2026-10-12 that this must be detected within a bounded, documented window
([0011 amendment](0011-talos-stream-reconnect-and-generations.md#amendment--2026-10-12-live-evidence-and-owner-decision)).
Packet F1a requires the mechanism to satisfy:

- the check lives in the Go helper, on the subscription's node-pinned session
  from [0007](0007-pin-talos-streams-to-the-node-api.md), and no status request
  is routed through the Rust supervisor (R3 stays deferred);
- a detected stall is an interruption under 0011: one stale marker first, then
  the same three-attempt budget, with no second budget and no change to the
  generation, sequence, or 256-event-cap rules;
- each check obeys the section 4 policy's 15-second attempt deadline, at most
  one check is in flight per subscription, and cancellation during a check ends
  promptly;
- a permission or TLS check failure is terminal and is never retried;
- the official Talos client and its existing APIs are used, with no generic
  resource selector.

A `MachineStatus` watch is change-driven, so silence is not itself a failure:
an idle healthy node normally emits nothing. The mechanism therefore has to
distinguish "quiet" from "not responding" rather than treat silence as staleness.

## What is checked, over which path — primary sources

The helper opens two authenticated connections per probe
(`helper/internal/talosprobe/client.go`): the read connection spans the
backend-supplied endpoint allowlist and the stream connection is created with a
single endpoint, the selected node.

- `client.WithEndpoints(node)` overwrites the config-derived endpoint list
  (`pkg/machinery@v1.14.2/client/options.go`). With one endpoint the client
  builds the gRPC target `dns:///node:50000` (`client/connection.go`,
  `constants.ApidPort`), so the stream connection dials the selected node's own
  apid directly.
- `client.WithNode(s)` only attaches gRPC metadata (`client/context.go`):
  "Request will be proxied by the endpoint to the specified node without any
  further processing." The read path uses `WithNodes(ctx, node)`, so its answer
  comes from an allowlisted endpoint and is proxied to the node.
- Talos v1.14.2 apid routing
  (`internal/app/apid/pkg/director/director.go`): a request without `node` or
  `nodes` metadata is served locally by the connected apid; `nodes` metadata
  permits one-2-many proxying only for `/machine.MachineService/`,
  `/cluster.ClusterService/`, `/inspect.InspectService/`,
  `/storage.StorageService/`, and `/time.TimeService/`, and otherwise fails
  with `one-2-many proxying is not supported for method ...` — the watch
  failure [0007](0007-pin-talos-streams-to-the-node-api.md) recorded.

Two facts reconcile against that split. The worker is not one of the
backend-supplied API endpoints (the fixture manifest's `allowedEndpoints`
excludes it), and the read path reaches it by proxying through a control plane;
a read-path liveness signal would describe the answering control-plane endpoint,
not the node. The stream path is pinned to the node as its sole dial target
(0007), so a liveness signal measured on the stream session does describe the
selected node's API server. The check therefore runs only on the stream
session.

## The official client already retries a broken watch

Added on 2026-10-12 after the handoff review; read from the pinned sources, not
observed on a fixture.

`client.New` builds its COSI client with default adapter options
(`pkg/machinery@v1.14.2/client/client.go`:
`client.NewAdapter(cosiv1alpha1.NewStateClient(c.conn))`). That leaves the
adapter's watch retry enabled
(`cosi-project/runtime@v1.16.3/pkg/state/protobuf/client/client.go`,
`watchAdapter`). Once an event carrying a bookmark has arrived, a receive error
is not reported. The adapter re-establishes the watch from the last bookmark
with the default exponential backoff of `cenkalti/backoff/v4`: 0.5 s initial
interval, 60 s maximum interval, 15 minutes maximum elapsed time. The helper's
watch is given an error only when those retries run out, when the server
rejects the bookmark, or when no bookmark had arrived. The in-memory state the
adapter talks to attaches a bookmark to every event
(`pkg/state/impl/inmem/collection.go`).

Three things follow for this decision:

- From the helper's side a broken connection is also silence, for up to 15
  minutes. The liveness check therefore bounds broken connections as well as
  frozen nodes, and staleness no longer waits for the adapter to give up.
- It is the probable cause of F1 part 3's reboot observation, that the break
  surfaced only once the worker's API was back. A restarted node holds a new
  in-memory state, so rejecting the previous boot's bookmark is the first error
  the helper can be given. This is an inference from the sources.
- A node reboot is now an outage the check sees. Its consequence is recorded
  under Consequences and was accepted by the owner.

## Decision

**Mechanism.** After `stallDetectionWindow` of silence measured from the last
delivered data frame of the current generation, the helper issues exactly one
unary `client.Version` read on the stream session's node-pinned connection
(`session.stream.Version(ctx)`, no node metadata). This is an existing client
API the probe already calls at startup, it is read-only, and it needs no
resource selector. A successful response proves the selected node's API server
is answering on the same connection that carries the watch, and the silence
window restarts. The check runs in the subscription's single run loop, so at
most one check is in flight; it is bounded by the policy's 15-second attempt
deadline through its context; cancelling the subscription cancels the check and
the RPC returns promptly. Any delivered data frame resets the silence window, so
checks run only while the watch is silent.

**A failed check is an interruption under 0011.** The helper stops the watch,
emits one `TALOS_STREAM_STALE` marker repeating the current sequence, and then
spends the existing budget: first attempt immediately, 0.5 s and 1 s jittered
backoffs, 15 seconds per attempt, at most three attempts in total, ending in a
replacement snapshot under the next generation or terminal `talos_unavailable`.
There is no second budget and no change to the generation, sequence, or
256-event-cap rules. Stopping the watch before the stale marker is bounded by a
5-second join window; a callback still blocked on an undrained output pipe
after that window means no frame can be delivered safely, so the helper emits
nothing further and ends, mirroring the existing cancellation join-timeout
disposition and leaving the parent's own cancellation or exit bound to handle a
pipe it stopped draining. A check failing with `talos_unauthorized` or
`talos_certificate_invalid` is terminal and is never retried, exactly like the
same watch-failure classes.

**Why an idle watch is not a stall.** Silence only triggers the bounded liveness
read; staleness follows the read's failure, never the silence. A check that
succeeds leaves the projection current, so an idle healthy stream stays current
across any number of windows.

**Window and derivation.** The window is
`stallDetectionWindow = 30 s`, which is twice the section 4 per-attempt deadline
of 15 s. The bound is documented as:

- stale marker at most 30 s (silence window) + 15 s (check deadline) = **45 s**
  after the last delivered projection, plus at most the 5-second watch stop,
  which elapses only when the parent has stopped draining the pipe (for a
  draining parent the stop is immediate);
- terminal outcome at most 45 s + 3 × 15 s attempts + 0.5 s + 1 s backoffs with
  ≤ 20 % jitter ≈ **92 s** after the last delivered projection, plus at most the
  same conditional 5-second watch stop.

Thirty seconds keeps the detection bound inside the same order as the existing
reconnect budget (≤ 46.5 s) and below one minute, while the check itself gets a
full attempt deadline so a node that is slow but alive is not marked stale by a
single marginal response; a node must be unresponsive for the silence window
plus the check deadline before the stale marker is emitted. The check is one
unary RPC per 30 s of silence, and none while events flow.

## Alternatives considered

- **gRPC keepalive on the stream connection.** A keepalive ping would detect an
  unresponsive transport below the application layer, but its detection bound
  would depend on client keepalive parameters and on the server's enforcement
  policy, which the helper does not own: the pinned grpc-go documentation states
  servers have a default `EnforcementPolicy.MinTime` of 5 minutes and that
  incompatible client/server settings can close the connection. The bounded,
  deterministic framed tests script the session interface, not the gRPC
  transport, so this mechanism could not be exercised at the helper boundary.
  Rejected in favor of an explicit application-level check whose window the
  helper owns and can test.
- **A second `MachineStatus` read (`state.Get` or another watch) on the
  node-pinned connection.** Rejected: heavier, duplicates the same COSI resource
  read, adds its own subscription lifecycle, and proves no more than apid
  responsiveness, which `Version` already establishes with one unary call.
- **TCP keepalive or socket-level tuning.** Rejected: OS defaults are far above
  the bound ([0011](0011-talos-stream-reconnect-and-generations.md) recorded
  this), the pinned client does not expose a bounded per-connection setting, and
  a frozen userspace behind a live kernel still acknowledges at the TCP layer.
- **Probing the read connection or the endpoint allowlist.** Rejected: a
  control-plane endpoint can answer, so the signal says nothing about the
  selected node; that is the exact confusion this decision's path analysis
  removes.
- **Probing from the Rust supervisor.** Excluded by the packet: R3 (helper
  status/probe serialization) stays deferred, and the check belongs on the
  helper's node-pinned session.
- **Disabling the adapter's watch retry.** A second adapter over
  `Client.Conn()` with `WithDisableWatchRetry` would report every break at
  once and send it through the three-attempt budget. Not chosen: it removes the
  bookmark-based resume, which loses no event across a brief break, and it
  replaces the client's own COSI wiring for no gain the check does not already
  give.
- **Holding the stream stale without spending attempts until a check passes.**
  A reboot would then recover instead of ending the subscription. Not chosen by
  the owner on 2026-10-12: it rewrites the retry policy of 0011 and plan
  section 4 and needs a new overall bound.

## Consequences

- No wire-contract change. The check reuses the existing stale marker and
  terminal error frames; no message kind, field, sequence, or generation rule
  changes. Helper protocol v1 and application IPC gain documentation that a
  stale marker can now follow a check-detected stall rather than only an
  observed connection failure.
- Node, credential, and session identity are unchanged: the check rides the
  already authenticated, read-only, node-pinned connection.
- The 0011 consequence that a long freeze is not detected is superseded by this
  decision; 0011 carries a pointer here.
- A detected stall costs the same stale marker and three-attempt budget as any
  other interruption, so recovery and terminal behavior stay uniform.
- **A node reboot now usually ends the subscription. The owner accepted this on
  2026-10-12.** During a reboot the watch is silent, so the check fails once
  the silence window has passed, and the three attempts are then spent while
  the node is still down. The budget lasts under 47 s when every attempt waits
  for its deadline, and far less when attempts fail at once. An outage that
  outlasts the stale bound plus the budget ends in terminal
  `talos_unavailable`, and the view needs an explicit reconnect. F1 part 3's
  live reboot row recovered under generation 2 before this decision; that
  outcome is no longer expected for a reboot of that length. The retry policy
  is unchanged, and a terminal outcome that requires an explicit reconnect
  matches plan section 4's handling of repeated relists.
- Failed checks draw on 0011's budget of three attempts per subscription, which
  is never refilled. A long-lived subscription ends at its third interruption
  of any kind.
- Milestone 2 subscriptions that reuse the probe's generation semantics must
  reuse this check or document their own bounded mechanism.

## Unverified until step 4 (live fixture)

These depend on a real frozen node and are step-4 rows in the milestone ledger.
Part 3's frozen-worker and reboot measurements came from a driver that was
deleted and whose output was not retained; they are not cited here as evidence.

- The frozen worker (QEMU `SIGSTOP`) makes the unary `Version` read wait for its
  15-second deadline rather than fail immediately, and the stale marker arrives
  within the documented 45 s and terminal `talos_unavailable` within ≈ 92 s.
  This specific timing is unverified.
- An idle healthy stream stays current for longer than the window (more than one
  window observed) on the fixture.
- Power-loss and partition produce the same outcome (same mechanism; not
  separately observed).
- Resuming the worker as soon as the stale marker is observed recovers with a
  replacement snapshot under the next generation. The connection is intact, so
  the first attempt is expected to be served inside its deadline.
- A reboot ends according to its measured length: terminal `talos_unavailable`
  when the outage outlasts the stale bound plus the budget, recovery under the
  next generation only when it was shorter. The row records the measured outage
  and asserts the matching outcome; accepting either outcome unconditionally,
  as the F1 harness row does, is not enough.
- The watch-retry reading above: that a broken connection stays silent to the
  helper, and that a rebooted node rejects the earlier bookmark.
- The window threshold on a real node: the deterministic tests prove the timer
  boundary, but the real RPC behavior exactly at the boundary is fixture-only.

## Verification

Deterministic framed tests in `helper/cmd/talos-pilot-helper/main_test.go` with
scripted sessions and an injected clock: silence with failing checks reaches the
stale marker and then budget exhaustion (`talos_unavailable`); silence with
passing checks stays current across several windows with serial, deadline-
bounded checks; a stall that clears recovers under the next generation with a
continuous sequence; cancellation during a check ends promptly and cleanly;
permission and TLS check failures are terminal with no retry; helper exit with
a check in flight leaks no task, timer, or connection; a failed watch that
cannot be stopped inside the join window ends without a stale marker or a
second watch; the silence window triggers exactly at its bound and not one
step before; and the default policy documents the 30-second window and the
5-second join window beside the unchanged 15-second deadline and backoffs.
`talosprobe.Session.CheckLiveness` is the only new real-client path, and its
live behavior is step 4's.
