# Renderer application IPC

The renderer calls native application commands through the typed adapter in
[`src/lib/ipc/transport.ts`](../../src/lib/ipc/transport.ts). Rust Serde DTOs
in [`contracts.rs`](../../src-tauri/src/contracts.rs) are the source of the
wire types; `pnpm contracts:generate` emits TypeScript declarations under
[`src/lib/ipc/generated/`](../../src/lib/ipc/generated/). Generated files are
not edited manually.

## Command surface

Every command is granted explicitly to the `main` window in
[`capabilities/main.json`](../../src-tauri/capabilities/main.json). No other
window or origin receives them, and an ungranted webview is rejected by the
generated ACL rather than by a renderer check.

| Command                            | Renderer arguments                           | Result                                                |
| ---------------------------------- | -------------------------------------------- | ----------------------------------------------------- |
| `get_helper_status`                | none                                         | `HelperStatusDto`                                     |
| `get_appearance_settings`          | none                                         | `AppearanceSettingsDto`                               |
| `set_appearance_settings`          | `settings`                                   | `null` on success                                     |
| `get_credential_storage_status`    | none                                         | `CredentialStorageStatusDto`                          |
| `use_session_only_storage`         | none                                         | `CredentialStorageStatusDto`                          |
| `retry_persistent_storage`         | none                                         | `CredentialStorageStatusDto`                          |
| `import_kubeconfig`                | none (native file picker)                    | `CredentialImportResultDto` or `null` when cancelled  |
| `import_talosconfig`               | none (native file picker)                    | `TalosCredentialSessionDto` or `null` when cancelled  |
| `list_kubernetes_credentials`      | none                                         | `KubernetesCredentialSummaryDto[]`                    |
| `open_kubernetes_session`          | `credentialHandle`                           | `KubernetesSessionDto`                                |
| `close_kubernetes_session`         | `sessionId`                                  | `true` when that session was open                     |
| `read_kubernetes_version`          | `sessionId`                                  | `KubernetesVersionDto`                                |
| `list_kubernetes_pods`             | `sessionId`, `namespace`, optional selectors | `KubernetesPodListDto`                                |
| `open_kubernetes_pod_watch`        | `sessionId`, `namespace`, optional selectors | `KubernetesPodWatchSubscriptionDto`                   |
| `stream_kubernetes_pod_watch`      | `sessionId`, `subscriptionId`, `channel`     | `KubernetesPodWatchEndDto`; events arrive on channel  |
| `acknowledge_kubernetes_pod_watch` | `sessionId`, `subscriptionId`, `sequence`    | `true` only for the exact outstanding event           |
| `stop_kubernetes_pod_watch`        | `sessionId`, `subscriptionId`                | `true` when that subscription was stopped             |
| `start_talos_probe`                | `sessionId`, `node`, `channel`               | `null` on completion; events arrive on the channel    |
| `stop_talos_probe`                 | `sessionId`                                  | `true` when that session owns the active subscription |
| `close_talos_session`              | `sessionId`                                  | `true` when an in-memory session was removed          |

Rust parameters are declared in `snake_case` and Tauri exposes them to the
renderer as `camelCase`, so `sessionId` binds to `session_id` and
`credentialHandle` to `credential_handle`. No command accepts a path, a
credential, a process argument, or a raw selector: selected files stay in Rust,
Talos credentials stay in the backend session store, Kubernetes credentials
stay behind an opaque handle, and `stop_talos_probe`, `close_talos_session`, and
`close_kubernetes_session` act only on the session they name. Unknown,
already-closed, or non-owning session identifiers release no helper work and
return `false`.

## Kubernetes credential handles and sessions

Importing a kubeconfig returns a `credential_handle`: an opaque
`kubecred-`-prefixed reference to the stored credential. A handle is **not** an
authorization grant. `open_kubernetes_session` validates its kind prefix and
length, re-checks which storage holds that reference and that the reference is
a `kubeconfig` record of a known profile, and refuses a stored reference while
the runtime cannot open it, before any decryption. Unknown, malformed, or
foreign-kind handles fail as `KUBERNETES_CREDENTIAL_UNKNOWN`.

`list_kubernetes_credentials` reports at most 512 entries and is called only
from an explicit user action: the backend never lists credentials at startup, so
opening the shell does not read the vault or create a key. Each entry carries a
handle, a bounded context label derived from that credential's encrypted
material, and the mode the entry currently lives in (`persistent` or
`session_only`, never a runtime-wide mode). A persistent reference survives a
restart; a session-only handle does not.

A session is process-local and returns only its identifier, bounded context
label, and credential mode. `read_kubernetes_version` performs one
non-sensitive API server read through that session's client: it is admitted
against a 32-request capacity that rejects excess work instead of queueing it,
bounded by a fifteen-second attempt deadline, and returns only the reported
version fields. `list_kubernetes_pods` keeps the session and namespace fixed
while the backend follows server-side continuation tokens. It validates
namespace and optional label/field selectors before network access, probes only
the core `/api/v1` resource list, and returns at most 10,000 summaries with the
shared resource version. The 200-item page limit, 2 MiB response-byte bound,
16 MiB per-session retained-projection budget, 15-second attempt deadline, and
60-second whole-snapshot deadline apply. A result whose `complete` field is
false stopped at a documented collection cap and must remain visibly partial.
Each `KubernetesPodDto` contains only name, namespace, UID, resource version,
phase, and a readiness category; Pod specs, annotations, addresses, and raw
status/error messages never cross IPC. The adapter holds at most four sessions.

No credential bytes, kubeconfig content, file path, token, or SDK object is
included in any of these results. The adapter never reads ambient configuration
(`$KUBECONFIG`, `~/.kube/config`, or the in-cluster environment), never applies
a proxy, and never disables TLS validation; see
[decision 0012](../decisions/0012-kubernetes-client-session-boundary.md).

### Kubernetes Pod watch

`open_kubernetes_pod_watch` validates the query and allocates one of at most
seven process-wide watch slots under the named credential session. It returns
the backend-generated subscription identity before network establishment so a
renderer can cancel promptly. The current implementation assigns one watcher
and one Tauri channel per subscription; identical-query sharing across multiple
consumers remains tracked in the F4 ledger and is not claimed as complete.

`stream_kubernetes_pod_watch` sends bounded
`KubernetesPodWatchEventDto` messages. Each event identifies the session and
subscription, has a decimal-string unsigned 64-bit sequence and generation, and
contains one change: snapshot begin, a snapshot batch, snapshot complete, UID
upsert, UID delete, or stale. Snapshot generations publish only after the
backend has collected a complete bounded list. A 410 response starts a new
generation through kube's pinned list-watch recovery; old renderer data stays
visible as stale until the new snapshot completes. Resource versions remain
opaque strings. A repeated object update with the same UID and resource version
is ignored; deletes and recreations use UID identity.

Each subscription retains at most 64 queued messages and 8 MiB of projected
data, with at most 200 Pods in one snapshot batch and 10,000 Pods per
generation. One decoded Pod is rejected when its bounded re-encoding exceeds
2 MiB. This size check occurs after kube has decoded the object, so it limits
accepted and retained projection work but does not cap kube's initial decode
allocation. A delivered event remains the only outstanding event until the
renderer validates it, applies it, and acknowledges its exact sequence. The
backend stops the subscription on a five-second acknowledgement timeout;
channel send failure also stops it. Queue overflow, exhausted recovery, and
invalid projections end stale or failed with a terminal result outside the
bounded data queue.

The watcher allows three transient attempts total with 0.5-second then
1-second backoff. A replacement snapshot has a 60-second deadline. After
three consecutive relists without an applied event, the view becomes stale and
requires an explicit reconnect. Watches request a 290-second server lifetime.
Session close, explicit stop, application
shutdown, and renderer channel loss cancel and join owned tasks; cancellation
is bounded by the watcher request and acknowledgement limits. Watch request
connect and write timeouts are 10 and 5 seconds. The current HTTP client's
read timeout is disabled to preserve a quiet long-lived stream, so the full
15-second response-establishment bound is not yet demonstrated; see the F4
ledger.

## Streaming results

`start_talos_probe` uses a Tauri `Channel<TalosProbeEventDto>` for ordered
stream events and keeps the command open until the subscription ends. The
command resolves with `null`; the channel carries the data. Channel callbacks
validate each message before it reaches application state, and the adapter
requests cancellation for its own session as soon as a message fails
validation. The backend forwards at most 256 status events per subscription and
bounds the cancellation acknowledgement at two seconds, so a closed or slow
view cannot accumulate renderer messages. See
[helper protocol v1](helper-v1.md) for the private Rust-to-Go side of the same
stream.

Every event carries the session identity, a decimal sequence, a decimal
snapshot generation, and a snapshot flag. Data projections advance the
sequence by exactly one and continue it across reconnect generations; the
bootstrap snapshot is generation 1 with sequence `0`, and a replacement
snapshot after a mid-stream reconnect is the only event that advances the
generation while the sequence stays continuous. A stale marker repeats the
sequence and generation of the projection it invalidates and carries no data
fields: the state module retains the displayed values and marks them stale, so
old data stays visibly stale until a valid replacement snapshot arrives. A
stale marker no longer requires an observed connection failure: when the
selected node stops responding while the watch stays silent, the backend's
bounded node-pinned liveness check marks the projection stale first and then
spends the same reconnect budget ([helper protocol v1](helper-v1.md);
[decision 0013](../decisions/0013-talos-stream-stall-detection.md)). The
renderer contract is unchanged by that cause: the outcome is still a
replacement snapshot or the same terminal error mapping. A node reboot that
outlasts the reconnect budget is such a terminal outcome: the subscription is
not resumed, and the user starts the probe again from the view. A
failed or exhausted subscription ends with an application error state
(`TALOS_UNAVAILABLE` for an exhausted reconnect budget, the classified code
for a permission or TLS failure) that the view never presents as current.

## Validation and errors

Fields are snake_case in DTO payloads; nullable DTO fields are present as
`null`. The adapter accepts harmless additive object fields but rejects missing
required fields, unknown enum or capability values, inconsistent readiness
state, duplicate or excess identities, non-decimal sequence or generation
strings, sequences beyond the stream bound, generations outside `1..256`,
unsafe numerics, and oversized strings or labels. Talos identifiers must match
the documented session, version, stage, and identity character sets before
anything reaches a component. A stale marker must carry no data fields and no
snapshot flag, and a healthy event must carry a stage; anything else is a
contract violation and stops the stream.

The transport returns `unknown` from Tauri's generic `invoke` API and validates
the runtime value before exposing the generated DTO. A well-formed application
error becomes `IpcApplicationError` with the validated
`ApplicationErrorDto` code, action, target, retry classification, and safe
message. An invalid rejection or transport failure becomes a generic
`IpcTransportError`; raw IPC errors, helper pipes, and credential material are
never forwarded to the UI. A browser request for the native transport throws
`IpcTransportUnavailableError`, and a stream command on a transport without
channel support fails the same way instead of degrading to polling.

Browser tests explicitly inject `createBrowserMockTransport` from the testing
module or a test-local transport. No runtime mode, environment flag,
missing-IPC fallback, or test mock selection is part of the production
application entry point. Native app command permission and packaged helper
behavior are checked by the separate native test packet; mocked renderer tests
do not establish those properties.

Run `pnpm contracts:check` to verify the generated declarations,
`pnpm test:run` for runtime validation and mock-boundary tests, and
`pnpm test:native` for the real Tauri command, channel, and ACL behavior. The
direct `@tauri-apps/api` dependency is pinned to 2.12.1 to match the installed
Tauri 2.12.1 core and CLI.
