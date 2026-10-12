# Foundation finish series: ledger

This is the progress record for the [foundation finish series](README.md). **Every session must update it**, including a session that only investigates, gets blocked, or changes nothing.

## How to update this ledger

1. **Before your first edit**, set your document's row in the status board to `in progress` and fill in the date.
2. **Before you commit**, append one entry to the session log using the template at the end of this file. Entries are append-only: never rewrite or delete an earlier entry. To correct one, add a new entry that names the entry it corrects.
3. **In the same change**, update the status board row: status, last commit, date, and the next action.
4. Add any new blocker, question, deferred row, or unverified assumption to its section below. When one is resolved, mark it resolved with the date and the entry that resolved it. Do not delete it.
5. Update the checkpoint table in the [milestone ledger](../../verification/milestone-1.md#checkpoint-status-and-acceptance-criteria) when a checkpoint's status changes, and link the entry here. Packet evidence for this series is written here, not there.
6. Keep entries factual. Record commands as they were run and results as they were printed. A check that did not run is listed as unexecuted with its reason.

Status values: `not started`, `in progress`, `blocked` (name the blocker), `done`, `deferred` (owner decision; name the missing resource).

A document is `done` only when every acceptance case in it has recorded evidence, its gates pass on the committed tree, and its exit condition in the [plan](../foundation-completion-flash.md) is met. Otherwise it stays `in progress` or `blocked`.

## Status board

| Document                                                                        | Packet           | Status      | Last commit | Updated    | Next action                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------- | ----------- | ----------- | ---------- | ----------------------------------------------------------------------------------------------------------------- |
| [01 F1a live stall rows](01-f1a-live-stall-rows.md)                             | F1a step 4       | in progress | this commit | 2026-10-13 | Resume its remaining live cases after the owner-directed document 02 session completes                            |
| [02 F3 Kubernetes list probe](02-f3-kubernetes-list-probe.md)                   | F3               | in progress | this commit | 2026-10-13 | Read hosted checks for this commit; then finish Part A step 3 by creating the restricted reader and exercising it |
| [03 F4 Kubernetes watch](03-f4-kubernetes-watch.md)                             | F4               | not started | —           | 2026-10-12 | After 02                                                                                                          |
| [04 F5 Kubernetes version fixtures](04-f5-kubernetes-version-fixtures.md)       | F5               | not started | —           | 2026-10-12 | After 03                                                                                                          |
| [05 F6 editor workers and CSP](05-f6-editor-workers-csp.md)                     | F6               | not started | —           | 2026-10-12 | After 04, or earlier if a fixture document is blocked                                                             |
| [06 F7 terminal and chart wrappers](06-f7-terminal-chart.md)                    | F7               | not started | —           | 2026-10-12 | After 05                                                                                                          |
| [07 F8 dependencies, notices, security](07-f8-dependencies-notices-security.md) | F8               | not started | —           | 2026-10-12 | After 06; mind the 2026-11-30 date below                                                                          |
| [08 F9 Linux packages](08-f9-linux-packages.md)                                 | F9.0, F9.1, F9.4 | not started | —           | 2026-10-12 | After 07                                                                                                          |
| [09 F10 budgets and Linux close](09-f10-budgets-and-linux-close.md)             | F10              | not started | —           | 2026-10-12 | After 08                                                                                                          |
| [10 Platform revisit](10-platform-revisit.md)                                   | F9.2, F9.3       | deferred    | —           | 2026-10-12 | Owner has no macOS or Windows machine; revisit when they are available                                            |

## Standing owner decisions

Recorded on 2026-10-12 and 2026-10-13. Their full wording is in the series [README](README.md#what-the-owner-has-decided).

| Date       | Decision                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-12 | Milestone 1 may stay open. The macOS and Windows rows are deferred and do not block milestone 2                             |
| 2026-10-12 | The owner has no macOS or Windows machine                                                                                   |
| 2026-10-12 | The fixture-scoped host firewall remediation may be applied in the session, exactly as the allowlist records it             |
| 2026-10-12 | Pushing to `ft-foundation-completion` is permitted; no force-push, tags, releases, or push to `main`                        |
| 2026-10-12 | The fixture may shadow the VPN route covering `10.79.0.0/24` indefinitely (answers Q1)                                      |
| 2026-10-12 | The owner opened pull request 2 from this branch to `main` (answers Q2). Sessions never merge, close, retarget, or edit it  |
| 2026-10-12 | A node reboot that outlasts the reconnect budget ends the Talos subscription; the retry policy is unchanged (decision 0013) |
| 2026-10-12 | F1 is closed with its live retry-exhaustion row re-scoped to F1a; F2 is accepted                                            |
| 2026-10-13 | Move the Kubernetes server-version preflight to document 02 and record it before any fixture test (answers Q3)              |

Add a row when the owner decides something new. Quote the owner's words or cite where they are recorded.

## Dates that matter

| Date       | What happens                                                                                                                                | Owner document |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 2026-11-30 | Both Trivy exceptions in `.trivyignore.yaml` expire. The security workflow and the release gate fail afterwards until they are re-evidenced | 07             |

## Blockers

| ID  | Opened     | Blocker                                                                                                                                                                                                 | Affects                                          | Status                                                                                           |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| B1  | 2026-10-12 | `git push` failed with HTTP 403 for the stored account `TIT-IT`                                                                                                                                         | Every hosted-CI row; F9.0 in document 08         | Resolved 2026-10-12: the owner switched the remote to SSH and `b662b1a` was pushed               |
| B2  | 2026-10-12 | `gh` is not installed, and no session has yet read a hosted CI result from this host                                                                                                                    | Recording hosted-CI results; F9.0 in document 08 | Resolved 2026-10-12: the owner installed and configured `gh`; hosted runs were read the same day |
| B3  | 2026-10-12 | Hosted `desktop (windows-2022)` failed at `b662b1a` and `481421a` in `go test`: `TestProbeCancellationDuringBackoffEndsCleanly` raced its cancellation against the first reconnect attempt              | Hosted evidence for every commit until fixed     | Resolved 2026-10-12: fixed in `aaedf79`, whose hosted run 38301882786 passed all five jobs       |
| B4  | 2026-10-12 | Document 01's live cases require runbook step 5's Kubernetes server-version preflight; the owner directed that preflight to document 02, so document 01 remains incomplete until document 02 records it | Document 01 live harness                         | Resolved 2026-10-13: document 02 recorded Kubernetes v1.36.5 in the 2026-10-13 session entry     |

## Questions for the owner

| ID  | Asked      | Question                                                                                                                                                                                                                                                                                                                                  | Needed by                                 | Answer                                                                                                   |
| --- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Q1  | 2026-10-12 | The fixture network `10.79.0.0/24` sits inside a VPN route on the host. The owner accepted shadowing it for the 2026-10-12 run only. Is that accepted from now on?                                                                                                                                                                        | The first fixture session, document 01    | Answered 2026-10-12: allowed indefinitely                                                                |
| Q2  | 2026-10-12 | The security workflow (CodeQL and Trivy) runs only for pushes and pull requests to `main`. Exact-commit scan results for this branch need a pull request to `main`. May a session open one, as a draft, when document 07 needs the results?                                                                                               | Document 07                               | Answered 2026-10-12: the owner opened pull request 2 to `main`; the security scans now run for each push |
| Q3  | 2026-10-12 | Runbook step 5 requires the live Kubernetes server version before any fixture test, while its rule says Kubernetes actions are authorized only once the allowlist names them and document 02 adds those actions. May document 01 add a single read-only version request to the fixture API, or should that preflight move to document 02? | Document 01, before the next fixture test | Answered 2026-10-13: move the preflight to document 02; record the version there before any fixture test |

## Deferred and carried rows

Rows that no current document closes, or that a named document must pick up. A row leaves this table only by being executed, with a link to the entry that did it.

| Row                                                                                   | Owner                         | Why it is open                                                                                                                                         |
| ------------------------------------------------------------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| macOS 13.3 and current, Apple Silicon and Intel: clean install, Keychain, helper, CSP | Document 10                   | Deferred by the owner; no macOS machine                                                                                                                |
| Windows 11: NSIS and WebView2 install, Credential Manager, helper lifecycle           | Document 10                   | Deferred by the owner; no Windows machine                                                                                                              |
| Mutual-TLS client handshake against a real API server                                 | Document 02                   | Resolved 2026-10-13: the allowlisted fixture kubeconfig uses inline client certificate/key and its admin `/version` read succeeded; this session entry |
| Basic-auth client handshake                                                           | Unassigned                    | Selection and rejection tests only; no live endpoint is planned                                                                                        |
| Live cancellation during an in-flight reconnect attempt or backoff                    | Unassigned                    | Deterministic evidence only; the 2026-10-12 live cancellation landed on an established stream                                                          |
| Real OS-vault restart of a Kubernetes credential on Linux                             | Document 08                   | Unit tests use injected keys; the packaged run can exercise the Secret Service                                                                         |
| Packaged-installer helper startup                                                     | Document 08, then document 10 | Belongs to F9                                                                                                                                          |
| R3: helper status and probe serialization                                             | Deferred                      | No feature polls helper status during a probe; deliver its contract first if one does                                                                  |
| Legacy Kubernetes 1.33 and 1.34 browsing and migration                                | Later milestone               | Outside milestone 1                                                                                                                                    |

## Unverified assumptions

Statements the code or a decision record relies on that only a live run can confirm. The owner document must confirm or refute each one and record which.

| Assumption                                                                                                                         | Source        | To be checked by                                   |
| ---------------------------------------------------------------------------------------------------------------------------------- | ------------- | -------------------------------------------------- |
| A frozen worker makes the liveness read wait for its 15-second deadline; stale within 45 s, `TALOS_UNAVAILABLE` within about 92 s  | Decision 0013 | Document 01                                        |
| An idle healthy stream stays current for longer than the 30-second window                                                          | Decision 0013 | Document 01                                        |
| A suspend released at the stale marker recovers under the next generation                                                          | Decision 0013 | Document 01                                        |
| The official client's watch retry keeps a broken connection silent to the helper, and a rebooted node rejects the earlier bookmark | Decision 0013 | Document 01                                        |
| A reboot that outlasts the stale bound plus the budget ends `TALOS_UNAVAILABLE`                                                    | Decision 0013 | Document 01                                        |
| Power loss and partition behave like a freeze                                                                                      | Decision 0013 | Unassigned; no fixture action is designed for them |

## Session log

Entries are appended below, oldest first.

### 2026-10-12 — series created

- **Document:** none (planning).
- **Session:** owner-directed review and planning; base and final revision: the commit that adds this series.
- **What changed:** the series documents, this ledger, and pointers from the foundation plan, the milestone 2 plan, the milestone ledger, and the repository README.
- **Why:** the owner asked for per-packet implementation documents with a shared ledger, and decided that milestone 1 may stay open for the macOS and Windows rows without blocking further work.
- **Evidence:** documentation only. `pnpm format:check`, `git diff --check`, and a local link and anchor check of the changed Markdown files.
- **Unexecuted:** every packet in the status board.
- **Next:** document 01.

### 2026-10-12 — hosted CI access, and a flaky helper test

- **Document:** none (series maintenance, before document 01).
- **Session:** Claude Opus 5.5; base revision `481421a`; final revision: the commit carrying this entry.
- **Status after this session:** no document status changed. Blockers B1 and B2 are resolved; B3 is fixed locally and awaits its hosted confirmation.
- **Acceptance cases:** none.
- **What changed:**
  - `helper/cmd/talos-pilot-helper/main_test.go`: `TestProbeCancellationDuringBackoffEndsCleanly` now uses the injected fake clock and waits for the pending 30-second backoff before it cancels. No production code changed.
  - Series README and documents 04, 07, and 08: `gh` is available; the conditional wording about unreadable hosted results no longer names B2.
- **Commands and results** (openSUSE Tumbleweed x86_64, Go 1.27.2):
  - `gh auth status`: signed in as `agiledevel`. `gh run list --branch ft-foundation-completion`: runs 38299801331 (`b662b1a`) and 38300140517 (`481421a`).
  - Both runs, read while still in progress: `renderer` success; `desktop (windows-2022)` failure in the step "Verify Go helper source and modules", `--- FAIL: TestProbeCancellationDuringBackoffEndsCleanly`, "unexpected frame after cancellation" with an error frame; `desktop (ubuntu-22.04)`, `desktop (macos-15)`, and `desktop (macos-15-intel)` still in progress when read.
  - Before the fix, `go test -run 'TestProbeCancellationDuringBackoffEndsCleanly$' -count=3000 ./cmd/talos-pilot-helper/`: 51 failures, so the race is not specific to Windows.
  - After the fix: the same command with `-count=5000` passes; `-count=2000 -cpu=1,4` passes; `-race -count=300` passes; the whole package with `-count=300` passes; the whole package with `-race -count=40` passes.
  - `gofmt -l .` prints nothing; `go vet ./...`, `go build ./...`, `go test -count=1 ./...`, and `go test -race -count=1 ./...` pass.
  - `pnpm format:check`, `git diff --check`, and the local link and anchor check pass.
- **Evidence class:** deterministic tests and hosted CI results only. No native run and no real cluster.
- **Fixture:** none.
- **Failed or unexecuted:**
  - The hosted Ubuntu and macOS desktop jobs of both runs were not read to completion. They are in progress, not passed.
  - The hosted run for this entry's commit has not been read. Until it is, the Windows fix is confirmed locally only.
- **Review findings:**
  - The test cancelled as soon as it read the stale marker. The stale marker is sent before the first reconnect attempt, so the cancellation could cross that attempt's failure. The helper then reports the failure instead of a clean cancelled end, which is its documented disposition for a terminal outcome that races a cancellation. The test was wrong, not the helper.
  - The test dates from commit `f9d56a8`. No hosted run had executed it, because pushes had failed since `c310fbd`. The F1a handoff's stress runs covered only the `TestStall` tests.
  - The carried row "Live cancellation during an in-flight reconnect attempt or backoff" is related: a cancellation that lands during an attempt can end with that attempt's failure. That is existing behavior and is unchanged here.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** B3.
- **Next:** read the hosted result for this entry's commit, all five jobs, and record it in the next entry. If the Windows job still fails, fix that before document 01.

### 2026-10-12 — hosted results for `b662b1a`, `481421a`, and `aaedf79`

- **Document:** none (series maintenance, before document 01).
- **Session:** Claude Opus 5.5; base revision `aaedf79`; final revision: the commit carrying this entry.
- **Status after this session:** no document status changed. Blocker B3 is resolved. No blocker is open.
- **Acceptance cases:** none.
- **What changed:** this ledger only.
- **Commands and results:** `gh run view` on each run, read after it completed.

  | Commit    | Run         | renderer | ubuntu-22.04 | windows-2022 | macos-15 | macos-15-intel | Run result |
  | --------- | ----------- | -------- | ------------ | ------------ | -------- | -------------- | ---------- |
  | `b662b1a` | 38299801331 | success  | success      | failure      | success  | success        | failure    |
  | `481421a` | 38300140517 | success  | success      | failure      | success  | success        | failure    |
  | `aaedf79` | 38301882786 | success  | success      | success      | success  | success        | success    |

  Both Windows failures were in the step "Verify Go helper source and modules", in `TestProbeCancellationDuringBackoffEndsCleanly`, the test `aaedf79` corrects.

- **Evidence class:** hosted CI. The desktop jobs include the native Tauri tests on each runner. No real cluster.
- **Fixture:** none.
- **Failed or unexecuted:**
  - The hosted run for this entry's commit has not been read. It changes documentation only.
  - No security workflow run exists for this branch. That workflow runs only for pushes and pull requests to `main` and on a weekly schedule, so the CodeQL and Trivy results for these commits are unexecuted. See question Q2.
  - These are hosted macOS 15 and Windows Server 2022 runners. They are not macOS 13.3 or Windows 11 qualification, and no installer was built.
- **Review findings:** the stall detection of `b662b1a` passed on every runner except for the unrelated flaky test, and passes on all five at `aaedf79`.
- **Assumptions confirmed or refuted:** none; those need the live fixture.
- **Questions and blockers raised:** Q2.
- **Next:** document 01.

### 2026-10-12 — pull request 2 opened by the owner

- **Document:** none (series maintenance, before document 01).
- **Session:** Claude Opus 5.5; base revision `f2c09b6`; final revision: the commit carrying this entry.
- **Status after this session:** no document status changed. Question Q2 is answered.
- **Acceptance cases:** none.
- **What changed:** this ledger, the series README, and document 07, to reflect the pull request and how to read its checks.
- **Commands and results:** `gh pr list --head ft-foundation-completion`: pull request 2, "Foundation Next", base `main`, not a draft, head `f2c09b6`. `gh run list`: for `f2c09b6`, foundation checks 38308644370 (push) and 38309157781 (pull request) and security scans 38309157790 (pull request), all in progress when read.
- **Evidence class:** none; no result was read to completion.
- **Fixture:** none.
- **Failed or unexecuted:** the three runs for `f2c09b6` and the runs for this entry's commit are in progress or not started. None is a pass yet.
- **Review findings:** neither workflow sets a concurrency group, so a later push does not cancel an earlier run. Results for an older commit stay readable.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** none.
- **Next:** document 01. Its session first reads and records the results of the runs named above, including the first CodeQL and Trivy results for this branch. A failing scan is a finding for document 07; record it and carry on with document 01 unless it shows a defect in code that document 01 touches.

### 2026-10-12 — document 01, harness changes and fixture preflight

- **Document:** 01, F1a step 4, Part A and the start of Part B.
- **Session:** GPT-6; base revision `1a4bbd0`; final revision: this commit.
- **Status after this session:** blocked by Q3. The harness changes compile and the host is restored; live acceptance evidence is still unexecuted.
- **Acceptance cases:** (1) unexecuted, no harness run; (2) unexecuted, no harness run; (3) unexecuted, no harness run; (4) unexecuted, no harness run; (5) unexecuted, no harness run; (6) unexecuted as a live case, though the suspend guard resumes its exact worker PID on drop; (7) unexecuted, the six earlier live rows were not run; (8) passed, the host matches its captured baseline.
- **What changed:** `src-tauri/tests/talos_fixture.rs` restores fixture-scoped QEMU suspend/resume helpers, moves `talosctl reboot` to `spawn_blocking`, adds the three F1a live cases, and measures the reboot outage before asserting its corresponding outcome. The fixture allowlist status records this preflight. This ledger records the hosted evidence, Q3, and the handoff.
- **Commands and results** (openSUSE Tumbleweed x86_64, Node 26.11.1, pnpm 12.10.1, Rust 1.99.0, Go 1.27.2, protoc 36.2):
  - Node 26.11.1 was downloaded to `/tmp/talos-f1a-tools` and verified against Node's `SHASUMS256.txt`; pnpm 12.10.1 was installed into that private Node prefix. Rust 1.99.0 came from the pinned rustup toolchain with `~/.cargo/bin` first on `PATH`; Go 1.27.2 came from the recorded module cache; protoc 36.2 matched `.github/actions/install-protoc/action.yml` SHA-256 `121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278`.
  - `src-tauri/.local-tools/talosctl version --client`: v1.14.2. Its SHA-256 `c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4` matched the v1.14.2 release `sha256sum.txt` entry.
  - `pnpm format`, `pnpm format:check`, `pnpm format:rust:check`, and `git diff --check`: pass.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked --test talos_fixture --no-run`: pass; the nine ignored live tests compile.
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` and the same command with `--features native-test`: pass.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets` and the same command with `--features native-test`: pass, 95 passed and one unrelated native-vault test ignored in each configuration; the nine Talos fixture tests are ignored by default.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked --doc`: pass, zero doctests.
  - `RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps`: pass.
  - `cargo build --manifest-path src-tauri/Cargo.toml --locked`: pass.
  - `gh pr checks 2`: security run 38309345000 for the pre-change revision `1a4bbd0` passes all four jobs (CodeQL actions, JavaScript/TypeScript, Rust, Trivy filesystem). Foundation push run 38309345023 and PR run 38309339162 are still running; each had renderer and Ubuntu pass, with the remaining platform jobs pending when read. For parent revision `f2c09b6`, push run 38308644370 and PR run 38309157781 were still running when read. PR job `desktop (windows-2022)` failed in `helper::supervisor::tests::reaps_child_when_request_id_space_is_exhausted`, panicking that the temporary helper binary must be removable; other PR platform jobs and push macOS 15 Intel had not completed. Security run 38309157790 passes all four jobs. The Windows failure is outside this document's changes. Hosted runs for the commit carrying this entry have not started yet.
  - Fixture baseline: default zone `public`; zones `block dmz docker drop external home internal libvirt libvirt-routed nm-shared public trusted work`; active zones were Docker, libvirt (`virbr0`), and public (`enp13s0`, `tun0`); the original FORWARD and POSTROUTING rules had no `10.79.0` match; route was `10.79.0.2 dev tun0 src 172.23.11.5`; no QEMU process, fixture bridge, fixture address, or `/tmp/tpc4` state existed.
  - Provisioned `talos-pilot-c4-20261009` with the runbook command: Talos v1.14.2, requested Kubernetes v1.36.5, three control planes and one worker; no bootstrap fallback. Bound only `talosb8c871e1` and its four attached veths to `talos-pilot-c4`, and applied the five exact allowlisted iptables rules. `talosctl version` returned v1.14.2 on control plane `10.79.0.2` and worker `10.79.0.5`; the worker's MachineStatus reported `running`. The provisioner reported endpoint `https://10.79.0.1:6443` and nodes `10.79.0.2`–`10.79.0.5`. The Kubernetes server version, three Talos node versions, context identities, and role-scoped client configurations were not verified because of Q3; no Kubernetes API request or fixture harness command ran.
  - Runbook step 7: destroyed the fixture with the exact fixture ID and state path; removed the five corresponding iptables rules, deleted the temporary firewalld zone, and removed `/tmp/tpc4` and `/tmp/talos-pilot-c4-20261009`. Restoration matches the baseline: both `10.79.0` rule counts are `0`, zone/default/active-zone lists match, no QEMU process or fixture interface/address remains, and `10.79.0.2` routes through `tun0` again. Provision output is retained outside the repository at `/tmp/talos-f1a-tools/provision.log`.
- **Evidence class:** deterministic Rust tests and build checks only. No native Tauri run and no real-cluster harness run.
- **Fixture:** `talos-pilot-c4-20261009`, Talos v1.14.2, provisioned with requested Kubernetes v1.36.5, 3 control planes + 1 worker. Host baseline and restoration are above. No identities beyond the admin config were created; the F1a harness was not run.
- **Failed or unexecuted:** F1a live harness and its seven live cases are unexecuted because runbook step 5 requires a Kubernetes server-version request that the current allowlist rules reserve for document 02; Q3 is open. Foundation runs 38309345023 and 38309339162 are in progress; no job for the commit carrying this entry has started yet. Prior PR run 38309157781 has a Windows test failure described above. macOS/Windows qualification is not established by this Linux session.
- **Review findings:** found and corrected a stale source comment that said no test suspends the worker; the reboot row now logs stale timing relative to reboot start and measures freshness with a probe explicitly targeting the worker. The live tests assert their recovery/exhaustion contracts without changing production code or policy. Host restoration was checked separately against the saved baseline.
- **Assumptions confirmed or refuted:** none. The live assumptions in decision 0013 remain unverified because the harness did not run.
- **Questions and blockers raised:** Q3.
- **Next:** first read the hosted runs for this commit to completion, including `gh pr checks 2`, both foundation runs, and security scans. Then resolve Q3 before any Kubernetes API request; if the allowlist is not amended for the version preflight, do not run the document 01 fixture tests.

### 2026-10-12 — document 01, hosted run handoff

- **Document:** 01, F1a step 4; hosted run recording only.
- **Session:** GPT-6; base revision `b49ca11`; final revision: this commit.
- **Status after this session:** blocked by Q3; no fixture behavior changed and live acceptance evidence remains unexecuted.
- **Acceptance cases:** (1)–(7) unexecuted, blocked by Q3 as recorded above; (8) passed in the prior entry.
- **What changed:** Updated the status board's first action and recorded the newly started hosted runs for `b49ca11`.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh pr checks 2`: PR foundation run 38311908416 has renderer and all four desktop jobs pending.
  - `gh run list --branch ft-foundation-completion --limit 8 --json databaseId,headSha,name,status,conclusion,createdAt`: push foundation run 38311912771 queued; security scan 38311912809 in progress. Both target `b49ca11e74afda6f13db6d5da361427191080d65`.
- **Evidence class:** hosted run states only; no completed result is claimed for this commit.
- **Fixture:** none touched in this recording-only session; fixture `talos-pilot-c4-20261009` was destroyed and the host restored in the preceding entry.
- **Failed or unexecuted:** all three runs for `b49ca11` are queued or in progress. Their results must be read to completion in the next session.
- **Review findings:** none; the entry records statuses returned by the GitHub CLI.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** Q3 remains open.
- **Next:** first run `gh pr checks 2` and inspect runs 38311908416, 38311912771, and 38311912809 to completion. Then resolve Q3 before any Kubernetes API request; if the allowlist is not amended for the version preflight, do not run the document 01 fixture tests.

### 2026-10-12 — document 01, latest ledger commit run states

- **Document:** 01, F1a step 4; hosted run recording only.
- **Session:** GPT-6; base revision `6acd9b0`; final revision: this commit.
- **Status after this session:** blocked by Q3; live acceptance evidence remains unexecuted.
- **Acceptance cases:** (1)–(7) unexecuted, blocked by Q3 as recorded above; (8) passed in the fixture session.
- **What changed:** Recorded the queued hosted runs created by the prior ledger update commit.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh pr checks 2`: PR foundation run 38311982305 queued with all five jobs pending.
  - `gh run list --branch ft-foundation-completion --limit 8 --json databaseId,headSha,name,status,conclusion,createdAt`: push foundation run 38311987009 queued and security scan 38311987259 queued. Both and the PR run target `6acd9b081b3cbf76e7291c00a27f5c8c3534df68`.
- **Evidence class:** hosted run states only; none of these runs has completed.
- **Fixture:** none touched; the disposable fixture remains destroyed and the host restored as recorded in the fixture session entry.
- **Failed or unexecuted:** runs 38311982305, 38311987009, and 38311987259 are queued; they must be read to completion next session.
- **Review findings:** none; statuses match the GitHub CLI output.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** Q3 remains open.
- **Next:** first read runs 38311982305, 38311987009, and 38311987259 to completion with `gh pr checks 2` and `gh run view`; then resolve Q3 before any Kubernetes API request or live fixture tests.

### 2026-10-13 — document 02, allowlisted version preflight

- **Document:** 02, F3 Part A steps 1–2 and Part D step 14 preflight only.
- **Session:** GPT-6; base revision `38c5d29`; final revision: the commit carrying this entry.
- **Status after this session:** in progress. The checked harness, exact F3 fixture scope, and live server-version preflight are recorded; the list implementation and remaining acceptance cases are not complete.
- **Acceptance cases:** (1)–(9) unexecuted; (10) partially covered by manifest rejection unit cases, but wrong credential, endpoint, and live server-version rejection cases remain unexecuted; (11)–(12) unexecuted; (13) the version preflight passed, but a real Pod list remains unexecuted.
- **What changed:**
  - `scripts/kubernetes-fixture.ts` and `scripts/lib/kubernetes-fixture.ts`: add an explicit-file-only runner and validate the fixed fixture ID, endpoint, Kubernetes version, CA fingerprint, selected context, namespace, and exact setup/cleanup action lists before launching Rust.
  - `scripts/lib/kubernetes-fixture.test.ts`: cover valid scope, changed identity/scope, and rejection of ambient or in-repository credentials.
  - `src-tauri/tests/kubernetes_fixture.rs`: add an ignored live preflight using the production kubeconfig validator, credential store, session store, and version read; check endpoint and CA before opening a session.
  - `tests/fixtures/talos-c4.json`, `docs/verification/fixtures/talos-c4-disposable.md`, and `package.json`: record the observed Kubernetes identity and CA hash, authorize only the exact namespaced setup/read/cleanup scope plus the preflight, and expose `pnpm kubernetes:fixture`.
  - `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `docs/dependencies.md`, and the generated dependency inventory: pin dev-only `sha2` 0.10.9 for the CA fingerprint.
  - This ledger: answer Q3, resolve B4, and record the preflight as the next session's prerequisite evidence for document 01.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2):
  - Verified the pinned Node archive against `SHASUMS256.txt`, protoc against `.github/actions/install-protoc/action.yml`, and `src-tauri/.local-tools/talosctl` against the v1.14.2 release checksum; the talosctl digest matched `c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4`.
  - `pnpm format`, `pnpm check`: pass; renderer tests report 125 passed across 15 files, Svelte diagnostics report zero errors/warnings, and the production Vite build passes.
  - `pnpm inventory:generate`, `pnpm inventory:check`: pass; inventory is current at 529 npm, 601 Cargo, and 143 Go modules.
  - `pnpm install --frozen-lockfile`, `pnpm audit --audit-level=low`, `cargo audit --file src-tauri/Cargo.lock`, `pnpm audit:go`, and `pnpm advisories:check`: pass. npm and Go reported no called-code vulnerabilities; Rust retained the two documented GTK3 warnings, and the advisory baseline matched the scanner, dependency paths, and linked executable.
  - `pnpm helper:build`: pass. `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, clippy with and without `native-test`, default and `native-test` `cargo test --all-targets`, `cargo test --doc`, `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps`, and `cargo build --locked`: pass. The first default Rust test invocation failed because the generated Go helper did not exist; after `pnpm helper:build`, the same suite passed. The first native-feature invocation lacked the pinned protoc directory on `PATH`; rerunning with the pinned toolchain path passed.
  - `pnpm kubernetes:fixture -- --manifest tests/fixtures/talos-c4.json --admin-kubeconfig /tmp/tpc4/kubeconfig`: first attempt failed before an API request because the harness assumed the Talos context name; the observed Kubernetes context was `admin@talos-pilot-c4-20261009`, which is now checked in the manifest and harness. The next invocation passed and printed `fixture preflight passed: Kubernetes v1.36.5 at the allowlisted endpoint`.
  - `kubectl --kubeconfig /tmp/tpc4/kubeconfig version --output=json`: server `v1.36.5`, major 1, minor 36. The endpoint was `https://10.79.0.1:6443`. The live Kubernetes preflight and Talos API calls ran only against the allowlisted fixture.
  - `gh pr checks 2`: for PR run 38312039901, renderer, Ubuntu, and Windows passed; macOS 15 and macOS 15 Intel remained pending. Push run 38312046110 had renderer, Ubuntu, and Windows pass, with both macOS jobs pending. Security run 38312045962 passed CodeQL actions, JavaScript/TypeScript, Rust, and Trivy. The runs for this entry's commit have not started yet.
  - `git diff --check` passes. `pnpm format:check` was rerun after formatting the ledger entry and passes.
- **Evidence class:** deterministic renderer and Rust checks passed; one live Kubernetes version read passed through the production Rust session store. No native Tauri window/capability run; this part adds no command or capability. No live Pod list yet.
- **Fixture:** `talos-pilot-c4-20261009`, Talos v1.14.2 and Kubernetes v1.36.5, 3 control planes and 1 worker. Baseline saved at `/tmp/talos-f1a-tools/f3-baseline.txt`: default zone `public`; zones `block dmz docker drop external home internal libvirt libvirt-routed nm-shared public trusted work`; active Docker, libvirt, and public zones; no `10.79.0` iptables rules, QEMU process, fixture bridge/address, or `/tmp/tpc4`; `10.79.0.2` routed through `tun0`. All four nodes reported Talos v1.14.2. Endpoint and Kubernetes context were verified; cluster CA SHA-256 is recorded in the manifest. No bootstrap fallback was needed. No Kubernetes namespace or Pod was created. Runbook step 7 destroyed the fixture and removed the exact five forwarding/NAT rules and temporary firewalld zone. Both `10.79.0` rule counts are zero; zone/default/active-zone state, links/addresses, and route match the baseline exactly. Restoration snapshot: `/tmp/talos-f1a-tools/f3-restoration.txt`.
- **Failed or unexecuted:** initial Node runner invocation failed because native Node TypeScript requires explicit `.ts` import extensions; fixed before the passing run. A fixture-unit assertion initially expected a generic error string; corrected to assert manifest rejection, then all 125 renderer tests passed. Full F3 list, restricted ServiceAccount read, namespace setup/UID cleanup, E2E, native window, audit, and list-related release gates are unexecuted because those implementation steps are still ahead. The fixture's client-certificate authentication type was not inspected before teardown; the carried mutual-TLS row remains open. macOS hosted jobs are pending, not passed. The version warning from kubectl describes its 1.34 client against the 1.36 server; the server result itself matches the fixture.
- **Review findings:** validation rejects any nonempty ambient `KUBECONFIG`, requires the single checked manifest and an external bounded regular credential file, and checks the selected context, endpoint, and CA fingerprint before session creation or network access. The live first run caught the context-name assumption and the harness now pins the observed context. A separate review also caught a metadata/read race in the credential-size check; the Rust reader now stops at the maximum plus one byte, and its native-feature test target and clippy pass. Only the named version endpoint was contacted; no resource mutation occurred. Host state was restored and compared byte-for-byte at the saved command-output level.
- **Assumptions confirmed or refuted:** the fixture endpoint is `https://10.79.0.1:6443` and its server reports Kubernetes v1.36.5. The current kubeconfig's CA fingerprint and selected context were confirmed and pinned. The carried mutual-TLS authentication assumption remains unverified.
- **Questions and blockers raised:** none. Q3 answered and B4 resolved above.
- **Next:** continue document 02 at Part A step 3: implement admin setup, the namespace-scoped restricted reader, and cleanup that first matches the recorded namespace UID. Re-provision via the runbook, refresh the manifest CA fingerprint before any API request, and inspect whether the kubeconfig uses a client certificate before teardown.

### 2026-10-13 — document 02, hosted run handoff

- **Document:** 02, hosted checks for the Part A preflight commit.
- **Session:** GPT-6; base revision `2209863`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; the preflight is committed and pushed, and the hosted runs are not complete.
- **Acceptance cases:** no new F3 case changed; document 02 remains as recorded in the preceding entry.
- **What changed:** recorded the hosted run states for `2209863` and made reading those runs the next action.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh run view 38315891463`: Foundation checks for `2209863`, status queued; renderer and Windows jobs were in progress, Ubuntu and both macOS jobs queued at inspection.
  - `gh run view 38315903164`: second Foundation checks run for the same SHA, status queued; renderer and Ubuntu were in progress, Windows and both macOS jobs queued.
  - `gh run view 38315897393`: Security scans for the same SHA, status queued; CodeQL jobs were in progress and Trivy was queued.
  - `gh pr checks 2`: listed the above foundation and security jobs as pending; no completed result for `2209863` was available.
- **Evidence class:** hosted run state only; no hosted check is recorded as passed.
- **Fixture:** none; the fixture was already destroyed and the host restored as recorded in the preceding entry.
- **Failed or unexecuted:** every hosted job for `2209863` remains in progress or queued. Read all three runs to completion; these statuses are not passes.
- **Review findings:** none; states were read from the GitHub CLI and API.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** none.
- **Next:** first read hosted runs 38315891463, 38315903164, and 38315897393 to completion with `gh pr checks 2` and `gh run view`. Then continue document 02 Part A step 3, implementing admin setup, the namespace-scoped restricted reader, and UID-anchored cleanup; re-provision only through the fixture runbook and refresh the CA fingerprint before any Kubernetes request.

### 2026-10-13 — document 02, ledger handoff checks

- **Document:** 02, hosted checks for the hosted-run handoff commit.
- **Session:** GPT-6; base revision `f042e8a`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; all recorded runs are still pending or in progress.
- **Acceptance cases:** no F3 acceptance case changed; see the preflight entry above.
- **What changed:** recorded the current hosted states for `f042e8a`; the board now directs the next session to inspect the latest branch head so it also catches the workflow run triggered by this entry.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh run view 38316055211`: Foundation checks, queued; Ubuntu was in progress and Windows, renderer, and both macOS jobs were queued at inspection.
  - `gh run view 38316060975`: Foundation checks, queued; renderer and Windows were in progress and Ubuntu and both macOS jobs were queued.
  - `gh run view 38316060918`: Security scans, in progress; all three CodeQL jobs and Trivy were in progress.
  - `gh pr checks 2`: Trivy passed; all listed foundation and CodeQL jobs remained pending.
- **Evidence class:** hosted status only; incomplete jobs are not passes.
- **Fixture:** none; the fixture is destroyed and the host restored.
- **Failed or unexecuted:** no result for the above foundation or security runs was complete. The follow-up workflow run for this entry's commit has not started yet.
- **Review findings:** none.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** none.
- **Next:** first inspect hosted checks for the latest `ft-foundation-completion` head with `gh pr checks 2`, `gh run list`, and `gh run view`; read every run to completion. Then continue document 02 Part A step 3: implement admin setup, the namespace-scoped restricted reader, and UID-anchored cleanup. Re-provision only through the runbook, refresh the CA fingerprint before Kubernetes requests, and inspect the kubeconfig authentication type before teardown.

### 2026-10-13 — document 02, admin namespace setup and UID cleanup

- **Document:** 02, F3 Part A steps 3–4 (admin-only namespace setup and UID-anchored cleanup; restricted reader setup remains unfinished).
- **Session:** GPT-6; base revision `45c8a57`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; the live admin preflight and namespace create/delete passed, but ServiceAccount, Role, RoleBinding, Pod, token, and restricted-reader setup is still ahead.
- **Acceptance cases:** (1)–(9) unexecuted; (10) manifest rejection unit coverage remains from the previous entry, while the live version gate passed; (11)–(12) unexecuted; (13) no real Pod list yet.
- **What changed:**
  - `src-tauri/src/kubernetes/session.rs`: expose a client clone only under `native-test` for the ignored disposable-fixture harness; production builds retain no generic client accessor.
  - `src-tauri/tests/kubernetes_fixture.rs`: use the validated admin session to reject an existing namespace, create the allowlisted namespace, capture its UID, and delete with the UID as a server-side precondition; verify disappearance within a bounded 15 seconds.
  - `tests/fixtures/talos-c4.json`: refresh the fixture CA fingerprint after reprovisioning and before the first Kubernetes API request.
  - `docs/verification/fixtures/talos-c4-disposable.md`: record this run's endpoint, version, CA, client-certificate authentication, successful mTLS preflight, and namespace lifecycle result.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2, talosctl v1.14.2):
  - Verified Node, protoc, and talosctl SHA-256 against `/tmp/talos-f1a-tools/SHASUMS256.txt`, `.github/actions/install-protoc/action.yml`, and the downloaded Talos v1.14.2 `sha256sum.txt`; all matched. The unqualified system defaults were Node 24.21.0, Go 1.27.1, and no `protoc`; fixture commands used the pinned scratch paths.
  - Captured the pre-provision host state in `/tmp/talos-f1a-tools/f3-session-2026-10-13-baseline.txt`. Applied only the allowlisted firewalld zone/interface and five iptables rules.
  - `pnpm format:rust:check`, native-test `cargo clippy --all-targets -- -D warnings`, native-test `cargo test --all-targets`, and `cargo test --test kubernetes_fixture --no-run`: pass. Native-test suite: 95 passed, 1 ignored in the library; 5 Kubernetes session integration tests passed; fixture tests remained ignored in the all-targets run.
  - `pnpm kubernetes:fixture -- --manifest tests/fixtures/talos-c4.json --admin-kubeconfig /tmp/tpc4/kubeconfig`: first attempt failed because Kubernetes kept the newly deleted namespace in `Terminating` after the API accepted deletion. Added a 15-second bounded disappearance check; the second live run passed and verified the namespace absent.
  - `kubectl --kubeconfig /tmp/tpc4/kubeconfig version --output=json`: server `v1.36.5`, endpoint `https://10.79.0.1:6443`; selected context `admin@talos-pilot-c4-20261009`. The selected kubeconfig contains inline client certificate and key, with no token/basic credentials. The successful version call and harness `/version` read are real mTLS reads.
  - All four Talos nodes reported v1.14.2 and members `10.79.0.2`–`10.79.0.5` were running. No bootstrap fallback was needed.
  - Hosted runs targeting `45c8a57`: `gh pr checks 2` showed both renderer checks and CodeQL actions/JavaScript plus Trivy passed; CodeQL Rust was in progress and all desktop jobs were pending. Push Foundation run `38316124723` and PR Foundation run `38316129911` were queued; security run `38316129913` was in progress. None was read to completion.
- **Evidence class:** Rust deterministic tests/build checks passed; a real Kubernetes `/version` read and namespace create/delete passed through the production Rust session client. No actual Tauri window/capability run and no Pod list.
- **Fixture:** `talos-pilot-c4-20261009`, Talos v1.14.2 / Kubernetes v1.36.5, 3 control planes + 1 worker. Baseline is `/tmp/talos-f1a-tools/f3-session-2026-10-13-baseline.txt`. Runbook step 7 destroyed the fixture, removed the exact five iptables rules (both `10.79.0` counts were 0), deleted the temporary zone, removed `/tmp/tpc4` and state, and restored the default/active zones, zone list, links/addresses, and route (`10.79.0.2` again through `tun0`). No QEMU process or fixture interface/address remained.
- **Failed or unexecuted:** the first namespace absence check failed due to asynchronous deletion; the bounded verification fixed it and the second live run passed. Restricted ServiceAccount/Role/RoleBinding, 201 Pods, token request, restricted identity read, all list behavior, native Tauri, browser E2E, and remaining F3 gates are unexecuted because the implementation is unfinished. Hosted checks for `45c8a57` are incomplete, not passes.
- **Review findings:** the first live run exposed an immediate-read-after-delete race. Cleanup now supplies the namespace UID as a Kubernetes delete precondition, then polls only the named namespace under a 15-second deadline before claiming removal.
- **Assumptions confirmed or refuted:** resolved the carried “Mutual-TLS client handshake against a real API server” row: client certificate/key authentication was present and the admin version request succeeded. Endpoint and version matched the manifest; refreshed the observed CA fingerprint before the request.
- **Questions and blockers raised:** none.
- **Next:** first read hosted runs for the latest branch head to completion with `gh pr checks 2`, `gh run list`, and `gh run view`. Then continue document 02 Part A step 3 by creating the restricted ServiceAccount, namespace-only Pod Role/RoleBinding, synthetic Pods, and short-lived ServiceAccount token under admin authority; ensure the restricted identity is used for probe reads. Re-provision only through the runbook and complete teardown/restoration.

## Entry template

Copy this block, fill every field, and append it to the session log. Write `none` where a field does not apply; do not delete fields.

```markdown
### YYYY-MM-DD — document NN, short title

- **Document:** NN, and the packet or step worked on.
- **Session:** the model that did the work; base revision; final revision (the commit carrying this entry).
- **Status after this session:** not started / in progress / blocked / done, and why.
- **Acceptance cases:** each case from the document, marked passed, failed, or unexecuted.
- **What changed:** files, contracts, and decision records, one line each.
- **Commands and results:** each command as run, with its result. Name the host and the toolchain versions.
- **Evidence class:** which results are deterministic tests, which are native Tauri runs, and which are real-cluster runs.
- **Fixture:** identity, versions, and topology if one was used; the baseline taken before provisioning; the restoration evidence afterwards. Write `none` if no fixture was touched.
- **Failed or unexecuted:** each check that failed or did not run, with the reason and what it limits.
- **Review findings:** what the separate review pass found and how each finding was resolved.
- **Assumptions confirmed or refuted:** rows of the unverified-assumptions table this session settled.
- **Questions and blockers raised:** IDs added to the tables above.
- **Next:** the first thing the next session should do.
```
