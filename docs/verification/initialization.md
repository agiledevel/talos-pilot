# FND-001: project initialization

Date: 2026-10-08. Milestone 1 is in progress; this is its first increment.

## Intended behavior and acceptance criteria

Starting the renderer shows an honest empty cluster view. Operators can change light/dark appearance and compact density independently with mouse or keyboard. Preferences are session-only. No cluster transport, credential input, mutation, or native application command is introduced.

Acceptance: install from committed exact pins/lockfiles; format and strict lint/type checks pass; keyboard preferences pass renderer tests; light/dark browser states pass accessibility checks; production frontend builds; native host builds with a restrictive capability/CSP configuration; local commands are enforced in CI. Native/platform checks that cannot be demonstrated remain unverified, and the complete milestone is not declared complete.

## Commands and evidence

Environment: openSUSE Tumbleweed 20261007, Linux x86_64. Node 26.11.1, pnpm 12.10.1, Rust 1.99.0. Node/Rust were installed in task-specific temporary directories; the repository pins support normal installations. GTK3/WebKitGTK 4.1/DBus development packages were installed to enable native compilation. Playwright downloaded its Ubuntu 24.04 fallback Chromium build on this distribution.

Frontend commands:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm exec playwright install chromium
pnpm test:e2e
pnpm audit
pnpm licenses list --json
```

Rust commands:

```sh
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps
cargo build --manifest-path src-tauri/Cargo.toml --locked
pnpm desktop:build
cargo install cargo-audit --version 0.22.2 --locked
cargo audit --file src-tauri/Cargo.lock
```

Executed results: frozen pnpm installation, `pnpm check`, browser accessibility/resize flow, coverage collection, Rust formatting, Clippy, Rust test target build (zero backend tests at this stage), rustdoc, locked debug build, and Tauri release executable build all passed. The browser flow covers dark/compact and narrow/light states; the unit test covers independent keyboard controls. The first browser run caught insufficient empty-state text contrast; a shared theme token correction was applied and the final run passed. `pnpm icons:check` verifies retained PNG/ICO generation.

Vite reports a 580.82 kB minified initial JS chunk (188.52 kB gzip), above its default warning threshold. No threshold was increased; startup/performance measurement and future feature code splitting remain FND-006 work. The shell's trivial unit coverage is not evidence for any cluster behavior.

`pnpm audit` returned zero advisories. Cargo audit returned zero entries in its vulnerability category, but two informational findings remain unresolved: [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370.html), unmaintained `proc-macro-error` 1.0.4, and [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429.html), unsound `glib::VariantStrIter` in GLib 0.18.5. Both arrive through Tauri's Linux GTK3 dependency tree, confirmed with `cargo tree -i`. The GLib advisory's patched >=0.20 line is not interchangeable with GTK3's selected 0.18 dependency. No advisory is excluded and no claim of non-reachability is made. FND-007 must establish a compatible upstream/backported fix or a verified applicability decision before foundation qualification; an unsafe baseline is not accepted for release. RustSec database commit: `550efd3d587a29b2e2c2b21b17a440da4fede999`.

Generated ICNS bytes were not reproducible across consecutive CLI runs. This increment retains reproducible PNG/ICO assets only; resolving macOS installer icon generation belongs to FND-006. The PNG/ICO comparison passed. The native host is a binary crate with no exported application APIs or Rust doctest examples; there are no artificial backend unit tests for the Tauri builder wrapper.

Native smoke evidence: launched `src-tauri/target/release/talos-pilot` in an isolated `Xvfb -displayfd 1 -screen 0 1280x900x24` display and `dbus-run-session`. `xdotool search --sync --onlyvisible --name '^Talos Pilot$'` observed the native window within a 20-second bound. Captured the X display with `import -window root`, inspected the rendered light shell, clicked both appearance controls with xdotool, and inspected the dark/compact shell. Bundled assets and dynamic Ant Design styles rendered under the release CSP. The test process group and X server were terminated after inspection. Xvfb emitted expected graphics acceleration and desktop portal/accessibility service warnings; this smoke is not a real desktop session, native WebDriver suite, graceful-shutdown proof, or OS release qualification.

Final review: inspected application and tooling sources, capability/CSP configuration, manifest/lock consistency, CI commands, generated icon consistency, and documentation links. No credential or cluster boundary is implemented. Local documentation links and diff whitespace passed. CI jobs have not been remotely executed. Native automated permission tests, installers, macOS/Windows runtime checks, and real-cluster tests remain unexecuted; this increment cannot establish their behavior.

## Remaining foundation tasks

| Task                                        | Acceptance criteria                                                                                                                                                                                                                                                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FND-002: helper and contracts               | Go toolchain/modules/sums pinned; bounded versioned Protobuf handshake and framed transport generated deterministically; malformed/oversized/version-mismatch cases covered; actual native supervision/shutdown and each target's packaged binary verified; add `contracts:check` with generation sources |
| FND-003: secure storage                     | SQLite migrations, encryption, and platform vault support implemented; unavailable/locked-vault and session-only behavior covered; no plaintext credentials; restart and redaction verified                                                                                                               |
| FND-004: connection feasibility             | Official Talos mTLS read/stream and Rust Kubernetes read/watch on allowlisted disposable fixtures; bounded ownership/cancellation; explicit credential/permission failure states                                                                                                                          |
| FND-005: specialized UI/native harness      | Monaco YAML workers, xterm/uPlot integrations, typed runtime IPC validation; explicit browser mock transport; WebdriverIO/Tauri service in test-only builds; native allowed/rejected IPC and production exclusion checks; packaged Ant Design themes/CSP and worker verification                          |
| FND-007: upstream advisories                | Resolve GLib iterator unsoundness through a compatible verified fix or demonstrated applicability decision; resolve/record macro dependency maintenance risk; rerun audit and native tests without silent exclusions                                                                                      |
| FND-006: platform/performance qualification | Linux reference/Fedora, both macOS architectures, and Windows 11 runtime/packaging checks; helper signing/integrity feasibility; clean install/launch/shutdown; measured baseline and budgets; dependency notices/inventory                                                                               |

No `test:native`, `contracts:check`, or Go commands are fabricated before those implementations exist. They remain required milestone deliverables. CI currently enforces renderer checks and native compilation on Linux, macOS ARM64/Intel, and Windows; those configured jobs are not evidence that remote runners have executed. No real cluster was contacted.
