# Foundation dependency research

Research dates: 2026-10-08 for the foundation baseline and 2026-10-09 for C3.3 additions. Versions were queried from upstream npm `dist-tags.latest`, crates.io `max_stable_version`, Rust's stable channel manifest, Node's release index, and the Go/Talos/Helm release APIs. No version was inferred from a search snippet. The exact installed package versions are in [package.json](../package.json), [pnpm-lock.yaml](../pnpm-lock.yaml), [Cargo.toml](../src-tauri/Cargo.toml), and [Cargo.lock](../src-tauri/Cargo.lock).

| Capability                      | Current stable release selected                                             | Primary source                                                                                                                                                                                                                                                                            |
| ------------------------------- | --------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| JavaScript runtime              | Node 26.11.1 (current stable; latest LTS was 24.21.0)                       | [Node release index](https://nodejs.org/dist/index.json)                                                                                                                                                                                                                                  |
| Package manager                 | pnpm 12.10.1                                                                | [npm metadata](https://registry.npmjs.org/pnpm/latest)                                                                                                                                                                                                                                    |
| Rust toolchain                  | 1.99.0, published 2026-10-01                                                | [stable channel manifest](https://static.rust-lang.org/dist/channel-rust-stable.toml)                                                                                                                                                                                                     |
| Desktop                         | Tauri / API / CLI 2.12.1; tauri-build 2.7.1                                 | [Tauri releases](https://v2.tauri.app/release/), [API metadata](https://www.npmjs.com/package/@tauri-apps/api), [crate metadata](https://crates.io/api/v1/crates/tauri), [build crate metadata](https://crates.io/api/v1/crates/tauri-build)                                              |
| Rendering                       | React / React DOM 19.3.0                                                    | [React metadata](https://registry.npmjs.org/react/latest), [React DOM metadata](https://registry.npmjs.org/react-dom/latest)                                                                                                                                                              |
| Components                      | Ant Design 6.6.5                                                            | [npm metadata](https://registry.npmjs.org/antd/latest)                                                                                                                                                                                                                                    |
| Bundling / React transforms     | Vite 8.3.4 / plugin-react 6.1.2                                             | [Vite metadata](https://registry.npmjs.org/vite/latest), [plugin metadata](https://registry.npmjs.org/@vitejs/plugin-react/latest), [Vite 8 architecture](https://vite.dev/blog/announcing-vite8)                                                                                         |
| Types                           | TypeScript 7.0.2                                                            | [npm metadata](https://registry.npmjs.org/typescript/latest)                                                                                                                                                                                                                              |
| Lint / type engine / format     | Oxlint 1.87.0 / oxlint-tsgolint 7.0.2003 / Oxfmt 0.72.0                     | [Oxlint metadata](https://registry.npmjs.org/oxlint/latest), [engine metadata](https://registry.npmjs.org/oxlint-tsgolint/latest), [Oxfmt metadata](https://registry.npmjs.org/oxfmt/latest)                                                                                              |
| Renderer unit tests / coverage  | Vitest 5.0.3 / coverage-v8 5.0.3                                            | [Vitest metadata](https://registry.npmjs.org/vitest/latest), [coverage metadata](https://registry.npmjs.org/@vitest/coverage-v8/latest)                                                                                                                                                   |
| DOM test environment            | jsdom 30.1.2                                                                | [npm metadata](https://registry.npmjs.org/jsdom/latest)                                                                                                                                                                                                                                   |
| React test helpers              | Testing Library React 16.3.3; DOM 10.4.2; jest-dom 7.0.1; user-event 14.6.7 | [React](https://registry.npmjs.org/@testing-library/react/latest), [DOM](https://registry.npmjs.org/@testing-library/dom/latest), [assertions](https://registry.npmjs.org/@testing-library/jest-dom/latest), [interaction](https://registry.npmjs.org/@testing-library/user-event/latest) |
| Browser / accessibility         | Playwright 1.64.0; axe-core/playwright 4.13.0                               | [Playwright metadata](https://registry.npmjs.org/@playwright/test/latest), [axe metadata](https://registry.npmjs.org/@axe-core/playwright/latest)                                                                                                                                         |
| Native test harness             | WebdriverIO 9.31.9; Tauri service/plugin 1.5.0; Rust plugins 1.5.0          | [Tauri WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/), [service setup](https://webdriver.io/docs/desktop-testing/tauri/plugin-setup)                                                                                                                                     |
| Backend storage                 | rusqlite 0.40.2 (bundled); XChaCha20-Poly1305 0.11.0; secrecy 0.10.3        | [rusqlite](https://docs.rs/rusqlite/0.40.2/rusqlite/), [AEAD](https://docs.rs/chacha20poly1305/0.11.0/chacha20poly1305/), [secrecy](https://docs.rs/secrecy/0.10.3/secrecy/)                                                                                                              |
| Native credential vault         | keyring 3.6.3; base64 0.22.1; zeroize 1.9.1                                 | [keyring 3.6.3](https://docs.rs/keyring/3.6.3/keyring/), [features](https://docs.rs/crate/keyring/3.6.3/features), [base64](https://docs.rs/base64/0.22.1/base64/), [zeroize](https://docs.rs/zeroize/1.9.1/zeroize/)                                                                     |
| Native import / YAML validation | tauri-plugin-dialog 2.8.1; serde-saphyr 1.3.0; url 2.5.8                    | [dialog](https://docs.rs/tauri-plugin-dialog/2.8.1/tauri_plugin_dialog/), [YAML parser](https://docs.rs/serde-saphyr/1.3.0/serde_saphyr/), [URL](https://docs.rs/url/2.5.8/url/)                                                                                                          |
| Type declarations               | React / React DOM 19.3.0; Node 26.6.4                                       | [React](https://registry.npmjs.org/@types/react/latest), [React DOM](https://registry.npmjs.org/@types/react-dom/latest), [Node](https://registry.npmjs.org/@types/node/latest)                                                                                                           |
| Rust advisory scanner           | cargo-audit 0.22.2                                                          | [crate metadata](https://crates.io/api/v1/crates/cargo-audit)                                                                                                                                                                                                                             |
| Go advisory scanner             | govulncheck 1.8.0 (`golang.org/x/vuln`)                                     | [module list](https://pkg.go.dev/golang.org/x/vuln/cmd/govulncheck)                                                                                                                                                                                                                       |
| CI security scanners            | CodeQL action 4.38.1; Trivy 0.74.0                                          | [CodeQL release](https://github.com/github/codeql-action/releases/tag/v4.38.1), [Trivy release](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0)                                                                                                                               |

Compatibility: Vite 8 and plugin-react 6 use the Oxc transform path. Oxlint requires oxlint-tsgolint >=7.0.2003; its [official guide](https://oxc.rs/docs/guide/usage/linter/type-aware.html) requires TypeScript 7+. React DOM matches React exactly, Ant Design supports React >=18, and the chosen test environment supports Node 26. Rust 1.99 exceeds Tauri's declared 1.95 minimum. These constraints were checked against registry metadata and exercised by the installed tools.

Go **1.27.2** and Talos **1.14.1** are selected for the helper baseline. C4 pins `github.com/siderolabs/talos/pkg/machinery` at **v1.14.1**, `github.com/cosi-project/runtime` at **v1.16.3**, and its `github.com/siderolabs/gen` channel helper at **v0.8.8** in `helper/go.mod`. The probe uses the official `client.New`, `client.WithConfig`, `client.WithEndpoints`, `client.WithNodes`, `Client.Version`, `safe.StateWatchKind`, and the Talos `runtime.MachineStatus` resource. `go.mod`/`go.sum` are authoritative; the local build/vet/test/race probe passes under the auto-selected Go 1.27.2 toolchain. It does not yet add Helm APIs. Rust Kubernetes, vault, editor, terminal, charts, routing, and state dependencies likewise belong with their first concrete capability; installing unused packages would not qualify those integrations. See the primary-source compatibility record in [C0.2 evidence](verification/milestone-1.md#c02-dependency-and-harness-research) and the [C4 acceptance/evidence record](verification/milestone-1.md#c4-acceptance-cases).

The Go toolchain moved from 1.27.1 to 1.27.2, and `golang.org/x/net` from v0.58.0 to v0.60.0 (with `x/crypto` v0.57.0, `x/sys` v0.48.0, and `x/text` v0.42.0), on 2026-10-09 in response to `govulncheck` findings GO-2026-6617 (HTTP/2 HPACK encoder race, fixed in `x/net` v0.60.0 and Go 1.27.2) and GO-2026-6613 (HTTP/1 desynchronization after a 2xx CONNECT, fixed in Go 1.27.2). Both reached the helper only through the gRPC transport behind the Talos client, and the scan reports no findings after the upgrade.

Tokio **1.53.2** (MIT) is now a direct Rust dependency for bounded helper-process I/O, asynchronous deadlines, and process reaping ([crate metadata](https://crates.io/crates/tokio/1.53.2)). It uses the application's existing Tokio runtime; no second runtime or shell plugin is introduced. The process supervisor uses Tokio's documented [`kill_on_drop`](https://docs.rs/tokio/1.53.2/tokio/process/struct.Command.html#method.kill_on_drop), `kill`, and `wait` behavior, and explicitly awaits child exit on owned cleanup paths. The exact pin and feature set are in [Cargo.toml](../src-tauri/Cargo.toml) and [Cargo.lock](../src-tauri/Cargo.lock).

The renderer uses `@tauri-apps/api` **2.12.1** (Apache-2.0 OR MIT), pinned to the Tauri core/CLI release. Only the `core` module's `invoke` and `isTauri` APIs are used for the command boundary. No shell or filesystem plugin is registered or exposed to the renderer. The [official core API reference](https://v2.tauri.app/reference/javascript/api/namespacecore/) documents both functions.

C3.1 uses `rusqlite` **0.40.2** (MIT) with bundled SQLite **3.53.2**,
`chacha20poly1305` **0.11.0** (Apache-2.0 OR MIT), `getrandom` **0.4.3**, and
`secrecy` **0.10.3** (Apache-2.0 OR MIT). The locked feature set excludes
SQLCipher, OpenSSL, runtime extension loading, and system SQLite. The selected
formats and security boundary are recorded in [decision 0003](decisions/0003-storage-schema-and-envelope.md).

C3.2 pins `keyring` **3.6.3** with default features disabled and explicitly
selects Secret Service (`sync-secret-service`, `crypto-rust`) on Linux,
Keychain (`apple-native`) on macOS, and Credential Manager (`windows-native`)
on Windows. This excludes keyring's mock provider and unrelated platform
stores. Linux uses system `libdbus-1`; the build image already provides it for
Tauri. Vault keys are base64 encoded for UTF-8-only Secret Service
implementations, with the encoded transient zeroized; the decoded 32-byte key
enters zeroizing `SecretBox` memory immediately. See [decision
0004](decisions/0004-native-vault-integration.md). Linux Secret Service has a
real KDE Wallet persistence/reopen run; macOS and Windows runtime qualification
remain open for C8.

C3.3 uses `tauri-plugin-dialog` **2.8.1** through Rust's native dialog API;
the plugin's renderer commands have no capability grants. `serde-saphyr`
**1.3.0** is enabled with only its deserializer feature, with parser budgets
and unsupported tags rejected. It has no filesystem include feature, so YAML
cannot expand into generic file access. The importer accepts only HTTPS cluster
endpoints and inline supported auth, and returns only safe context metadata.
See [decision 0005](decisions/0005-native-kubeconfig-import.md).

The native harness pins `@wdio/tauri-service` and `@wdio/tauri-plugin` to
**1.5.0**, the WebdriverIO CLI/local runner/Mocha framework to **9.31.9**, and
`tauri-plugin-wdio` / `tauri-plugin-wdio-webdriver` to **1.5.0**. It uses the
embedded provider on Linux, Windows, and macOS. Only the `native-test` Cargo
feature registers these plugins, and only its Tauri config grants their
permissions. The pnpm lifecycle policy allows `esbuild`'s install script for
the pinned TypeScript WebDriver configuration, while `edgedriver` and
`geckodriver` installers are denied because the embedded provider does not use
external browser drivers. The native harness's audited transitive overrides and
their compatibility review are recorded in [decision 0002](decisions/0002-wdio-transitive-advisory-remediation.md).

## Licensing and updates

Direct frontend/build/test packages are MIT, except TypeScript (Apache-2.0), Playwright (Apache-2.0), and Tauri CLI (Apache-2.0 OR MIT). The Rust desktop/build crates are Apache-2.0 OR MIT. Upstream packages are actively released; registry metadata and successful builds establish this initialization's compatibility, not the later platform/cluster qualification.

The WebdriverIO service/plugin packages are MIT; `tauri-plugin-wdio` is MIT OR Apache-2.0 and `tauri-plugin-wdio-webdriver` is MIT. Their transitive obligations are in the generated inventory below.

`pnpm inventory:generate` writes [the generated inventory](verification/dependency-inventory.json) and `pnpm inventory:check` fails on any drift, so the inventory is never hand-edited. It is schema version 2 and records the toolchain pins plus the SHA-256 of `pnpm-lock.yaml`, `src-tauri/Cargo.lock`, and `helper/go.sum`, then one sorted entry per dependency: 503 npm packages from `pnpm licenses list --json`, 548 registry Cargo packages from `cargo metadata --locked --format-version 1` (workspace members are first-party code, not an obligation), and 143 Go modules from `go list -m -json all`, of which the 35 that actually contribute packages to the helper binary are marked `linked`. Each Go entry names its license only when exactly one canonical marker set matches its license text — 35 of 35 linked modules resolved — and otherwise reports `unknown`. The 108 graph-only modules are reported as `unobserved` and their license files are never read: a graph-only module is in the module cache only when unrelated work downloaded it, so reading it would make the inventory differ between machines and fail the drift gate on a clean runner. `unobserved` is therefore not a license claim. A linked module with no extracted source is a generator error.

Redistributed notices follow from that inventory: the packages carrying a `NOTICE` file are `@playwright/test`, `playwright`, `playwright-core`, `typescript`, `@typescript/typescript-linux-x64`, `bare-path` (all dev-only), and the linked Go modules `go.yaml.in/yaml/v4` and `google.golang.org/grpc`, which must ship with the packaged helper. MPL-2.0 covers 18 entries overall, including the linked Go modules `github.com/cosi-project/runtime`, `github.com/hashicorp/errwrap`, and `github.com/hashicorp/go-multierror`; MPL is file-level copyleft, so any modification to those files must be documented and the source made available. The only npm package with no declared license is `css-value@0.0.1`, which arrives solely through the WebdriverIO development chain that the production-exclusion gate keeps out of shipped artifacts. Cargo expressions include MPL-2.0, Unicode data licenses, and LLVM exceptions, and two crates offering LGPL resolve through their MIT/Apache alternative. Final installer notice packaging remains a release task.

Use `pnpm audit`, `cargo audit --file src-tauri/Cargo.lock`, `pnpm audit:go`, and `pnpm advisories:check` for advisories; CI also runs Trivy over both lockfiles and `helper/go.mod`, and its exceptions follow [CI/release](ci-release.md). Record any finding's applicability rather than silently excluding it, and keep the verification record on the actual scan output.

`pnpm inventory:check` is a Linux-only CI step because the npm license listing includes platform-specific optional packages (`@typescript/typescript-linux-x64`, `lightningcss-linux-x64-gnu`), so the committed inventory is the Linux view of the graph; per-platform inventories belong with the installer notice packaging.

The 2026-10-09 scan used cargo-audit 0.22.2 against advisory database
`550efd3d587a29b2e2c2b21b17a440da4fede999` (1,295 advisories, 569 locked Rust
dependencies) and `pnpm audit --audit-level=low` on the pinned lockfile. npm
reported no known vulnerabilities. Rust reported exactly two informational
findings, both inherited from Tauri 2.12.1's Linux GTK3 stack: RUSTSEC-2024-0370
(`proc-macro-error` 1.0.4, unmaintained, only behind the `glib-macros` and
`gtk3-macros` proc-macros) and RUSTSEC-2024-0429 (`glib` 0.18.5, unsound only in
`glib::VariantStrIter` iterator methods, whose patched 0.20 line `gtk = "0.18"`
cannot select). `pnpm advisories:check` re-proves that record against the scanner
report, the reverse dependency paths, and the 37,865 demangled symbols in the
built Linux executable, where neither affected symbol appears. See [decision
0006](decisions/0006-gtk3-advisory-applicability.md) for the accepted
applicability decision, the alternatives, and the 2026-11-30 review date.

Refresh versions deliberately from these primary sources, preserve exact direct pins, regenerate lockfiles, and rerun affected checks. CI action releases were also researched through GitHub's release/ref APIs; checkout v7.0.1, setup-node v7.1.0, and setup-go v6.5.0 are pinned by commit. The pnpm release-age exceptions list only the freshly published Vite/Playwright and WDIO 1.5.0 packages with reviewed target versions; it does not globally turn off pnpm's supply-chain policy.

## Desktop configuration

The initial capability grants no application or plugin permissions. There is no shell, filesystem, remote navigation, helper launch, or credential interface exposed to the renderer. The CSP permits bundled scripts and Tauri's IPC origins only. Inline **styles** are permitted because Ant Design inserts styles and style attributes dynamically; executable inline scripts and remote assets remain blocked. The Linux release shell rendered both themes under this CSP in the initialization smoke test; cross-platform and specialized-worker verification remains pending. A nonce-based style integration must be assessed with the packaged editor/worker feasibility task.

The [canonical project icon](../assets/app-icon.png) was generated with the built-in image generation tool. Its prompt and provenance are in [assets/README.md](../assets/README.md). The pinned Tauri CLI converts the retained bitmap into PNG/ICO/ICNS assets through `pnpm icons:generate`; `pnpm icons:check` compares generated bytes. ICNS chunk ordering is canonicalized without changing image payloads, resolving the CLI nondeterminism observed at initialization. Release-only configuration enables draft-preview installer builds; the complete helper/signing/platform qualification remains foundation work. See [CI/release setup](ci-release.md).
