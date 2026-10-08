# Milestone 1 verification ledger

Date opened: 2026-10-08. Base revision: `2926f4c58312a415fb430eca2c014e500f436d62`.

This is the active evidence record for [milestone 1](../plans/milestone-1-flash.md). It distinguishes current checks from historical evidence in [initialization](initialization.md) and [automation](automation.md). A checkpoint remains open until its observable acceptance criteria and required evidence pass on the final changed revision.

## Checkpoint status and acceptance criteria

| Checkpoint | Status | Acceptance criteria |
| --- | --- | --- |
| C0.1 baseline and ledger | Complete | Reproduce frozen install, renderer, coverage, browser, icon, Rust, advisory, workflow, and native release-build checks; record actual command results, host/tool versions, failures, and next actions. |
| C0.2 dependency/harness research | Complete | Pin compatible Go/Talos, Rust-to-TypeScript and Protobuf generation/runtime tools, and Tauri native harness packages from primary sources; run minimal compatibility probes and record limits. |
| C1 helper and contracts | Pending | Deterministically generate documented Rust/Go/TypeScript protocol and DTO outputs; reject malformed, oversized, unknown, and incompatible frames; exercise actual packaged Rust↔Go handshake, bounded supervision, failure cleanup, and safe status IPC. |
| C2 native IPC harness | Pending | Runtime-validate renderer DTOs; use an explicit browser mock; run Tauri/WebdriverIO allowed and denied IPC flows; demonstrate cleanup and prove production excludes mock/driver/test commands. |
| C3 encrypted storage | Pending | Verify schema/migration atomicity, AEAD integrity and redaction, actual OS-vault success/failure, encrypted restart, explicit session-only behavior, and native credential import with exec-auth rejection. |
| C4 Talos probe | Pending | On an allowlisted disposable Talos 1.14 fixture, demonstrate authenticated nonsensitive read and bounded COSI stream, TLS/authorization failures, cancellation/reconnect, and native shutdown cleanup. |
| C5 Kubernetes probe | Pending | On disposable Kubernetes 1.36, demonstrate scoped paginated Rust reads and watch/relist behavior with RBAC/TLS/scope faults and cleanup; run affected read/watch cases on 1.35 and 1.37. |
| C6 UI, workers, and CSP | Pending | Qualify system/light/dark and density behavior, accessible feasibility states, lazy offline editor workers, bounded terminal/chart wrappers and disposal, restrictive CSP, and packaged asset behavior. |
| C7 advisories and inventory | Pending | Resolve or record applicability for each advisory without silent exclusions; generate/review dependency inventory and notices; preserve exact-revision security automation. |
| C8 package/platform runtime | Pending | Qualify clean install/launch/shutdown/uninstall and helper/vault/assets on Linux, macOS Intel/Apple Silicon, and Windows 11; inspect production exclusion and signing/integrity feasibility. |
| C9 budgets and review | Pending | Measure declared synthetic and native workloads on recorded hardware, derive and enforce budgets, complete acceptance matrix and separate final review, and hand off with all failed/unrun evidence visible. |

## C0.1 baseline evidence

Environment: openSUSE Tumbleweed, Linux x86_64, Node/pnpm from the repository-pinned setup, installed Rust 1.99.0 via `/home/kiss/.cargo/bin`, Go 1.27.1 installed to `/tmp/go`. The default shell `PATH` resolves `/usr/bin/rustc` 1.98.1 before the pinned Cargo installation; Rust commands must prepend `/home/kiss/.cargo/bin` on this host.

| Command | Result | Evidence and practical limit |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | Pass | pnpm 12.10.1; lockfile unchanged. |
| `pnpm check` | Pass | Oxfmt, type-aware Oxlint, 10 renderer/script tests, Vite production build. Build retains the 580.82 kB minified / 188.52 kB gzip initial JS chunk warning. |
| `pnpm test:coverage` | Pass | 10 tests; 94.73% statements, 93.18% branches, 100% functions, 94.44% lines for the current declared scope. This shell/script coverage does not demonstrate cluster behavior. |
| `pnpm test:e2e` | Pass | One Chromium shell appearance/accessibility/narrow-width flow; it does not establish native IPC. |
| `pnpm icons:check` | Pass | Derived icons match the committed source and conversion pipeline. |
| `actionlint .github/workflows/*.yml` | Pass | Ran the exact CI-pinned actionlint 1.7.12 archive after verifying SHA-256 `8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8`. |
| Rust format, Clippy, tests, rustdoc, build | Pass | `cargo fmt`, locked Clippy with `-D warnings`, locked all-target tests, rustdoc with warnings denied, and locked build all passed using Rust 1.99.0. There are currently zero Rust application tests because the crate only contains the minimal Tauri binary wrapper. |
| `PATH=/home/kiss/.cargo/bin:$PATH pnpm desktop:build` | Pass | Built the Linux x86_64 release executable with `--no-bundle`. This is not an installer or clean-target runtime qualification. The first attempt inherited system Rust 1.98.1 and failed the manifest minimum; the pinned-path rerun passed. |
| `pnpm audit --audit-level=low` | Pass | No known frontend vulnerabilities. |
| `cargo audit --file src-tauri/Cargo.lock` | Pass with findings | cargo-audit 0.22.2 exited 0 and reported RUSTSEC-2024-0370 (`proc-macro-error` unmaintained) and RUSTSEC-2024-0429 (`glib` iterator unsoundness). This is an audit command pass, not advisory resolution; both findings remain open under FND-007. |
| Trivy 0.74.0 | Pass with documented exception | Downloaded the CI-pinned archive and verified SHA-256; ran the same vulnerability/secret/misconfiguration scan with generated build directories skipped. No new findings; the existing `.trivyignore.yaml` GLib entry suppressed RUSTSEC-2024-0429. |

Historical Linux package/runtime failures, advisory details, remote CI qualification limits, and earlier checks remain in [automation evidence](automation.md); they have not been promoted to current passes by this baseline run.

## C0.2 dependency and harness research

Primary-source checks on 2026-10-08 find [Talos `v1.14.1`](https://github.com/siderolabs/talos/releases/tag/v1.14.1) as the current stable 1.14 release. Its root and [`pkg/machinery` modules](https://raw.githubusercontent.com/siderolabs/talos/v1.14.1/pkg/machinery/go.mod) declare Go `1.26.5`, and its release notes state it was built with Go `1.26.8`. The [Go release history](https://go.dev/doc/devel/release) lists `1.27.1` (released 2026-09-01) as the latest 1.27 patch; `1.27.2` is not listed there. Go 1.27.1 is installed in `/tmp` and an isolated module successfully built/tests imported package `github.com/siderolabs/talos/pkg/machinery/client` at v1.14.1. This is a source compatibility probe only, not a helper implementation or cross-target build.

Tauri's [official WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/) recommends `@wdio/tauri-service` with its embedded provider on Windows, Linux, and macOS; its external provider is Linux/Windows only. The npm registry currently provides `@wdio/tauri-service` and `@wdio/tauri-plugin` v1.5.0 (MIT); crates.io provides `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver` v1.5.0 (MIT/Apache-2.0 and MIT respectively). An isolated Rust 1.99/Tauri 2.12.1 compile probe with both v1.5.0 plugins passed. It does not demonstrate that a driver listener is excluded from production; C2 still requires a test-only build and runtime/artifact checks.

The exact pins and generation paths are recorded in [decision 0001](../decisions/0001-foundation-generators-and-native-harness.md). A temporary cross-language Protobuf fixture round-tripped `u64::MAX` and bytes from Rust `prost` into generated Go successfully. A separate Rust Serde/`ts-rs` probe confirmed tagged-enum serialization and string-encoded sequence declarations. C1 still owns schema-specific unknown-field policy, committed output generation, drift detection, and malformed wire tests.

## Open findings and next packet

- **FND-002 / C1:** implement and check in the researched protocol/generator source and outputs; test malformed, oversized, incompatible, unknown, and mismatched messages; run actual helper supervision and packaged handshake.
- **FND-003 / C3:** determine maintained vault, AEAD, SQLite, and secret-memory dependencies; verify each OS vault with actual platform behavior before persistent credentials are exposed.
- **FND-004 / C4–C5:** choose compatible Kubernetes/Tokio/TLS pins and provision an allowlisted disposable Talos fixture. No owner cluster may be used implicitly.
- **FND-005 / C2/C6:** complete typed runtime IPC validation, true native driver suite, production exclusion, and packaged CSP/worker validation.
- **FND-006 / C8/C9:** qualify Linux package rendering and all declared OS runtimes, then measure performance and derive numeric limits. Existing openSUSE AppImage render failure remains open.
- **FND-007 / C7:** investigate current `cargo audit` and Trivy results, the GLib unsoundness and proc-macro maintenance warnings; no silent exception or reachability claim.
- **FND-008 / C0–C9:** configured automation is not execution evidence. Record final exact-revision CodeQL/Trivy and platform runner outcomes when available.

No Talos or Kubernetes endpoint, credentials, native command, helper, vault, or new application behavior is introduced by these research packets.
