# Decision 0005: Native kubeconfig import boundary

Date: 2026-10-09

## Context

C3.3 needs a native file-selection path that can import a synthetic Kubernetes
credential without exposing file contents or paths to the renderer. Kubeconfig
exec plugins can launch arbitrary commands when a client library resolves
credentials, and file-path credential references can expand the importer into
general filesystem access. The backend must reject those forms before any SDK
receives the document.

## Decision

- `import_kubeconfig` takes no arguments and opens a single-file native dialog
  through Tauri's Rust `DialogExt` API. The selected `FilePath` and bytes remain
  in the Rust command. The dialog plugin is registered for Rust APIs only; no
  dialog or filesystem command permission is added to the renderer capability.
  A backend import gate allows only one picker and file buffer at a time.
- Read one regular file, bounded to 4 MiB. Hold the raw bytes in `SecretBox`
  memory and validate them with `serde-saphyr` 1.3.0 using a single-document
  budget, maximum depth/events/nodes/scalar bytes, disabled comment retention,
  and rejected unsupported YAML tags. The dependency enables only its
  deserializer feature and has no filesystem include feature.
- Require `apiVersion: v1`, `kind: Config`, a valid current context, defined
  cluster/user references, unique bounded names, HTTPS cluster URLs, and
  inline supported authentication. Accept inline tokens, username/password,
  or paired client certificate/key data. Validate inline CA/certificate/key
  data as base64.
- Reject any user `exec`, legacy `auth-provider`, external token/certificate/key
  or CA paths, insecure TLS bypass, non-HTTPS endpoints, duplicate YAML keys,
  malformed structure, and multi-document input. Arbitrary values inside
  rejected auth blocks deserialize as `IgnoredAny`; parser details never leave
  the backend.
- Persist the entire source kubeconfig only as an AEAD value under the native
  vault key. Insert a generic nonsensitive profile label, reference, and encrypted
  value in one SQLite transaction; keep the user-supplied context label out of
  plaintext profile rows. If the user explicitly chooses session-only
  storage after a vault failure, retain the secret solely in the bounded
  zeroizing session store.
- Appearance theme (`system`, `light`, `dark`) and density (`comfortable`,
  `compact`) are separate nonsensitive preferences and update atomically. The
  renderer displays when existing session-only credentials remain in memory
  after a successful vault retry.
- Do not access or create the OS vault key during app startup or a preference
  read. The first import or an explicit retry loads/creates the key inside
  SQLite's immediate write reservation. This prevents diagnostics and
  production-runtime checks from creating credentials as a side effect.
- Native-test builds use an in-memory SQLite database, a session-only backend,
  and a fake unavailable vault provider. A test command cannot access the real
  user's vault or application-data database.

## Alternatives considered

- Renderer-selected paths or renderer file reads: rejected because they expose
  local file paths/content to web code and would require broad filesystem
  capabilities.
- `serde_yaml_ng` 0.10: rejected in favor of `serde-saphyr` 1.3.0, whose current
  parser API provides explicit structural budgets, duplicate-key rejection,
  unsupported-tag rejection, and configurable include support that can remain
  disabled. `serde_yaml_ng` 0.10's latest release predates these controls.
- Allowing kubeconfig `exec`, auth-provider, token-file, or certificate paths:
  rejected because they introduce command execution or additional filesystem
  reads when a later client SDK consumes the file.
- Importing only the current user's fields and rewriting YAML: rejected for
  this packet because it changes a user-supplied config document. Store the
  bounded source bytes encrypted, validate the selected context and all
  executable/external auth references, and return only the current-context
  label.
- Accessing the vault during app startup: rejected because opening the shell,
  reading appearance settings, and production negative checks should not create
  or touch user credentials. The user action that needs persistence initializes
  the key.

## Consequences

- Import currently supports HTTPS kubeconfigs with inline token,
  username/password, or certificate/key credentials. Exec, external file,
  insecure TLS, and auth-provider forms require explicit future design work if
  support is needed.
- A successful retry after session-only use preserves existing session values
  in zeroizing memory, persists new imports, and reports the combined state
  until shutdown. It does not silently discard session credentials.
- Database storage is under Tauri's app-data directory in
  `talos-pilot.sqlite3`; Unix directory/file modes are 0700/0600. Windows uses
  the per-user application-data directory ACL.
- Native capability grants are limited to the main window and name each
  command. The unauthorized test window still has no storage/import access.

## Verification

Rust tests validate supported input, exec/auth-provider/external path rejection,
TLS requirements, malformed/duplicate/oversized input, atomic metadata plus
ciphertext writes, no plaintext SQL artifacts, session-only non-persistence,
explicit vault recovery, and preservation of retained session data after retry.
Frontend tests validate typed runtime DTOs, independent persisted appearance,
session-only messaging, and fail-closed browser transport. Linux Tauri/WebDriver
tests execute the actual Rust appearance/storage commands, deny storage and
import from the unauthorized webview, and verify helper process cleanup. The
native-test configuration uses an in-memory database and session-only mode; it
does not touch the user's app-data directory or OS vault.

The native GTK file picker was separately opened under X11/Xvfb in the
native-test build. Selecting the checked-in synthetic fixture returned its
current-context label and `session_only`; the renderer received neither its
path nor token. Persistent import storage was verified with a synthetic AEAD
key in Rust tests. A Tauri import using the user's production vault was not run.

Primary references:

- [Tauri dialog Rust API](https://docs.rs/tauri-plugin-dialog/2.8.1/tauri_plugin_dialog/struct.FileDialogBuilder.html)
- [Tauri dialog plugin](https://docs.rs/tauri-plugin-dialog/2.8.1/tauri_plugin_dialog/)
- [serde-saphyr 1.3.0](https://docs.rs/serde-saphyr/1.3.0/serde_saphyr/)
- [serde-saphyr budget controls](https://docs.rs/serde-saphyr/1.3.0/serde_saphyr/budget/struct.Budget.html)
- [URL 2.5.8](https://docs.rs/url/2.5.8/url/)
