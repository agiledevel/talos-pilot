# Local storage schema v1

This is the C3.1 backend storage contract. It defines SQLite schema version 1
and sensitive-value envelope version 1. It does not expose credential import,
credential reads, or a Tauri storage command. C3.2 will supply the actual
platform vault key and explicit unavailable-vault/session-only behavior.

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
dependency and format selection. The Rust implementation lives in
[`src-tauri/src/storage/`](../../src-tauri/src/storage/); C3.2 owns vault
integration, and no renderer or native command calls it yet.
