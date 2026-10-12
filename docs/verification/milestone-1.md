# Milestone 1 verification ledger

Date opened: 2026-10-08. Base revision: `2926f4c58312a415fb430eca2c014e500f436d62`.

This is the active evidence record for [milestone 1](../plans/milestone-1-flash.md); the [foundation completion plan](../plans/foundation-completion-flash.md) defines its next execution packets. It distinguishes current checks from historical evidence in [initialization](initialization.md) and [automation](automation.md). A checkpoint remains open until its observable acceptance criteria and required evidence pass on the final changed revision.

## Readiness recheck at `f0731cf` — 2026-10-11

The owner requested verification of foundation completion and a next-phase FLASH
plan. The [source and evidence review](foundation-readiness-2026-10-11.md) could
not establish completion: C5 has no implemented Rust adapter, F1 steps 4–5 are
undelivered, and C6/C8/C9 remain open. No checkpoint is promoted by this
planning change. The prepared [milestone 2 plan](../plans/milestone-2-flash.md)
is gated on foundation acceptance. Next executable packet: remaining F1
reconnect/resync and live interruption qualification, then F2–F10. This recheck
uses current source plus attributed historical evidence; it does not rerun
application, native, fixture, platform or security gates.

The review also read the hosted runs at `f0731cf`. `desktop (windows-2022)`
executed and passed the reworked contract step, so the F0 entry's unexecuted
Windows row now has hosted evidence; see the
[automation record](automation.md#eighth-run-at-f0731cf--the-reworked-contract-step-on-windows).
This promotes no checkpoint: hosted Windows Server is not C8's Windows 11
qualification.

## Checkpoint status and acceptance criteria

| Checkpoint                       | Status                                                                                                          | Acceptance criteria                                                                                                                                                                                                                                      |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0.1 baseline and ledger         | Complete                                                                                                        | Reproduce frozen install, renderer, coverage, browser, icon, Rust, advisory, workflow, and native release-build checks; record actual command results, host/tool versions, failures, and next actions.                                                   |
| C0.2 dependency/harness research | Complete                                                                                                        | Pin compatible Go/Talos, Rust-to-TypeScript and Protobuf generation/runtime tools, and Tauri native harness packages from primary sources; run minimal compatibility probes and record limits.                                                           |
| C1 helper and contracts          | In progress (C8 runtime)                                                                                        | Deterministically generate documented Rust/Go/TypeScript protocol and DTO outputs; reject malformed, oversized, unknown, and incompatible frames; exercise actual packaged Rust↔Go handshake, bounded supervision, failure cleanup, and safe status IPC. |
| C2 native IPC harness            | In progress (final target refresh)                                                                              | Runtime-validate renderer DTOs; use an explicit browser mock; run Tauri/WebdriverIO allowed and denied IPC flows; demonstrate cleanup and prove production excludes mock/driver/test commands.                                                           |
| C3 encrypted storage             | Complete on Linux (C8 OS matrix open)                                                                           | Verify schema/migration atomicity, AEAD integrity and redaction, actual OS-vault success/failure, encrypted restart, explicit session-only behavior, and native credential import with exec-auth rejection.                                              |
| C4 Talos probe                   | In progress (F1 closed; live retry exhaustion re-scoped to F1a by owner decision; packaged startup with F9)     | On an allowlisted disposable Talos 1.14 fixture, demonstrate authenticated nonsensitive read and bounded COSI stream, TLS/authorization failures, cancellation/reconnect, and native shutdown cleanup.                                                   |
| C5 Kubernetes probe              | In progress (F2 client/credential-session boundary accepted; live list/watch and the version matrix with F3–F5) | On disposable Kubernetes 1.36, demonstrate scoped paginated Rust reads and watch/relist behavior with RBAC/TLS/scope faults and cleanup; run affected read/watch cases on 1.35 and 1.37.                                                                 |
| C6 UI, workers, and CSP          | Pending                                                                                                         | Qualify system/light/dark and density behavior, accessible feasibility states, lazy offline editor workers, bounded terminal/chart wrappers and disposal, restrictive CSP, and packaged asset behavior.                                                  |
| C7 advisories and inventory      | Complete on Linux (C8 scans open)                                                                               | Resolve or record applicability for each advisory without silent exclusions; generate/review dependency inventory and notices; preserve exact-revision security automation.                                                                              |
| C8 package/platform runtime      | Pending                                                                                                         | Qualify clean install/launch/shutdown/uninstall and helper/vault/assets on Linux, macOS Intel/Apple Silicon, and Windows 11; inspect production exclusion and signing/integrity feasibility.                                                             |
| C9 budgets and review            | Pending                                                                                                         | Measure declared synthetic and native workloads on recorded hardware, derive and enforce budgets, complete acceptance matrix and separate final review, and hand off with all failed/unrun evidence visible.                                             |

## Repository review and next phase — 2026-10-11

Reviewed `main` at `11d4e192de0e3c7a36d68053572d66811142eb73`, with a clean working tree before the planning change. This was a source/documentation review, not a fresh execution of application, native, cluster, platform, or security gates. The [foundation completion plan](../plans/foundation-completion-flash.md) records findings, acceptance cases, resources, and the next packet F0. The owner confirmed milestone 1 completion, Talos-hosted Kubernetes 1.36 plus Kubernetes-only 1.35/1.37 fixtures, and use of recommended available qualification resources.

Superseding evidence interpretation:

- [Automation's third run](automation.md#third-run-at-88983a8) records successful foundation and security jobs on all four desktop targets at `88983a8`. Earlier statements that no macOS/Windows native run or exact-revision security analysis had executed describe the earlier state. The Svelte migration and desktop shell changes followed that run, so their final cross-platform runtime evidence remains open.
- R4's command change was exercised by later aggregate native suites: the third CI run and [0009's final Linux native run](../decisions/0009-desktop-shell-layout.md#verification). The original R4 packet did not run the native gate at the time; no separate concurrent-storage responsiveness scenario is recorded. Preserve that distinction rather than keeping the aggregate native run marked absent.
- C7's inventory cache-dependence was fixed in [the second CI remediation](automation.md#second-run-at-d857906); graph-only module license status no longer depends on cache warmth. Counts in older evidence are historical. Current dependency/notice and security evidence must be refreshed after the remaining integrations.
- C1 had one open item besides packaged runtime: `pnpm contracts:check` passed locally but was not a step of the foundation workflow, although C1 step 5 required it. [F0](#f0-packet-evidence--refresh-the-baseline-and-enforce-existing-contract-checks) added it to the desktop job and proved deliberate drift fails.
- C4 is live-proven but remains open for restricted-role coverage, reconnect/resync, and live multi-event evidence; packaged helper startup is C8 work. C5 has no Rust Kubernetes adapter yet. C6 has a qualified Linux shell increment, with specialized views/workers still pending. C8/C9 remain open.

Documentation corrections in this planning change align the original C6 instructions with Svelte/0009, README's Go setup with `helper/go.mod` 1.27.2, and the dependency document's capability description with the implemented command surface. The Talos fixture allowlist's status line now records that the fixture was provisioned and destroyed. No application behavior or checkpoint acceptance changes.

Documentation verification on openSUSE Tumbleweed x86_64 with Node 24.21.0, pnpm 12.10.1, and Oxfmt 0.72.0: `pnpm format:check` passed; all 135 local file/directory and Markdown heading links in the five changed documents resolved; diff whitespace checks passed. The separate review checked packet dependencies, existing versus proposed APIs, credential ownership, resource bounds, owner decisions, and historical versus current evidence. Application/native/cluster/package suites were not rerun for this documentation-only change, so it adds no behavior qualification.

Plan revision 2 followed a same-day review of the plan against source, workflows, decisions, and the fixture allowlist. It moves the Kubernetes fixture harness ahead of the first live request, makes fixture and host authority explicit, replaces undefined bounds with starting values, and corrects packet mappings. Rerun on the same host with Node 26.11.1 and Oxfmt 0.72.0, calling the pinned binary directly because pnpm is not installed there: `oxfmt --check` passed over the repository; all 142 local file/directory and Markdown heading links in the six changed documents resolved; `git diff --check` passed. No application, native, cluster, or package suite ran.

## F0 packet evidence — refresh the baseline and enforce existing contract checks

Packet F0 of the [foundation completion plan](../plans/foundation-completion-flash.md#f0--refresh-the-baseline-and-enforce-existing-contract-checks), mapped to C0, C1 step 5, C2, C7, FND-001/002/005/008. Base revision `de19494` (`ft-foundation-completion`); the final revision is the commit carrying this entry. Working-tree changes: the desktop contract-gate step, one Rust supervisor fix with its regression test, the owner-directed macOS minimum, the fixture remediation authorization, and these records.

### Trigger and observable behavior

1. The reviewed revision's hosted Linux desktop job failed, and the failure was reproducible: the helper supervisor reported the wrong error class for an exited helper, so the operator saw `TALOS_PROBE_FAILED` ("the probe failed") instead of `TALOS_UNAVAILABLE` ("the endpoint or node is unavailable") for the same event, depending on scheduler timing.
2. `pnpm contracts:check` passed locally but was not a workflow step, so generated-contract drift could not fail CI, contradicting C1 step 5 and FND-002.
3. The declared macOS minimum contradicted the renderer's browser target, which F0 was required to settle from primary sources.

### Behavior and invariants

- A helper that has exited is reported as `SupervisorError::ChildExited` whether the parent observes the exit on the request write or on the following read. The invariant is that the helper reads requests from standard input until end of file and returns on that end of file (`helper/cmd/talos-pilot-helper/main.go`), so it never closes that pipe while it stays alive; every write failure on it means the helper is gone.
- Generated DTO, Protobuf, and TypeScript outputs must match their sources byte for byte, and a mismatch fails foundation CI and therefore the release gate that reuses it.
- The declared macOS minimum states the version the packaged renderer actually needs, not a best-effort floor.

### Files, contracts, and ADRs changed

| File                                                                                                         | Change                                                                                                                                   |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/src/helper/supervisor.rs`                                                                         | `write_async_frame` classifies a helper-request write failure as `ChildExited`, with the invariant documented; one regression test added |
| `tests` (in the same file)                                                                                   | `status_request_after_the_helper_exited_reports_child_exit`, deterministic, fails on the base revision                                   |
| `.github/workflows/check.yml`                                                                                | New named step `Verify generated contracts are current` (`pnpm contracts:check`) in the desktop job on all four matrix runners           |
| `.github/tauri.release.conf.json`                                                                            | `bundle.macOS.minimumSystemVersion` `13.0` → `13.3`                                                                                      |
| [0010](../decisions/0010-macos-minimum-webview.md)                                                           | New ADR: owner-directed macOS 13.3 minimum, with the WebKit evidence and alternatives                                                    |
| [design.md](../design.md)                                                                                    | macOS packaging target row now reads 13.3+ and links 0010                                                                                |
| [0008](../decisions/0008-svelte-skeleton-renderer.md)                                                        | Its WebView-baseline consequence now points at 0010 instead of leaving the floor implicit                                                |
| [ci-release.md](../ci-release.md), [dependencies.md](../dependencies.md)                                     | The macOS minimum statements match the decision                                                                                          |
| [foundation completion plan](../plans/foundation-completion-flash.md#7-open-questions-and-decision-triggers) | Section 7 records the F0 resolutions; the F9 macOS rows read 13.3                                                                        |
| [milestone 1 plan](../plans/milestone-1-flash.md#c8--qualify-packaged-targets-and-shutdown)                  | Its two macOS C8 acceptance rows read 13.3 so no plan still declares the 13.0 floor                                                      |
| [Talos C4 fixture allowlist](fixtures/talos-c4-disposable.md)                                                | New "Re-application authorization (2026-10-11)" subsection covering F1–F5, with the scope limits                                         |
| [automation record](automation.md#fourth-run-at-99c7099--first-run-under-the-75-minute-limit)                | Hosted results for `99c7099`, `fd91ce4`, `11d4e19`, and the in-progress `de19494`, plus the drift-gate evidence                          |
| This ledger                                                                                                  | C0.2's wrong Talos patch record corrected; C1's CI gate closed; this entry                                                               |

No IPC command, DTO, capability, CSP, dependency, lockfile, or generated output changed. The supervisor fix changes an internal error class that the existing safe projections already had a mapping for.

### Hosted runs of the reviewed revisions

Read through the GitHub Actions API on 2026-10-11 for the exact revisions; recorded in full in the [automation record](automation.md).

| Revision  | Workflow run                                        | Jobs                                                                          | Result                                                                                                                           |
| --------- | --------------------------------------------------- | ----------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `99c7099` | Foundation checks 38054135965, 38054138988          | renderer + 4 desktop                                                          | Pass; first runs under the 75-minute desktop limit (intel 28.5 / 28.1 min)                                                       |
| `fd91ce4` | Foundation checks 38121202573, 38121206395          | renderer + 4 desktop                                                          | Pass; first hosted runs of the Svelte shell and fixed layout                                                                     |
| `11d4e19` | Foundation checks 38122849142                       | renderer, macos-15, macos-15-intel, windows-2022 pass; **ubuntu-22.04 fails** | Failed in `cargo test --locked --all-targets`: `helper_exit_during_status_exchange_is_reported_and_reaped`, 68 passed / 1 failed |
| `11d4e19` | Security scans 38122849140                          | Trivy, CodeQL actions/javascript-typescript/rust                              | Pass on all four jobs                                                                                                            |
| `de19494` | Foundation checks 38125472686, Security 38125472701 | —                                                                             | Still in progress when this entry was written; no result claimed                                                                 |

### Exact commands, host, and results

Host: openSUSE Tumbleweed Linux x86_64 with a desktop session. Pinned toolchain provisioned without touching host configuration: Node 26.11.1 at `/tmp/talos-pilot-node26` (archive SHA-256 `3883bfc73f9a680ca4eab04b196068aaaab1373ffa77d8fc1a4408222495b651`, matched against the live `nodejs.org` `SHASUMS256.txt`), pnpm 12.10.1 installed into that prefix, Go 1.27.2 auto-selected by `/tmp/go/bin/go` from the module-cache toolchain, `protoc` 36.2 at `/tmp/talos-pilot-proto/protoc` (zip SHA-256 `121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278`, the CI pin), Rust 1.99.0 at `/home/kiss/.cargo/bin`. The default shell `PATH` still resolves `/usr/bin/rustc` 1.98.1 first, so the pinned Cargo directory must be prepended.

| Command                                                                                                                                                  | Result                                                                                                |
| -------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                                                                         | Pass; lockfile unchanged, supply-chain policy verified for 743 entries                                |
| `pnpm check`                                                                                                                                             | Pass; Oxfmt, type-aware Oxlint, `svelte-check`, 102 Vitest tests in 13 files, production build        |
| `pnpm format:check`                                                                                                                                      | Pass after formatting the three files this packet touched                                             |
| `pnpm lint`, `pnpm lint:svelte`                                                                                                                          | Pass                                                                                                  |
| `pnpm build`                                                                                                                                             | Pass; 215.94 kB JavaScript (65.35 kB gzip) and 171.01 kB CSS (18.13 kB gzip)                          |
| `pnpm contracts:check`                                                                                                                                   | Pass on the final tree; see the drift evidence below                                                  |
| `pnpm test:run`, `pnpm test:coverage`                                                                                                                    | Pass; 96.98% statements, 91.43% branches, 97.81% functions, 97.41% lines over the declared scope      |
| `pnpm test:e2e`                                                                                                                                          | Pass; 7 Chromium/axe flows. Needs `PLAYWRIGHT_BROWSERS_PATH` pointed at the host's browser cache      |
| `pnpm icons:check`                                                                                                                                       | Pass                                                                                                  |
| Rust `fmt`, Clippy default + `native-test` with `-D warnings`, `test --all-targets` in both feature sets, `doc` with `RUSTDOCFLAGS=-D warnings`, `build` | Pass; 70 passed, 1 ignored in each feature set, 3 fixture tests ignored by default                    |
| Go `gofmt`, `go vet`, `go test`, `go test -race`, `go mod verify`, `go build`                                                                            | Pass under the auto-selected Go 1.27.2 toolchain                                                      |
| `pnpm audit --audit-level=low`, `pnpm audit:go`                                                                                                          | Pass; no known frontend vulnerabilities, no reachable Go vulnerability                                |
| `pnpm inventory:check`                                                                                                                                   | Pass; 529 npm, 548 Cargo, and 143 Go modules current                                                  |
| `pnpm desktop:build`, then `pnpm production:check`                                                                                                       | Pass; production artifacts exclude WebDriver and expose no driver listener                            |
| `pnpm advisories:check`                                                                                                                                  | Pass; both recorded advisories still match the scanner report, dependency path, and linked executable |
| `pnpm test:native`                                                                                                                                       | Pass; 12 WebKitGTK cases, helper process count back to baseline                                       |
| actionlint 1.7.12 over all three workflows                                                                                                               | Pass                                                                                                  |
| `git diff --check`                                                                                                                                       | Pass                                                                                                  |

The separate review pass is recorded under "Separate final review" below and produced four documentation/comment corrections and one test improvement, all applied before this revision.

Deliberate-drift evidence for the new CI step, on the same host: adding a field to `proto/helper/v1/envelope.proto` exits 1 inside the generation step; changing a DTO doc comment so the generated `ApplicationErrorDto.ts` differs exits 1 with ``Generated IPC declaration `ApplicationErrorDto.ts` is stale``; the restored tree exits 0. The first hosted run of the step, on the F0 commits, then showed a platform limit and a larger problem: it passed on `ubuntu-22.04` and `macos-15` and failed on `windows-2022`, because the pinned Go plugin reports its own file name there (`protoc-gen-go.exe v1.36.12`) before any byte is compared. Because a failed step skips the rest of its job, the Windows job then lost steps 11 to 26 — both Clippy and both test configurations, the Go gates, `desktop:build`, `production:check`, `test:native`, and `cargo audit`. Both harness gaps are now fixed (`scripts/lib/contracts.ts` normalizes only the executable suffix, with unit coverage, and the formatter is invoked through its own Node entry instead of the `pnpm` shim), and the step moved to the end of the desktop job so a cheap source check can no longer skip a platform's platform-specific evidence. The byte comparison is unchanged and no comparison was weakened. Two first attempts were environmental, not product failures: `pnpm test:e2e` could not find the browser because the session's `PLAYWRIGHT_BROWSERS_PATH` pointed at an empty temporary directory, and a first `pnpm test:native` run failed one case because the packet's own `TALOS_PILOT_BUILD_ID=f0-gates-local` override does not match the suite's 40-hex build-identity assertion. Both passed once corrected; the suite derives the identity from the git revision when the variable is unset, as CI supplies.

### Reproduction and fix of the hosted failure

Deterministic reproduction on the F0 host: kill and reap the helper, then request status. The base revision returned `Some(Pipe(Os { code: 32, kind: BrokenPipe }))`; the fix returns `ChildExited`. The new test fails on the base revision and passes after it. Nineteen other Rust tests exercise the same supervisor, and the existing `helper_exit_during_status_exchange_is_reported_and_reaped` case, which races `start_kill()` against the exchange, now passes through both observation orders.

### Evidence class

Native on Linux x86_64: `pnpm test:native` (real Rust↔Go helper over real pipes, real Tauri IPC, capability denial, helper reaping). Mocked: the Playwright flows, which script the IPC entry point. Rust/Go integration: the supervisor's own tests build and drive the real Go helper. Real cluster: none. No Talos, Kubernetes, macOS, Windows, installer, or vault-unlock evidence is claimed from this packet.

### Fixture identity, versions, topology, allowlist, cleanup

No fixture was provisioned, contacted, or destroyed. The [C4 allowlist](fixtures/talos-c4-disposable.md) still describes the destroyed 2026-10-09 run (`talos-pilot-c4-20261009`, Talos v1.14.1, Kubernetes v1.36.5, 3 control planes + 1 worker, CIDR `10.79.0.0/24`). Its scope now also records the owner's 2026-10-11 authorization to re-apply the same fixture-scoped host remediation for F1–F5, with nothing broader, and states that F1's version refresh is not covered by it. No host firewall, zone, bridge, or interface was changed in this session.

### Passed, failed, and unexecuted rows

Passed: every command in the table above, on the final tree.

Failed then resolved: the `ubuntu-22.04` desktop job at `11d4e19` (product defect, fixed here, with a regression test); two first-attempt gate failures caused by this session's environment rather than the product, corrected and re-run.

Hosted results for this revision: Foundation checks run 38155107982 completed with `renderer`, `desktop (ubuntu-22.04)`, `desktop (macos-15)`, and `desktop (macos-15-intel)` green and `desktop (windows-2022)` failing on the new contract step's harness, which is fixed in a later commit of this branch. The Ubuntu job is the one that failed at `11d4e19`, so the supervisor fix is confirmed on the hosted Linux runner, and the three POSIX runners all executed the contract step successfully. `de19494`'s Foundation and Security runs also completed green. Recorded in full in the [automation record](automation.md#seventh-run-at-fae291d--the-first-hosted-run-of-the-contract-step).

Unexecuted here, with the practical limit: the Windows runner's execution of the reworked contract step (no Windows host); every C5–C9 row; the reconnect/resync and live multi-event C4 rows; packaged-installer helper startup. The `os:reader`-role denial is now executed — see the F1 entry below. No real-cluster Kubernetes or cross-platform claim is made. `pnpm test:native` and `pnpm desktop:build` still share `src-tauri/target/release/talos-pilot`, so `pnpm production:check` must follow a default `pnpm desktop:build`, which is the order used above.

### Separate final review

Findings and their resolution:

1. **The reviewed revision's CI failure had been recorded as a passing platform history.** The review note in the plan said the hosted results "should exist; this review did not read them". Reading them found a real Ubuntu failure. Fixed, with regression coverage; the automation record now distinguishes the four hosted revisions.
2. **The macOS minimum was unenforced prose.** 0008 recorded the 13.3 requirement as a caveat while the release config still said 13.0, so the bundle would launch on a WebView the build target does not support. Resolved by the owner's decision and recorded in 0010.
3. **The drift gate was not enforced where it mattered.** Adding the step to the desktop job also adds it to the release gate, which reuses that workflow; the step runs on every matrix runner rather than one platform.
4. **The Talos patch record contradicted the design.** Verified against the upstream release list; the ledger was the wrong record and is corrected.
5. **Two documents still declared the old floor.** The milestone 1 plan's C8 macOS rows said "macOS 13 minimum", which 0010's own acceptance criterion forbids. Both rows now read 13.3.
6. **One record overstated the operator-visible difference.** The automation record claimed the status path also showed two different codes. It does not: `application_error` maps `Pipe` and `ChildExited` alike to `HELPER_UNAVAILABLE`. Only the Talos probe projection diverges, and the record now says so.
7. **An existing test's name over-promised.** `helper_exit_during_status_exchange_is_reported_and_reaped` asserted only the error class. It now also asserts the child was reaped, which `refresh_status` guarantees.
8. **Known cost of the new CI step.** `pnpm contracts:check` also runs `cargo check --locked`, so the step adds a debug-profile compile on each of the four desktop runners before Clippy and the test suites. That is accepted for now; the plan already allows restricting the step with an explicit condition if a non-Linux runner shows a tool-induced byte difference.
9. **Scope discipline.** The fix does not retry, does not change the protocol, and does not touch a command name, DTO, capability, or renderer path; the macOS change adds no code. No unrelated refactoring was performed, and no scratch file was left in the repository.

### Next smallest packet and prerequisites

**F1 — close Talos read/stream qualification gaps.** Prerequisites: this packet's accepted handoff; owner confirmation to re-apply the fixture-scoped remediation, now recorded for F1–F5; and a deliberate fixture refresh that moves `pkg/machinery`, `talosctl`, the Talos image, and the fixture manifest to **v1.14.2** together. F1 must also amend the allowlist for the fixture-local actions it uses, the denied `os:reader` identity, and the Kubernetes API endpoint F3 will need, before performing any of them.

## F1 packet evidence, part 1: provisioning refresh and restricted identities

Packet F1 of the [foundation completion plan](../plans/foundation-completion-flash.md#f1--close-talos-readstream-qualification-gaps),
steps 1–3, mapped to C4 and FND-004. Base revision `fae291d`; the final revision is the commit carrying this entry. **F1 remains in progress**: steps 4 and 5, the mid-stream reconnect/resync implementation and the live multi-event and interruption evidence, are not delivered here and are named under "Not delivered" below.

### Trigger, behavior, and invariants

F0 established that the current stable Talos 1.14 patch is `v1.14.2`, while the module, the `talosctl` binary, the fixture image, and the fixture manifest all pinned `v1.14.1`. C4 was also open for restricted-role coverage: no identity other than the fixture's admin credential had ever been exercised through the production path.

Three invariants this packet demonstrates:

1. Every Talos pin moves together. A mixed module/CLI/image/manifest version is not observable in any passing case, so the refresh is one coordinated change and the fixture manifest is the one the harness compares against.
2. An identity with a genuine permission gap surfaces as the permission state, not as an unavailable or failed state, and is never retried.
3. A read path that is permitted by a role is permitted for that role only because the pinned upstream rule allows it, not because the client fell back to a broader credential.

### What changed

| File                                                       | Change                                                                                                                                                                       |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `helper/go.mod`, `helper/go.sum`                           | `github.com/siderolabs/talos/pkg/machinery` v1.14.1 → v1.14.2; `go mod tidy`                                                                                                 |
| `tests/fixtures/talos-c4.json`                             | `talosVersion` → `v1.14.2`; added the `readerContext` and `deniedContext` labels the fixture derives                                                                         |
| `src-tauri/.local-tools/talosctl` (ignored, not committed) | v1.14.1 → v1.14.2, digest-verified against the release's published `sha256sum.txt`                                                                                           |
| `src-tauri/tests/talos_fixture.rs`                         | `import` now takes the allowlisted context label for the credential it imports; new live test `reads_with_a_reader_identity_and_denies_a_credential_without_the_probe_roles` |
| `scripts/talos-fixture.ts`                                 | `--reader-talosconfig` and `--denied-talosconfig`, both required file references validated exactly like `--talosconfig`                                                      |
| [C4 allowlist](fixtures/talos-c4-disposable.md)            | F1's three fixture-local actions, the derived-config procedure, the corrected Kubernetes endpoint, and the active-zone comparison rule                                       |
| [dependencies.md](../dependencies.md)                      | The Talos pin statement and its primary-source basis                                                                                                                         |

### Upstream rule evidence

The pinned rules map is [`machined.go` v1.14.2](https://github.com/siderolabs/talos/blob/v1.14.2/internal/app/machined/pkg/system/services/machined.go), read from a `v1.14.2` checkout:

- `/machine.MachineService/Version` → `os:admin`, `os:operator`, `os:reader`;
- `/cosi.resource.State/Watch` (also `Get`/`List`) → the same three;
- `os:etcd:backup` is granted exactly four methods (`EtcdAlarmList`, `EtcdMemberList`, `EtcdSnapshot`, `EtcdStatus`), and `Authorizer.FallbackRoles` is `os:admin`, so every other method is denied to it;
- `/machine.MachineService/Reboot` → `os:admin`, `os:operator` only; `Reset` and `Upgrade` are `os:admin` only and stay unused.

`os:reader` therefore permits both probe APIs and `os:etcd:backup` permits neither, which is what the plan predicted without having checked. Role-scoped credentials come from `/machine.MachineService/GenerateClientConfiguration`, which is `os:admin` only and signs from the machine's existing secrets bundle without persisting anything on the node.

### Fixture identity, versions, topology, and cleanup

Provisioned on 2026-10-11 with the owner-approved fixture-scoped remediation: `talosctl` v1.14.2, `cluster create qemu --name talos-pilot-c4-20261009 --cidr 10.79.0.0/24 --talos-version v1.14.2 --kubernetes-version v1.36.5 --controlplanes 3 --workers 1 --presets iso --state /tmp/tpc4/state`. It completed end to end this time, `PROVISION-EXIT=0`, including bootstrap, with no manual bootstrap step:

- bridge `talosb8c871e1` on `10.79.0.1/24`, the same deterministic name as the 2026-10-09 run, bound to the `talos-pilot-c4` zone together with its four `veth` peers;
- control planes `10.79.0.2`, `10.79.0.3`, `10.79.0.4` and worker `10.79.0.5`, exactly the recorded addresses, all `Talos (v1.14.2)` per `get members`;
- contexts: `talos-pilot-c4-20261009` (`os:admin`), `reader@talos-pilot-c4-20261009` (`os:reader`), `etcd:backup@talos-pilot-c4-20261009` (`os:etcd:backup`), each with the three recorded endpoints and the four recorded nodes;
- Kubernetes API endpoint `https://10.79.0.1:6443` (the cluster VIP on the bridge gateway), which F3 must add as a Kubernetes endpoint rather than reuse a Talos endpoint.

After the run the fixture was destroyed and the host restored: no `qemu-system` process, no `talos*` bridge or fixture `veth`, no `/tmp/tpc4`, no synthetic credential file, both `iptables` counters back to `0`, the 12-zone list restored, default zone `public`, and active zones back to the baseline captured immediately before provisioning (`docker`/`public`; `libvirt` is absent on this host now because `libvirtd` is inactive).

### Commands and results

Host: openSUSE Tumbleweed Linux x86_64, Node 26.11.1, pnpm 12.10.1, Rust 1.99.0, Go 1.27.2, protoc 36.2, `talosctl` v1.14.2. Harness command:

```sh
pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json \
  --talosconfig /tmp/tpc4/talosconfig \
  --reader-talosconfig /tmp/tpc4/talosconfig.reader \
  --denied-talosconfig /tmp/tpc4/talosconfig.etcdbackup
```

Result: **4 passed; 0 failed** in 24.17 s, through the production path (`TalosSessionStore` → `HelperService` → packaged helper → official Talos client), with these printed projections:

```text
fixture read: Talos v1.14.2, stage Some("running"), ready Some(true), projected events: 1
os:reader read: Talos Some("v1.14.2"), stage Some("running"), projected events: 1
worker node 10.79.0.5 read: stage Some("running"), ready Some(true)
failover read with a dead leading endpoint: stage Some("running"), ready Some(true)
os:etcd:backup denied: TALOS_UNAUTHORIZED (retryable: false, message: Talos rejected the configured permissions.) after 4.163409ms
```

An independent CLI-level check with the same credentials confirms the classification comes from the cluster, not from the harness: `talosctl --talosconfig talosconfig.reader --nodes 10.79.0.5 version` returns the server version, while the same command and `get machinestatus --watch` with `talosconfig.etcdbackup` both fail with `rpc error: code = PermissionDenied desc = not authorized`.

Go and Rust gates on the final revision: `gofmt`, `go vet`, `go test`, `go test -race`, `go mod verify`, `go build`; Rust `fmt`, Clippy with `-D warnings` in both feature sets, all-target tests in both feature sets, rustdoc, build, `pnpm check`, `pnpm contracts:check`, `pnpm production:check`, `pnpm test:native`, `pnpm test:e2e`, `pnpm audit:go`, `pnpm inventory:check`, and `git diff --check`.

### Evidence class

Real cluster through the production path: the four harness cases above, on the allowlisted disposable fixture. Real cluster at the CLI level: the denial and permission cross-check. Not used as the C4 proof here: any mock or synthetic event stream.

### Passed, failed, and unexecuted

Passed: the coordinated v1.14.2 refresh (module, `talosctl`, image, manifest); authenticated read and node-pinned stream on v1.14.2; endpoint failover; the worker-node identity split; fail-closed target and authority cases; `os:reader` permitted read and stream; `os:etcd:backup` denial as a non-retryable permission state; `pnpm inventory:check` after regenerating the inventory for the new `go.sum`.

**Not delivered, and therefore still open in C4:**

- F1 step 4, mid-stream reconnect/resync. Nothing reconnects today: a stream that fails mid-flight ends, and the renderer marks the last projection stale. A replacement-snapshot generation with preserved sequence identity, the bounded retry policy that excludes permission and TLS failures, and the deterministic framed tests for order, gap, and slow-consumer faults are unimplemented.
- F1 step 5's live multi-event and interruption evidence. The stable fixture projected one event inside the settle window on both runs, so ordering is asserted on whatever arrives and no live interruption case was executed. Producing several real status events and a real network interruption needs the step 4 behavior to be worth observing, so the two steps belong to one increment.
- A prohibited sensitive-resource subscription remains inexpressible in protocol v1: the probe has no resource selector, so a denied read of a sensitive resource cannot be requested at all. Recorded rather than manufactured, as the plan requires.
- Packaged-installer helper startup, the macOS/Windows fixture matrix, and every C5–C9 row.

### Separate review

The F0 review's findings are recorded in the F0 entry above. This packet's own review checked: that the new manifest fields cannot be satisfied by a credential for the wrong cluster (the asserted context labels are the ones `config new` derives, and a mismatch fails the import); that the denial assertion cannot pass vacuously (the test fails if any projection is accepted, and asserts both the code and non-retryability); that the extra credentials are file references, never inline, and stay outside the repository; that the version refresh cannot be a partial mix (module, CLI, manifest, and fixture all moved, and the manifest is what the harness enforces); and that no new fixture action exceeds the amendment. Two harness defects were found and fixed during the live run: the added `import` parameter had one missed call site, and `oxfmt` does not format Rust, so the fixture test is covered by `cargo fmt` instead.

### Next increment

**F1, part 2**: implement mid-stream reconnect/resync and obtain the live multi-event and interruption evidence, then close F1. Its prerequisites are this packet's accepted refresh and a fixture reprovisioning under the same owner-approved remediation, which the allowlist already authorizes for F1–F5.

## F1 packet evidence, part 2: mid-stream reconnect/resync and interruption evidence

Packet F1 of the [foundation completion plan](../plans/foundation-completion-flash.md#f1--close-talos-readstream-qualification-gaps),
steps 4–5, mapped to C4 and FND-004. Base revision `c310fbd` (clean tree); the
final revision is the commit carrying this entry — this packet is handed off as
one working-tree change set. **F1 remains in progress**: the deterministic,
native, and renderer evidence is delivered and green, but the live fixture rows
below could not execute on this host (no root, no KVM), so C4 keeps its live
reconnect rows open and F1 is not closed.

### Trigger, observable behavior, invariants

F1 part 1 recorded that a mid-stream failure ended the subscription and left the
last projection stale, with no replacement-snapshot generation. This packet
implements the required behavior: an authenticated `MachineStatus` stream that
fails mid-flight becomes stale, reconnects through the official Talos client
within the foundation plan's section 4 policy, and delivers a replacement
snapshot under a new generation with the same subscription, node, and
credential identity and a continuous sequence.

Invariants enforced and tested:

1. At most three reconnect attempts **in total** per subscription; the first
   starts immediately after the interruption, waits of 0.5 s and 1 s (jitter at
   most ±20%) precede attempts two and three, and each attempt is bounded by a
   15-second deadline covering watch re-establishment and the replacement
   snapshot. An established watch is never cut by that deadline. The 256-event
   cap counts replacement snapshots and is never raised.
2. Permission (`talos_unauthorized`), TLS (`talos_certificate_invalid`), and
   input (`talos_config_invalid`, `talos_invalid_target`) failures never retry;
   an exhausted budget ends the subscription with terminal `talos_unavailable`,
   and nothing after a stale marker is presented as current until a valid
   replacement snapshot arrives.
3. Sequence values advance by exactly one across the whole subscription and are
   never reset by a reconnect; only a replacement snapshot (the sole frame
   allowed to advance the generation) closes a stale marking. Rust rejects
   sequence gaps, duplicates, stale/foreign generations, a second stale marker
   before a replacement snapshot, and any non-snapshot data frame after a stale
   marker, as `TalosStreamInvalid`. Cancel-safe framing, startup deadlines,
   terminal/cancel race handling, and node-pinned COSI routing (0007) are
   unchanged, and no status polling was added (R3 stays deferred).

[Decision 0011](../decisions/0011-talos-stream-reconnect-and-generations.md)
records why the helper owns the reconnection and how the wire contract carries
generations.

### Files/contracts/ADRs changed

| File                                                                                                                                                                                            | Change                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `proto/helper/v1/envelope.proto`                                                                                                                                                                | `TalosProbeResponse.generation` (always 1); `TalosStatusEvent.generation`/`snapshot`; new `TalosStreamStale` marker (no data, no sequence consumed)                                                                                                               |
| `helper/internal/protocol/helper/v1/envelope.pb.go`                                                                                                                                             | Regenerated by `pnpm contracts:generate` (never hand-edited)                                                                                                                                                                                                      |
| `helper/cmd/talos-pilot-helper/main.go`                                                                                                                                                         | `subscriptionStream` state machine and `reconnectPolicy` (3 attempts, 0.5/1 s backoffs, ±20% jitter, 15 s attempt deadline) on the same node-pinned session                                                                                                       |
| `helper/cmd/talos-pilot-helper/main_test.go`, `testdata/`                                                                                                                                       | Deterministic framed tests: generation resync with continuous sequence, attempt budget/exhaustion, no-retry classes, cancel during backoff and during an attempt, attempt-deadline retry, policy bounds; scripted `probehelper`/`endracehelper` fixtures          |
| `src-tauri/src/contracts.rs`, `src/lib/ipc/generated/`                                                                                                                                          | `TalosProbeEventDto` gains decimal `generation` and `snapshot`; regenerated TypeScript                                                                                                                                                                            |
| `src-tauri/src/helper/protocol/validate.rs`                                                                                                                                                     | Probe response generation must be 1; status events need a nonzero generation; `TalosStreamStale` kind/payload pairing                                                                                                                                             |
| `src-tauri/src/helper/supervisor.rs`                                                                                                                                                            | Strict sequence/generation/stale validation on every frame, stale-marker projection, scripted-frame tests (order, gap/duplicate, stale/foreign generation, slow consumer, exhaustion and non-retryable terminals, helper exit mid-stream)                         |
| `src/lib/ipc/validation.ts`, `src/lib/state/talosProbe.svelte.ts`                                                                                                                               | Runtime bounds for generation/snapshot and marker shape; state machine keeps the retained projection stale until a replacement snapshot, rejects stale/foreign/duplicate events as contract violations                                                            |
| `src-tauri/tests/talos_fixture.rs`, `scripts/talos-fixture.ts`                                                                                                                                  | Three live cases (reboot-driven multi-event/interruption with recovery-or-exhaustion, deterministic exhaustion via suspended worker, cancellation during reconnect) and the allowlisted action runners; the harness takes the pinned `talosctl` by file reference |
| `docs/protocol/helper-v1.md`, `docs/protocol/application-ipc.md`, [fixture allowlist](fixtures/talos-c4-disposable.md), [ADR 0011](../decisions/0011-talos-stream-reconnect-and-generations.md) | Reconnect/resync wire and IPC contract, the recorded execution form of the two already-authorized fixture actions (no new authority), and the placement decision                                                                                                  |

### Exact commands; host/toolchain/WebView; exit results

Host: sandboxed Linux x86_64 session over the openSUSE Tumbleweed development
host. The pinned tools were **not** installed where the task expected
(`~/.local/toolchains` is read-only in this sandbox), so they were provisioned
into the session scratchpad `/tmp/tp-tools` with verified digests: Node
26.11.1 (nodejs.org `SHASUMS256.txt`), Go 1.27.2 (go.dev release index),
Rust 1.99.0 + rustfmt/clippy (rustup into `~/.cargo`), protoc 36.2 (the CI pin
and SHA-256 from `.github/actions/install-protoc/action.yml`), pnpm 12.10.1.
WebKitGTK 605.1.15/GTK 3.24.52 host runtime; the sandbox has no `-devel`
packages, so a scratchpad pkg-config/link shim resolves the Tauri GTK/WebKit
link set against the installed runtime libraries (environment bootstrap only;
no product code or check is altered). `cargo-audit` 0.22.2 (the CI pin) was
installed for the advisory gate. All commands ran on the final tree:

| Command                                                                                                                | Result                                                                                                                                               |
| ---------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gofmt -l .`, `go vet ./...`, `go test ./...`, `go test -race ./...`, `go mod verify`, `go build ./...` (in `helper/`) | Pass (race detector included)                                                                                                                        |
| `cargo fmt --all -- --check`                                                                                           | Pass after applying the pinned formatter to the packet's new tests                                                                                   |
| `cargo clippy --locked --all-targets -- -D warnings` (default and `native-test` feature sets)                          | Pass                                                                                                                                                 |
| `cargo test --locked --all-targets` (both feature sets), `cargo test --locked --doc`                                   | 76 passed, 0 failed, 1 ignored (vault test, as before); doctests 0                                                                                   |
| `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps`, `cargo build --locked`                                      | Pass                                                                                                                                                 |
| `pnpm check`                                                                                                           | Pass: Oxfmt, type-aware Oxlint, `svelte-check` (warnings as errors), 113 renderer tests, production Vite build                                       |
| `pnpm contracts:check`                                                                                                 | Pass: Rust/Go/TypeScript regeneration is byte-stable on the final schema                                                                             |
| `pnpm test:e2e`                                                                                                        | Pass: 7 Playwright flows (mock transport) on Chromium Headless Shell 156.0.8078.4                                                                    |
| `pnpm test:native`                                                                                                     | Pass: 12 WebdriverIO specs against the real test-built app (real Rust↔Go handshake, ACL denials, Talos probe commands, helper reaped after shutdown) |
| `pnpm desktop:build`, `pnpm production:check`                                                                          | Pass: default release executable rebuilt after `test:native` replaced it; production artifacts exclude WebDriver                                     |
| `pnpm advisories:check`                                                                                                | Pass: the two recorded advisories match the report, dependency path, and linked executable                                                           |
| `pnpm audit:go`                                                                                                        | Pass: 0 findings in the linked call graph (1 uncalled finding in a required module, as reported by govulncheck)                                      |
| `pnpm inventory:check`                                                                                                 | Pass: inventory current (529 npm, 548 cargo, 143 Go modules); `go.sum` unchanged by this packet                                                      |
| `git diff --check`                                                                                                     | Pass                                                                                                                                                 |

Two first-attempt failures were environmental and are not product results: the
first `pnpm test:native` run panicked at app setup with `EROFS` because this
sandbox pins `HOME` to a read-only home (the app data dir defaulted under it);
re-running with `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` pointed at
the scratchpad passed all 12 specs. `pnpm test:e2e` first failed only because
the Chromium headless shell was not yet downloaded into the scratchpad
browsers path.

### Native vs mocked vs real-cluster evidence

- **Deterministic framed (real Go/Rust protocol code, scripted peers):** the Go
  helper suite drives the real `runProbe` state machine through scripted probe
  sessions and a scripted `probehelper` frame fixture; the Rust suite drives
  the real supervisor through scripted frames. These prove order, gap,
  duplicate, stale/foreign generation, slow consumer, cancel during backoff and
  reconnect, helper exit mid-stream, retry exhaustion, and no retry on
  permission/TLS failures — all without a cluster.
- **Native:** `pnpm test:native` exercises real Tauri IPC, channels, ACL
  denials, and helper supervision/cleanup (Linux x86_64 WebKitGTK 605.1.15).
- **Renderer:** 113 Vitest tests including the stale-until-replacement-snapshot
  state machine and foreign-event rejection; 7 Playwright flows remain mock
  transport evidence only.
- **Real cluster:** **none in this session** (see the unexecuted rows).

### Fixture identity, versions, topology, allowlist, cleanup evidence

The C4 fixture was **not provisioned** in this session, so there is no new
fixture identity or cleanup run to record. The harness (`pnpm talos:fixture --
--manifest tests/fixtures/talos-c4.json --talosconfig … --reader-talosconfig …
--denied-talosconfig … --talosctl …`) is ready for `talos-pilot-c4-20261009`
(Talos v1.14.2, Kubernetes v1.36.5, 3 control planes + 1 worker) and now
executes the two already-authorized fixture-local actions — the admin-identity
worker reboot and the worker-QEMU `SIGSTOP`/`SIGCONT` identified by the
fixture's `--state` directory and machine name — through the live tests. The
allowlist entry of 2026-10-11 records that execution form and grants no new
authority. The restoration checklist applies unchanged once the fixture runs.

### Passed, failed, and unexecuted rows and practical limits

Passed: the full deterministic framed suite (helper and supervisor), the
generation/sequence/stale contract at all three boundaries (Protobuf + Go
producer, Rust consumer, TypeScript adapter and state), every static/type/doc
gate for the changed boundaries, native IPC/ACL/helper-cleanup evidence,
production exclusion, and the dependency/advisory gates.

Failed then corrected: `cargo fmt` drift in the packet's new tests (fixed with
the pinned formatter); the two environmental first attempts recorded above.

**Unexecuted, with the practical limit:** every live fixture row — several real
status events, the real interruption, same-subscription recovery with a
replacement snapshot, live retry exhaustion, cancellation during reconnect, and
post-run host restoration. This host cannot run the fixture: the sandbox
refuses `sudo` ("no new privileges" flag is set, `sudo -n` exits non-zero) and
`/dev/kvm` does not exist, so the recorded provisioning (host bridge, the
owner-approved firewalld/`iptables` remediation, and four KVM guests) cannot
run here. The live tests are implemented and `#[ignore]`-gated for
`pnpm talos:fixture`; they must run on a root-capable host with KVM before F1
and C4 can close. Also still unexecuted: packaged-installer helper startup
(F9), the macOS/Windows platform rows, and every C5–C9 row.

### Separate final review findings and resolutions

1. **The live reboot guard was too weak.** `reboot_worker` accepted any
   recorded fixture node; a control-plane node is in that list. Strengthened to
   reject any API-endpoint node and to require the fixture's single worker, so
   the allowlist's "never a control-plane guest" rule is enforced in code.
2. **Formatting drift** in the new Rust tests; fixed with the pinned
   `cargo fmt` and re-checked (`--check` clean).
3. **The native harness environment** in this sandbox needed explicit
   `XDG_*` scratchpad dirs because `HOME` is pinned read-only; recorded as an
   environment fact, no product or test change was made for it.
4. **Concurrent work in the tree.** This packet's tests, docs, and fixture code
   landed alongside the protocol/implementation changes in one uncommitted
   change set; the combined tree was verified as a whole by every gate above,
   and no semantic conflict was found between the pieces.

### Next smallest packet and prerequisites

**Finish F1's live rows, then close F1.** Prerequisite: a host that can run
`sudo -n` and KVM. Run the exact `pnpm talos:fixture` command above, verify the
fixture identity/addresses first, execute the three live cases, then destroy
the fixture and complete the restoration checklist; the F1 part 2 entry above
then gains its live-evidence rows and C4's remaining open rows can close.
**F2 — establish the Kubernetes client and credential-session boundary** is the
next packet; its pin/API research may start now, but F2 acceptance must not be
claimed before F1's live evidence exists. Packaged startup stays with F9; R3
stays deferred. _Executed on 2026-10-12; the live-evidence rows and outcomes are
in part 3 below._

## F1 packet evidence, part 3: live fixture rows on the unsandboxed host — 2026-10-12

Packet F1 steps 1–5 executed live, mapped to C4 and FND-004. Base revision
`101d697` (clean tree); the final revision is the commit carrying this entry,
handed off as one working-tree change set. **F1 is not closed**: six of the
seven live rows passed and the live retry-exhaustion row failed in both runs
with a reproduced, recorded cause (below). C4 keeps that row open, C5's
acceptance stays gated on F1, and F2's acceptance cannot be claimed yet. This
run supersedes the part 2 entry's unexecuted fixture rows, and the VPN question
left open by the [F2 recheck](#f2-recheck-on-the-unsandboxed-development-host--2026-10-12)
was answered by the owner before provisioning (shadowing of `10.79.0.0/24`
accepted for the run).

### Trigger, observable behavior, invariants

The seven `#[ignore]` live rows in `src-tauri/tests/talos_fixture.rs` ran
against the reprovisioned `talos-pilot-c4-20261009` fixture through the recorded
harness command. Part 2's behavior and invariants applied unchanged. One harness
defect found by the first run was fixed in this change set:

- A panicking live case left the worker's QEMU process `SIGSTOP`ped: run 1's
  exhausted-budget case panicked before its resume step, and the three
  subsequent worker-touching rows then failed against the frozen worker
  (`TALOS_UNAVAILABLE` reads, a watch whose break never surfaced, an early
  stream end). That is why run 1 recorded 3 passed / 4 failed. `SuspendedWorker`
  now resumes the worker on every exit path including panic; no assertion,
  deadline, or product behavior was changed.

The remaining failure is a test-design limit, not a product defect: with the
recorded actions only (admin-identity reboot, worker-QEMU `SIGSTOP`/`SIGCONT`),
the live exhaustion scenario cannot deterministically hold the worker
unreachable across the three reconnect attempts, because the watch break only
surfaces once the worker's API is back, and the helper's first attempt then
reconnects in about a millisecond, before any `SIGSTOP` can land. The frozen,
already-reconnected stream goes silent; the helper's policy never cuts an
established watch by the attempt deadline, so no exhaustion is produced. This
is the open finding below.

### Files/contracts/ADRs changed

| File                                                 | Change                                                                                                                             |
| ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/tests/talos_fixture.rs`                   | `SuspendedWorker` guard (resume-on-drop) and its use in the exhausted-budget case; assertions, deadlines, and policy are unchanged |
| [fixture allowlist](fixtures/talos-c4-disposable.md) | Status line, 2026-10-12 host-issued identities, and the run's restoration record                                                   |
| this ledger, `README.md`                             | Live evidence, checkpoint/stage corrections                                                                                        |

The wire contract, helper, Rust supervisor, renderer, and the design/ADR set are
unchanged.

### Exact commands; host/toolchain/WebView; exit results

Host: the unsandboxed openSUSE Tumbleweed x86_64 development host of the
[F2 recheck](#f2-recheck-on-the-unsandboxed-development-host--2026-10-12)
(`sudo -n` and `/dev/kvm` present; no host configuration was changed). Pinned
tools were provisioned into the session scratchpad: Node 26.11.1 (nodejs.org
`SHASUMS256.txt`), pnpm 12.10.1, protoc 36.2 (the CI SHA-256 from
`.github/actions/install-protoc/action.yml`), Go 1.27.2 (module cache), Rust
1.99.0 (rustup). `src-tauri/.local-tools/talosctl` already held v1.14.2; its
SHA-256 `c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4`
matches the release `sha256sum.txt` `talosctl-linux-amd64` entry, so it was not
re-downloaded.

Baseline captured before provisioning, on the final tree: the thirteen-zone list
with default `public`; active `docker`/`libvirt`/`public`; `filter-FORWARD` and
`nat/POSTROUTING` containing only the pre-existing DOCKER/LIBVIRT rules; the
pre-provisioning interface set; zero `qemu-system` processes; the fixture name,
`/tmp/tpc4`, and `10.79.0.0/24` unused. The owner chose to accept `10.79.0.0/24`
being shadowed by the fixture bridge while the fixture existed.

| Command                                                                                                                                                                                                                                                | Result                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The allowlist's `cluster create qemu` command (verbatim block in the allowlist; `sudo -n -E sh -c 'umask 077; cd /tmp/tpc4; …'`)                                                                                                                       | Pass; no bootstrap timeout, so the recorded `bootstrap` fallback was not needed                                                                                                                     |
| The allowlist's firewalld zone commands and `--change-interface` binds for `talosb8c871e1` and its four veths                                                                                                                                          | Pass                                                                                                                                                                                                |
| The allowlist's five `iptables` rules (FORWARD ×4, `nat` POSTROUTING MASQUERADE)                                                                                                                                                                       | Pass                                                                                                                                                                                                |
| The allowlist's `config new` issuance ×2, `config node` on all three contexts, and `chown kiss:kiss` on exactly the three credential files                                                                                                             | Pass                                                                                                                                                                                                |
| `pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json --talosconfig /tmp/tpc4/talosconfig --reader-talosconfig /tmp/tpc4/talosconfig.reader --denied-talosconfig /tmp/tpc4/talosconfig.etcdbackup --talosctl src-tauri/.local-tools/talosctl` | Run 1: `3 passed; 4 failed` in 180.24 s (guard cascade + the open finding). Run 2 after the guard fix: `6 passed; 1 failed` in 1863.20 s (the open finding only). Full outputs kept as session logs |
| The allowlist's `cluster destroy` command, the five `iptables -D` counterparts, `firewall-cmd --permanent --delete-zone=talos-pilot-c4` + reload, and `rm -rf /tmp/tpc4`                                                                               | Pass; restoration verified against the baseline (below)                                                                                                                                             |

Diagnostics for the open finding used a temporary Go driver
(`helper/cmd/tpdebug`, deleted before staging) over the real `talosprobe`
package: a fresh watch against a `SIGSTOP`ped worker was bounded at 15 s per
attempt (attempts 2 and 3 of the recorded policy), a `SIGSTOP` 2.5 s after the
`rebooting` stage meant the watch never broke within 120 s, and a reboot's break
surfaced only when the worker's API was back, with a fresh watch reconnecting
within 1 ms. The harness's own run-2 output reproduces the last point: the
`live_interruption` row recovered under generation 2 with continuous sequence 2.

### Native vs mocked vs real-cluster evidence

- **Real cluster (new):** run 2's row results, in order of completion —
  `reads_and_streams_the_allowlisted_fixture` ok (fixture read Talos v1.14.2;
  worker node read stage `running`, ready true); `live_interruption…` ok
  (reboot → stale → replacement snapshot generation 2, sequence 2; worker
  reports running again); `fails_over_to_a_reachable_allowlisted_endpoint` ok;
  `reads_with_a_reader_identity…` ok (`os:reader` read succeeded;
  `os:etcd:backup` denied `TALOS_UNAUTHORIZED`, not retried, after 3.9 ms);
  `live_cancellation…` ok (cancellation acknowledged in 375.7 µs; stream ended
  cleanly); `fails_closed_on_targets_and_authority…` ok;
  `live_reconnect_exhausts…` FAILED as an open finding.
- **Deterministic framed, native IPC, and renderer evidence:** unchanged from
  part 2; this run re-ran only the live rows through `pnpm talos:fixture`
  (which rebuilds the helper and runs the ignored tests). No deterministic,
  native, or renderer suite was rerun for this documentation-and-test change,
  so nothing here extends their status.

### Fixture identity, versions, topology, allowlist, cleanup evidence

Provisioned and destroyed on 2026-10-12 under the recorded identity; 4 members
on Talos v1.14.2, Kubernetes v1.36.5 (server version via the fixture kubeconfig),
three control planes `10.79.0.2–10.79.0.4`, worker `10.79.0.5`, bridge
`talosb8c871e1` (`10.79.0.1/24`), Kubernetes endpoint `https://10.79.0.1:6443`.
Contexts: `talos-pilot-c4-20261009` (admin, 1775 bytes) plus
`reader@talos-pilot-c4-20261009` and `etcd:backup@talos-pilot-c4-20261009`
(1789/1811 bytes), each with the node list `10.79.0.2–10.79.0.5`; the three
files were mode 600 and readable by the unprivileged harness user. The cached
installer ISO (`376567988ad370138ad8b2698212367b8edcb69b5fd68c80be1f2ec7d603b4ba`,
v1.14.2 metal-amd64) hashed
`e230299bf831f3de962b66226a29b45ca185d23a390a7eb2bd889c9e522846cd`.

Cleanup evidence, all compared with the pre-provisioning baseline: `cluster
destroy` removed the guests, network, and state; the five `iptables -D`
counterparts removed the fixture rules and both `10.79.0` counters report `0`;
no `CNI-*` chain remains; the zone list, default zone, and active zones equal the
baseline exactly; `/tmp/tpc4` and any `/tmp/talos-pilot-c4-*` are absent; zero
`qemu-system` processes; no `talos*` bridge and none of the fixture `veth`s; no
interface holds a `10.79.0.x` address; `ip route get 10.79.0.2` returns through
`tun0` again, so the accepted shadowing ended with the bridge. The VPN state
(`tun0` up, `172.23.11.5/24`, `10.0.0.0/8` route) is otherwise unchanged.

### Passed, failed, and unexecuted rows and practical limits

Passed live (6 of 7): read/stream with a real event, `os:reader` read and
`os:etcd:backup` denial, target/authority rejection without helper work,
failover past a dead leading endpoint, reboot interruption with stale →
replacement-snapshot recovery, and prompt cancellation.

Failed (open finding): `live_reconnect_exhausts_while_the_worker_is_suspended`.
Both runs ended the case with the 90-second window exhausted by an established,
silent stream after the worker was frozen, panicking with "the reconnect budget
must end the subscription within its window". The deterministic framed tests
still cover budget exhaustion, backoff, and attempt-deadline behavior, and the
live diagnostics above show the policy's attempt bound working against a frozen
peer; what cannot be produced live within the recorded authority is a
break that is detected while the worker is still unreachable.

Practical limits and environment notes (some inferred, marked):

- The recorded `talosctl reboot` action waits for Talos's `MachineReady` event
  (stage `running` and ready true) with the command's default 30-minute tracker
  timeout, so the harness's reboot step inherits that bound. After this
  session's earlier freezes and repeated reboots, the worker's flannel/CNI
  recovery after a reboot took roughly 9 and 16 minutes (kubelet reporting
  `cni plugin not initialized`; the flannel DaemonSet pod stuck in
  `Init:ContainerStatusUnknown` until recreated), which is why run 2 took
  1863 s. The correlation with the freeze experiments is an inference; the
  cause was not isolated. No product conclusion depends on it.
- Because that delay postponed the reboot helper's return until long after the
  helper had reconnected, run 2's live cancellation landed on an established
  (reconnected) stream rather than under an in-flight attempt. The assertion
  held; the during-attempt/during-backoff cancellation shapes remain
  deterministic-test evidence only.
- Unexecuted for F1: nothing else — all seven live rows executed. Packaged
  helper startup remains F9 work and R3 remains deferred, as recorded.
- The VPN's shadowed range was exercised only as accepted; no VPN host in
  `10.79.0.0/24` was contacted or verified during the run.

### Separate final review findings and resolutions

1. **Panic-unsafe worker cleanup (fixed).** Run 1's exhausted-budget case left
   the worker `SIGSTOP`ped, invalidating three later rows. Fixed with
   `SuspendedWorker`'s resume-on-drop; run 2's same failure left the fixture
   healthy (worker running and the node Ready afterwards).
2. **Live retry exhaustion is not deterministically reproducible with the
   recorded actions (open).** The watch break surfaces only when the worker's
   API is back, so a test-side `SIGSTOP` cannot keep the worker unreachable
   during the attempts; the helper reconnects within about a millisecond and
   then holds a silent established stream that its contract never cuts. A
   future decision needs one of: a different fixture-scoped interruption that
   is detectable while the worker is unreachable (new authority), a product
   change that detects a silent established watch (new behavior outside this
   packet's stated policy), or an owner-approved re-scope of the row. The
   product's exhaustion path itself remains proven by the deterministic framed
   suite and by the live attempt-bound diagnostics.
3. **Reboot helper wait (observed).** The live cases inherit the reboot
   command's `MachineReady` wait; a fixture whose node does not re-converge
   makes the harness slow rather than wrong. Recorded for future runs; no
   change made.
4. **Cancellation semantics nuance (recorded).** See the practical limits
   above; no product or test change.

### Next smallest packet and prerequisites

**Resolve the open live retry-exhaustion row, then close F1.** It is the only
missing C4 live evidence and needs an owner decision on the options in finding 2
(no new authority exists today). Everything else F1 promised has live evidence.
**F2's acceptance prerequisite is therefore still not met**: F2 stays
implemented-and-green but unaccepted, and F3 stays blocked behind it.
Packaged-installer startup stays with F9; R3 stays deferred. _Decided by the
owner on 2026-10-12: the row is re-scoped, F1 is closed, and F2 is accepted; see
the [closure entry](#f1-closure-and-f2-acceptance--owner-decisions-2026-10-12)._

## F2 packet evidence — the Kubernetes client and credential-session boundary

Packet F2 of the [foundation completion plan](../plans/foundation-completion-flash.md#f2--establish-the-kubernetes-client-and-credential-session-boundary),
mapped to C5 step 1, the C3 contract extension, and FND-003/004. Base revision
`f9d56a8` (clean tree); the final revision is the commit carrying this entry —
the packet is handed off as one working-tree change set. **F2 is implemented and
green, but not accepted**: its own live-cluster read is deliberately out of
scope (F3 owns it), and F1's live fixture rows ran on 2026-10-12 with six of
seven passing, but the live retry-exhaustion row remains open
([F1 part 3](#f1-packet-evidence-part-3-live-fixture-rows-on-the-unsandboxed-host--2026-10-12)),
so C5 keeps its acceptance open. _The owner accepted F2 on 2026-10-12 after
closing F1; see the [closure entry](#f1-closure-and-f2-acceptance--owner-decisions-2026-10-12). C5 itself stays in
progress until F3–F5._

### Trigger, observable behavior, invariants

F1 part 2 left the Kubernetes boundary entirely unimplemented: C3.3's import
returned only a context label and a storage mode, nothing identified a stored
credential after the import finished, and no Rust client, session, or adapter
existed. F2 implements the boundary the plan specifies:

1. Importing a supported kubeconfig yields an opaque, kind-prefixed handle
   (`kubecred-` plus a 16-byte random reference). A handle is not an
   authorization grant: resolution re-validates the handle's prefix and bounds,
   which storage holds the reference, that the reference's `value_kind` is
   `kubeconfig`, and that the current mode can open it, before anything is
   decrypted.
2. The client is built from an explicitly selected, validated in-memory
   kubeconfig and never from ambient configuration. There is no `Config::infer`,
   `Kubeconfig::read`, in-cluster path, or proxy anywhere in the adapter; exec,
   auth-provider, and external-file credentials and insecure TLS are rejected
   during selection, before any SDK action.
3. Every context label comes from encrypted material. An import writes a small
   encrypted label under the new `value_kind` `kubeconfig-context` in the same
   transaction as the profile and credential; a row written before that label
   derives it by decrypting and re-validating the credential. Decision 0005
   stands: no plaintext label row exists, and `profiles.display_name` stays
   generic.
4. A read never creates a vault key. The vault trait gained a read-only
   `load_key`, so a missing or replaced key leaves existing ciphertext intact
   and fails resolution instead of silently re-keying records.
5. Section 4's session and admission limits are enforced before client
   construction: at most four sessions, at most 32 admitted requests with
   immediate rejection rather than queueing, and a fifteen-second attempt
   deadline. The storage lock is released before any network I/O.
6. Errors are stable redacted categories: no SDK message, URL, token, or
   kubeconfig content reaches a DTO, a log, or the renderer.

### Files, contracts, and ADRs changed

| File                                                                                                                                                                                               | Change                                                                                                                                                                                                                                                     |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/Cargo.toml`, `Cargo.lock`                                                                                                                                                               | Pins `kube` 4.2.0 (client/config/rustls-tls/ring), `k8s-openapi` 0.28.0 with the single `v1_36` schema feature, `http` 1.5.0, `pem` 3.0.6; adds optional `rcgen` 0.14.10 and `tokio-rustls` 0.26.6 (ring only) under `native-test` plus the example target |
| `src-tauri/src/kubernetes/`                                                                                                                                                                        | New module: `client.rs` (supported-field `Config` construction), `session.rs` (session store, admission, version read), `error.rs` (redacted categories), `synthetic.rs` (feature-gated synthetic TLS apiserver)                                           |
| `src-tauri/src/storage/runtime.rs`, `database.rs`, `session.rs`, `vault.rs`, `kubeconfig.rs`, `mod.rs`                                                                                             | Handles, `list_kubeconfig_credentials`, `resolve_kubeconfig_credential`, the encrypted `kubeconfig-context` label, the read-only vault read, `select_kubeconfig`, and single-transaction multi-value writes                                                |
| `src-tauri/src/contracts.rs`, `src/bin/export_ipc_types.rs`, `src/lib/ipc/generated/`                                                                                                              | `credential_handle` on the import result; new `KubernetesCredentialSummaryDto`, `KubernetesSessionDto`, `KubernetesVersionDto`; regenerated TypeScript                                                                                                     |
| `src-tauri/src/lib.rs`, `capabilities/main.json`, `build.rs`                                                                                                                                       | Four commands with redacted error mapping, registered and granted only to the main window                                                                                                                                                                  |
| `src/lib/ipc/validation.ts`, `transport.ts`, tests                                                                                                                                                 | Handle/version/session runtime validation, bounded-listing validation, typed transport, and their renderer tests                                                                                                                                           |
| `src-tauri/examples/kubernetes-synthetic-apiserver.rs`, `src-tauri/tests/kubernetes_session.rs`, `tests/native/kubernetes-session.spec.ts`, `scripts/test-native.ts`                               | Synthetic endpoint, integration tests, native specs, and the harness lifecycle with endpoint cleanup                                                                                                                                                       |
| `scripts/check-production-exclusion.ts`                                                                                                                                                            | New capability names, synthetic-server markers, and graph assertions (`rcgen` absent by default, present with the Kubernetes test support under `native-test`)                                                                                             |
| [ADR 0012](../decisions/0012-kubernetes-client-session-boundary.md), [application IPC](../protocol/application-ipc.md), [storage v1](../storage/storage-v1.md), [dependencies](../dependencies.md) | The boundary decision, the four commands and handle/session semantics, the handle/label/listing/resolution contract, and the new pins                                                                                                                      |

### Exact commands; host/toolchain/WebView; exit results

Host: sandboxed Linux x86_64 session over the openSUSE Tumbleweed development
host (WebKitGTK 605.1.15, GTK 3.24.52). The pinned tools were again **not**
installed where the task expected (`HOME` is read-only here), so they were
provisioned into `/tmp/tp` with verified digests: Node 26.11.1 (nodejs.org
`SHASUMS256.txt`), pnpm 12.10.1, Go 1.27.2 (go.dev release index), Rust 1.99.0
with rustfmt 1.10.0 and clippy 0.1.99 (rustup into `/tmp/tp/cargo`), and protoc
36.2 (the CI pin and SHA-256 from `.github/actions/install-protoc/action.yml`).
Because this sandbox has no GTK/WebKit `-devel` package, a scratchpad
pkg-config/link shim (`/tmp/tp/pkgconfig` with `-L/tmp/tp/libshim -l<name>`
symlinks to the installed runtime libraries) resolves the Tauri link set;
`XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` point into the scratchpad,
and the host Go module cache is reused read-only. Environment bootstrap only:
no product code or check was weakened for it. All commands ran on the final
tree:

| Command                                                                                                                        | Result                                                                                             |
| ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- |
| `cargo build --locked --lib` (default features)                                                                                | Pass: the pinned Kubernetes client graph builds locked                                             |
| `cargo fmt --all -- --check`                                                                                                   | Pass                                                                                               |
| `cargo clippy --locked --all-targets -- -D warnings` (default and `native-test`)                                               | Pass                                                                                               |
| `cargo test --locked --all-targets`                                                                                            | 95 passed, 0 failed, 1 ignored (vault test)                                                        |
| `cargo test --locked --all-targets --features native-test`                                                                     | 95 lib tests + 5 integration tests passed, 7 live Talos rows ignored                               |
| `cargo test --locked --doc`, `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps`, `cargo build --locked`                 | Pass                                                                                               |
| Go gates in `helper/`: `gofmt -l .`, `go vet ./...`, `go test ./...`, `go test -race ./...`, `go mod verify`, `go build ./...` | Pass (helper and shared protocol unchanged by this packet)                                         |
| `pnpm check`                                                                                                                   | Pass: Oxfmt, type-aware Oxlint, `svelte-check`, 115 renderer tests, production Vite build          |
| `pnpm contracts:check`                                                                                                         | Pass: Rust/Go/TypeScript regeneration is byte-stable                                               |
| `pnpm test:e2e`                                                                                                                | Pass: 7 Playwright flows on Chromium headless shell 156.0.8078.4                                   |
| `pnpm test:native`                                                                                                             | Pass: 12 shell/helper specs + 4 Kubernetes specs; no helper process or synthetic endpoint remained |
| `pnpm desktop:build`, `pnpm production:check`                                                                                  | Pass: production artifact excludes WebDriver and exposes no driver listener                        |
| `pnpm advisories:check`                                                                                                        | Pass: the two recorded advisories match the report, path, and linked production executable         |
| `pnpm audit:go`, `pnpm inventory:generate`, `pnpm inventory:check`                                                             | Pass: no linked vulnerabilities; inventory current at 529 npm / 601 cargo / 143 Go entries         |
| `git diff --check`                                                                                                             | Pass                                                                                               |

Two first-attempt failures were environmental and are not product results. The
first `pnpm test:e2e` run failed all seven flows with "Executable doesn't exist"
because the scratchpad Playwright cache had no headless shell; after
`pnpm exec playwright install chromium`, all seven passed. One Go gate run used
`GOFLAGS=-mod=mod`, which rewrote `helper/go.sum`; that edit was reverted and
the gates were rerun in the default readonly module mode, leaving `go.sum`
byte-identical.

### Native vs mocked vs real-cluster evidence

- **Synthetic endpoint (real client, real TLS):** `src-tauri/tests/kubernetes_session.rs`
  imports a synthetic kubeconfig, resolves its handle, opens a session, and
  performs a real TLS `GET /version` against the endpoint from
  `kubernetes::synthetic`, which records exactly one request carrying the
  imported bearer token. A mismatched certificate authority classifies as
  `KUBERNETES_CERTIFICATE_INVALID`; 401 and 403 classify as
  `KUBERNETES_UNAUTHORIZED` and `KUBERNETES_FORBIDDEN`; no error or listing
  rendering contains the sentinel token; an empty store resolves nothing and
  refuses every malformed or foreign handle.
- **Native:** `pnpm test:native` drives the four commands through real Tauri IPC
  against the harness-started synthetic endpoint, including the four-session
  ceiling, unknown handle/session handling, and ACL denial from the
  unauthorized window.
- **Mocked/browser:** `pnpm test:e2e` remains mock-transport evidence for the
  shell only; it establishes nothing about the Kubernetes commands.
- **Real cluster:** **none.** The first live cluster read belongs to F3.

### Fixture identity, versions, topology, allowlist, cleanup evidence

No cluster or Talos fixture was involved, so no allowlist change was needed.
The synthetic endpoint is generated per run: a fresh certificate authority,
server certificate, and bearer token, written into a temporary directory that
the harness removes afterwards, and it is started and stopped by
`scripts/test-native.ts`, which asserts the process exited and prints "No helper
process or synthetic endpoint remained after the native suite." The Talos
fixture and its allowlist were not touched.

### Passed, failed, and unexecuted rows and practical limits

Passed: the whole credential handle/list/resolve contract across persistent,
session-only, and mixed modes (including restart resolution with an existing
key, ciphertext preserved with a missing key, wrong-kind and unknown handles,
and the encrypted-only label); the client-construction restrictions; the
session/admission limits; the real-TLS version read through the production path
with no ambient fallback; TLS/401/403 classification; redaction; every static,
type, doc, contract, browser, native, production-exclusion, advisory, inventory
and diff gate for the changed boundaries.

**Unexecuted, with the practical limit:**

- **F2 acceptance** cannot be claimed while F1's live evidence is missing: this
  host cannot run `sudo -n` and has no `/dev/kvm`, so the recorded
  `pnpm talos:fixture` provisioning still cannot run here.
- **Live cluster reads** (list/watch, RBAC and namespace scoping, pagination,
  discovery against 1.35–1.37) belong to F3–F5. This packet's endpoint is
  synthetic and cannot qualify cluster behaviour.
- **Client construction with a mutual-TLS or basic-auth identity** is covered by
  the selection and rejection tests but not by a live handshake; the synthetic
  endpoint authenticates with a token.
- **A real OS-vault restart of a Kubernetes credential** is covered only with
  injected keys in unit tests; the Linux Secret Service path remains C3/C8
  evidence, and macOS/Windows vault and platform rows are still open.
- Windows and macOS native runs of the new specs are unexecuted here; the
  example and harness are cross-platform by construction, but that is not
  evidence.

### Separate final review findings and resolutions

1. **Client construction needs an async runtime context.** `KubernetesSessionStore::open`
   builds a client whose transport spawns a worker; calling it from a blocking
   thread would panic. Both callers are async commands and the tests are
   `#[tokio::test]`, and the requirement is now documented on `open`.
2. **The first native specs failed inside the webview** because they referenced
   module-level helpers from `browser.tauri.execute` callbacks, which are
   serialized to the page. The helpers were inlined and the specs re-run green.
3. **The production-exclusion graph assertion was wrong.** The first version
   asserted the string `kubernetes` appears in the native-test dependency tree,
   which it cannot. It now asserts the two feature-gated test dependencies
   (`rcgen`, `tokio-rustls`) instead.
4. **An accidental `helper/go.sum` rewrite** from one Go gate run was reverted
   and the gates rerun in readonly mode; the file is byte-identical to its
   committed content.
5. **Formatting and lint drift** in the new Rust and TypeScript files was fixed
   with the pinned tools (`cargo fmt`, `oxfmt`) and re-checked with the gates.
6. **The first `pnpm test:e2e` run** failed only because the scratchpad browser
   cache was empty; recorded as an environment fact, not a product change.

An independent review pass with the repository's review tool then read the
staged diff (generated DTOs and the dependency inventory excluded) and returned
a `warn` verdict with no blocking issue, plus three should-fix items and four
nits. Its conclusions and their resolutions:

7. **The TLS classifier's type-name branch could not fire.** `type_name_of_val`
   on a `&dyn Error` yields the trait-object name, so the branch the comment
   described as matching Rustls types by dynamic type name was dead and the
   tested behaviour came only from the message markers. The branch was deleted,
   the comment now states the real mechanism and why the concrete Rustls type is
   not nameable here, and two unit tests now pin the classifier over a synthetic
   error chain (a certificate text inside and outside an `io::Error` wrapper,
   and a non-certificate transport failure).
8. **The pre-label fallback had no test** although ADR 0012 and storage v1 rely
   on it. A test-only database helper now removes the label reference, and a new
   runtime test proves both the listing and resolution still derive the label
   from the decrypted credential.
9. **`KubernetesError::Unavailable` had no test** (no timeout or refused
   connection case). A new integration test imports a credential for the
   synthetic endpoint, stops that endpoint so its listener is released, and then
   asserts `KUBERNETES_UNAVAILABLE` on the read, bounded in time so a refused
   connection is distinguishable from an attempt that reached the deadline.
10. **Nits resolved:** the two never-constructed error variants were removed as
    dead code; `SyntheticApiserver::stop` now awaits the accept loop instead of
    sleeping; the all-or-nothing listing behaviour, its 256-reference bound, and
    the deferred non-PEM certificate-authority rejection are now stated in the
    storage document, ADR 0012, and the rustdoc (all three were deliberate, and
    the last preserves decision 0005's base64-only import rule and its
    checked-in fixture).

A second review pass read the corrections and raised two more items, both fixed:

11. **API statuses were collapsed into one category.** Every non-401/403 status
    became retryable `Unavailable`, which contradicted the rustdoc: a 404 from a
    live server is not an unreachable server. Statuses are now mapped by class —
    401 `Unauthorized`, 403 `Forbidden`, 429 and 5xx `Unavailable` (the only
    retryable class), anything else `UnsupportedResponse` — and the unit test
    covers each class.
12. **The classifier test did not require the chain walk.** The wrapped case
    still named the certificate text in `Display`, so a single-level check would
    have passed. The test now uses a wrapper whose `Display` is marker-free and
    whose `source()` carries the cause, plus a second level, so classification
    has to descend.

A third pass raised one remaining item, fixed here:

13. **A decode failure was reported as an unavailable server.** `SerdeError` is
    now `UnsupportedResponse`, so a malformed payload never invites a retry; the
    fallback for every other non-API, non-certificate failure is documented on
    `from_kube` as the unavailable-and-retryable class. The remaining nits from
    that pass — the stale `# Errors` list on `apiserver_version`, the wording of
    the redaction note, and the timing check in the refused-connection test —
    were corrected as well, and the one residual limit is recorded: a synthetic
    server started concurrently could in principle rebind the port this test
    released, which would surface as a certificate failure or a deadline stall
    rather than a refusal, and the elapsed-time assertion reports that as a
    stall.

After those corrections the affected gates were rerun on the final tree:
`cargo fmt --check`, Clippy with `-D warnings` and tests in both feature sets
(95 tests in the default feature set, 95 library plus 5 integration tests with
`native-test`),
rustdoc, and `pnpm test:native` (2 spec files, 16 specs, no leftover process or
endpoint) all pass.

### Next smallest packet and prerequisites

**F3 — deliver the bounded scoped Kubernetes list probe.** Its prerequisites are
this packet's client/session boundary and the reprovisioned, amended Talos
fixture harness that F1 still owes; F2 acceptance stays blocked until F1's
remaining live row is resolved
([F1 part 3](#f1-packet-evidence-part-3-live-fixture-rows-on-the-unsandboxed-host--2026-10-12)).
Packaged-installer startup remains F9, and R3 stays deferred. _Resolved on
2026-10-12; F1a now precedes F3. See the [closure entry](#f1-closure-and-f2-acceptance--owner-decisions-2026-10-12)._

## F2 recheck on the unsandboxed development host — 2026-10-12

The owner asked for the unexecuted rows to be verified now that QEMU is
available on the development host. Revision: `279e4f5`, the F2 commit; the
gates ran on the staged tree that became that commit, and no gate changed a
tracked file. **This recheck promotes no checkpoint**: no fixture was
provisioned, so F1 stays in progress and F2 stays unaccepted.

### Correction to the recorded limit

The F1 part 2 and F2 entries above say the host has no root and no `/dev/kvm`.
That described their sandboxed sessions, not the host. Outside the sandbox,
`sudo -n` succeeds, `/dev/kvm` exists and the developer account is in the `kvm`
and `libvirt` groups, and `qemu-system-x86_64` with OVMF firmware is installed.
No QEMU guest was running. libvirt lists one owner virtual machine, shut off; it
is not an allowlisted fixture and was not touched.

The limit that actually stopped the live rows in this session is different: the
agent session's permission policy denied the fixture-scoped firewalld zone and
`iptables` commands from the
[allowlist](fixtures/talos-c4-disposable.md#applied-host-remediation-owner-approved-2026-10-09)
before they executed. The owner's recorded authorization for F1–F5 does not
bypass that policy. Nothing was applied, and the host was checked afterwards:
the thirteen-zone list and default zone `public` are unchanged, and there is no
`talos*` interface, no `qemu-system` process, and no `/tmp/tpc4`. The baseline
active zones captured before the attempt were `docker`, `libvirt` (`virbr0`),
and `public` (`enp13s0`, `tun0`).

One host fact is new and matters to the next provisioning: an active VPN
connection routes `10.0.0.0/8` over `tun0`, and the fixture CIDR `10.79.0.0/24`
lies inside it. The fixture bridge's connected `/24` route would take precedence
while the bridge exists, so the host would reach the fixture rather than any VPN
host in that range. This was not exercised. The owner's Talos, Kubernetes, and
SSH client configurations contain no `10.79.0.x` address.

### Exact commands; host/toolchain/WebView; exit results

Host: openSUSE Tumbleweed 20261003, Linux 7.2.8 x86_64, WebKitGTK 2.54.1
(reported by the driver as 605.1.15), GTK 3.24.53, with the distribution's
`-devel` packages, so no pkg-config or link shim was used. Pinned tools were
provisioned without changing host configuration: Node 26.11.1 (nodejs.org
`SHASUMS256.txt`), protoc 36.2 (the CI digest), and `talosctl` v1.14.2 (the
release's `sha256sum.txt`, placed in the ignored `src-tauri/.local-tools/`);
Go 1.27.2 from the Go toolchain module cache; Rust 1.99.0 through rustup;
pnpm 12.10.1.

| Command                                                                                                                  | Result                                                                                      |
| ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| Go gates in `helper/`: `gofmt -l .`, `go vet ./...`, `go test ./...`, `go test -race ./...`, `go mod verify`, `go build` | Pass                                                                                        |
| `cargo fmt --all -- --check`, `cargo clippy --locked --all-targets -- -D warnings` (default and `native-test`)           | Pass                                                                                        |
| `cargo test --locked --all-targets`                                                                                      | 95 passed, 0 failed, 1 ignored (vault test)                                                 |
| `cargo test --locked --all-targets --features native-test`                                                               | 95 lib tests + 5 integration tests passed, 7 live Talos rows ignored                        |
| `cargo test --locked --doc`, `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps`, `cargo build --locked`           | Pass                                                                                        |
| `cargo test --locked --test talos_fixture --no-run`, `pnpm helper:build`                                                 | Pass: the live-test binary and the helper build here; the seven live rows were not executed |
| `pnpm check`                                                                                                             | Pass: 115 renderer tests and the production Vite build                                      |
| `pnpm contracts:check`                                                                                                   | Pass                                                                                        |
| `pnpm test:e2e`                                                                                                          | Pass: 7 Playwright flows (mock transport)                                                   |
| `pnpm test:native`                                                                                                       | Pass: 12 shell/helper specs + 4 Kubernetes specs; no helper or synthetic endpoint remained  |
| `pnpm desktop:build`, `pnpm production:check`                                                                            | Pass, after `test:native` replaced the release executable                                   |
| `pnpm advisories:check`, `pnpm audit:go`, `pnpm inventory:check`                                                         | Pass: 529 npm / 601 cargo / 143 Go entries                                                  |
| `cargo test --locked --lib -- --ignored --exact storage::vault::tests::native_vault_key_survives_database_reopen`        | Pass against the KDE Secret Service (`ksecretd`)                                            |
| `git diff --check`, `git diff --cached --check`                                                                          | Pass                                                                                        |

`pnpm test:native` ran on a private `Xvfb` display with the X11 GDK backend and
`XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME` in a scratch directory, so the
suite neither opened windows on the developer's desktop nor used the developer's
application data.

### Passed, failed, and unexecuted rows and practical limits

Passed: every non-fixture gate for the F2 change set, now on an unsandboxed
Linux host as well as the sandboxed one. The real-vault test adds current
evidence that a synthetic vault key survives a database reopen in the Linux
Secret Service. It stores a `synthetic` value, not a Kubernetes credential, so
the F2 row "a real OS-vault restart of a Kubernetes credential" is narrowed and
stays open.

Failed: none. The denied firewall commands are a blocked prerequisite, not a
product result.

**Unexecuted, with the practical limit:**

- All seven live Talos fixture rows, including the three F1 part 2
  reconnect/interruption cases and the post-run restoration. The fixture could
  not be provisioned without the host remediation, which needs the owner to run
  it or to permit the session to run it.
- Mutual-TLS and basic-auth client handshakes: no test exercises them; the
  synthetic endpoint authenticates with a token.
- macOS and Windows native rows: no such host was available.

### Next smallest packet and prerequisites

**Finish F1's live rows, then close F1**, unchanged. The prerequisite is now
precise: the fixture-scoped remediation applied by the owner, or a session
permitted to apply it, on this host. Before provisioning, capture the baseline
again and decide whether the VPN route above may be shadowed for the run. F2
acceptance and F3 stay blocked on that evidence. _Executed on 2026-10-12: the
session applied the allowlist's remediation, the owner accepted the VPN
shadowing, and the run's outcomes are recorded in
[F1 part 3](#f1-packet-evidence-part-3-live-fixture-rows-on-the-unsandboxed-host--2026-10-12)._
F2 acceptance and F3 now wait only on F1's open live retry-exhaustion row.
_Resolved on 2026-10-12 by the [closure entry](#f1-closure-and-f2-acceptance--owner-decisions-2026-10-12) below._

## F1 closure and F2 acceptance — owner decisions, 2026-10-12

Packets F1 (C4, FND-004) and F2 (C5 step 1, FND-003/004). Base revision
`ae67a9c`, which records part 3 as handed off; the final revision is the commit
carrying this entry. A separate review of the part 3 handoff preceded the
decisions. **F1 is closed and F2 is accepted, both by owner decision.** No new
native, mocked, or real-cluster evidence is added here.

### Owner decisions

The owner was offered the options from part 3's open finding and chose:

1. **Re-scope the live retry-exhaustion row and close F1.** The row is not
   producible with the recorded fixture actions under
   [0011](../decisions/0011-talos-stream-reconnect-and-generations.md)'s policy.
   Not chosen: keeping F1 open until stall detection lands, deferring stall
   detection to milestone 2, and adding a new fixture interruption.
2. **Add packet [F1a](../plans/foundation-completion-flash.md#f1a--detect-a-stalled-talos-stream)
   for bounded stall detection, ahead of F3.** Its live stall and exhaustion row
   runs in the next fixture session, which is F3's.
3. **Accept F2** on its recorded evidence at `279e4f5`, rechecked at `101d697`.
   F3 follows F1a's fixture-free steps.

The decisions are recorded in the
[0011 amendment](../decisions/0011-talos-stream-reconnect-and-generations.md#amendment--2026-10-12-live-evidence-and-owner-decision)
and in the plan's F1, F1a, and F2 packets.

### What the closure claims and does not claim

- F1's steps 1–5 are delivered, with live evidence for six rows: read and
  stream, reader and denied identities, target and authority rejection,
  endpoint failover, reboot interruption with stale then replacement-snapshot
  recovery, and cancellation.
- **Live retry exhaustion has no fixture evidence.** It is proven by the
  deterministic framed tests only. This entry records an absence, not a pass.
- The implemented behavior is unchanged: a node that freezes, loses power, or
  is partitioned keeps its last projection presented as current until F1a is
  accepted.
- F2's acceptance covers the client and credential-session boundary against a
  synthetic TLS endpoint. C5 stays in progress until F3–F5.

### Review findings on the part 3 handoff

1. **The exhaustion case could not pass as written.** `reboot_worker` runs
   `talosctl reboot` synchronously, and that command waits for the machine to be
   ready. The case therefore sent `SIGSTOP` only after the worker had recovered
   and the stream had already reconnected. Part 3's "before any `SIGSTOP` can
   land" describes a race; the ordering made the outcome certain. Resolved by
   removing the case; F1a step 4 replaces it.
2. **The live cases block their test runtime.** The synchronous reboot runs on
   the single-threaded test runtime, so the stream under test is not polled for
   the whole wait, 9 and 16 minutes in run 2. The two remaining reboot cases
   passed with this in place. They are not changed here, because no fixture
   exists to re-verify them; F1a step 4 carries the fix.
3. **Part 3's diagnostics cannot be reproduced from the repository.** They came
   from `helper/cmd/tpdebug`, which was deleted, and the "session logs" that
   entry cites were not found in the host's session scratch directories on
   2026-10-12. The six row results therefore rest on part 3's record, and the
   attempt-bound observation against a frozen peer is an unreproducible
   observation, not retained evidence. F1a step 1 must reproduce any
   measurement it relies on.
4. **Zone count corrected.** Part 3 and the F2 recheck said "twelve-zone list".
   The host has thirteen: `block`, `dmz`, `docker`, `drop`, `external`, `home`,
   `internal`, `libvirt`, `libvirt-routed`, `nm-shared`, `public`, `trusted`,
   and `work`, as the F2 recheck's own baseline capture lists. Both entries now
   say thirteen. Their comparisons against the baseline are unaffected.
5. **Host restoration re-verified.** Read-only checks after the handoff found
   no `qemu-system` process, no `talos*` bridge, no interface with a
   `10.79.0.x` address, no rule matching `10.79.0` in `iptables -S` or
   `iptables -t nat -S`, no `/tmp/tpc4` or `/tmp/talos-pilot-c4-*`, the thirteen
   zones with default `public` and no `talos-pilot-c4` zone, and
   `ip route get 10.79.0.2` through `tun0`. Five `veth` interfaces exist; each
   is a member of a Docker bridge.

### Files/contracts/ADRs changed

| File                                                                  | Change                                                                                                              |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| `src-tauri/tests/talos_fixture.rs`                                    | Removed the exhaustion case, the QEMU signal helpers and guard it alone used, and the manifest field only they read |
| [0011](../decisions/0011-talos-stream-reconnect-and-generations.md)   | Amendment: live evidence and the owner decision                                                                     |
| [foundation completion plan](../plans/foundation-completion-flash.md) | F1 closure note, new packet F1a, F2 acceptance note, sequence, resolved-decision note                               |
| [milestone 2 plan](../plans/milestone-2-flash.md)                     | Next foundation work is F1a, then F3–F10                                                                            |
| [fixture allowlist](fixtures/talos-c4-disposable.md)                  | Status line; note that no harness case currently uses the `SIGSTOP`/`SIGCONT` authority                             |
| this ledger, `README.md`                                              | Checkpoint statuses, the zone-count correction, cross-references, the current stage                                 |

The manifest `tests/fixtures/talos-c4.json` keeps its `stateDir` value as the
fixture's record; F1a's live row reads it again. The wire contract, helper,
Rust supervisor, and renderer are unchanged.

### Exact commands; host/toolchain/WebView; exit results

Host: the openSUSE Tumbleweed x86_64 development host of the F2 recheck, with
that entry's provisioned toolchain (Node 26.11.1, Rust 1.99.0, Go 1.27.2,
protoc 36.2). All commands ran on the final tree of this change set.

| Command                                                                          | Result                                                                                              |
| -------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `cargo fmt --all -- --check`                                                     | Pass                                                                                                |
| `cargo clippy --locked --all-targets -- -D warnings` (default and `native-test`) | Pass. The first run failed on the manifest field left unread by the removal; it passed once removed |
| `cargo test --locked --all-targets`                                              | 95 passed, 0 failed, 1 ignored (vault test); 6 live Talos rows ignored                              |
| `cargo test --locked --all-targets --features native-test`                       | 95 lib tests + 5 integration tests passed; 6 live Talos rows ignored                                |
| `pnpm format:check`                                                              | Pass                                                                                                |
| `git diff --check`, `git diff --cached --check`                                  | Pass                                                                                                |
| Local link and heading-anchor validation of every changed Markdown file          | Pass                                                                                                |

### Passed, failed, and unexecuted rows and practical limits

Passed: the gates above. Failed: none on the final tree.

**Unexecuted, with the practical limit:**

- The six remaining live rows were not re-run after the removal: no fixture
  exists. Their bodies are unchanged from part 3's run 2.
- Go, renderer, contract, browser, native, and production-exclusion gates were
  not re-run: this change touches one Rust integration-test file and
  documentation, and none of those boundaries.
- F2's gates were not re-run for the acceptance; it rests on the `279e4f5` and
  `101d697` records.

### Open rows carried forward

| Row                                                                                   | Owner        | Acceptance                                                                                              |
| ------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------- |
| Live stall, stale marker, and retry exhaustion against a frozen worker                | F1a          | F1a's exit: observed live within the documented bound, with an idle healthy stream staying current      |
| Live cases must not block the test runtime during a reboot                            | F1a step 4   | The stream is polled throughout the reboot; every live row re-run on the changed harness                |
| Live cancellation during an in-flight attempt or backoff                              | Unassigned   | Deterministic evidence only today; part 3's live cancellation landed on an established stream           |
| Mutual-TLS client handshake against a real API server                                 | F3           | The fixture kubeconfig is expected to use a client certificate; confirm at provisioning, then record it |
| Basic-auth client handshake                                                           | Unassigned   | Covered by selection and rejection tests only; no live endpoint is planned                              |
| Real OS-vault restart of a Kubernetes credential; macOS and Windows vault and natives | C3/C8, F9    | As recorded in the F2 entry                                                                             |
| Packaged-installer helper startup; R3 status/probe serialization                      | F9; deferred | Unchanged                                                                                               |

### Next smallest packet and prerequisites

**F1a steps 1–3: decide and implement bounded stall detection, with its
deterministic tests.** No fixture is needed. **F3** follows; its fixture session
also runs F1a step 4. That session needs the fixture-scoped host remediation
applied by the owner or by a session permitted to apply it, a fresh baseline,
and a decision on shadowing the VPN's `10.79.0.0/24` route, as on 2026-10-12.

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

Primary-source checks on 2026-10-08 recorded [Talos `v1.14.1`](https://github.com/siderolabs/talos/releases/tag/v1.14.1) as the current stable 1.14 release. **F0 corrected this record on 2026-10-11**, because it was wrong: the upstream release list shows [`v1.14.2`](https://github.com/siderolabs/talos/releases/tag/v1.14.2), published 2026-09-29, as the current stable 1.14 patch and the repository's latest release, so the design's 1.14.2 snapshot was right and this note was not. The installed `pkg/machinery` pin stays at v1.14.1 until F1 refreshes the Go module, `talosctl`, the Talos image, and the fixture manifest together. Its root and [`pkg/machinery` modules](https://raw.githubusercontent.com/siderolabs/talos/v1.14.1/pkg/machinery/go.mod) declare Go `1.26.5`, and its release notes state it was built with Go `1.26.8`. The [Go release history](https://go.dev/doc/devel/release) listed `1.27.1` (released 2026-09-01) as the latest 1.27 patch on that date; C7.2 later moved the pin to `1.27.2`. Go 1.27.1 is installed in `/tmp` and an isolated module successfully built/tests imported package `github.com/siderolabs/talos/pkg/machinery/client` at v1.14.1. This is a source compatibility probe only, not a helper implementation or cross-target build.

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
- **FND-007 / C7:** both recorded Rust advisories carry a verified applicability decision with linked evidence and an enforcing gate ([decision 0006](../decisions/0006-gtk3-advisory-applicability.md)); the two Go advisories the new `pnpm audit:go` scan found were fixed by version bumps rather than excluded. GO-2026-5932, the `golang.org/x/crypto/openpgp` deprecation notice, has no fixed version and names packages the helper does not build; it carries a `helper/go.mod`-scoped Trivy exception that expires 2026-11-30. At expiry, repeat the `go list -deps` and `pnpm audit:go` evidence in the [automation record](automation.md#amendment-first-ft-foundation-ci-run), then renew or remove the exception. The dependency/license inventory is generated and drift-gated, with redistributed notices recorded. What remains is a real exact-revision CodeQL/Trivy run and the C8 per-platform scans.
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

### Review remediation R1

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R1, base `346285d` on Linux x86_64 with Rust 1.99.0 and Go 1.27.2.

The helper supervisor read frames with `read_exact` inside the cancellation `select!`, which is not cancel safe. It now reads through a stateful `FrameReader` that awaits only `AsyncReadExt::read` and keeps header/body progress in the struct, so a dropped read resumes the same frame. `read_async_frame` was deleted and `rg -n read_exact src-tauri/src/helper` finds only the synchronous protocol-module helper.

New tests: `interrupted_frame_read_keeps_consumed_bytes`, `interrupted_header_read_keeps_consumed_bytes`, and `frame_reader_maps_eof_and_invalid_lengths`. The pre-fix failure (`Frame(InvalidLength)` on the resumed read) is the reproduction recorded in the plan's review evidence; the new tests were not separately executed against the old reader in this session. The existing streaming and bounded-cancel tests pass with only the reader type changed.

Commands: `cargo fmt --check`, `cargo clippy --locked --all-targets -D warnings`, `cargo test --locked --all-targets` (65 passed, 1 ignored), and rustdoc with warnings denied, all exit 0. Not executed: Go gates (no Go change), native gate (no command signature change), `cargo build` as a separate step.

### Review remediation R2

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R2, base `b0640c1`, Linux x86_64, Rust 1.99.0.

The talosconfig parser now deserializes `ca`, `crt`, and `key` into the shared zeroizing `SensitiveString` and decodes through `decodes_to_nonempty_base64`, both moved from the kubeconfig parser into the crate-private `secret` module, leaving one definition of each. Accepted and rejected config semantics are unchanged; all existing talos and kubeconfig tests pass unmodified. New `secret.rs` tests cover base64 acceptance/rejection (empty, path reference) and the `expose`/`is_empty` round trip with synthetic values.

Limit: zeroization on drop is not observable from safe Rust tests; the evidence is the type change plus review. `serde_saphyr` may hold transient scalar copies while parsing, for both parsers, and is outside this packet.

Commands: `cargo fmt`, `cargo clippy --locked --all-targets -D warnings`, `cargo test --locked --all-targets` (67 passed, 1 ignored), rustdoc with warnings denied, all exit 0. Go and native gates not executed (no Go or command-signature change).

### Review remediation R6

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R6, base `ft-foundation` after R2, Linux x86_64, Rust 1.99.0, Go 1.27.2.

With a cancel outstanding, the probe loop now finishes only after both the subscription terminal frame and the cancel reply (`TALOS_CANCEL_RESPONSE` or `ERROR{unknown_subscription}`) arrive, in either order, inside the existing two-second deadline; any other frame for the cancel request ID remains a protocol fault. [helper-v1.md](../protocol/helper-v1.md) states the rule.

Test: `cancellation_crossing_a_natural_stream_end_is_accepted` uses the new `helper/testdata/endracehelper` fixture, which writes the stream end before reading the cancel and rotates replies (cancel response, `unknown_subscription`, silence). It asserts both reply forms return `Ok`, a following `refresh_status` succeeds on the same supervisor (no stale frame), and a missing reply ends in `Timeout` with the helper reaped. Before the fix it failed with an invalid-stream error on the first probe. The consumer closes at the first event so the cancel is sent deterministically; a first version that only signalled the cancellation channel was nondeterministic and was replaced. Stable over five consecutive runs.

Commands: Rust gates (fmt, clippy `-D warnings`, `cargo test --locked --all-targets` 68 passed, rustdoc `-D warnings`), Go gates (gofmt, vet, `go test`, build), `git diff --check`: all exit 0. `go test -race` and the native gate were not executed.

### Review remediation R5

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R5, Linux x86_64, Rust 1.99.0, Go 1.27.2.

The helper's `probeStartDeadline` is now 12 s and the version read and first-status wait share one `startupContext` budget (previously two separate 15 s waits, up to 30 s against the parent's 15 s). A cancelled `ctx` takes the silent cancellation path; otherwise one `talos_probe_timeout` frame is sent. The deadline is a `serveWithProbe`/`runProbe` parameter (no mutable package state). Rust maps `talos_probe_timeout` to `TALOS_UNAVAILABLE`; both constants document the ordering, and [helper-v1.md](../protocol/helper-v1.md) states it.

Tests: `TestProbeStartupSharesOneDeadlineBetweenVersionAndFirstStatus` (200 ms budget, 120 ms version read; a separate-budget implementation would answer near 320 ms), `TestProbeCancelledDuringFirstStatusSendsNoTimeoutFrame`, and `helper_startup_timeout_maps_to_unavailable`. The new Go tests were not run against the pre-fix code in this session.

Commands: Go gates including `go test -race ./...`, Rust fmt/clippy/test (69 passed, 1 ignored)/rustdoc, `git diff --check`: exit 0. Native gate not executed (no command change).

### Review remediation R4

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R4, Linux x86_64, Rust 1.99.0.

`get_appearance_settings`, `set_appearance_settings`, `get_credential_storage_status`, and `use_session_only_storage` were non-`async` commands that locked the storage mutex on the main thread. They are now `async` and, with `retry_persistent_storage`, share `run_storage`, which takes the `StorageRuntime` lock inside `spawn_blocking` and maps a join failure to the retryable `STORAGE_UNAVAILABLE`. `import_kubeconfig` keeps its own `spawn_blocking` body because it reads and validates the file before taking the lock. The vault call stays inside the lock, as [storage-v1.md](../storage/storage-v1.md) requires; no command name, argument, DTO, or ACL changed.

Commands: Rust fmt, clippy `-D warnings`, `cargo test --locked --all-targets` (69 passed, 1 ignored; includes the plaintext sentinel scans), rustdoc `-D warnings`, `git diff --check`: exit 0.

Not executed: the native gate (`pnpm test:native`). `pnpm` is not installed or executable on this host (a Node 26 toolchain exists, `spawnSync pnpm EACCES`), so the actual Tauri run for the command execution-context change is **unverified**. Run it on a provisioned host before relying on this packet; a mock transport cannot establish it.

### Review remediation R3

Plan: [foundation review remediation](../plans/foundation-review-remediation-flash.md), packet R3. Documentation only: [helper-v1.md](../protocol/helper-v1.md) now states that a status request waits for an active probe stream because the helper has one pipe and one in-flight exchange. No renderer component calls `getHelperStatus`; only the native helper-status spec does, without a concurrent probe. The coupling is tracked in the follow-ups table below. Gate: `git diff --check` and link review only.

### CI remediation: cancelled probe startup

Trigger: `TestProbeCancelledDuringFirstStatusSendsNoTimeoutFrame` hung on the ubuntu-22.04 and macos-15-intel runners at `f8fe5e3`. Only the `ctx.Done` and startup-deadline branches were silent for a cancelled probe. The open, version-read, and first-status branches still wrote a `talos_probe_failed` frame when the cancelled context made their step return an error, and the first-status branch did so only when the watch result won the `select` against `ctx.Done`.

Expected: a probe cancelled before the helper sends `TALOS_PROBE_RESPONSE` produces the cancel reply and no frame for the probe request, in every startup phase. `runProbe` now routes the three failure branches through one check of the probe context. `TestProbeCancelledDuringStartupSendsNoProbeFrame` supersedes the R5 test with one subtest per phase, and both startup tests read the output pipe before waiting for the helper, so a stray frame fails the assertion instead of blocking the pipe. [helper-v1.md](../protocol/helper-v1.md) states the rule. The Rust parent is unchanged: it never cancels during startup.

Evidence, including the new test's failures against the previous code, is in the [automation record](automation.md#amendment-first-ft-foundation-ci-run).

### Desktop shell layout revision

Owner-directed on 2026-10-11 and recorded in [0009](../decisions/0009-desktop-shell-layout.md), with its acceptance criteria and the executed checks: the single scrolling page became a fixed shell with a View menu for theme and density, a navigation bar (Home, Talos, Settings), and a status bar naming the cluster, Talos, and credential context. No IPC command, capability, Tauri configuration, backend, helper, or dependency changed, so no checkpoint status above changes. The Talos probe state moved from the probe panel to the shell so an imported session survives a change of view; its lifetime is still the window's.

The C0.1 and C3.3 rows that describe radio-group appearance controls and "narrow layouts" are superseded for the current shell: the controls are menu radio items, and the tested window sizes are 1280×800, 1024×700, and 720×480. The shell state gained a load error separate from the credential-action error, so a failed settings load is reported under the menu bar from every view. Evidence is Linux x86_64 only.

### Review remediation follow-ups

| ID                | Severity | Acceptance case                                                                                                                                                           | Owner decision or reason deferred                                                                                                                                                                           |
| ----------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R3                | Low      | A probe yielding several events is active, `status()` returns before the probe ends, the probe then completes normally, and no two exchanges touch the pipe concurrently. | Deferred: no renderer path polls helper status; a child-owning task that schedules pipe access from a request queue is a larger change for a later milestone and must land before any feature polls status. |
| R4 (verification) | Low      | `pnpm test:native` passes the storage and appearance flows with the async storage commands.                                                                               | Executed in later aggregate CI/native runs; see the 2026-10-11 review note above. The original packet's missing run remains historical. Refresh final-candidate evidence in F0.                             |
