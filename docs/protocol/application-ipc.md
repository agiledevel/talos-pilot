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

| Command                         | Renderer arguments             | Result                                                |
| ------------------------------- | ------------------------------ | ----------------------------------------------------- |
| `get_helper_status`             | none                           | `HelperStatusDto`                                     |
| `get_appearance_settings`       | none                           | `AppearanceSettingsDto`                               |
| `set_appearance_settings`       | `settings`                     | `null` on success                                     |
| `get_credential_storage_status` | none                           | `CredentialStorageStatusDto`                          |
| `use_session_only_storage`      | none                           | `CredentialStorageStatusDto`                          |
| `retry_persistent_storage`      | none                           | `CredentialStorageStatusDto`                          |
| `import_kubeconfig`             | none (native file picker)      | `CredentialImportResultDto` or `null` when cancelled  |
| `import_talosconfig`            | none (native file picker)      | `TalosCredentialSessionDto` or `null` when cancelled  |
| `start_talos_probe`             | `sessionId`, `node`, `channel` | `null` on completion; events arrive on the channel    |
| `stop_talos_probe`              | `sessionId`                    | `true` when that session owns the active subscription |
| `close_talos_session`           | `sessionId`                    | `true` when an in-memory session was removed          |

Rust parameters are declared in `snake_case` and Tauri exposes them to the
renderer as `camelCase`, so `sessionId` binds to `session_id`. No command
accepts a path, a credential, a process argument, or a raw selector: selected
files stay in Rust, Talos credentials stay in the backend session store, and
`stop_talos_probe` and `close_talos_session` act only on the session they name.
Unknown, already-closed, or non-owning session identifiers release no helper
work and return `false`.

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

## Validation and errors

Fields are snake_case in DTO payloads; nullable DTO fields are present as
`null`. The adapter accepts harmless additive object fields but rejects missing
required fields, unknown enum or capability values, inconsistent readiness
state, duplicate or excess identities, non-decimal sequence strings, sequences
beyond the stream bound, unsafe numerics, and oversized strings or labels.
Talos identifiers must match the documented session, version, stage, and
identity character sets before anything reaches a component.

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
