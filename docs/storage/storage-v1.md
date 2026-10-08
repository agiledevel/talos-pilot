# Local storage schema v1

This is the C3.1–C3.3 backend storage contract. It defines SQLite schema
version 1, sensitive-value envelope version 1, native-vault handling,
session-only memory, bounded kubeconfig import, and appearance preferences.
Credential bytes and selected file paths remain in Rust; only safe metadata and
explicit storage-mode state cross IPC.

## Database schema

`rusqlite` owns one backend connection with foreign keys enabled, WAL journaling,
full synchronous commits, a five-second busy timeout, and a bundled SQLite
library. `PRAGMA user_version` tracks the database schema independently from
the value-envelope version. Opening a fresh database starts an immediate
transaction, creates all four tables, sets schema version 1, and commits once.
Concurrent opens serialize through that transaction. A failed migration rolls
back its table creation and leaves preexisting rows intact. Unknown future
schema versions fail closed.

Schema v1 contains:

- `profiles`: opaque profile ID, nonsecret display name, and UTC Unix creation
  time.
- `credential_references`: profile ownership and a bounded credential kind;
  secret bytes do not appear here.
- `encrypted_values`: envelope version, 24-byte nonce, and authenticated
  ciphertext for one reference.
- `preferences`: bounded nonsensitive preference values.

Sensitive payloads are capped at 16 MiB before encryption. SQL uses bound
parameters, profile/reference relationships use foreign keys, and a record
reference and its encrypted value are committed in one transaction.

## Encrypted value envelope v1

The cipher is XChaCha20-Poly1305 with a 32-byte key, a fresh 24-byte nonce, and
its 16-byte authentication tag appended to the ciphertext. Envelope version
1 is stored separately from the SQLite schema version. The authenticated
additional data is the domain string `talos-pilot/sqlite-value/v1`, followed
by length-prefixed profile ID, reference ID, and value kind. This prevents an
envelope from being swapped between profiles or record kinds.

The backend wraps keys in `secrecy::SecretBox`; the key is neither serialized
nor formatted, and its buffer is zeroized when dropped. The C3.1 test adapter
accepts synthetic keys so the encryption and persistence behavior can be
exercised without a platform vault. A missing key, wrong key, malformed
envelope, changed nonce/ciphertext/context, unknown envelope version, random
source failure, and oversize value return safe errors. Plaintext is never
written to SQLite, WAL, shared-memory, or rollback-journal rows.

See [decision 0003](../decisions/0003-storage-schema-and-envelope.md) for the
schema/envelope format and [decision 0005](../decisions/0005-native-kubeconfig-import.md)
for the import boundary. The Rust implementation lives in
[`src-tauri/src/storage/`](../../src-tauri/src/storage/); the Tauri command
surface is defined in `src-tauri/src/lib.rs` and the safe DTOs in
`src-tauri/src/contracts.rs`.

## Master key vault and session-only memory

`PlatformVault` stores a randomly generated 32-byte master key in the current
user's native credential store: Linux Secret Service, macOS Keychain, or
Windows Credential Manager. The selected provider features are target-scoped
and disable keyring's mock store. The vault is not accessed at app startup; the
first import or an explicit retry accesses it, avoiding credential side effects
from settings reads and runtime diagnostics. Keyring calls are serialized
within the process because Secret Service is an RPC interface. Provider
diagnostics are redacted to static storage errors.

Persistent key initialization obtains the key through
`Database::load_or_create_master_key`, which holds SQLite's immediate write
reservation while consulting the vault. Instances sharing a database file
therefore cannot race to generate and replace the first key before writing
records. If a user retries the vault while session-only values are still in
memory, new imports become persistent and the old values remain in memory; the
status continues to show that combined state until the app exits.

## Kubeconfig import and appearance settings

The native single-file picker is invoked by a no-argument Rust command. The
selected path never enters renderer IPC. Rust opens only that file, reads at
most 4 MiB into zeroizing memory, and validates a single kubeconfig document
with bounded YAML parser budgets. It accepts only HTTPS cluster endpoints,
inline certificate authority data, and inline token, username/password, or
client certificate/key credentials. It rejects exec plugins, legacy
auth-provider, external credential paths, malformed or duplicate-keyed YAML,
unsupported tags, and insecure TLS settings before any SDK can process the
input. The whole source file is encrypted as one value; IPC returns only the
current-context label and active storage mode.

The SQLite file is `talos-pilot.sqlite3` under Tauri's platform application-data
directory. Unix application-data directory permissions are set to `0700` and
the database file to `0600`; WAL, shared-memory, and journal files live in that
private directory. Windows relies on the per-user ACL of Tauri's app-data
directory; that permission behavior is still awaiting Windows runtime
qualification. The renderer cannot select this path. Theme (`system`,
`light`, or `dark`) and density (`comfortable` or `compact`) are separate
nonsensitive preferences, updated together in one SQLite transaction.

The key is stored as base64 UTF-8 text for Secret Service implementations such
as KDE Wallet that do not accept arbitrary binary values. The encoded buffer
is zeroized after use and decoded bytes are immediately owned by `SecretBox`.
This encoding does not replace or change the SQLite AEAD envelope.

On vault failure, persistent imports fail without creating a credential
reference. The UI offers an explicit session-only choice; `SessionOnlyStore` has
no database connection and holds values in `SecretBox` memory until removed or
dropped, with at most 256 entries and 64 MiB of retained payload. It does not
save ciphertext rows that would be undecryptable after restart. If the vault is
successfully retried while session values remain, new imports become
persistent while the old values stay in memory until shutdown; the UI marks
this combined state. See [decision 0004](../decisions/0004-native-vault-integration.md)
and [decision 0005](../decisions/0005-native-kubeconfig-import.md) for provider
selection, import policy, and platform verification limits.
