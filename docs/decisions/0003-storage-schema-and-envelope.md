# 0003: Versioned SQLite schema and AEAD value envelope

Date: 2026-10-08. Status: accepted for milestone 1 C3.1.

## Context

The locked design requires local SQLite metadata and authenticated encryption
for credentials, full configuration drafts, cluster secrets, and secret-bearing
patches. OS vault behavior and persistent credential flows are C3.2/C3.3 work;
C3.1 needs a testable storage boundary that does not rely on a real vault or
expose credentials in IPC.

## Decision

- Use `rusqlite` **0.40.2** with only its `bundled` feature. This pins the
  SQLite implementation across supported targets and avoids host system
  SQLite variation.
- Use RustCrypto `chacha20poly1305` **0.11.0**, specifically
  XChaCha20-Poly1305 with 24-byte random nonces, a 32-byte key, and associated
  data bound to profile/reference/kind identity.
- Use `getrandom` **0.4.3** for fallible platform entropy and `secrecy`
  **0.10.3** to hold the key in a redacted zeroizing secret container. Enable
  the AEAD crate's `zeroize` feature for its key schedule.
- Version schema through SQLite `user_version` and value envelopes through an
  independent `envelope_version` field. Schema v1 stores profiles, credential
  references, encrypted values, and nonsensitive preferences. Fresh migration
  runs in a `BEGIN IMMEDIATE` transaction.
- Keep all storage APIs backend-only. C3.1 tests inject synthetic key material;
  the actual key source and persistent credential feature wait for C3.2's
  platform vault checks.

## Alternatives considered

- System SQLite: rejected because target OS SQLite versions vary and may be
  absent from a clean deployment.
- SQLCipher for the whole database: rejected because sensitive values need
  field-level authenticated encryption and nonsensitive metadata should remain
  queryable. A whole-database cipher would add a second key/storage layer.
- AES-GCM: not selected; the pure Rust XChaCha20-Poly1305 implementation has a
  wider nonce and no platform-specific crypto dependency.
- Unversioned blobs or AAD containing only a record ID: rejected because the
  envelope algorithm needs independent migrations and foreign-context swaps
  must fail authentication.

## Consequences and verification

Bundled SQLite adds a native compile dependency and binary size, but uses the
same version on Linux, macOS, and Windows. XChaCha payloads carry one nonce and
one authentication tag per value; maximum plaintext is 16 MiB. Schema and
crypto tests cover migration commit/rollback, concurrent initialization,
reopen, wrong key, altered nonce/ciphertext/AAD, version rejection, size
bounds, and plaintext sentinels in the database and journal files. Platform
vault success/failure remains open for C3.2/C8.

Primary sources: [rusqlite 0.40.2](https://docs.rs/crate/rusqlite/0.40.2),
[ChaCha20-Poly1305 0.11.0](https://docs.rs/chacha20poly1305/0.11.0/chacha20poly1305/),
[getrandom 0.4.3](https://docs.rs/getrandom/0.4.3/getrandom/fn.fill.html), and
[secrecy 0.10.3](https://docs.rs/secrecy/0.10.3/secrecy/struct.SecretBox.html).
