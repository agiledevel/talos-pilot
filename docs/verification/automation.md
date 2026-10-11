# FND-008: GitHub quality and release automation

Date: 2026-10-08.

Acceptance criteria: the exact source commit must pass CodeQL (actions, JavaScript/TypeScript, Rust) with zero results and Trivy (vulnerabilities, secrets, misconfigurations) with zero unexcepted findings. A failing scan cannot permit release. (This replaced the original SonarCloud app gate; see the amendment below.) Existing renderer/native QA remains enforced. Angular commits generate changelogs. Releases build the declared desktop targets and collect real installer assets with hashes; failures prevent creation of a complete release. The README distinguishes the current shell from the planned full product and displays live version/QA badges. A new project icon is integrated into native assets and documentation with reproducible conversion.

The pipeline produces draft prereleases during foundation development. This preserves the locked full v1 release criteria while allowing inspection of real preview packages. Production signing, helper packaging, full native/cluster qualification, and the existing upstream advisory tasks remain open.

## Executed verification

Host: openSUSE Tumbleweed 20261007, Linux x86_64. Node 26.11.1, pnpm 12.10.1, Rust 1.99.0. Workflow/action versions and the AppImage runtime digest were researched from the upstream release APIs; links and exact pins are in [CI/release setup](../ci-release.md).

| Check                                         | Result and practical scope                                                                                                                                                                                                                                                             |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                  | Formatting, strict lint/types, 15 tests across five files, and production frontend build pass. Tests covered the since-removed Sonar app check-polling contract, release version rejection, installer collection/hashes, packaged WebKit resources, and deterministic ICNS validation. |
| `pnpm test:coverage`                          | Pass; LCOV generated. Maintained component/library coverage: 93.93% statements, 92.13% branches, 100% functions, 94.91% lines. Coverage scope is declared in `vitest.config.ts`; entry-point scripts additionally have subprocess fixture checks.                                      |
| `pnpm test:e2e`                               | One Chromium browser flow passes appearance controls, accessibility, and narrow layouts. This does not establish native IPC or cluster behavior.                                                                                                                                       |
| `pnpm icons:generate` / `pnpm icons:check`    | New source PNG converted; retained PNG/ICO/ICNS derivatives compare byte-for-byte. Two independent ICNS generations contained equal image payloads but unordered container chunks before canonicalization.                                                                             |
| actionlint 1.7.12                             | All three workflow files pass syntax/expression validation.                                                                                                                                                                                                                            |
| git-cliff 2.14.2                              | Existing Angular commit history renders the committed generated changelog with working commit links. Release notes use the same configuration.                                                                                                                                         |
| Release source CLI in an isolated Git fixture | Matching tag/source/npm/Tauri/Cargo versions accepted; mismatched version, wrong tag revision, and source outside main ancestry rejected. No actual repository tag or remote release was created.                                                                                      |
| Rust gates                                    | `cargo fmt --all -- --check`, locked Clippy/all-target tests, and rustdoc with warnings denied pass. The native binary exposes no application service API and currently has zero Rust tests.                                                                                           |
| `pnpm audit --audit-level=low`                | No known frontend vulnerabilities found. Existing Cargo informational advisories remain unresolved as recorded in [initialization](initialization.md); no exclusions were added.                                                                                                       |
| Native Linux executable                       | Release executable launched under an isolated Xvfb/DBus session; light and dark shell views rendered and the theme switch worked. Session/process cleanup executed.                                                                                                                    |
| Linux package build                           | The release workflow's Tauri command produced DEB, RPM, and AppImage for `x86_64-unknown-linux-gnu` with locked Cargo resolution.                                                                                                                                                      |
| `pnpm release:assets` / `sha256sum --check`   | Three actual Linux packages collected and their hashes verified. Installer files stay ignored locally and are workflow artifacts.                                                                                                                                                      |
| README/docs                                   | README rendered successfully through GitHub's GFM Markdown API. Local Markdown links and diff whitespace validated.                                                                                                                                                                    |

The final Vite build still reports its unchanged 580.82 kB minified initial JS chunk (188.52 kB gzip); no warning threshold was increased. Performance qualification remains FND-006 work.

## Failed and unexecuted qualification

The initial Linux packaging attempt failed because linuxdeploy scanned an inaccessible inherited PATH directory. A clean task-specific PATH corrected this host issue. The next attempt hung in appimagetool's OpenSSL runtime downloader; a debugger backtrace located the wait inside `fetch_runtime`. Prefetching and verifying the latest versioned runtime through upstream-supported `LDAI_RUNTIME_FILE` corrected the packaging failure and is enforced in CI.

**AppImage runtime smoke failed on this host.** The package opened a native window but could not render: WebKit could not spawn `libexec/libwebkit2gtk-4_1-0/WebKitNetworkProcess`. Inspection found neither WebKit helper process in the generated AppDir. `pnpm release:check-linux` reproduces the missing-resource rejection, and the new release job runs it before upload. A compilation/bundling pass is therefore not reported as a successful packaged runtime test. No generated installer was hand-edited to hide this failure.

FND-006 packaging acceptance remains open: execute the Ubuntu 22.04 package job, verify both WebKit helpers and a rendered AppImage on clean declared Linux targets, and investigate upstream layout handling if openSUSE-built AppImages are to be supported. Clean DEB/RPM install/uninstall, macOS Intel/Apple Silicon build/runtime/signing, and Windows build/runtime/signing were not executed here. The full native WebDriver/helper/IPC harness remains FND-005/FND-002 work.

No GitHub release run was executed for these changes. Release creation is deliberately a draft prerelease after every dependency job passes. The full milestone and v1 release gates remain incomplete.

## Separate final review

Reviewed workflow permissions, exact-commit reuse, bounded gate polling and input validation, tag/main ancestry and version agreement, changelog range handling, collision-free installer naming, checksum verification, signing scope, generated-icon ownership, tests, and documentation claims. The review found and corrected recursive executable collection that could accept a nested application binary as a Windows installer. It also added the executable WebKit resource gate after the real AppImage smoke failure. No application IPC permissions, credential interfaces, or cluster mutations were introduced. Remaining qualification is explicitly recorded above.

## Amendment: CodeQL and Trivy replace SonarCloud

Date: 2026-10-08. SonarCloud never produced a result for this repository. The app check-polling gate failed in run 37811900492 (commit `8e22df6`) because the commit had no SonarCloud check. A CI-scanner replacement then failed in run 37815070833 (commit `80607c7`). The owner directed replacing SonarCloud with GitHub CodeQL and Trivy and wiring rustfmt for Rust formatting. Foundation checks run 37815070862 passed on `80607c7` on all matrix runners, so the earlier macos-15-intel `pnpm` install failure did not recur.

Changes: `.github/workflows/security.yml` replaces `sonar.yml`, and the release pipeline depends on it. `.trivyignore.yaml` holds one owner-approved exception, GHSA-wrw7-89jp-8q8g (FND-007), which expires on 2026-11-30. `src-tauri/rustfmt.toml` sets the Rust 2024 style edition. The `pnpm format:rust` and `pnpm format:rust:check` scripts were added, and the desktop CI job now calls the check script. Details are in [CI/release setup](../ci-release.md).

Executed on openSUSE Tumbleweed:

| Check                                                                                                                                                 | Result                                                                                 |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| actionlint 1.7.12 (checksum-verified)                                                                                                                 | All workflows pass.                                                                    |
| `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` with the new config (rustfmt 1.9.0, Rust 1.99.0)                                    | No formatting differences.                                                             |
| Trivy 0.74.0 (checksum-verified), `fs --scanners vuln,secret,misconfig --ignorefile .trivyignore.yaml --exit-code 1`, local build directories skipped | Exit 0: no findings in `pnpm-lock.yaml` or `src-tauri/Cargo.lock` after the exception. |
| Trivy without the ignore file                                                                                                                         | Exit 1, on GHSA-wrw7-89jp-8q8g, so the gate fails without the exception.               |
| Trivy with the exception's expiry set in the past                                                                                                     | Exit 1, so expiry re-enables the gate.                                                 |
| CodeQL result-count step, run against synthetic SARIF                                                                                                 | Zero results exit 0; one result prints rule/file/line and exits 1.                     |

Not executed: CodeQL analysis itself, which ran neither locally nor on GitHub. Whether Rust `build-mode: none` extraction succeeds on this crate, and how many results the first run produces, is therefore unknown. The pushed workflow, code-scanning uploads, and release-mode runs are unverified until GitHub executes them.

## Amendment: first ft-foundation CI run

Date: 2026-10-10. The first GitHub runs for `ft-foundation` at `f8fe5e3` failed: Foundation checks runs 38046986041 (push) and 38047036239 (pull request), and Security scans run 38047036240. Every job stopped at its first failing step, so later steps in those jobs did not execute on GitHub. The causes are independent.

| Job and step                                                                             | Cause                                                                                                                                                                                                                                                                                                                                       | Change                                                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| renderer, workflow validator                                                             | shellcheck SC2046 on the unquoted `$(find …)` inside the Go format assertion in `check.yml`.                                                                                                                                                                                                                                                | The assertion is `test -z "$(gofmt -l .)"`, which walks the same ten files.                                                                                                                                 |
| renderer, `pnpm check` (not reached on GitHub; found by running the job's steps locally) | Two Markdown tables committed from a host without `pnpm` were not Oxfmt-formatted.                                                                                                                                                                                                                                                          | `oxfmt` applied to `docs/plans/milestone-1-flash.md` and `docs/verification/milestone-1.md`; whitespace only.                                                                                               |
| desktop (windows-2022), `pnpm format:rust:check`                                         | Git for Windows checked the sources out with CRLF and rustfmt enforces `newline_style = "Unix"`. The same step failed on `main` in run 37818339686.                                                                                                                                                                                         | `.gitattributes` checks text out with LF on every platform. `git add --renormalize .` changed no tracked file.                                                                                              |
| desktop (macos-15, macos-15-intel), Clippy                                               | `prost-build` found no `protoc`; hosted runners do not ship it.                                                                                                                                                                                                                                                                             | The `install-protoc` composite action installs the pinned, digest-verified 36.2 archive in the desktop and release jobs.                                                                                    |
| desktop (ubuntu-22.04, macos-15-intel), Go tests                                         | `TestProbeCancelledDuringFirstStatusSendsNoTimeoutFrame` timed out after ten minutes. A cancelled probe context made the interrupted startup step return an error, and `runProbe` reported it as `talos_probe_failed`. The test's unbuffered pipe had no reader left, so the write blocked. The helper violated its documented silent path. | `runProbe` reports no startup failure once the probe context is cancelled. `TestProbeCancelledDuringStartupSendsNoProbeFrame` replaces the test and covers the open, version-read, and first-status phases. |
| Trivy filesystem scan                                                                    | GO-2026-5932 against `golang.org/x/crypto` v0.57.0 in `helper/go.mod`. The advisory covers only the `openpgp` packages, affects every version, and has no fixed version.                                                                                                                                                                    | A `helper/go.mod`-scoped exception expiring 2026-11-30, under FND-007, approved by the owner on 2026-10-10. See [CI/release](../ci-release.md).                                                             |

Executed on openSUSE Tumbleweed Linux x86_64 with Rust 1.99.0, Go 1.27.2, Node 24.21.0, pnpm 12.10.1, and `protoc` 36.2, on the working tree containing these changes:

| Check                                                                                                                                       | Result                                                                                                          |
| ------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| actionlint 1.7.12 (checksum-verified) with shellcheck 0.10.0                                                                                | Reproduced SC2046 before the change; exit 0 after.                                                              |
| `install-protoc` step script, run with `RUNNER_OS=Linux` and `RUNNER_ARCH=X64`                                                              | Digest verified, `libprotoc 36.2`. An unrecorded platform and an altered digest each exit 1.                    |
| SHA-256 of the four `protoc` 36.2 archives                                                                                                  | Each downloaded archive matches the digest GitHub publishes for the release asset and the value in the action.  |
| New Go test against the previous `runProbe`, 20 runs                                                                                        | Open and version-read phases failed 20 of 20, first-status 6 of 20, each on a stray `talos_probe_failed` frame. |
| New Go test with the fix                                                                                                                    | `-count=500`, `GOMAXPROCS=1 -count=200`, and `-race -count=100` all pass.                                       |
| Go gates in `helper/`: format assertion, `go vet`, `go test`, `go test -race`, `go mod verify`, `go build`                                  | Exit 0.                                                                                                         |
| `go list -deps -test ./...` for linux/amd64, darwin/arm64, darwin/amd64, and windows/amd64                                                  | No `golang.org/x/crypto/openpgp` package on any target.                                                         |
| `pnpm audit:go` (govulncheck 1.8.0)                                                                                                         | Exit 0: no called vulnerability, none in imported packages, one in a required module (GO-2026-5932).            |
| Trivy 0.74.0 (checksum-verified), CI arguments, local build directories skipped                                                             | Exit 1 on GO-2026-5932 before the exception; exit 0 with it; exit 1 again with its expiry set in the past.      |
| Remaining renderer job steps: `pnpm check`, `pnpm icons:check`, `pnpm audit --audit-level=low`, `pnpm test:e2e`, `pnpm test:coverage`       | Exit 0 (62 unit tests, 1 browser test).                                                                         |
| Remaining desktop job steps, in workflow order, from `pnpm format:rust:check` through `pnpm advisories:check`, including `pnpm test:native` | Exit 0 (69 Rust tests passed, 1 ignored; 11 native WebDriver tests).                                            |
| `pnpm contracts:check`                                                                                                                      | Exit 0.                                                                                                         |

Not executed: any macOS or Windows step. The `install-protoc` action's macOS and Windows branches, the LF checkout on Windows, and every desktop step after the first failure on those runners are unverified until GitHub runs this revision. The release workflow was not run.

### Second run at `d857906`

Runs 38049609375 and 38049611875 (Foundation checks) and 38049611895 (Security scans). The renderer job, Trivy, and the `actions` and `javascript-typescript` CodeQL jobs passed. The Windows job passed the rustfmt and Go steps that the LF checkout and the helper fix addressed. Each desktop job then stopped at a step it had not reached before:

| Job and step                                         | Cause                                                                                                                                                                                                                                                        | Change                                                                                                                                                                                              |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| desktop (macos-15, macos-15-intel), `install-protoc` | The macOS runners provide a BSD `sha256sum` that has no `--check` option, so the first version of the action printed its usage and exited 1.                                                                                                                 | The action computes the digest and compares the string, with `shasum -a 256` as the fallback.                                                                                                       |
| desktop (windows-2022), Clippy                       | `secure_database_file` used its `path` only inside `#[cfg(unix)]`, so Windows reported an unused variable under `-D warnings`.                                                                                                                               | The function has a Unix implementation and a documented non-Unix no-op, matching the storage design's statement that Windows relies on the inherited per-user ACL.                                  |
| desktop (ubuntu-22.04), `pnpm inventory:check`       | The generator read license files for every Go module whose source was in the module cache. The committed inventory recorded 42 graph-only modules that the implementing host had downloaded for other work; a clean runner holds only the 35 linked modules. | License files are read only for linked modules; graph-only modules are always `unobserved`, and a linked module with no source is an error. The inventory was regenerated (176003 to 175016 bytes). |

Executed on the same Linux host: the previous generator against a fresh `GOMODCACHE` filled by the workflow's Go steps reproduced the stale result (175016 generated against 176003 committed bytes); the new generator reports the regenerated inventory as current under both that fresh cache and the full developer cache. `pnpm check` (63 tests, including the changed and the added inventory case), `pnpm test:coverage`, `pnpm format:rust:check`, both Clippy configurations, both Rust test configurations (69 passed, 1 ignored), rustdoc, actionlint, and the `install-protoc` script (the `sha256sum` branch, the `shasum` branch, and an altered digest) all behaved as expected.

Not executed locally: the Windows compilation of `secure_database_file` and the macOS digest branch, which only the hosted runners exercise. No cross-compilation toolchain for either target is installed on this host.

### Third run at `88983a8`

Foundation checks run 38050246762 (push) and Security scans run 38050249577 passed on every job: renderer, the four desktop runners, Trivy, and the three CodeQL languages. These are the first GitHub executions of the full desktop job on macOS and Windows for this branch, including `pnpm test:native` on each.

Foundation checks run 38050249511 (pull request) passed on every job except `desktop (macos-15-intel)`, which GitHub cancelled at the 45-minute job limit during `cargo install cargo-audit`. Every step it executed had passed. Step durations on that runner varied between the two runs of the same commit (for example 213 s and 403 s for the first Rust test step), and the job needed about 50 minutes against 38 minutes on the push run. The desktop job limit is now 75 minutes, at the owner's direction on 2026-10-10.

Not executed: a run with the 75-minute limit; the next push provides it.

### Fourth run at `99c7099` — first run under the 75-minute limit

The limit change from [the third run](#third-run-at-88983a8) was the
`99c7099` commit itself, so its own runs are the first under it.

Foundation checks run 38054135965 (push) and run 38054138988 (pull request), and
Security scans run 38054138960 (pull request), passed on every job. `desktop
(macos-15-intel)` took 28.5 minutes on the push run and 28.1 on the pull-request
run, against the cancelled 45-minute-limit attempt at `88983a8`. The limit is
therefore confirmed sufficient with roughly 45 minutes of headroom, and the
cancellation cause (job width, not a failing step) is confirmed.

### Fifth run at `fd91ce4` — the Svelte shell on all four desktop targets

Foundation checks run 38121202573 (push) and run 38121206395 (pull request), and
Security scans run 38121206387 (pull request), passed on every job: renderer, the
four desktop runners, Trivy, and the three CodeQL languages. `desktop
(macos-15-intel)` took 30.4 and 37.3 minutes. This is the first hosted execution
of the Svelte/Skeleton shell and the fixed desktop layout, including
`pnpm test:native` and `pnpm production:check` on each runner.

### Sixth run at `11d4e19` — the desktop shell layout revision, with a real failure

Foundation checks run 38122849142 (push) and Security scans run 38122849140
(push) recorded the revision [the 2026-10-11 review](../plans/foundation-completion-flash.md)
examined. Security passed all four jobs (Trivy, CodeQL `actions`, `CodeQL
javascript-typescript`, `CodeQL rust`). The renderer job and `desktop
(macos-15)`, `desktop (macos-15-intel)`, and `desktop (windows-2022)` passed;
`desktop (ubuntu-22.04)` **failed** in `cargo test --manifest-path
src-tauri/Cargo.toml --locked --all-targets` after 5.4 minutes:

```text
test helper::supervisor::tests::helper_exit_during_status_exchange_is_reported_and_reaped ... FAILED
panicked at src/helper/supervisor.rs:980:
assertion failed: matches!(supervisor.refresh_status(Duration::from_secs(5)).await,
    Err(SupervisorError::ChildExited))
test result: FAILED. 68 passed; 1 failed; 1 ignored
```

F0 treated this as a finding rather than a platform artifact: the supervisor
reported a generic `Pipe` error when it observed a killed helper's exit on the
request write (`EPIPE`) instead of on the following read (end of file). The two
classes are not interchangeable in the operator's view: in the Talos probe
projection `ChildExited` becomes `TALOS_UNAVAILABLE` ("the endpoint or node is
unavailable") while `Pipe` becomes `TALOS_PROBE_FAILED` ("the authenticated
Talos read probe failed"), so the same event produced a different code and
message depending on scheduler timing. The status projection maps both classes
to `HELPER_UNAVAILABLE` and was already stable. Reproduced deterministically on the F0 host by killing and reaping the
helper before the status request, which yields `Pipe(Os { code: 32, kind:
BrokenPipe })`. Packet F0 fixed the write path to report `ChildExited` and added
the regression test; see [the F0 entry](milestone-1.md#f0-packet-evidence--refresh-the-baseline-and-enforce-existing-contract-checks).
The hosted failure's own rerun is the next push.

### Run at `de19494` — the plan documentation commit

Foundation checks run 38125472686 and Security scans run 38125472701 were
created at 2026-10-11T08:37:42Z and were still in progress when F0 recorded this
entry; no result is claimed for them. They changed documentation only.

### Seventh run at `fae291d` — the first hosted run of the contract step

Foundation checks run 38155107982 (push, `ft-foundation-completion`) is the first
hosted execution of the F0 commits. It completed with four jobs green and one
failing:

| Job                      | Result  | Duration | `Verify generated contracts are current`             |
| ------------------------ | ------- | -------- | ---------------------------------------------------- |
| renderer                 | success | 1.1 min  | not applicable; the renderer job has no protoc or Go |
| desktop (ubuntu-22.04)   | success | 16.2 min | passed                                               |
| desktop (macos-15)       | success | 16.2 min | passed                                               |
| desktop (macos-15-intel) | success | 38.5 min | passed                                               |
| desktop (windows-2022)   | failure | 2.4 min  | **failed**                                           |

`desktop (ubuntu-22.04)` is the job that failed at `11d4e19` on
`helper_exit_during_status_exchange_is_reported_and_reaped`; it passed here, so
the F0 supervisor fix is confirmed on the hosted Linux runner. `macos-15-intel`
finished in 38.5 minutes, well inside the 75-minute limit, and all three POSIX
runners executed the new contract step successfully.

The Windows failure is a harness defect, not a difference in generated output.
The step stopped in the pinned-tool version assertion:

```text
$ node scripts/contracts.ts --check
Expected protoc-gen-go v1.36.12, received protoc-gen-go.exe v1.36.12.
```

`pnpm contracts:check` builds the pinned plugin and then compares
`protoc-gen-go --version` with the recorded string. On Windows the plugin reports
its own file name, so the exact comparison fails before any generated byte is
compared. A second, unobserved gap is in the same script: it spawns `pnpm exec
oxfmt` without a shell, which cannot resolve the Windows `pnpm.cmd` shim.

The failure is also worse than a failed check: GitHub Actions skips every
subsequent step, so `desktop (windows-2022)` ran for 2.4 minutes and skipped
steps 11 to 26 — both Clippy and both test configurations, the Go gates, rustdoc,
`desktop:build`, `production:check`, `test:native`, `cargo audit`, and the
advisory applicability check. A cheap, platform-independent source check took
that platform's entire verification with it.

Both harness gaps are fixed in `scripts/contracts.ts` rather than worked around,
so the gate runs on all four runners:

- The pinned-plugin comparison now strips a Windows executable suffix from the
  tool name through `scripts/lib/contracts.ts`, which has unit coverage for the
  POSIX line, the Windows line, a wrong version, and a line with no version. The
  version text itself is still compared exactly, so no comparison was weakened.
- The formatter is invoked as `node node_modules/oxfmt/bin/oxfmt`, which is the
  package's own Node entry point, instead of `pnpm exec oxfmt`. `spawnSync`
  cannot start pnpm's `.cmd` shim without a shell on Windows, and resolving the
  package entry removes the platform-specific path entirely.

The step also moved to the end of the desktop job, after
`pnpm advisories:check`, with the reason recorded in the workflow: it sits behind
the platform's native, packaging, and advisory evidence, so a future defect in it
cannot skip those steps again. On this host the reworked check still passes on
the current tree, still exits 1 on a deliberate DTO drift, and a simulated
Windows line (`protoc-gen-go.exe v1.36.12`) is accepted while
`protoc-gen-go.exe v1.37.0` is rejected. The Windows runner itself has not yet
executed the reworked step.

### Eighth run at `f0731cf` — the reworked contract step on Windows

Foundation checks run 38158295458 and Security scans run 38158295539 (push,
`main`) were read at 2026-10-11T17:28Z by the
[readiness review](foundation-readiness-2026-10-11.md#hosted-ci-at-the-reviewed-revision).
`renderer`, `desktop (ubuntu-22.04)`, `desktop (macos-15)` and
`desktop (windows-2022)` succeeded, and so did all four security jobs.
`desktop (macos-15-intel)` was still running and has no recorded result here.
The Windows job ran every step through `Verify generated contracts are current`.
That is the first hosted Windows execution of the reworked step, and it closes
the unexecuted row recorded under the seventh run.

### Contract drift gate

`pnpm contracts:check` was not a workflow step before F0, although C1 step 5
required it as one. It is now a named step of the desktop job on every matrix
runner and therefore also part of the release gate, which reuses this workflow.
F0 first placed it immediately after `install-protoc`. `dd96539` moved it to
the end of the job, after `pnpm advisories:check`, for the reason given under
the seventh run. Deliberate-drift evidence on the F0
host: a `.proto` field addition exits 1 in the generation step, a DTO doc
comment that changes the generated TypeScript declaration exits 1 with
``Generated IPC declaration `ApplicationErrorDto.ts` is stale``, and the
restored tree exits 0. macOS and Windows byte behaviour for this step is
unexecuted and belongs to the next hosted run.
