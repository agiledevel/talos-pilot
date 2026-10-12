# Decision 0012: Kubernetes client construction and credential-session boundary

Date: 2026-10-11. Status: accepted for milestone 1 F2.

## Context

F2 must let an imported kubeconfig reach a real Kubernetes client without
exposing credentials to the renderer, and without the client ever reading
configuration the user did not select. Three properties make that non-trivial:

1. The renderer must be able to refer to an imported credential. C3.3 returned
   only a context label and a storage mode, so nothing identified a stored
   credential after an import completed.
2. `kube` can build a `Config` from an inferred environment (`Config::infer`,
   `Kubeconfig::read`, in-cluster variables) or from a raw kubeconfig
   document. Both paths can execute an `exec` plugin, follow an auth-provider,
   read a token file, honour a proxy, or accept an insecure TLS flag, and both
   would silently fall back to a different cluster or credential than the one
   the user imported.
3. Decision [0005](0005-native-kubeconfig-import.md) deliberately keeps the
   user's context label out of plaintext profile rows, so every stored profile
   currently carries the same generic display name. A restarted application
   therefore has no way to tell saved credentials apart.

## Decision

- **The backend issues an opaque handle.** `store_kubeconfig` returns a
  `StoredCredential` whose `handle` is `kubecred-` followed by the 16-byte
  random reference the storage layer already generated. The handle names the
  credential kind so a lookup can reject a foreign handle, and it contains no
  credential bytes, path, or kubeconfig.
- **A handle is not an authorization grant.** `resolve_kubeconfig_credential`
  re-validates the handle prefix and bounds, looks the reference up in the
  session store and then among stored references, rejects a reference whose
  `value_kind` is not `kubeconfig`, and refuses a stored reference while the
  runtime is in a mode that cannot open it (session-only, or vault
  unavailable) instead of touching the vault again. Only then is anything
  decrypted.
- **Reads never create a vault key.** The vault trait gained a read-only
  `load_key`; `Database::load_master_key` uses it without a write transaction.
  A missing key leaves the ciphertext untouched and fails resolution, which is
  what keeps a locked or reset vault from silently re-keying existing records.
- **The label stays encrypted.** An import writes a second encrypted value
  under the new `value_kind` `kubeconfig-context`, so the listing can show a
  real context label without a plaintext row and without a schema change. A row
  written before that label existed derives its label by decrypting the
  credential and re-validating it, so both paths use only encrypted material.
  Decision 0005 is preserved exactly: `profiles.display_name` remains generic.
- **Listing is explicit and bounded.** `list_kubeconfig_credentials` is called
  only from an explicit user action; nothing in the backend calls it at
  startup. At most 256 stored references are read (bounded in SQL) and the
  session store's own 256-entry ceiling bounds the rest, so a listing
  projection cannot grow without limit.
- **The client is built from a supported-field selection.** `select_kubeconfig`
  runs the same validation the import uses and copies out only the endpoint,
  the inline certificate authority, and one inline identity (token, basic, or
  client certificate/key). `kubernetes::client::build_client` then sets the
  `Config` fields explicitly: `accept_invalid_certs = false`, no
  `root_cert_file`, no proxy, no TLS server-name override, no extra headers,
  the SDK's own transient-failure retry disabled, and bounded connect, read and
  write timeouts. There is no `Config::infer`, `Kubeconfig::read`, or
  in-cluster path anywhere in the adapter.
- **Sessions and admission are owned and bounded.** The adapter holds at most
  four sessions and admits at most 32 requests, checking the session limit
  before a client is constructed and rejecting excess work instead of queueing
  it. One request attempt, including connect and response read, is bounded by
  fifteen seconds. The registry lock is never held across an await.
- **Errors are redacted categories.** `KubernetesError` carries a stable code
  and a static message; SDK messages, URLs, tokens, and kubeconfig content
  never reach the DTO, the log, or the renderer.

## Alternatives considered

- **Handling the raw kubeconfig to `Kubeconfig::try_from`.** Rejected: it would
  let the SDK interpret fields the import boundary does not support (exec,
  auth-provider, token files, proxies, TLS server-name overrides) and would
  make the supported set depend on the SDK version rather than on this
  project's validation.
- **`Config::infer()` with an override.** Rejected: the fallback chain itself is
  the hazard — an absent override silently becomes a different cluster.
- **A plaintext context label in `profiles.display_name`.** Rejected: it
  reverses 0005, needs an owner-directed amendment, a migration, and the
  upgrade fixture the original C3 tests require.
- **Keeping the credential bytes in the session.** Rejected: a session that
  caches decrypted material keeps secrets alive for as long as the session
  exists, and would make a later vault lock or key change invisible to the
  session. The session holds only the client.
- **Reusing the Talos credential store's session ceiling.** Rejected for this
  phase: until milestone 2 links both access paths in one cluster profile, the
  adapters admit sessions separately, so the Kubernetes adapter owns its own
  four-session and 32-request limits.
- **A test-only IPC command that seeds a credential.** Rejected: it would put
  credential material on the IPC surface. The native-test runtime instead reads
  a harness-supplied file through the ordinary validation and store path.

## Consequences

- A stored credential can be resolved after a restart, as long as the vault key
  is present; a session-only handle cannot be resolved after a restart, and a
  missing or replaced key leaves existing ciphertext unreadable rather than
  silently re-keyed.
- Every persistent profile still carries one generic display name; the context
  label exists only inside encrypted values and in one bounded in-memory label
  per session-only credential.
- The adapter is read-only in this packet: it performs a version read only. List
  and watch behaviour, namespace/selector validation, projections, pagination,
  and flow control belong to the next packet.
- Classification of a TLS failure walks the SDK error's source chain for the
  Rustls text naming a rejected peer certificate. The concrete Rustls error
  type is not nameable here without taking a direct dependency on the TLS stack,
  so the behaviour is pinned by a real mismatched-authority integration test and
  by unit tests over a synthetic error chain rather than by the markers alone.
- A credential listing is all-or-nothing: when stored rows exist and the vault
  key cannot be read, the listing fails instead of returning only the
  session-only entries, so a partial projection cannot be mistaken for "nothing
  is saved".
- An inline certificate authority is only shape-checked (non-empty base64) at
  import, preserving 0005; it must parse as a PEM certificate bundle before a
  client is built, so an unusable authority fails as
  `KUBERNETES_CREDENTIAL_INVALID` rather than being trusted.
- `kube`, `k8s-openapi`, `http`, and `pem` are production dependencies;
  `rcgen` and `tokio-rustls` exist only for the native-test feature and are
  asserted absent from the default dependency graph.

## Verification

- Rust: unit tests for the selection, client construction, session limits,
  admission capacity, and redacted error mapping; integration tests
  (`src-tauri/tests/kubernetes_session.rs`, `native-test` feature) that import a
  synthetic kubeconfig, resolve its handle, open a session, and perform a real
  TLS version read against the synthetic endpoint, plus mismatched-authority,
  401/403, unknown-handle, and credential-redaction cases.
- Native: `pnpm test:native` starts the synthetic endpoint, injects its
  kubeconfig as test-only configuration, and exercises the four commands
  through real Tauri IPC, including ACL denial from the unauthorized window,
  the four-session ceiling, and endpoint cleanup after the run.
- Contracts and renderer: `pnpm contracts:check`, `pnpm lint`, `svelte-check`,
  and renderer tests cover the new DTOs, the handle shape, and the bounded
  listing.
- Production exclusion: `pnpm production:check` asserts that the synthetic
  server's markers, the native-test variable, and the test certificate
  generator are absent from the default artifact and graph.

The first live cluster read belongs to the next packet; nothing in this
decision is verified against a real cluster.
