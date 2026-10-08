# Renderer application IPC

The renderer calls native application commands through the typed adapter in
[`src/lib/ipc/transport.ts`](../../src/lib/ipc/transport.ts). Rust Serde DTOs
in [`contracts.rs`](../../src-tauri/src/contracts.rs) are the source of the
wire types; `pnpm contracts:generate` emits TypeScript declarations under
[`src/lib/ipc/generated/`](../../src/lib/ipc/generated/). Generated files are
not edited manually.

## Current command

`get_helper_status` takes no renderer-controlled arguments. It returns the
bounded `HelperStatusDto` projection or rejects with a serialized
`ApplicationErrorDto`. Fields are snake_case; nullable DTO fields are present
as `null`. Helper status currently uses a small enum and one capability. The
adapter accepts additive object fields but rejects missing required fields,
unknown enum/capability values, inconsistent readiness state, duplicate or
excess capabilities, and oversized strings or invalid protocol numbers.

The transport returns `unknown` from Tauri's generic `invoke` API and validates
the runtime value before exposing the generated DTO. A well-formed application
error becomes `IpcApplicationError`. An invalid rejection or transport failure
becomes a generic `IpcTransportError`; raw IPC errors are never forwarded to
the UI. A browser request for the native transport throws
`IpcTransportUnavailableError`.

Browser tests explicitly inject `createBrowserMockTransport` from the testing
module. No runtime mode, environment flag, missing-IPC fallback, or test mock
selection is part of the production application entry point. Native app command
permission and packaged helper behavior are checked by the separate native
test packet; mocked renderer tests do not establish those properties.

Run `pnpm contracts:check` to verify the generated declarations and
`pnpm test:run` for runtime validation and mock-boundary tests. The direct
`@tauri-apps/api` dependency is pinned to 2.12.1 to match the installed Tauri
2.12.1 core and CLI.
