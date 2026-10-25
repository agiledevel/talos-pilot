# 03 — F4: owned watch, relist, and bounded delivery

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs a fixture session for its live rows; follow the [fixture runbook](fixture-runbook.md).

Plan packet: [F4](../foundation-completion-flash.md#f4--add-owned-watch-relist-and-bounded-delivery). Maps to checkpoint C5.2 and tasks FND-004 and FND-005. Prerequisite: document 02 is `done`.

## Outcome

An active Pod query receives ordered changes, survives a watch expiring by relisting atomically, and releases everything when it is stopped or its owner goes away. Delivery to the renderer is bounded and acknowledged, so a slow or closed consumer cannot grow a buffer without limit.

## Read before you start

| File                                                                                | Why                                                                                             |
| ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| [Plan section 4](../foundation-completion-flash.md#4-contracts-and-resource-limits) | The flow-control and retry contract; it is the authority                                        |
| [Decision 0011](../../decisions/0011-talos-stream-reconnect-and-generations.md)     | The generation and sequence model the Talos stream uses; the Kubernetes watch mirrors its ideas |
| [Application IPC](../../protocol/application-ipc.md)                                | Channels, events, and identities                                                                |
| `src-tauri/src/kubernetes/`                                                         | The adapter and the list from document 02                                                       |
| `src-tauri/src/helper/supervisor.rs`                                                | A worked example of validating generation and sequence on the consuming side                    |
| `src/lib/state/talosProbe.svelte.ts` and its test                                   | A worked example of a stale-until-replacement state machine in the renderer                     |
| The Workloads view and state module from document 02                                | What you extend                                                                                 |
| The Kubernetes fixture harness from document 02                                     | The only way to cause live changes                                                              |

Apply the `talos-pilot-rust`, `talos-pilot-tauri`, `talos-pilot-typescript`, and `talos-pilot-svelte` skills.

## Context

### Terms

- **Generation.** One complete snapshot of the query's objects. A relist produces a new generation. A generation is built completely before it is published; a failed or partial relist never replaces the current one and never marks old data current.
- **Sequence.** A counter on every event of a subscription, sent as a decimal string backed by an unsigned 64-bit integer. Both ends validate it. A gap, a duplicate, or an event from a foreign or stale subscription is rejected.
- **Resource version.** An opaque string from the API server. Never parse or compare it numerically.
- **UID.** The identity of an object. A Pod deleted and recreated under the same name is a different object, told apart by UID.
- **410 Gone.** The API server's answer when a watch's resource version is too old. The correct response is a relist, which is a new generation, not a retry.

### Limits you must implement

From plan section 4.

| Limit                                     | Value                                                                |
| ----------------------------------------- | -------------------------------------------------------------------- |
| Kubernetes read subscriptions             | 7 at most                                                            |
| Queue per subscription                    | 64 messages and 8 MiB, whichever is hit first                        |
| Items per delivered batch                 | 200                                                                  |
| Decoded watch event                       | 2 MiB                                                                |
| Acknowledgement timeout                   | 5 s for a delivered batch                                            |
| Watch establishment attempt               | 15 s                                                                 |
| Complete relist                           | 60 s, retries included                                               |
| Transient failures                        | 3 attempts in total, 0.5 s and 1 s backoff, at most 20 % jitter      |
| Consecutive relists with no event applied | after 3, mark the projection stale and require an explicit reconnect |
| Cancellation                              | acknowledged within 2 s, and owned tasks joined                      |

A Tauri channel reporting a successful send does not prove the renderer consumed the message. Implement bounded acknowledged delivery, or an equivalent flow-control contract that you demonstrate. Overflow or an acknowledgement timeout marks the projection stale, stops delivery, and requires a bounded resync. Terminal and control outcomes must never be dropped silently.

### Ownership

- The same query from two consumers shares one watch, but each consumer's ownership is tracked. Stopping one consumer must not close the other's subscription. The shared watch stops when its last owner leaves.
- Query replacement, leaving the view, closing the session, a closed channel, and application shutdown each release admission permits, clients, buffers, and task handles, and join the tasks.
- Leaving the view stops a Kubernetes watch whose view is no longer active, but keeps the credential session. The Talos probe keeps its own shell-owned lifetime; do not change it.

### The dependency

`kube` currently has only the `client`, `config`, `ring`, and `rustls-tls` features. Its watch and list-watch recovery support lives behind a further feature. Read the pinned version's documentation, enable only what you need, and record the choice in `docs/dependencies.md`. Use the library's supported recovery semantics; do not reimplement watch bookkeeping the library already provides.

## Do not

- Do not publish a generation that is still being built.
- Do not treat a 410 relist as a retry that resets the attempt counter.
- Do not let a channel or queue grow without a bound.
- Do not cause live changes except through the fixture harness from document 02, with its setup identity, inside the allowlisted namespace.
- Do not raise a limit to make a measurement or a test fit.

## Work

1. Implement the watch on top of the list from document 02, using the pinned library's list-watch recovery. Apply deletions and updates by UID.
2. Build each replacement generation completely, within its bounds, then publish it atomically.
3. Add session, subscription, and generation identity plus sequence validation at both ends of IPC: Rust validates before forwarding, the renderer validates before applying.
4. Deduplicate subscription work for identical queries while tracking each consumer's ownership.
5. Implement the flow-control contract through the real native boundary.
6. Join task cleanup on every exit path listed under "Ownership". Release watch cache and query data when no longer needed, under a bounded eviction policy.
7. Extend the Workloads view: live updates, a visible stale state, and an explicit reconnect action when the relist budget is exhausted.
8. Extend the synthetic API server where needed to produce deterministic 410 responses and consumer-pressure cases. Keep those results labelled as synthetic.
9. In the fixture session: cause Pod add, change, delete, and delete-then-recreate through the harness, and interrupt the watch once to show it resumes.

## Acceptance cases

1. The handoff from list to watch loses and duplicates nothing.
2. A duplicate event is rejected or ignored according to the documented rule.
3. A 410 produces a relist and a new generation; the old generation stays visible and marked stale until the new one is complete.
4. Three consecutive relists with no applied event mark the projection stale and require an explicit reconnect.
5. Disconnect, reconnect, and exhaustion each end in the documented state.
6. A Pod deleted and recreated with the same name is shown as a new object.
7. An event from a stale or foreign subscription, a stale generation, or with a sequence gap is rejected at both ends.
8. A session or namespace change discards the old subscription's events.
9. Two consumers of one query: stopping one leaves the other working; stopping both stops the watch.
10. The queue bound and the acknowledgement timeout each produce stale-and-resync or termination, never growth.
11. Cancel during list, during relist, and during backoff each end promptly and cleanly.
12. A closed channel and an application shutdown release everything.
13. After every case above, tasks, sockets, permits, and retained data are back at baseline, shown by observation and not by assuming a cleanup function ran.
14. Native run: ordered delivery and fault cleanup through real Tauri IPC.
15. Live run: a 1.36 watch receives real changes and resumes after an interruption.

## Gates

Rust, TypeScript and Svelte, IPC, and Tauri gates from the README, in full. Dependency gates if a `kube` feature or a package changed.

## Done means

- Every acceptance case has recorded evidence, with synthetic, native, and real-cluster results labelled separately.
- `docs/protocol/application-ipc.md` describes the subscription identities, the flow-control contract, and every limit.
- A decision record under `docs/decisions/` captures the watch, relist, and flow-control design: context, chosen behavior, alternatives, consequences, and verification.
- The plan's exit holds: real Tauri ordered delivery and fault cleanup are proven, and a live 1.36 watch resumes after an interruption.
