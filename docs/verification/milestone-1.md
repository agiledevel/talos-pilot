# Milestone 1 verification ledger

Date opened: 2026-10-08. Base revision: `2926f4c58312a415fb430eca2c014e500f436d62`.

This is the active evidence record for [milestone 1](../plans/milestone-1-flash.md). It distinguishes current checks from historical evidence in [initialization](initialization.md) and [automation](automation.md). A checkpoint remains open until its observable acceptance criteria and required evidence pass on the final changed revision.

## Checkpoint status and acceptance criteria

| Checkpoint                       | Status                                | Acceptance criteria                                                                                                                                                                                                                                      |
| -------------------------------- | ------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0.1 baseline and ledger         | Complete                              | Reproduce frozen install, renderer, coverage, browser, icon, Rust, advisory, workflow, and native release-build checks; record actual command results, host/tool versions, failures, and next actions.                                                   |
| C0.2 dependency/harness research | Complete                              | Pin compatible Go/Talos, Rust-to-TypeScript and Protobuf generation/runtime tools, and Tauri native harness packages from primary sources; run minimal compatibility probes and record limits.                                                           |
| C1 helper and contracts          | In progress (C8 packaged runtime)     | Deterministically generate documented Rust/Go/TypeScript protocol and DTO outputs; reject malformed, oversized, unknown, and incompatible frames; exercise actual packaged Rust↔Go handshake, bounded supervision, failure cleanup, and safe status IPC. |
| C2 native IPC harness            | In progress (C8 macOS/Windows runs)   | Runtime-validate renderer DTOs; use an explicit browser mock; run Tauri/WebdriverIO allowed and denied IPC flows; demonstrate cleanup and prove production excludes mock/driver/test commands.                                                           |
| C3 encrypted storage             | Complete on Linux (C8 OS matrix open) | Verify schema/migration atomicity, AEAD integrity and redaction, actual OS-vault success/failure, encrypted restart, explicit session-only behavior, and native credential import with exec-auth rejection.                                              |
| C4 Talos probe                   | In progress (live read/stream proven) | On an allowlisted disposable Talos 1.14 fixture, demonstrate authenticated nonsensitive read and bounded COSI stream, TLS/authorization failures, cancellation/reconnect, and native shutdown cleanup.                                                   |
| C5 Kubernetes probe              | Pending                               | On disposable Kubernetes 1.36, demonstrate scoped paginated Rust reads and watch/relist behavior with RBAC/TLS/scope faults and cleanup; run affected read/watch cases on 1.35 and 1.37.                                                                 |
| C6 UI, workers, and CSP          | Pending                               | Qualify system/light/dark and density behavior, accessible feasibility states, lazy offline editor workers, bounded terminal/chart wrappers and disposal, restrictive CSP, and packaged asset behavior.                                                  |
| C7 advisories and inventory      | Complete on Linux (C8 scans open)     | Resolve or record applicability for each advisory without silent exclusions; generate/review dependency inventory and notices; preserve exact-revision security automation.                                                                              |
| C8 package/platform runtime      | Pending                               | Qualify clean install/launch/shutdown/uninstall and helper/vault/assets on Linux, macOS Intel/Apple Silicon, and Windows 11; inspect production exclusion and signing/integrity feasibility.                                                             |
| C9 budgets and review            | Pending                               | Measure declared synthetic and native workloads on recorded hardware, derive and enforce budgets, complete acceptance matrix and separate final review, and hand off with all failed/unrun evidence visible.                                             |

## C0.1 baseline evidence

Environment: openSUSE Tumbleweed, Linux x86_64, Node/pnpm from the repository-pinned setup, installed Rust 1.99.0 via `/home/kiss/.cargo/bin`, Go 1.27.1 installed to `/tmp/go`. The default shell `PATH` resolves `/usr/bin/rustc` 1.98.1 before the pinned Cargo installation; Rust commands must prepend `/home/kiss/.cargo/bin` on this host.

| Command                                               | Result                         | Evidence and practical limit                                                                                                                                                                                                                                           |
| ----------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                      | Pass                           | pnpm 12.10.1; lockfile unchanged.                                                                                                                                                                                                                                      |
| `pnpm check`                                          | Pass                           | Oxfmt, type-aware Oxlint, 10 renderer/script tests, Vite production build. Build retains the 580.82 kB minified / 188.52 kB gzip initial JS chunk warning.                                                                                                             |
| `pnpm test:coverage`                                  | Pass                           | 10 tests; 94.73% statements, 93.18% branches, 100% functions, 94.44% lines for the current declared scope. This shell/script coverage does not demonstrate cluster behavior.                                                                                           |
| `pnpm test:e2e`                                       | Pass                           | One Chromium shell appearance/accessibility/narrow-width flow; it does not establish native IPC.                                                                                                                                                                       |
| `pnpm icons:check`                                    | Pass                           | Derived icons match the committed source and conversion pipeline.                                                                                                                                                                                                      |
| `actionlint .github/workflows/*.yml`                  | Pass                           | Ran the exact CI-pinned actionlint 1.7.12 archive after verifying SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`.                                                                                                                          |
| Rust format, Clippy, tests, rustdoc, build            | Pass                           | `cargo fmt`, locked Clippy with `-D warnings`, locked all-target tests, rustdoc with warnings denied, and locked build all passed using Rust 1.99.0. There are currently zero Rust application tests because the crate only contains the minimal Tauri binary wrapper. |
| `PATH=/home/kiss/.cargo/bin:$PATH pnpm desktop:build` | Pass                           | Built the Linux x86_64 release executable with `--no-bundle`. This is not an installer or clean-target runtime qualification. The first attempt inherited system Rust 1.98.1 and failed the manifest minimum; the pinned-path rerun passed.                            |
| `pnpm audit --audit-level=low`                        | Pass                           | No known frontend vulnerabilities.                                                                                                                                                                                                                                     |
| `cargo audit --file src-tauri/Cargo.lock`             | Pass with findings             | cargo-audit 0.22.2 exited 0 and reported RUSTSEC-2024-0370 (`proc-macro-error` unmaintained) and RUSTSEC-2024-0429 (`glib` iterator unsoundness). This is an audit command pass, not advisory resolution; both findings remain open under FND-007.                     |
| Trivy 0.74.0                                          | Pass with documented exception | Downloaded the CI-pinned archive and verified SHA-256; ran the same vulnerability/secret/misconfiguration scan with generated build directories skipped. No new findings; the existing `.trivyignore.yaml` GLib entry suppressed RUSTSEC-2024-0429.                    |

Historical Linux package/runtime failures, advisory details, remote CI qualification limits, and earlier checks remain in [automation evidence](automation.md); they have not been promoted to current passes by this baseline run.

## C0.2 dependency and harness research

Primary-source checks on 2026-10-08 find [Talos `v1.14.1`](https://github.com/siderolabs/talos/releases/tag/v1.14.1) as the current stable 1.14 release. Its root and [`pkg/machinery` modules](https://raw.githubusercontent.com/siderolabs/talos/v1.14.1/pkg/machinery/go.mod) declare Go `1.26.5`, and its release notes state it was built with Go `1.26.8`. The [Go release history](https://go.dev/doc/devel/release) lists `1.27.1` (released 2026-09-01) as the latest 1.27 patch; `1.27.2` is not listed there. Go 1.27.1 is installed in `/tmp` and an isolated module successfully built/tests imported package `github.com/siderolabs/talos/pkg/machinery/client` at v1.14.1. This is a source compatibility probe only, not a helper implementation or cross-target build.

Tauri's [official WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/) recommends `@wdio/tauri-service` with its embedded provider on Windows, Linux, and macOS; its external provider is Linux/Windows only. The npm registry currently provides `@wdio/tauri-service` and `@wdio/tauri-plugin` v1.5.0 (MIT); crates.io provides `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver` v1.5.0 (MIT/Apache-2.0 and MIT respectively). An isolated Rust 1.99/Tauri 2.12.1 compile probe with both v1.5.0 plugins passed. It does not demonstrate that a driver listener is excluded from production; C2 still requires a test-only build and runtime/artifact checks.

The exact pins and generation paths are recorded in [decision 0001](../decisions/0001-foundation-generators-and-native-harness.md). Temporary cross-language Protobuf and Serde/`ts-rs` probes informed the implementation. C1.1 now generates the shared protocol from its schema, emits Rust DTO declarations, rejects generation drift, and checks framing and message validation in both languages. It still does not establish packaged native helper supervision or the application handshake; those remain C1.2/C1.3.

## Open findings and next packet

### C1.1 completed evidence

Trigger: C0 research established pinned cross-language generators and helper/native compatibility. C1.1 adds a documented v1 envelope and frame contract, generated Rust/Go protocol types, generated TypeScript DTO declarations, and Rust/Go codec validation. Rust tests cover split reads, consecutive frames, zero/over-limit lengths, truncated frames, write bounds, malformed protobuf, unknown kinds, payload mismatch, incompatible versions, optional fields, and unknown protobuf fields. The committed fixture is generated by Rust and decoded by Go; it covers optional presence and `u64::MAX`. `contracts:check` passed after regeneration and rejected both a deliberate schema-field edit and a deliberate Rust DTO edit. Rust unit tests (10), Go tests and race detector pass. These checks establish source-level protocol behavior only; C1.2 still owns packaged helper supervision, deadlines, shutdown and actual app/helper handshake.

Final C1.1 commands on this host passed: `pnpm contracts:generate`, `pnpm contracts:check`, `pnpm check`, `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, locked Clippy with warnings denied, locked all-target Rust tests (10 passed), rustdoc with warnings denied, locked Rust build, Go format/vet/test/race/module verification/build, and `PATH=/home/kiss/.cargo/bin:/tmp/go/bin:/tmp/talos-pilot-proto/protoc/bin:$PATH pnpm desktop:build` (Linux x86_64 release executable, no bundle). `cargo audit --file src-tauri/Cargo.lock` exited 0 with the two existing RUSTSEC findings documented above; it did not resolve them. `git diff --check` passed. The desktop build retains the known 580.82 kB minified renderer chunk warning. macOS/Windows, bundled installer, app/helper runtime handshake, and CI checks are unexecuted in C1.1.

### C1.2 completed evidence

Trigger: C1.1 provided the private Protobuf contract and the C0.2 Go toolchain pin. C1.2 adds a Rust-owned asynchronous helper supervisor with one in-flight exchange, bounded frames, startup/request/shutdown deadlines, identity-checked v1 handshake, safe status projection, continuous discard-only stderr draining, graceful shutdown, and kill-and-wait cleanup when an exchange fails. Request identifiers are monotonic within the process owner; exhaustion triggers child termination and reaping rather than leaving an owned process behind. Status refresh also verifies the helper identity remains the one accepted at startup.

Acceptance cases exercised: actual Rust↔Go handshake/status/shutdown; build identity mismatch; startup deadline against a stalled Go fixture; helper exit during status exchange; request-ID exhaustion cleanup; split/truncated/zero/oversized frames; malformed protobuf; unsupported protocol/kind and mismatched payload. The integration test builds the real Go helper into a test-specific temporary executable and communicates over private stdio. It is a local process integration test, not a Tauri application, packaged sidecar, installer, or cross-platform runtime test.

Final C1.2 commands on openSUSE Tumbleweed Linux x86_64, Rust 1.99.0, Go 1.27.1 and the pinned `protoc` path passed: Rust formatting check; locked Clippy with `-D warnings`; locked all-target Rust tests (15 passed); Go vet, tests, race detector, module verification and build. The first Clippy attempt did not execute because the shell omitted the pinned `protoc` path; the corrected invocation passed. No Go source needed formatting changes. The helper remains unbundled and no Tauri status command, permission scope, target packaging, or CI helper gate exists yet; those belong to C1.3. macOS and Windows runtime behavior remains unexecuted.

### C1.3 implementation evidence

Trigger: C1.2 established process ownership and the Go helper status handshake. C1.3 adds the `get_helper_status` Tauri command, a Rust application service that starts/refreshes only the identity-checked helper and projects bounded nonsensitive DTOs, and awaited graceful shutdown on application exit. Safe failures retain a stable code/action and generic message; pipe causes are not returned. The build script generates app-command ACL entries from Tauri 2.12.1's `AppManifest`; the main-window capability explicitly grants only `allow-get-helper-status`. The generated ACL was inspected and contains the allow and deny permissions. No plugin, shell command, path input, or renderer-controlled process argument was added.

Tauri's target-aware before-dev/build hook compiles the helper with Go 1.27.1, cgo disabled, and a shared source-revision build identity. The helper is bundled under `binaries/` in the resource directory, while development resolves it from the generated local binaries directory. The script was run for `x86_64-unknown-linux-gnu`, `aarch64-apple-darwin`, `x86_64-apple-darwin`, and `x86_64-pc-windows-msvc`; `file` identified each output as the expected ELF, Mach-O, or PE architecture. These are cross-compilation checks, not runtime qualification on those platforms.

Final C1.3 implementation checks on openSUSE Tumbleweed Linux x86_64 passed: `pnpm check` (10 renderer/script tests and frontend build), `pnpm contracts:check`, locked Rust fmt/Clippy/tests (18 tests)/rustdoc/build, Go format/vet/tests/race/module verification/build, native `pnpm desktop:build`, actionlint 1.7.12, and the four Go target cross-builds. A release-style Debian bundle also built successfully with `pnpm tauri build --ci --config .github/tauri.release.conf.json --target x86_64-unknown-linux-gnu --bundles deb -- --locked`. The `.deb` archive was inspected with `ar`/`tar`: it contains executable `usr/lib/Talos Pilot/binaries/talos-pilot-helper` (mode 0755), and the embedded helper identity matches the Rust build identity. `dpkg-deb` is not installed, so this package was not installed. `cargo audit --file src-tauri/Cargo.lock` completed with the same existing RUSTSEC-2024-0370 and RUSTSEC-2024-0429 findings; they remain open under C7. The JS build retains the existing 580.82 kB minified / 188.52 kB gzip warning. A Tauri runtime invocation of the new command, installed-package resource lookup, and allowed/denied IPC flows remain unverified; C2's native harness is required for those checks. Hosted macOS/Windows runs and the complete release package matrix are also unexecuted.

### C2.1 completed evidence

Trigger: C1.3 established the safe status command and generated Rust DTOs. C2.1 adds a narrow `IpcTransport`, runtime validators for generated status/error DTOs, a Tauri transport that requires `isTauri()`, and a separately named browser test mock selected only by injection. Malformed responses, unknown variants, invalid or unsafe numeric values, inconsistent readiness state, excess or duplicate capabilities, missing fields, and overlong values fail safely. Structured backend errors are parsed before presentation; raw rejection strings and objects become a generic transport error. Vitest now discovers `src/**/*.test.ts` and collects coverage from the adapter and validators.

The exact `@tauri-apps/api` 2.12.1 package is pinned to the Tauri 2.12.1 core/CLI line. The browser suite explicitly injects the mock, exercises the transport through a mocked Tauri API, and verifies native transport creation fails in jsdom; no mock is wired into production entry points. The final production asset scan found no browser mock, test marker, or synthetic secret marker. [Application IPC](../protocol/application-ipc.md) documents the DTO and error contract.

Final C2.1 checks passed: `pnpm install --frozen-lockfile`, `pnpm check` (18 tests), `pnpm test:coverage` (97.64% statements, 96.96% branches, 100% functions, 97.59% lines), and `pnpm contracts:check`. The first contract check lacked the pinned `protoc` directory on `PATH` and failed to start `/usr/bin/protoc`; rerunning with the recorded pinned tool path passed. The production build retains the 580.82 kB minified / 188.52 kB gzip warning. The native invocation and permission checks outstanding at C2.1 are covered in C2.2 below.

### C2.2 completed Linux runtime evidence

Trigger: C2.1 supplied the generated DTO validator and explicit transport. C2.2 adds an optional Rust `native-test` feature, a test-only Tauri config/capability and frontend entry for the WDIO plugin, an embedded WebDriver server, and a second `unauthorized` webview with no capability. The production config, default Cargo features, and frontend entry do not register or import the WDIO plugins. `pnpm test:native` builds that isolated app, runs the embedded service, and fails if the helper process count does not return to its pre-run baseline after app shutdown. Linux uses the current display or `xvfb-run` when headless.

On openSUSE Tumbleweed Linux x86_64 with Node 26.11.1, Rust 1.99.0, Go 1.27.1, WebKitGTK 4.1, and the desktop display, `pnpm test:native` passed both actual Tauri cases: `main` invokes the Go helper built for the native-test app and receives `ready` with a matching build identity; the same application command is denied from `unauthorized`, which is outside the `main` capability. The runner confirmed no additional helper process remained after shutdown. This is real native Rust↔Go IPC and permission evidence on Linux, distinct from C2.1's mocked Tauri API tests.

Default and `native-test` Cargo Clippy with warnings denied, and all-target tests, passed (18 tests in each feature configuration). `pnpm check`, coverage, frozen install, and contract regeneration check passed. `pnpm audit --audit-level=low` initially found six advisories in the new WebDriver dependency graph; [decision 0002](../decisions/0002-wdio-transitive-advisory-remediation.md) records the tested transitive overrides. After remediation the npm audit passed with no known vulnerabilities. `cargo audit --file src-tauri/Cargo.lock` still reports the two previously tracked GLib/macro findings and no new finding.

The initial native attempt did not load the WDIO frontend API because Vite injected its test entry after HTML bundling. Moving the test-only entry injection to Vite's pre-transform phase fixed the issue; the final run above passed. WebDriver runtime is still unexecuted on macOS and Windows. Production exclusion evidence is recorded in C2.3. The packaged Debian helper was inspected but not installed/run; C8 retains package-runtime qualification.

### C2.3 production exclusion evidence

`pnpm production:check` runs after the default `pnpm desktop:build` in desktop CI. It verifies the default Cargo feature graph excludes both WDIO plugins, only the main capability is configured, the main capability has no WDIO permissions, and the production renderer/native executable omit WebDriver, mock, test-window, and test-plugin markers. It then launches the default app with `TAURI_WEBDRIVER_PORT` set to a free loopback port, verifies that no listener appears, and terminates the app and its process tree.

Final C2.3 checks on openSUSE Tumbleweed Linux x86_64, Node 26.11.1 and Rust 1.99.0 passed: default `pnpm desktop:build`, `pnpm production:check`, full `pnpm check`, `pnpm test:coverage`, `pnpm contracts:check`, and actionlint 1.7.12. The runtime negative check observed no embedded listener and the default app exited cleanly. The C2.2 native Tauri/Go/permission suite also passed on this Linux host. Production verification has not run on macOS or Windows; those platform rows remain open for C8.

### C3.1 acceptance cases before implementation

Trigger: C2.2 exercised real Tauri IPC and C2.3 passed the Linux production exclusion gate. C3.1 will add only backend storage primitives and tests; it will not expose credential import or a persistent-credential command. Acceptance cases: a fresh database receives schema version 1 and all profile/reference/encrypted-envelope/preference tables in one transaction; a deliberate migration conflict rolls back all newly created tables; a nonsensitive profile and preference survive reopen; a synthetic secret encrypts, persists, and decrypts after reopen using an injected test key; wrong key, altered nonce, altered ciphertext, altered AAD/reference context, unknown envelope version, malformed envelope, and oversize plaintext fail safely; and searches of database, WAL, shared-memory, and journal files find no synthetic plaintext sentinel. Storage errors and key formatting must not reveal values. C3.2 remains responsible for actual OS vaults, locked/unavailable recovery, restart with vault key, session-only choice, and native credential import.

### C3.1 completed evidence

Implemented backend-only schema v1 and envelope v1 in `src-tauri/src/storage/`, with exact dependency pins recorded in [the dependency inventory](../dependencies.md) and the format decision in [decision 0003](../decisions/0003-storage-schema-and-envelope.md). The storage contract is documented in [storage-v1.md](../storage/storage-v1.md). No Tauri command, renderer API, credential import, or persistent credential workflow is connected.

On openSUSE Tumbleweed Linux x86_64 with Rust 1.99.0, Go 1.27.1, Node 24.21.0 and pnpm 12.10.1, `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, `cargo test --locked --all-targets` (31 passed), `RUSTDOCFLAGS='-D warnings' cargo doc --locked --no-deps`, `cargo build --locked`, `pnpm check` (18 renderer/script tests), `pnpm contracts:check`, `pnpm install --frozen-lockfile`, `pnpm desktop:build`, and `pnpm production:check` passed. The storage tests cover schema and transactional migration rollback, concurrent initialization, preference/profile persistence, encrypted reopen and sentinel scans, SQL failure rollback, wrong keys and modified nonce/ciphertext/AAD/version, malformed identities and lengths, oversize rejection, and random-source failure. Production exclusion still passed after the storage module was added. Tool binaries for Go and protoc needed workspace-local copies because `/tmp` is mounted no-exec; they were temporary and are not part of the change.

`cargo audit --file src-tauri/Cargo.lock` reports the same two pre-existing advisories, RUSTSEC-2024-0370 and RUSTSEC-2024-0429; no new Rust advisory was introduced. The frontend build retains its existing >500 kB chunk warning. C3.1 itself did not qualify an OS vault or session-only behavior; C3.2 now verifies KDE Secret Service and memory-only storage, while locked-vault UX, cross-platform runtime checks, and native credential import remain open in C3.3/C8.

### C3.2 acceptance cases

The acceptance boundary is C3.1's encrypted database plus a native key provider and a distinct session-only store. The provider must use only the selected platform vault, generate and persist a random 32-byte key when absent, return the same key after reopen, reject malformed stored key data, redact locked/unavailable errors, and never fall back to plaintext. A real host-vault run must persist and reopen an encrypted synthetic SQLite value, then remove its synthetic vault entry. Session-only storage must retain a bounded secret only in zeroizing process memory, offer no database persistence path, and discard it on removal/drop. Injected/unit tests do not qualify the native provider. C3.3 will connect these modes to import IPC and an accessible user choice.

### C3.2 completed evidence

Added exact target-specific `keyring` 3.6.3 providers with defaults disabled: Linux Secret Service, macOS Keychain, and Windows Credential Manager. The mock provider is not enabled. The key is base64-encoded for UTF-8-only Secret Service compatibility and the transient encoding is zeroized. Provider errors map to static categories. `Database::load_or_create_master_key` serializes first-key creation across processes sharing a database file; a vault failure aborts with no fallback. `SessionOnlyStore` keeps at most 256 values and 64 MiB of secrets in `SecretBox` memory only and has no SQLite handle. The dependency and provider selection are recorded in [the inventory](../dependencies.md) and [decision 0004](../decisions/0004-native-vault-integration.md); no Tauri command or renderer choice UI is connected.

On openSUSE Tumbleweed Linux x86_64, the native KDE Secret Service integration test was explicitly run and passed. It created a uniquely named synthetic vault entry, stored a database value encrypted with that key, closed/reopened SQLite, retrieved the same key from Secret Service, decrypted the synthetic value, and deleted the vault entry. Rust formatting, clippy, and docs passed; the full Rust suite passed 37 tests with the native integration test skipped by default, and the integration test passed separately. `cargo build --locked`, `pnpm desktop:build`, and `pnpm production:check` passed. `cargo audit` reported only the same two previously allowed advisories (RUSTSEC-2024-0370 and RUSTSEC-2024-0429); `cargo tree -i openssl` found no OpenSSL dependency, and the selected `keyring` feature tree contains only `crypto-rust` and `sync-secret-service` (no mock). Only `x86_64-unknown-linux-gnu` is installed here. macOS Keychain and Windows Credential Manager were neither cross-compiled nor run; those target checks remain open for C8. The Linux test exercises KDE Secret Service only, not GNOME Keyring or every desktop implementation.

### C3.3 acceptance cases

The renderer may invoke only typed storage and appearance commands granted to the main window. `import_kubeconfig` takes no renderer arguments and opens a native single-file picker; the selected path and file contents stay in Rust. A backend import gate allows one dialog/file buffer at a time. Rust rejects non-files, files over 4 MiB, malformed/unsupported kubeconfigs, exec and auth-provider configurations, and external certificate/key file references before persistence. It returns only a bounded context label and the active storage mode. Persistent imports are encrypted in one reference/value transaction under the vault key; import failure creates no credential reference. If the vault is unavailable, the UI offers an explicit session-only choice; session imports stay solely in bounded memory and vanish when that owner is dropped or the app exits. A persistent import request while storage is unavailable fails without fallback. Appearance supports system/light/dark independently from comfortable/compact density, persists through SQLite, and changes must not hide or alter the session-only status. The UI must label controls, associate errors with the import action, preserve keyboard focus, and expose no secret values or paths. Runtime DTO parsing rejects malformed command responses; the browser mock remains explicit and test-only.

### C3.3 completed evidence

Added the no-argument `import_kubeconfig` command, which invokes the native single-file picker, reads at most 4 MiB in Rust, validates one bounded kubeconfig, rejects exec/auth-provider and external file credentials, enforces HTTPS, and returns only the bounded current-context label and storage mode. Control and bidi characters are excluded from context labels, and the current-context name is not stored in plaintext profile metadata. Persistent imports commit a generic profile label, reference, and full-source AEAD envelope together. Session-only imports retain the source only in the bounded zeroizing memory store. When a vault retry succeeds while session credentials remain, the runtime keeps those values in memory and reports `persistent_with_session_only`; new imports are encrypted. Startup and preference reads do not access or create an OS-vault key; the first import or explicit retry performs key initialization under the cross-process SQLite reservation.

Appearance commands persist system/light/dark and comfortable/compact settings atomically. The renderer runtime-validates every DTO, displays unavailable/session-only/mixed state, associates errors with the relevant controls, and disables storage actions in an ordinary browser. The main capability grants only the named storage/settings commands; the unauthorized test window has none. `tauri-plugin-dialog` renderer commands and generic filesystem access are not granted.

On openSUSE Tumbleweed Linux x86_64 with Rust 1.99.0, Go 1.27.1, Node 24.21.0, and pnpm 12.10.1, `cargo fmt --check`, default Clippy with warnings denied, all-target Rust tests (51 passed, 1 vault integration test intentionally ignored by default), rustdoc with warnings denied, `cargo build --locked`, and the `native-test` feature check passed. `pnpm check` passed (25 renderer/script tests), `pnpm contracts:check`, frozen install, and `pnpm audit --audit-level=low` passed. `pnpm desktop:build` and `pnpm production:check` passed; production runtime had no driver listener. The actual Tauri/WebDriver suite passed 8 cases: helper handshake, allowed/denied commands, rendered session-only state, persisted settings commands, native-test vault isolation, and denial of storage/import from an unauthorized webview. The helper process count returned to baseline.

The real GTK native file picker was manually exercised under X11/Xvfb in the `native-test` build using `tests/fixtures/kubeconfig-valid.yaml`. The Rust importer returned only context `native-import-synthetic` and `session_only`; the UI showed session-only status and no token or selected path. This test used the isolated in-memory test database/session store. The persistent import transaction and encrypted source were covered separately by Rust tests; an end-to-end Tauri import using the user's native vault was intentionally not run because it would modify the user's vault. The separate C3.2 integration test used a uniquely named synthetic vault entry and passed on KDE Secret Service.

`cargo audit` still reports only the two pre-existing allowed findings, RUSTSEC-2024-0370 and RUSTSEC-2024-0429. Trivy 0.74.0 found no vulnerabilities in the Go, pnpm, or Cargo lockfiles (with the existing GLib advisory exception). The frontend build retains the existing >500 kB chunk warning. Only Linux x86_64 was built/run here; macOS Keychain, Windows Credential Manager, Windows ACL behavior, and the cross-platform dialog matrix remain open for C8.

- **FND-002 / C1:** implement and check in the researched protocol/generator source and outputs; test malformed, oversized, incompatible, unknown, and mismatched messages; run actual helper supervision and packaged handshake.
- **FND-003 / C3:** C3.1–C3.3 storage, native Linux vault, session-only behavior, kubeconfig import, and appearance settings are implemented and verified on Linux. macOS Keychain, Windows Credential Manager/ACL, and cross-platform native dialog runtime qualification remain open for C8.
- **FND-004 / C4–C5:** the allowlisted disposable Talos fixture now provisions, verifies, and destroys cleanly on Linux with the C4.3 live evidence; the `os:reader` denial, reconnect/resync, packaged-installer cases, and the C5 Kubernetes/Tokio/TLS pin selection remain open. No owner cluster may be used implicitly.
- **FND-005 / C2/C6:** complete typed runtime IPC validation, true native driver suite, production exclusion, and packaged CSP/worker validation.
- **FND-006 / C8/C9:** qualify Linux package rendering and all declared OS runtimes, then measure performance and derive numeric limits. Existing openSUSE AppImage render failure remains open.
- **FND-007 / C7:** both recorded Rust advisories carry a verified applicability decision with linked evidence and an enforcing gate ([decision 0006](../decisions/0006-gtk3-advisory-applicability.md)); the two Go advisories the new `pnpm audit:go` scan found were fixed by version bumps rather than excluded. The dependency/license inventory is generated and drift-gated, with redistributed notices recorded. What remains is a real exact-revision CodeQL/Trivy run and the C8 per-platform scans.
- **FND-008 / C0–C9:** configured automation is not execution evidence. Record final exact-revision CodeQL/Trivy and platform runner outcomes when available.

### C4 acceptance cases

C4 extends only the private Rust-to-Go helper protocol and backend application service. A Rust-owned authenticated Talos session sends the synthetic talosconfig over stdin framing; no command argument, environment variable, renderer payload, or log contains it. API endpoints, node targets, and Kubernetes API endpoint remain separate identities. The Go helper must use upstream `github.com/siderolabs/talos/pkg/machinery` APIs pinned to Talos 1.14.1, perform one authenticated `Version` read, and watch the nonsensitive COSI `MachineStatus` resource. The Rust projection contains only Talos version, resource stage, ready state, and bounded lifecycle status; it omits addresses, certificates, config, and raw resource bodies.

The only registered fixture is allowlisted in [talos-c4-disposable.md](fixtures/talos-c4-disposable.md) before provisioning. It is scoped to a local three-control-plane/one-worker Talos 1.14.1 QEMU cluster running Kubernetes 1.36.5, with a unique cluster name, isolated talosctl state and config paths, endpoint and node allowlists, synthetic credentials, and an exact destroy command. The first attempts failed before any API call because guests received no DHCP offer and never synced time; the diagnosis, the owner-approved host remediation, the issued identities, the harness command, and the restoration checklist are recorded in that allowlist, and the successful run is evidenced in C4.3 below. Tests must never select or mutate other Docker, libvirt, Talos, or Kubernetes clusters.

Acceptance requires a real packaged-helper handshake to the fixture, authenticated version read, initial `MachineStatus` snapshot plus bounded COSI stream, valid TLS verification, endpoint failover, invalid target/RBAC/TLS/unavailable-node failures, rejected sensitive resource subscription, slow-consumer queue bound, stream cancellation, helper exit, reconnect/deadline handling, and resource counts returning to baseline. Frontend-facing tests validate only bounded DTOs; helper IPC tests use deterministic faults for each failure class. C4 is not complete if only mocks or `talosctl` CLI output pass.

The C0 research packets introduced no Talos or Kubernetes endpoint, credentials, or vault. C1 adds the private helper protocol, supervision, bundling, and safe status command; no cluster API or credential operation is exposed yet.

### C4.2 completed increment evidence

Trigger: C4.1 fixture provisioning is blocked on the host QEMU bridge/DHCP path, so this increment completes every C4 boundary that does not require cluster network access. Base revision `6a7e4c4` plus the recorded working tree.

Backend: `src-tauri/src/talos.rs` parses a selected talosconfig in Rust only, keeps the source in a bounded zeroizing in-process session store (4 sessions, 64 KiB config, 8 endpoints, 64 nodes), requires the current context to select itself, keeps API endpoints and node targets as distinct identities, restricts endpoints to literal IPv4/IPv6 with port, rejects `auth`, `proxy-url`, and any `ca`/`crt`/`key` value that is not non-empty inline standard base64, and never returns credentials, paths, or file contents in a DTO. `helper::supervisor::talos_probe` sends config bytes only over the helper stdin frame, validates handshake identity plus the `talos_probe` capability, requires strict sequence ordering for the probe response and each status event, caps delivery at 256 events, and cancels the helper subscription when the renderer channel closes. `HelperService` owns the single active subscription keyed by backend session identity, so cancellation and session close act only on the owning session, and `shutdown` cancels and reaps the child. On the Go side, the probe runs one authenticated `Version` read then watches projected `MachineStatus` snapshots with a 16-item bounded queue and backpressure, honors cancel-by-subscription, clears its config copy, and maps x509/certificate-authority/TLS-handshake failures to certificate-invalid, permission-denied, unauthorized, unavailable, and invalid-input classes without echoing upstream text.

Renderer: `TalosProbePanel` plus `import_talosconfig`/`start_talos_probe`/`stop_talos_probe`/`close_talos_session` give a bounded feasibility view with explicit connecting, healthy, stale, unauthorized, certificate-invalid, unavailable, and unsupported states. Events arrive on a Tauri channel and every message is runtime-validated before it reaches state; sequence gaps, wrong session identity, non-decimal or over-cap sequences, and inconsistent `connecting` projections fail as contract errors that also request scoped cancellation. The view shows only the context label, endpoint list, version, stage, and ready/deletion flags, and cancels plus closes its own session on unmount. Commands are granted only to `main`; the unauthorized window gets none.

Review fixes applied to this increment before acceptance:

- Cancellation and session close were process-global; they are now keyed to the requesting backend session, matching the "cancellation is scoped to a known owned request/subscription" rule. Regression coverage: `cancellation_releases_only_the_subscription_owning_session` plus native cases asserting an unimported session releases no helper work.
- A helper that never acknowledged cancellation could pin the probe gate and the supervised child indefinitely. The stream read after `TALOS_CANCEL_REQUEST` is now bounded by `TALOS_CANCEL_ACK_DEADLINE` (2 seconds) and fails to the terminate-and-reap path; covered by `cancellation_acknowledgement_wait_is_bounded`.
- talosconfig accepted `ca`/`crt`/`key` as opaque values, so a file-path reference persisted as a session credential. The parser now requires non-empty inline base64 (the form the pinned machinery client decodes) and rejects path/empty material; covered by `rejects_file_path_and_empty_mtls_material`.
- A healthy stream that ended with an event gap kept showing the last healthy values. The panel now tracks whether the subscription ever reached healthy and marks that projection stale when the stream ends or fails after a healthy read.
- A helper that lacks the `talos_probe` capability, reports a mismatched build identity, or rejects the handshake was projected as retryable `TALOS_PROBE_FAILED`, so the view showed a retryable stale stream instead of the plan's disabled/unsupported connection. Those classes now project non-retryable `TALOS_UNSUPPORTED`; covered by `an_incapable_helper_disables_the_talos_connection` and a renderer case that displays `Talos: unsupported`.
- The native suite still asserted the pre-C4 capability list and had no Talos coverage; it now expects `["status", "talos_probe"]` and adds allowed/denied coverage for the Talos commands.
- `pnpm production:check` still carried the pre-C4 permission allowlist, so the new commands would have silently widened production scope; the expected list now names them explicitly.
- The C0.1 `pnpm test:e2e` row is stale: `tests/e2e/shell.spec.ts` targeted the pre-C3.3 switch controls and could not pass against the current radio-group shell. The flow now asserts the real browser behavior (radio groups disabled without transport, disabled import actions, native-only storage text, axe at 1280/1024/390 widths) and passes.
- `src-tauri/.local-tools/` (fixture-downloaded `talosctl`) is now gitignored so a bulk `git add` cannot commit a 118 MiB external binary into the product tree.
- [Application IPC](../protocol/application-ipc.md) documented only `get_helper_status`; it now records every current command, camelCase/snake_case binding, null-versus-absent results, the channel contract, and validation/error rules. [helper-v1.md](../protocol/helper-v1.md) records the cancellation acknowledgement bound and session-scoped ownership.

Commands on this final revision, openSUSE Tumbleweed Linux x86_64 with Rust 1.99.0, Go 1.27.1, Node 24.21.0, pnpm 12.10.1, and the pinned protoc 33.4: `pnpm install --frozen-lockfile`, `pnpm check` (47 renderer/script tests, Oxfmt, type-aware Oxlint, Vite production build), `pnpm test:coverage` (47 tests; 88.66% statements across the declared scope, `transport.ts` 95.58%, `validation.ts` 100%), `pnpm contracts:check`, `pnpm test:e2e`, `pnpm icons:check`, `cargo fmt --check`, default and `native-test` Clippy with `-D warnings`, `cargo test --locked --all-targets` (62 passed, 1 vault test ignored), rustdoc with warnings denied, `cargo build --locked`, the Go format/vet/test/race/`go mod verify`/build gates, `pnpm desktop:build`, `pnpm production:check`, and `pnpm test:native`. The native suite passed 11 cases on WebKitGTK 605.1.15: real Rust-to-Go handshake with the `talos_probe` capability, allowed/denied storage and Talos commands, main-window scoped session controls, native-test vault isolation, and the helper process count returning to baseline after shutdown. `git diff --check` passed.

`pnpm test:native` and `pnpm desktop:build` both write `src-tauri/target/release/talos-pilot`, so `pnpm production:check` must follow a default-feature `pnpm desktop:build`; after `pnpm test:native` it correctly failed on the WebDriver markers left in that shared artifact until the default release binary was rebuilt. The gates were re-run in that order for this record.

Not established by the pre-fixture increment: real Talos API contact. That gap closed in the C4.3 run below; the packaged-installer helper startup, the macOS/Windows fixture matrix, denied-role (`os:reader`) faults, and reconnect/resync behavior remain open. The 683.33 kB minified / 221.14 kB gzip initial chunk warning persists.

### C4.3 real fixture evidence

Trigger: the owner approved the dedicated fixture zone described in
[talos-c4-disposable.md](fixtures/talos-c4-disposable.md) after the read-only
diagnosis identified `firewalld`'s `public` default zone (no `dhcp` service) plus
Docker's legacy `-P FORWARD DROP` as the reason guests never received a DHCP
offer and never synced time.

Provisioned fixture: `talosctl cluster create qemu` v1.14.1 with
`--name talos-pilot-c4-20261009 --cidr 10.79.0.0/24 --talos-version v1.14.1
--kubernetes-version v1.36.5 --controlplanes 3 --workers 1 --presets iso --state
/tmp/tpc4/state`. All four guests obtained leases, installed Talos, and reached
`MachineStatus stage: running`; `cluster create` still timed out inside its own
bootstrap window, so bootstrap was completed against `10.79.0.2` and the cluster
was confirmed with `get members` listing three control planes and the worker.
Issued identities, the applied host remediation, and the restoration checklist are
recorded in the fixture allowlist.

Harness: `pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json
--talosconfig /tmp/tpc4/talosconfig` rebuilds the packaged helper through
`pnpm helper:build`, verifies the manifest identity, version pins, and literal
endpoint/node allowlists, rejects a credential file inside the repository, and
runs `src-tauri/tests/talos_fixture.rs` with file references only. Result:
`3 passed; 0 failed` in 24.17s, with the harness printing
`fixture read: Talos v1.14.1, stage "running", ready true`,
`worker node 10.79.0.5 read: stage "running", ready true`, and
`failover read with a dead leading endpoint: stage "running", ready true`.

Proven against the live cluster through the production path (`TalosSessionStore`
→ `HelperService` → packaged helper → official Talos client):

- authenticated `Version` read over the validated endpoint allowlist, returning `v1.14.1`;
- node-pinned `MachineStatus` projection of stage/ready only, with strictly
  ordered sequences from the probe response onward;
- session-scoped cancellation of a live COSI stream, acknowledged inside the
  two-second bound, followed by helper shutdown and reaping;
- endpoint/node identity separation: the worker `10.79.0.5` is a selectable target
  while not being an API endpoint;
- endpoint failover: a read still succeeds when an unreachable allowlisted
  address leads the endpoint list;
- fail-closed validation: a node absent from the imported context and an unknown
  session are rejected before any helper work;
- TLS verification: an unrelated but structurally valid authority yields
  non-retryable `TALOS_CERTIFICATE_INVALID`, never a trusted connection;
- unreachable target: retryable `TALOS_UNAVAILABLE` rather than a hang.

Real-fixture run also found and fixed a genuine defect. The original adapter
pinned the stream by adding `client.WithNodes` to the COSI watch, which Talos
rejects — `one-2-many proxying is not supported for method
/cosi.resource.State/Watch` — for both by-kind and by-resource watches, so every
fixture probe failed with `TALOS_PROBE_FAILED` and only real-cluster testing could
have shown it. The adapter now keeps a failover connection for the read and a
second connection pinned to the selected node for the stream, recorded in
[decision 0007](../decisions/0007-pin-talos-streams-to-the-node-api.md) and in
[helper-v1.md](../protocol/helper-v1.md); the offline helper tests were updated
with the new session shape, including node-target rejection with config clearing.
`helper/go.mod` now lists `google.golang.org/grpc` as the direct requirement it
already was, because `go mod tidy` reflects the adapter's `codes`/`status` usage.

Checks re-run on the final revision after the adapter change: Go
`gofmt`/`vet`/`test`/`test -race`/`mod verify`/`build`; `cargo fmt --check`;
default and `native-test` Clippy with `-D warnings`; `cargo test --locked
--all-targets` (62 passed, 1 vault test ignored, 3 fixture tests ignored by
default); rustdoc with warnings denied; `pnpm check` (55 tests, production
build); `pnpm test:coverage` (90.19% statements); `pnpm contracts:check`;
`pnpm test:e2e`; `pnpm icons:check`; `pnpm desktop:build` then
`pnpm production:check` ("Production artifacts exclude WebDriver, and runtime
exposes no driver listener"); `pnpm advisories:check`; and `pnpm test:native`,
which passed 11 cases including the real Rust-to-Go handshake with the
`talos_probe` capability and returned the helper process count to baseline after
shutdown.

Still open for C4: an `os:reader`-role denial case (the fixture issues an admin
config; the adapter has no resource selector, so a sensitive subscription is not
expressible in protocol v1), reconnect/resync after a mid-stream gap, live
multi-event stream volume (the stable fixture projected one event inside the
12-second settle window, so ordering is asserted on whatever arrives and is
additionally exercised by `helper/testdata/probehelper`, which emits several
sequenced events over real frames), and packaged-installer helper startup, which
belongs to C8 together with the macOS/Windows matrix. After the run the fixture
was destroyed and the host verified back to its pre-attempt state: no `10.79.0`
or bridge rules in `filter-FORWARD` or `nat/POSTROUTING`, no
`talos-pilot-c4` zone, `--get-zones`/`--get-active-zones`/`--get-default-zone`
matching the recorded baseline, no QEMU process or `talos*` bridge, and no
synthetic credential file left behind.

C4 source verification pinned `github.com/siderolabs/talos/pkg/machinery` v1.14.1 and `github.com/cosi-project/runtime` v1.16.3. In the pinned Talos source, `client.New`, `WithConfig`, `WithEndpoints`, `WithNodes`, and `Client.Version` implement the authenticated read; `safe.StateWatchKind` watches `resources/runtime.MachineStatusType` with bootstrap contents. A Go adapter validates IP endpoint/node identities, clears the input config byte buffer, and projects only version/stage/ready/deleted fields. The private protocol now carries config only over stdin, emits a projected version/snapshot and sequenced status events, and supports explicit cancellation plus EOF cleanup. Its injected fake-client test confirms config clearing/redaction and cancellation ordering. `go test -race ./...`, `go vet ./...`, `go mod verify`, and `go build ./...` pass locally on Go 1.27.1. Rust transport/session ownership and the renderer projection landed in the increment above; the live Talos API calls, TLS and failover faults, and cancellation ran in the C4.3 fixture run below, and only the `os:reader` denial, reconnect/resync, and packaged-installer cases remain.

### C7.1 completed evidence

Trigger: the plan allows advisory investigation to proceed while a prerequisite packet is blocked, and C0.1 had left FND-007 open. Investigation may begin after C0 when a prerequisite is blocked, which is exactly the C4 fixture state.

Scan on 2026-10-09 with cargo-audit 0.22.2 against advisory database `550efd3d587a29b2e2c2b21b17a440da4fede999` (1,295 advisories, 569 locked Rust dependencies): no vulnerabilities, exactly the two recorded informational findings. `pnpm audit --audit-level=low` still reports no known frontend vulnerabilities, so the C0.1 finding list did not grow.

Path and reachability analysis replaced the earlier "not a reachability claim" posture with evidence:

- RUSTSEC-2024-0370 (`proc-macro-error` 1.0.4). `cargo tree -i proc-macro-error@1.0.4 -e normal` lists only `glib-macros v0.18.5 (proc-macro)` and `gtk3-macros v0.18.2 (proc-macro)` as direct dependents, so it contributes compile-time code generation only; the advisory has no patched release, and upstream `glib-macros` 0.21.5 depends on `heck`/`proc-macro-crate`/`proc-macro2`/`quote`/`syn 2` instead, so the finding clears when the binding series moves. Its `syn 1.0.109` duplicate is likewise build-time only.
- RUSTSEC-2024-0429 (`glib` 0.18.5). The advisory's affected set is only `glib::VariantStrIter::{next, nth, last, next_back, nth_back}` for `>=0.15.0,<0.20.0`, patched at `>=0.20.0`. Tauri 2.12.1 requires `gtk = "0.18"` (`v3_24`) and `gtk 0.18.2` requires `glib = "0.18"`, whose last index release is 0.18.5, so no compatible in-series upgrade exists; a newer GLib line is not a drop-in for the GTK3 tree. `nm -C src-tauri/target/release/talos-pilot` on the unstripped release artifact yields 37,865 demangled symbols, including 345 `glib::` entries and zero `VariantStrIter` entries, confirming the unsound API is never called or linked.

Recorded in [decision 0006](../decisions/0006-gtk3-advisory-applicability.md) with the rejected alternatives (patched-for `glib` 0.18.5, forced `glib` 0.20/0.21, dropping the Linux target, scanner suppression) and the 2026-11-30 review date that matches the existing single-ID, path-scoped Trivy exception, whose statement now cites the gate.

Enforcement landed with the decision rather than as prose: `pnpm advisories:check` ([`scripts/advisory-baseline.ts`](../../scripts/advisory-baseline.ts) with pure logic in [`scripts/lib/advisories.ts`](../../scripts/lib/advisories.ts)) compares the scanner report, each recorded advisory's reverse dependency path, and the linked executable against the record, and is a step in the Linux desktop CI job. It passed on this revision; a deliberate probe that listed a genuinely linked symbol (`glib::main_context_channel::Channel`) made the same command exit 1, confirming the gate is not an always-success script. A stripped binary, missing release artifact, or missing `nm` is an error, and on non-Linux hosts the script prints that its executable scan is unexecuted rather than passing. Unit coverage is 8 cases: report parsing across both scanner sections, malformed shapes, the accepted baseline, an unrecorded finding, crate/version/kind drift, a vanished record, proc-macro versus runtime dependents, and linked affected symbols.

Commands run on this revision: `pnpm format:check`, `pnpm lint`, `pnpm test:run` (55 renderer/script tests), `pnpm build`, `pnpm advisories:check`, `cargo audit --file src-tauri/Cargo.lock`, and the pinned actionlint 1.7.12 over the changed workflow. Executed on Linux only; the advisory scan of a linked executable is defined for the ELF artifact, so macOS and Windows inherit C8.

Still open in C7: a real exact-revision CodeQL/Trivy run when GitHub integration is available. FND-007 otherwise closed with C7.2 below: the advisories have enforcing gates, the inventory is generated, and the Go findings were remediated rather than excluded.

### C7.2 completed evidence

Trigger: C7.1 left the inventory, notices, and Go scan open, and the plan requires both a pinned Go vulnerability scan and a generated dependency inventory once helper dependencies land.

Inventory generation moved from hand-assembled JSON to `pnpm inventory:generate` with `pnpm inventory:check` as the CI drift gate. Schema version 2 records the four toolchain pins and the SHA-256 of all three lockfiles, then 503 npm packages, 548 registry Cargo packages (workspace members excluded as first-party), and 143 Go modules, with the 35 modules that actually contribute packages to the helper binary marked `linked`. Go license naming only claims an identifier when exactly one canonical marker set matches, so all 35 linked modules resolved and graph-only modules with no extracted local source are reported `unobserved` rather than guessed. Pure logic is in `scripts/lib/inventory.ts` with 7 unit cases covering marker ambiguity, string-brace JSON splitting, ordering, malformed scanner input, workspace exclusion, and unobserved modules.

Notices derived from that inventory: `google.golang.org/grpc`, `go.yaml.in/yaml/v3`, `go.yaml.in/yaml/v4`, and `gopkg.in/yaml.v3` carry NOTICE files that must ship with the packaged helper; MPL-2.0 covers 20 entries including three linked Go modules; the single npm package with no declared license, `css-value@0.0.1`, arrives only through the WebdriverIO development chain that the production-exclusion gate keeps out of shipped artifacts. Recorded in [dependency research](../dependencies.md).

The new pinned Go scan (`golang.org/x/vuln/cmd/govulncheck@v1.8.0` installed into a private `GOBIN`, `pnpm audit:go`, wired into the desktop job) found two real advisories on its first run: GO-2026-6617 (`x/net` HTTP/2 HPACK encoder race, fixed in v0.60.0 and Go 1.27.2) and GO-2026-6613 (HTTP/1 desynchronization after a 2xx CONNECT, fixed in Go 1.27.2), both reaching the helper through the gRPC transport under the Talos client. Neither was suppressed: `golang.org/x/net` moved v0.58.0 → v0.60.0 (with `x/crypto` → v0.57.0, `x/sys` → v0.48.0, and `x/text` → v0.42.0), `helper/go.mod` moved the Go directive 1.27.1 → 1.27.2, and the rescan reports `No vulnerabilities found.` `go mod verify`, vet, tests, race tests, and the build pass under the auto-selected Go 1.27.2 toolchain, and CI's `setup-go` reads the same pin from `helper/go.mod`.

Commands on this revision: `pnpm check` (62 renderer/script tests), `pnpm test:coverage`, `pnpm contracts:check`, `pnpm inventory:generate`/`inventory:check`, `pnpm icons:check`, `pnpm audit:go`, `pnpm advisories:check`, `pnpm audit --audit-level=low`, `cargo audit --file src-tauri/Cargo.lock`, the Go gate set, `cargo fmt --check`, default and `native-test` Clippy with `-D warnings`, `cargo test --locked --all-targets`, rustdoc with warnings denied, `pnpm desktop:build`, `pnpm production:check`, `pnpm test:native`, the pinned actionlint 1.7.12 over the changed workflow, and `git diff --check`. macOS and Windows remain unexecuted; the inventory's `unobserved` count is a local-cache statement, and a clean-checkout run on another machine will show a different split until the module cache is warm.
