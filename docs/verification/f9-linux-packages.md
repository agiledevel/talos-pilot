# F9 on Linux: installer artifacts and clean-target runtime evidence

Opened: 2026-10-26. Source: local `ft-linux-package-qualification`, branched
from merged `main` `4a2f9914ddac222433ba99437e8aa39d54314078` (PR #5).
Packet: [document 08](../plans/foundation-finish/08-f9-linux-packages.md). The
[S4 launch prompt](../plans/foundation-finish/s4-launch-prompt.md) starts
**S4-A only**.

This record is append-only evidence, not a plan. A row stays `pending` until the
named environment was executed. Compilation, a browser mock, a test-feature
installer, an unexecuted step and the development host's F8 DEB extraction are
not installed-package evidence.

## Entry context

- Branch and tree: `ft-linux-package-qualification` at `3034d8c`, working tree
  clean, `git rev-parse HEAD` and the planning commit agree. No remote branch,
  pull request or workflow run exists for this branch.
- Pinned private tools: Node 26.12.1, pnpm 12.15.0, Rust 1.99.1, Go 1.27.3,
  protoc 36.2 from `.tools/` (repository bootstrap), no ambient cluster or
  Talos credentials.
- Merge-revision hosted results (read at session entry, not assumed):
  Security [40313099694](https://github.com/agiledevel/talos-pilot/actions/runs/40313099694)
  completed successfully; Foundation
  [40313099783](https://github.com/agiledevel/talos-pilot/actions/runs/40313099783)
  was still **in progress** with `desktop (macos-15-intel)` unfinished (also at
  the 12:53 UTC re-read), so the merge revision's Foundation result is not green
  evidence yet. The planning
  entry's earlier observation is preserved there.

## Acceptance matrix (all pending)

| ID    | Required row                                                                                              | Checkpoint | Status  |
| ----- | --------------------------------------------------------------------------------------------------------- | ---------- | ------- |
| F9-01 | Shared release/qualification path, four targets, one SHA, no tag/publication; downloaded bytes match      | S4-A       | pending |
| F9-02 | AppImage renders/exits on clean Ubuntu 22.04 and recorded current Fedora                                  | S4-C       | pending |
| F9-03 | Ubuntu DEB and Fedora RPM install, render, reinstall and uninstall with documented data retention         | S4-C       | pending |
| F9-04 | Packaged helper path/architecture/identity handshake, no global CLI, maintainer exporter absent           | S4-A/C/D   | pending |
| F9-05 | Desktop vault available/locked/unavailable, session-only/retry, encrypted restart, no plaintext leakage   | S4-C       | pending |
| F9-06 | Each format/guest loads offline editor/worker/diff/terminal/chart under packaged CSP and cleans up        | S4-C       | pending |
| F9-07 | Every path/helper/startup/crash/active-stream fault measured, cleanup observed, original preserved        | S4-C       | pending |
| F9-08 | Actual payloads exclude test/driver/mock code and expose no driver listener; swapped bytes fail           | S4-D       | pending |
| F9-09 | All three Linux payload notices verified, artifact scans reviewed, hashes and signing limits recorded     | S4-D       | pending |
| F9-10 | Final gates/hosted results read, separate review resolved, contracts/setup/runtime docs and ledgers agree | S4-D       | pending |

## Planned evidence by checkpoint

Not results. Each checkpoint replaces its own rows with executed evidence.

| Checkpoint | Environment                                                                    | Evidence class                                     |
| ---------- | ------------------------------------------------------------------------------ | -------------------------------------------------- |
| S4-A       | Hosted Ubuntu 22.04, macOS 15 ARM/Intel, Windows Server 2022 qualification run | Hosted build + downloaded artifact bytes           |
| S4-B       | QEMU/KVM user-mode guest recipe, pinned Ubuntu 22.04 and current Fedora images | Pinned image/host procedure, no acceptance row yet |
| S4-C       | Clean desktop guests with the S4-A hashes                                      | Installed runtime, vault, offline assets, faults   |
| S4-D       | Private payload extraction of the same hashes                                  | Actual payload, scans, signing feasibility, review |

## S4-A implementation record

Session: 2026-10-26, local `ft-linux-package-qualification` started at
`3034d8c45420bd4ef594ae129e6fa7ec7de7350e`. Environment: development openSUSE
Tumbleweed x86_64 host, KVM present, private toolchain from `.tools/` (Node
26.12.1, pnpm 12.15.0, Rust 1.99.1, Go 1.27.3, protoc 36.2), pinned actionlint
1.7.12 and ShellCheck 0.11.0 (digest-verified release archives). No cluster,
Talos or ambient credential was used.

### What changed

| Area                      | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Shared recipe             | New reusable [`build-assets.yml`](../../.github/workflows/build-assets.yml) holds the four-target matrix, pins, release config, AppImage runtime digest, helper/protoc setup, build hooks, legal and payload inspections, collection and bounded upload. `release.yml` calls it; no second copy of the steps remains                                                                                                                                                 |
| Tag-free wrapper          | New [`qualification.yml`](../../.github/workflows/qualification.yml) takes one full commit SHA, validates its shape before checkout, fetches full history, checks that commit out by SHA, and requires reachability from a branch. Read-only permissions, no draft or publication job                                                                                                                                                                                |
| Source validation         | `scripts/release-metadata.ts` has explicit `release` and `qualification` modes. Release keeps tag resolution, tag-commit equality, `main` ancestry and tag/version equality. Qualification requires an immutable existing commit, no tag, and matching npm/Tauri/Cargo versions. `scripts/lib/release.ts` adds the pure validators                                                                                                                                   |
| Collection and provenance | `scripts/release-assets.ts` requires mode, target, full-SHA revision, validated version and workflow-run identity; release mode additionally requires the tag that names the version, qualification rejects any tag. It clears `release-assets/` before writing, verifies the copied bytes, and writes `<target>-SHA256SUMS.txt` plus `<target>-provenance.json` (source, workflow run, release/tauri config digests, application/helper digests, installer digests) |
| Verification              | New `pnpm release:verify` (`scripts/verify-artifacts.ts`) checks a downloaded directory against provenance: expected targets, exact file set, sums, sizes, digests, mode, revision, version and target                                                                                                                                                                                                                                                               |
| Exporter exclusion        | `src-tauri/src/bin/export_ipc_types.rs` became `src-tauri/examples/export_ipc_types.rs`; `cargo metadata` now reports exactly one bin target and the exporter as an example. `scripts/contracts.ts` runs `cargo run --example export_ipc_types`, so `pnpm contracts:check` still regenerates and compares                                                                                                                                                            |
| Payload allowlist         | New `pnpm payload:check` (`scripts/check-payload.ts`, `scripts/lib/payload.ts`) validates extracted DEB/RPM/AppImage and macOS app payloads: required programs must be present and executable, every executable program must be declared (AppRun and the WebKit helper processes are explicit), and maintainer/test tools fail anywhere. A `--release-output` mode covers the Windows NSIS case                                                                      |
| CI prerequisite           | `scripts/ci-linux-prerequisites.sh` release mode now installs `cpio` for the RPM payload extraction                                                                                                                                                                                                                                                                                                                                                                  |
| Tests and docs            | New/extended `scripts/release-assets.test.ts`, `scripts/lib/{release,artifacts,payload}.test.ts`; `docs/ci-release.md`, `docs/quality.md`, `docs/protocol/helper-v1.md`, packet 08 and the status summaries record the contract                                                                                                                                                                                                                                      |

### Executed results

All commands ran from the repository root on the final tree unless a log path
says otherwise.

| Check                                                                                      | Result                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo metadata ... --no-deps`                                                             | exactly one bin target (`talos-pilot`); `export_ipc_types` is an example                                                                                                                                                                            |
| `pnpm contracts:check`                                                                     | `Rust, Go, and TypeScript contracts are current.`                                                                                                                                                                                                   |
| `cargo clippy --locked --all-targets -- -D warnings` and `--features native-test`          | pass                                                                                                                                                                                                                                                |
| `cargo test --locked --all-targets` (default and `native-test`)                            | 134 lib tests pass, 1 ignored; 1 Kubernetes synthetic test and 5 session tests pass under `native-test`; 9 Talos tests remain fixture-gated                                                                                                         |
| `cargo test --locked --doc`; `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps`     | pass                                                                                                                                                                                                                                                |
| `pnpm inventory:check`                                                                     | current: 538 npm, 614 cargo, 143 Go                                                                                                                                                                                                                 |
| `pnpm notices:check`                                                                       | current: 639 components, 1059 texts, 4,816,465 bytes                                                                                                                                                                                                |
| `pnpm icons:check`                                                                         | icons match the pinned pipeline                                                                                                                                                                                                                     |
| `pnpm exec vitest run scripts` (via `check:ci`)                                            | included below; new artifact/payload/metadata cases pass                                                                                                                                                                                            |
| `pnpm check:ci`                                                                            | format, type-aware Oxlint, `svelte-check` 0/0, **387 tests / 49 files**, coverage 71.19 % statements / 73.98 % branches, production build (`/tmp/tp-s4a-check-ci-final2.log`)                                                                       |
| `pnpm test:e2e`                                                                            | **31/31** in 27.6 s (`/tmp/tp-s4a-e2e-final2.log`)                                                                                                                                                                                                  |
| `xvfb-run ... pnpm test:native` (private XDG root, `GDK_BACKEND=x11`)                      | **31 tests / 5 spec files** on WebKitGTK 605.1.15 in 15 s; no helper, synthetic endpoint or Xvfb process remained (`/tmp/tp-s4a-native.log`)                                                                                                        |
| `pnpm desktop:build`                                                                       | ordinary executable SHA-256 `a7a607166302d3575ac39501dcbd81854a9522d204689666df527d4371c69454`; helper `a55eb0331d49d3d32902ab1d050c1a1ce0e765542ccd011a2ae5e4ed5ff7512a` (`/tmp/tp-s4a-desktop-build.log`)                                         |
| `pnpm production:check`                                                                    | no WebDriver surface and no driver listener (`/tmp/tp-s4a-production-check.log`)                                                                                                                                                                    |
| `pnpm payload:check --release-output ...`                                                  | rejected a stale pre-move `target/release/export_ipc_types` binary left by an earlier session; after removing that build artifact, the release output contains only `talos-pilot`                                                                   |
| `pnpm tauri build --ci --config .github/tauri.release.conf.json --bundles deb -- --locked` | `Talos Pilot_0.1.0_amd64.deb`, 25,736,544 bytes, SHA-256 `8c550683171bfe5bcabf14cc24cc1791b2d149ec6ae94646e1640f73402ccc34` (`/tmp/tp-s4a-deb-build.log`)                                                                                           |
| DEB payload inspection (`ar` + `tar` in `/tmp/tp-s4a-deb-Jmlh`)                            | `/usr/bin/talos-pilot` (SHA-256 `3690c0feb28c86ce1aa05252ac3410b133991c9f0db1ea015b0788ad6b1fcd0d`), `/usr/lib/Talos Pilot/binaries/talos-pilot-helper` (`a55eb033…`), both legal files, desktop entry and icon. **No `/usr/bin/export_ipc_types`** |
| `pnpm payload:check --platform linux-deb --root <extracted>`                               | passes: only declared programs (9 entries)                                                                                                                                                                                                          |
| `pnpm notices:check-packaged -- <extracted legal dir>`                                     | passes: 2 files, 639 components, 1059 texts                                                                                                                                                                                                         |
| Embedded identity scan                                                                     | both packaged programs contain the full commit `3034d8c45420bd4ef594ae129e6fa7ec7de7350e`                                                                                                                                                           |
| `pnpm advisories:check` after the bundle build                                             | recorded advisories still match the scanner report, dependency path and patched executable (`/tmp/tp-s4a-advisories.log`)                                                                                                                           |
| pinned `actionlint` 1.7.12 and `shellcheck` 0.11.0                                         | pass on the new/changed workflows and provisioning script                                                                                                                                                                                           |
| `pnpm format:check`, `git diff --check`                                                    | pass                                                                                                                                                                                                                                                |

### Acceptance rows

- **F9-01 remains pending.** No hosted qualification run exists: this branch is
  local, the workflow is not on the default branch, and this session holds no
  push, publication or dispatch authority. The local DEB above is a build of a
  dirty working tree with the HEAD fallback build identity; it is not a
  downloaded artifact, although it does prove the recipe, exporter exclusion,
  payload allowlist and packaged notices.
- **F9-04 is partially executed.** The maintainer exporter is absent from a real
  locally built DEB and is no longer a Cargo bin target; the packaged helper
  path/architecture/identity handshake and the installed launch remain S4-C.
- F9-02, F9-03, F9-05–F9-10 remain pending. Nothing in this record closes C8 for
  Linux.

### Limits and next action

- The Linux collection path for all three formats cannot run on this openSUSE
  host: a local AppImage is already known not to satisfy the Ubuntu WebKit
  helper gate, so the collector's real-bundle AppImage/RPM path is covered by
  unit fixtures locally and must be executed on the hosted Ubuntu runner.
- Windows NSIS payload extraction is not part of this build step; the release
  output exclusion check is the recorded partial evidence, and the actual
  installer payload stays with the final-artifact checkpoint.
- The **next action is owner-authorised publication of
  `.github/workflows/qualification.yml` and `.github/workflows/build-assets.yml`
  to the default branch and a `Package qualification` dispatch for the accepted
  commit.** Do not create a tag, release or temporary publishing trigger. Then
  download the `release-x86_64-unknown-linux-gnu` artifact, run
  `pnpm release:verify` for the recorded revision/version, and record F9-01.
- Local logs and the extracted payload live under `/tmp`; the extraction
  directory and the ignored `release-assets/` output were removed after use.

### Hosted candidate results (PR #6)

Owner-authorised push of `ft-linux-package-qualification` and pull request
[#6](https://github.com/agiledevel/talos-pilot/pull/6) (base `main`
`4a2f9914ddac222433ba99437e8aa39d54314078`). Candidate head
`fd6e30f1a62cebdae72b17a09f83d11af2fce761`.

- Foundation [40324397456](https://github.com/agiledevel/talos-pilot/actions/runs/40324397456)
  **passed**. The scope decision chose **RUN** for desktop and renderer with 21
  affected paths since `4a2f991`, naming the new workflows, `package.json` and
  `scripts/check-payload.ts`. `renderer` 2 m 31 s: `svelte-check` 0/0, **394
  tests / 49 files**, production build, **31/31 browser flows in 58.9 s**.
  `desktop (ubuntu-22.04)` 4 m 30 s, `desktop (macos-15)` 6 m 42 s and
  `desktop (windows-2022)` 8 m 11 s all executed: frozen install, notices
  current (639 components, 1059 texts, 4,816,465 bytes), Rust/Go/contract gates,
  `desktop:build`, `production:check` and `contracts:check` passed.
  `Foundation checks result` passed, so every executed job passed.
- Security [40324397585](https://github.com/agiledevel/talos-pilot/actions/runs/40324397585)
  **passed**. The scope decision chose **RUN** for `actions`,
  `javascript-typescript` and `rust` (19/19/21 affected paths); nothing was
  reused. Trivy 0.74.0 filesystem scan 22 s → 0 results; CodeQL `actions` 40 s,
  `javascript-typescript` 55 s, `rust` 7 m 33 s → 0 results each.

These are hosted CI results for the candidate change, not downloaded-artifact,
installed-runtime or F9-01 evidence: the `Package qualification` workflow is not
yet on the default branch, so no tag-free artifact run exists. F9-01 stays
blocked on owner-authorised publication and dispatch.

## S4-A review corrections

An independent review of the S4-A diff found two defects. Both are fixed with
regressions; the review's reproductions were synthetic and no hosted AppImage or
downloaded artifact exists yet, so F9-01 and every installed-runtime row stay
pending. The earlier "387 tests" row above describes the tree before these
corrections; the numbers below are the final tree.

| Finding                                                                                                                                                                                        | Reproduction                                                            | Correction                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Downloaded-artifact verification trusted the provenance's installer list and accepted an incomplete Linux set (for example only a synthetic DEB) as `Verified 1 targets and 1 installers`      | Synthetic DEB plus matching provenance/checksums                        | `requireInstallerFormats(target, installers)` in `scripts/lib/artifacts.ts`, called by `scripts/verify-artifacts.ts` before checksum and digest checks. It requires target-prefixed names and exactly one installer for every extension the target declares (DEB/RPM/AppImage for Linux, DMG for macOS, NSIS for Windows), and rejects foreign-target names or undeclared extensions |
| `isProgram` excluded `.so`, `.dylib` and `.dll` but not versioned Linux shared objects such as `libglib-2.0.so.0.8600.0`, so a valid payload was rejected as carrying an undeclared executable | Synthetic AppImage payload with an executable `libglib-2.0.so.0.8600.0` | `isProgram` now treats `so`, `so.<digits>[.<digits>…]`, `dylib` and `dll` suffixes as libraries. Arbitrary executables, and library-looking names with other suffixes such as `libnotreally.so.debug`, still fail the allowlist                                                                                                                                                      |

Regressions: `scripts/lib/artifacts.test.ts` covers complete, missing, duplicated,
foreign-target and undeclared-format sets for all three platform shapes;
`scripts/release-assets.test.ts` reproduces the incomplete/duplicated/foreign
sets through the `pnpm release:verify` CLI and keeps the complete Linux set
passing; `scripts/lib/payload.test.ts` adds positive versioned-library coverage
and retains the undeclared-program negatives.

Re-run on the final tree: `pnpm exec vitest run scripts` → **151 tests / 19
files** (`/tmp/tp-s4a-r1-scripts.log`); `pnpm lint`, `pnpm format:check` and
`git diff --check` pass; `pnpm check:ci` → **394 tests / 49 files**, coverage
71.37 % statements / 74.17 % branches, `svelte-check` 0/0, production build
(`/tmp/tp-s4a-r1-check-ci.log`); `pnpm test:e2e` → **31/31** in 26.5 s
(`/tmp/tp-s4a-r1-e2e.log`). The payload and verifier evidence classes are still
synthetic fixture bytes plus the earlier real local DEB; the versioned-library
case was not observed in a hosted AppImage extraction, and the format rule is
enforced by the verifier rather than inferred from the collector.

## First hosted qualification failure and correction (2026-10-26)

PR #6 merged as `ba90cb2d7fd6acc25939d8509cf829f11cf1587a`. Qualification
[40328346368](https://github.com/agiledevel/talos-pilot/actions/runs/40328346368)
validated that source; both macOS targets passed and uploaded artifacts. Windows
failed during `Build preview packages`, and Linux built DEB/RPM/AppImage but
failed during `Inspect packaged Linux payloads` after successful DEB payload and
notices checks. No Linux or Windows artifact was uploaded. **F9-01 remains
pending**, superseding the earlier default-branch-publication blocker without
rewriting its history.

Owner requested investigation, correction and delivery to `main`. Acceptance:
preserve locked Cargo builds on all four targets, extract the real Tauri RPM
without ignoring failures, keep every payload/provenance gate, and deliver
through required branch checks rather than bypassing protection. No tag,
release, cluster mutation or host provisioning is involved.

- **Windows:** the log shows `pnpm tauri build ... -- --locked` becoming
  `tauri build ... --locked`, which Tauri rejects. The shared step now uses
  explicit `shell: bash` and `node node_modules/@tauri-apps/cli/tauri.js`;
  neither pnpm's script wrapper nor PowerShell forwards the argument list.
- **Linux:** Ubuntu RPM 4.17's
  [`rpm2cpio.c`](https://github.com/rpm-software-management/rpm/blob/rpm-4.17.0-release/rpm2cpio.c)
  compares bytes copied with `LONGARCHIVESIZE`, even if absent. A locally
  Tauri-built RPM has neither `LONGARCHIVESIZE` nor `ARCHIVESIZE`. Executing
  Ubuntu's `rpm2cpio` 4.17.0+dfsg1-4build1 against it returned **1** after
  copying **70,090,848 bytes**, reproducing the silent failure. The corrected
  recipe provisions `libarchive-tools` and calls `scripts/extract-rpm.sh`:
  `timeout 60s bsdtar --no-same-owner -xf ... -C ...`. Failure is not masked;
  RPM payload validation immediately follows as before.
- **Regression boundary:** `scripts/package-workflow.test.ts` executes the
  actual shared YAML build command against an argv-recording CLI for all four
  targets (including a working directory with spaces). It requires the Cargo
  separator and locked flag, exercises extraction argument boundaries and
  nonzero propagation, and rejects missing inputs. These are process fixtures,
  not Windows installed-runtime or hosted package evidence.

Local package reproduction used the private pinned toolchain on the openSUSE
x86_64 development host, with a real Tauri release-config RPM build via the
new direct-Node command. RPM SHA-256:
`ec4e18eb7601929e5a62789a336cb5a1810ac800a80efa6be0f1b88ef4382e4e`.
Ubuntu tools were downloaded from the official archive into `/tmp`, checked
against its Packages-index SHA-256, and extracted **without system install**.
Ubuntu `bsdtar` and libarchive **3.6.0-1ubuntu1.9** extracted this RPM with the
checked-in script; `payload:check` passed (6 entries) and
`notices:check-packaged` passed (2 files, 639 components, 1059 texts). A truncated
100,000-byte copy failed with exit 1 and `truncated gzip input`. Temporary
payloads were removed. This is a dirty-tree local RPM, not hosted immutable-SHA
artifact evidence and not an installed desktop guest.

Final aggregate/native results and hosted delivery status are recorded in the
corresponding [ledger entry](../plans/foundation-finish/ledger.md). A fresh
four-target qualification plus downloaded Linux artifact verification remains
required before accepting F9-01; no previous run or local reproduction substitutes
for it.

## Owner-authorized qualification dispatch and blocked Linux download (2026-10-26)

Owner requested dispatch, then Linux artifact download and verification. Source
was merged `main` **`21e5ea6650a5c7aea5d8512ee6809f9e1d8cbbfe`** (PR #7).
Before dispatch, the exact revision's Foundation
[40341836260](https://github.com/agiledevel/talos-pilot/actions/runs/40341836260)
was read **successful**, including renderer, all four desktop runners and the
aggregate gate. Security
[40341836345](https://github.com/agiledevel/talos-pilot/actions/runs/40341836345)
was read **successful**, including all three CodeQL languages and Trivy.
These are exact-main results, not reuse of PR checks.

Executed:

```sh
gh workflow run qualification.yml --ref main \
  -f revision=21e5ea6650a5c7aea5d8512ee6809f9e1d8cbbfe
gh run watch 40361473939 --interval 45 --exit-status
```

Qualification [40361473939](https://github.com/agiledevel/talos-pilot/actions/runs/40361473939),
attempt 1, completed **failure**:

| Target / job                      | Result   | Observed boundary                                                                                                                                    |
| --------------------------------- | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Validate qualification source     | pass     | Immutable revision validated                                                                                                                         |
| macOS ARM `aarch64-apple-darwin`  | pass     | Build, app payload, release-output checks, collection and upload                                                                                     |
| macOS Intel `x86_64-apple-darwin` | pass     | Same gates and upload; 17 m 24 s                                                                                                                     |
| Windows `x86_64-pc-windows-msvc`  | pass     | NSIS build, release-output check, collection and upload; 8 m 49 s                                                                                    |
| Linux `x86_64-unknown-linux-gnu`  | **fail** | DEB/RPM/AppImage built; resource gate, DEB allowlist/notices and RPM extraction/allowlist passed; AppImage allowlist failed before collection/upload |

Linux job [121708016540](https://github.com/agiledevel/talos-pilot/actions/runs/40361473939/job/121708016540)
reported `The linux-appimage payload contains undeclared executable files`.
The rejected paths include `AppRun.wrapped`, `usr/share/doc/<library>/copyright`
(for example `libglib2.0-0`), and `usr/share/glib-2.0/schemas/` data such as
`gschema.dtd`, `.gschema.xml` and `.gschema.override`. The log establishes their
classification as executable, not a review of their contents. No broad data-path
exception or gate suppression was applied. This is newly reached validation:
the earlier Windows argument and Ubuntu RPM extraction fixes passed on hosted
runners, but Linux qualification is still not complete.

The run's artifact API listed only the Windows and two macOS artifacts, not
`release-x86_64-unknown-linux-gnu`. The requested download was attempted:

```sh
gh run download 40361473939 \
  --name release-x86_64-unknown-linux-gnu \
  --dir /tmp/talos-pilot-qualification-40361473939/linux
```

It returned exit 1: `no artifact matches any of the names or patterns provided`.
**There are no downloaded Linux bytes, checksums or provenance to verify.**
`pnpm release:verify` was therefore **unexecuted**, not passed or substituted
with a local build. No retry of this deterministic failure, tag, release,
installed guest, cluster operation or host-service change was performed.
Local logs: `/tmp/tp-qualification-40361473939-{watch,failed}.log`.

**F9-01 stays pending**, blocked by the AppImage payload gate (ledger B12).
Next: investigate the actual AppImage launch wrapper/data modes, implement a
narrow reviewed correction with positive/negative coverage and no executable
bypass, then qualify a newly accepted immutable revision and download/verify
the Linux artifact. All installed-runtime acceptance rows remain pending.

## B12 correction: explicit launcher and source-proven data (2026-10-26)

Owner requested fixing the failed qualification and starting another run after
the fix is pushed. Session base: `21e5ea6650a5c7aea5d8512ee6809f9e1d8cbbfe`;
branch `fix/appimage-payload-inspection`. The preceding uncommitted dispatch
record is included with this correction rather than discarded.

Acceptance criteria: declare linuxdeploy's real launcher chain, allow no unknown
program or data-path bypass, reject changed/script/binary data and untrusted
source escapes, preserve every existing payload/identity/format gate, and use a
new immutable revision for requalification. No tag/release, dependency refresh,
installer rewriting or removal of checks is permitted.

### Inspection and choice

A real local release-config AppImage was built with the pinned toolchain,
locked Cargo and the workflow's digest-checked AppImage runtime. The extracted
`AppRun` is linuxdeploy's generated Bash launcher: it sources the GTK hook and
then `exec`s `AppRun.wrapped`. The latter is an ELF program whose SHA-256
`f30140a43a0a59e46db21bdefdf749b9e9f2c6946e92afabbacf98b8ae73fb4f` equals
Tauri's downloaded `AppRun-x86_64`. Both are now exact required executable
paths, not a wildcard allowance. This matches the pinned
[Tauri 2.12.1 bundler source](https://github.com/tauri-apps/tauri/blob/tauri-cli-v2.12.1/crates/tauri-bundler/src/bundle/linux/appimage/linuxdeploy.rs).

The failed Ubuntu run provides executable-mode path classifications but no
artifact bytes. Local openSUSE data modes differ: the extracted `gschema.dtd`
is 0644, matching its source. Therefore this change does **not** presume all
rejected Ubuntu paths to be harmless text and does not grant blanket directory
or extension exceptions. Instead it verifies each execute-bit data candidate
against the exact trusted build OS original before classifying it as data:

- only distro `usr/share/doc/<package>/copyright` and GLib XML/DTD/override
  paths are eligible; every other executable still needs an explicit program rule;
- originals must resolve inside their expected data subtree and be regular,
  non-executable files; payload symlinks cannot escape the extraction root;
- both files must be bounded UTF-8 data, with no NUL or shebang prefix, and
  compare byte for byte; missing, changed, binary, executable-source and
  oversized files fail instead of falling back;
- limits are 256 files, 1 MiB/file and 32 MiB total; reads detect growth/shrinkage,
  nonblocking opens reject FIFOs, descriptors close on every outcome, and each
  successful comparison logs its path and SHA-256;
- the checker retains the actual execute-bit metadata plus an internal
  `verifiedSystemData` proof flag; the pure validator honors it **only** for
  AppImage data candidates. A forged flag on an unknown path or another format
  cannot suppress the program rule. Maintainer/test-tool rejection is unchanged.

Hosted inspection uses its own `/` source tree. The AppImage-only
`--appimage-system-root` option permits an operator-supplied trusted copy of the
exact build OS data for offline inspection/testing. That root is a trust input,
not an authenticated OS/publisher claim; arbitrary directories or another OS
must not be substituted. The source snapshot must be retained/reproduced when
independently rechecking copied data on another system.

### Evidence boundaries

Local AppImage SHA-256:
`f7bba269c12d3349a09c03eb5bc0f4b6775f41db2bd63d433f87f49f973c19bd`.
Only a disposable extracted copy's `gschema.dtd` mode was changed to 0755 to
exercise the reported permission condition; installer bytes were not changed.
The new verifier matched its 2,917 bytes to the host original with SHA-256
`44a12f339042a3f5568a9cc86bb617fabaf4a25836b8c9510aa9de22431930c6`.
This host's AppImage lacks the Ubuntu WebKit helper layout, so its full payload
gate remains unverified/failing at the required helper check; it is **not** a
hosted Ubuntu or installed-runtime pass. Logs: `/tmp/tp-appimage-b12-build.log`
and `/tmp/tp-b12-local-before.log`.

Regression coverage in `scripts/lib/{appimage-system-data,payload}.test.ts`
executes byte comparisons, same-name disguised scripts without shebangs,
binary/shebang/non-UTF-8 data, executable/missing/oversized originals, oversized
payloads, source/payload symlink escapes, FIFO rejection, missing wrapper and
forged-proof negatives. The CLI case uses separate synthetic payload/OS roots,
keeps unchanged data passing and rejects an unknown tool and changed data.
No test treats a filename alone as proof or rewrites the inspected files.

Final local gates and delivery/qualification identities are recorded in the
ledger. B12 remains open for hosted requalification; F9-01 and all installed
runtime rows remain pending until their own complete evidence exists.

## 40401994013 follow-up: pre-bundle references (2026-10-26)

Owner requested review and correction after qualification failed again. PR #8
merged as `9e2de303fd833ef80acb225c7afd81cdd99ca678`; exact-main Foundation
[40399677772](https://github.com/agiledevel/talos-pilot/actions/runs/40399677772)
and Security
[40399677855](https://github.com/agiledevel/talos-pilot/actions/runs/40399677855)
passed before dispatch. Qualification
[40401994013](https://github.com/agiledevel/talos-pilot/actions/runs/40401994013)
then failed on Linux; Windows and both macOS targets passed. Linux
[job 121850177181](https://github.com/agiledevel/talos-pilot/actions/runs/40401994013/job/121850177181)
passed the resource, DEB/notices and RPM checks, but AppImage verification
reported `Cannot verify AppImage system data usr/share/doc/libatk-bridge2.0-0/copyright: the source must be a regular non-executable system file`.
Its artifacts contain only the Windows/two macOS uploads: no Linux bytes or
provenance were available for download/verification. Log:
`/tmp/tp-qualification-40401994013-failed.log`.

The combined error establishes that the **post-build reference** failed the
regular/non-executable condition; it did not print the actual mode/type or
prove which tool changed it, or whether it was suitable before packaging.
The earlier local fixture did not reproduce this reference-lifetime issue.
Therefore the prior section's use of the live `/` tree is superseded by:

- Before Tauri runs, capture eligible OS data into a new private reference
  directory with independent read-only files, never hard links. Original
  regular-file/non-executable, content, path and per-file limits still apply.
  Unsupported candidates are reported and omitted, never silently permitted;
  any later executable payload copy without a reference still fails.
- Bound reference discovery to 10,000 entries / 256 MiB. A write/report failure
  removes only the newly owned directory; an existing destination is rejected
  and never overwritten/deleted. Originals and completed installers are not
  chmodded or rewritten. Data proof still enforces its stricter 256-file /
  32-MiB payload limits and exact bytes. Read errors now include regular-file
  status and mode for diagnosis.
- Pass that reference through the existing AppImage-only trusted-root option.
  It remains an operator/CI trust input, not OS/publisher authentication. A
  later change in the live OS cannot authorize a changed payload.
- On Linux payload failure only, retain one failed AppImage of at most 256 MiB,
  log its hash, and upload under `diagnostic-appimage-<revision>` for one day.
  This is **not** a qualified/release artifact; release collection excludes its
  name and the original job remains failed. Missing/multiple/oversized images
  are not uploaded. This avoids another diagnosis based solely on filenames.

Acceptance regressions reproduce the old live-reference failure after a source
chmod, prove independent captured bytes still work, and reject payload bytes
matching a subsequently changed source. They cover omitted executable/script/
binary/non-UTF-8/oversized/escaping sources, stale roots, partial-write cleanup,
source enumeration bounds, spaced CLI arguments, actual diagnostic shell limits
(including 256 MiB inclusive), and snapshot-before-build/diagnostic segregation.
The first narrow run passed **58 tests / 3 files**, type-aware lint and actionlint.
These are synthetic process/filesystem fixtures, not Ubuntu package evidence.
Broader final gates and actual Ubuntu validation are pending at this checkpoint.
The branch qualification will exercise this correction before protected delivery;
its source is not an accepted-main F9-01 candidate. B12, F9-01 and installed-runtime
rows stay pending until their own evidence exists.
