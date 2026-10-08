# Decision 0004: Native credential vault providers

Date: 2026-10-08

## Context

C3.1 introduced an authenticated SQLite envelope with an injected master key.
C3.2 needs a real key provider for database restart and a deliberate
session-only path when native vault access is unavailable. The renderer must
not receive the key, and a vault failure must not trigger plaintext fallback.

## Decision

Use `keyring` 3.6.3 with default features disabled and explicit target feature
sets: Linux Secret Service (`sync-secret-service`, `crypto-rust`), macOS
Keychain (`apple-native`), and Windows Credential Manager (`windows-native`).
The library uses its OS providers only when explicitly enabled and otherwise
falls back to its mock provider, so the feature selection is security
significant. Linux links to system `libdbus-1`; OpenSSL and the crate's
vendored feature are excluded.

Store one 32-byte random master key as a base64-encoded UTF-8 password in the
native vault. Some Secret Service implementations, including KDE Wallet, only
support UTF-8 values through this interface; base64 preserves the key bytes.
The encoded string is zeroized after provider calls. Decoded key bytes are
placed directly into a zeroizing `SecretBox` and exposed only to the AEAD and
vault adapters.

`PlatformVault` maps provider failures to static error categories. It never
logs or returns provider diagnostics, and it does not select session-only
operation. That choice is represented by constructing `SessionOnlyStore`,
which retains at most 256 values and 64 MiB of payload only in zeroizing
process memory and has no database handle. A caller that requires persistence
must stop on a vault failure and ask for the explicit session-only choice in
the later UI packet. The app does not access the vault at startup; the first
import or explicit retry triggers key creation under an immediate SQLite
transaction, so app instances sharing a database serialize their vault access.
When the vault becomes available while session values remain, the backend
keeps those values in memory, persists future imports, and reports the combined
state until shutdown.

## Alternatives considered

- `keyring` 4.2's new ecosystem recommends `keyring-core` plus separate store
  crates for applications that select providers. That is the forward API, but
  3.6.3 offers a stable single API across all three chosen native stores and
  lets this foundation packet qualify the actual Linux provider with a small
  dependency surface. Revisit before a major keyring API upgrade.
- `keyring` 3.6.3 default features: rejected because it can choose a mock store
  when a target provider is not selected.
- Linux keyutils: rejected as the primary store because its lifecycle is
  kernel-session scoped rather than a desktop user's persistent Secret Service
  collection.
- Application-managed key files or environment variables: rejected because
  they weaken the OS-vault boundary and complicate explicit locked/unavailable
  recovery.

## Consequences

- Linux runtime requires an active Secret Service and system `libdbus-1`; locked
  or unavailable vaults fail closed and leave session-only selection to the
  caller.
- macOS and Windows providers compile only for their target OS. Their actual
  vault behavior remains a C8 platform check.
- The Linux integration test creates a uniquely named synthetic credential,
  encrypts a temporary database value, reopens both, proves decryption, and
  removes the synthetic vault credential.
- The in-memory session store is not backed by SQLite and its retained values
  disappear when the owner drops it or the process exits.

## Verification

On openSUSE Tumbleweed Linux x86_64, dependency compilation and tests pass.
The ignored native integration test was explicitly run against the active KDE
Secret Service endpoint: it created the synthetic vault key, persisted and
reopened the SQLite envelope, decrypted with the retrieved key, and deleted the
synthetic vault entry. macOS Keychain and Windows Credential Manager have not
been run in this environment.

Primary references:

- [keyring 3.6.3 platform feature and fallback behavior](https://docs.rs/keyring/3.6.3/keyring/)
- [keyring 3.6.3 feature list](https://docs.rs/crate/keyring/3.6.3/features)
- [KDE Wallet UTF-8 Secret Service limitation](https://docs.rs/keyring/3.6.3/keyring/#caveats)
- [base64 0.22.1](https://docs.rs/base64/0.22.1/base64/)
- [zeroize 1.9.1](https://docs.rs/zeroize/1.9.1/zeroize/)
