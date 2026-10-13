# 0015 — Kubernetes watch recovery and acknowledged delivery

- **Status:** accepted; F4 is qualified on Linux, with Kubernetes 1.35/1.37 and other platform qualification tracked separately.
- **Date:** 2026-10-13.
- **Context:** Kubernetes Pod lists need a live continuation without moving cluster credentials or API clients into the renderer. Lists can expire, consumers can stall, and a Pod name can be reused after deletion. The F4 packet caps watch count, queues, batches, object size, recovery, and cancellation.

## Decision

Use the pinned `kube` runtime watcher's list-watch recovery and its `Init`,
`InitApply`, `InitDone`, `Apply`, and `Delete` events. The Rust adapter owns the
watch task, session client, cancellation signal, bounded queue, and cleanup
join under the Kubernetes credential session. It builds replacement
generations in a staging map and only publishes after `InitDone`. Pod maps are
keyed by UID, and the resource version remains opaque.

Expose a Tauri command that creates a session-owned subscription, a channel
command that forwards ordered DTO events, an exact-sequence acknowledgement
command, and a stop command. The renderer validates identity, generation,
sequence, and payload bounds before applying an event, then acknowledges only
after its state transition completes. One event can be outstanding per
subscription; a five-second timeout terminates delivery. Queue and batch
limits, transient retry delays, relist deadlines, and the no-update relist
budget are defined in [application IPC](../protocol/application-ipc.md) and
the F4 plan packet.

## Alternatives

- Reimplement resource-version handling and 410 recovery: rejected because
  kube's supported watcher already owns Kubernetes list-watch semantics.
- Poll repeated lists: rejected because polling can miss intermediate changes
  and does not provide the planned event flow-control contract.
- Treat successful Tauri channel send as consumption: rejected because it does
  not prove the renderer applied the event. Explicit acknowledgement bounds
  outstanding renderer work.

## Consequences

The backend retains the complete current and staged projections within a
session-wide projection budget, while per-subscription queues are independently
bounded. Slow consumers stop and resynchronize instead of accumulating events.
Old visible data is marked stale while a replacement generation is assembled.
The channel and acknowledgement contract is more involved than fire-and-forget
delivery, but it exposes consumer failure and has an explicit cleanup owner.

The renderer registry coalesces identical query keys into one native
subscription, keeps one bounded complete snapshot cache by reference, and
releases that subscription only after its final owner leaves. It assigns an
internal sequence per renderer owner while checking the shared IPC source
sequence before fanout; those internal events do not cross IPC.

The watch transport uses a Tower service deadline through response headers and
a streaming body wrapper that caps each watch line before the kube decoder
receives it. It bounds input chunks to 64 KiB while preserving the server's
quiet-stream lifetime. These limits are verified with deterministic synthetic
tests and recorded with per-case cleanup observations in the
[F4 resource-baseline matrix](../verification/kubernetes-watch-resource-baseline.md).

## Verification

Rust synthetic tests cover initial snapshots, 410 relists, exhausted retry and
relist budgets, UID updates/deletion, cancellation, admission, exact
acknowledgement validation, bounded response headers, quiet response bodies,
and pre-decode event size rejection. Renderer tests cover shared consumer
ownership, late snapshot replay, source sequence gaps, and namespace
replacement. The native WebKitGTK suite exercises ordered channel delivery,
closed-consumer timeout, session close, and active-watch shutdown cleanup
through Tauri IPC. The live Kubernetes 1.36 interruption and resumed-UID case
is recorded separately in the [foundation ledger](../plans/foundation-finish/ledger.md).
F4 acceptance evidence is complete on Linux; the 1.35/1.37 version matrix
remains in F5.
