# 0015 — Kubernetes watch recovery and acknowledged delivery

- **Status:** accepted for implementation; F4 qualification remains in progress.
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
- Share an identical-query producer across consumers: planned by F4 but not yet
  implemented. Current subscriptions have one consumer each, and the ledger
  keeps this requirement open.

## Consequences

The backend retains the complete current and staged projections within a
session-wide projection budget, while per-subscription queues are independently
bounded. Slow consumers stop and resynchronize instead of accumulating events.
Old visible data is marked stale while a replacement generation is assembled.
The channel and acknowledgement contract is more involved than fire-and-forget
delivery, but it exposes consumer failure and has an explicit cleanup owner.

The 2 MiB Pod limit is checked after kube has decoded each object; it does not
constrain the SDK's transient decode allocation. The long-lived HTTP client has
no read timeout. Connect and write timeouts are bounded, but a strict 15-second
watch response-establishment deadline still needs a transport implementation
that preserves indefinite quiet streams. Both are recorded limitations pending
F4 closure.

## Verification

Rust synthetic tests cover initial snapshots, 410 relists, exhausted retry and
relist budgets, UID updates/deletion, cancellation, admission, and exact
acknowledgement validation. The native WebKitGTK suite exercises ordered
channel delivery and session-close cleanup through Tauri IPC. Those checks do
not establish the live Kubernetes 1.36 interruption case, multi-consumer
deduplication, or the remaining transport and resource-baseline acceptance
cases; see the [foundation ledger](../plans/foundation-finish/ledger.md).
