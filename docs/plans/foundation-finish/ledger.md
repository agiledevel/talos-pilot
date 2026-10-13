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

| Document                                                                        | Packet           | Status       | Last commit | Updated    | Next action                                                                                                                       |
| ------------------------------------------------------------------------------- | ---------------- | ------------ | ----------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| [01 F1a live stall rows](01-f1a-live-stall-rows.md)                             | F1a step 4       | in progress  | this commit | 2026-10-13 | Resume its remaining live cases after the owner-directed document 02 session completes                                            |
| [02 F3 Kubernetes list probe](02-f3-kubernetes-list-probe.md)                   | F3               | blocked (B6) | this commit | 2026-10-13 | Resolve Q4; then repeat the fixture runbook with client-only binary verification and an explicit fixture config for server checks |
| [03 F4 Kubernetes watch](03-f4-kubernetes-watch.md)                             | F4               | not started  | —           | 2026-10-12 | After 02                                                                                                                          |
| [04 F5 Kubernetes version fixtures](04-f5-kubernetes-version-fixtures.md)       | F5               | not started  | —           | 2026-10-12 | After 03                                                                                                                          |
| [05 F6 editor workers and CSP](05-f6-editor-workers-csp.md)                     | F6               | not started  | —           | 2026-10-12 | After 04, or earlier if a fixture document is blocked                                                                             |
| [06 F7 terminal and chart wrappers](06-f7-terminal-chart.md)                    | F7               | not started  | —           | 2026-10-12 | After 05                                                                                                                          |
| [07 F8 dependencies, notices, security](07-f8-dependencies-notices-security.md) | F8               | not started  | —           | 2026-10-12 | After 06; mind the 2026-11-30 date below                                                                                          |
| [08 F9 Linux packages](08-f9-linux-packages.md)                                 | F9.0, F9.1, F9.4 | not started  | —           | 2026-10-12 | After 07                                                                                                                          |
| [09 F10 budgets and Linux close](09-f10-budgets-and-linux-close.md)             | F10              | not started  | —           | 2026-10-12 | After 08                                                                                                                          |
| [10 Platform revisit](10-platform-revisit.md)                                   | F9.2, F9.3       | deferred     | —           | 2026-10-12 | Owner has no macOS or Windows machine; revisit when they are available                                                            |

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

| ID  | Opened     | Blocker                                                                                                                                                                                                                          | Affects                                                          | Status                                                                                                                                 |
| --- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| B1  | 2026-10-12 | `git push` failed with HTTP 403 for the stored account `TIT-IT`                                                                                                                                                                  | Every hosted-CI row; F9.0 in document 08                         | Resolved 2026-10-12: the owner switched the remote to SSH and `b662b1a` was pushed                                                     |
| B2  | 2026-10-12 | `gh` is not installed, and no session has yet read a hosted CI result from this host                                                                                                                                             | Recording hosted-CI results; F9.0 in document 08                 | Resolved 2026-10-12: the owner installed and configured `gh`; hosted runs were read the same day                                       |
| B3  | 2026-10-12 | Hosted `desktop (windows-2022)` failed at `b662b1a` and `481421a` in `go test`: `TestProbeCancellationDuringBackoffEndsCleanly` raced its cancellation against the first reconnect attempt                                       | Hosted evidence for every commit until fixed                     | Resolved 2026-10-12: fixed in `aaedf79`, whose hosted run 38301882786 passed all five jobs                                             |
| B4  | 2026-10-12 | Document 01's live cases require runbook step 5's Kubernetes server-version preflight; the owner directed that preflight to document 02, so document 01 remains incomplete until document 02 records it                          | Document 01 live harness                                         | Resolved 2026-10-13: document 02 recorded Kubernetes v1.36.5 in the 2026-10-13 session entry                                           |
| B5  | 2026-10-13 | The command permission filter rejected starting the native test because its invocation included `rm -rf` cleanup for the private XDG directory; the Tauri/WebDriver run did not start                                            | Document 02 Part B step 8 native IPC and capability verification | Resolved 2026-10-13: a fresh private XDG directory with no explicit shell cleanup ran the native Tauri suite successfully (this entry) |
| B6  | 2026-10-13 | The fixture runbook's `talosctl version` preflight used the host's ambient Talos configuration and returned server `10.0.10.79`, outside the fixture allowlist. Fixture work stopped before provisioning or Kubernetes requests. | Document 02 Part D live fixture                                  | Open; owner direction is needed for a client-only tool check and a server-version preflight scoped to the allowlisted fixture          |

## Questions for the owner

| ID  | Asked      | Question                                                                                                                                                                                                                                                                                                                                                            | Needed by                                 | Answer                                                                                                   |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| Q1  | 2026-10-12 | The fixture network `10.79.0.0/24` sits inside a VPN route on the host. The owner accepted shadowing it for the 2026-10-12 run only. Is that accepted from now on?                                                                                                                                                                                                  | The first fixture session, document 01    | Answered 2026-10-12: allowed indefinitely                                                                |
| Q2  | 2026-10-12 | The security workflow (CodeQL and Trivy) runs only for pushes and pull requests to `main`. Exact-commit scan results for this branch need a pull request to `main`. May a session open one, as a draft, when document 07 needs the results?                                                                                                                         | Document 07                               | Answered 2026-10-12: the owner opened pull request 2 to `main`; the security scans now run for each push |
| Q3  | 2026-10-12 | Runbook step 5 requires the live Kubernetes server version before any fixture test, while its rule says Kubernetes actions are authorized only once the allowlist names them and document 02 adds those actions. May document 01 add a single read-only version request to the fixture API, or should that preflight move to document 02?                           | Document 01, before the next fixture test | Answered 2026-10-13: move the preflight to document 02; record the version there before any fixture test |
| Q4  | 2026-10-13 | The fixture runbook says to confirm the pinned `talosctl` version with `talosctl version`, but that command loads the host's ambient config and contacted server `10.0.10.79`. May the runbook be amended to use `talosctl version --client` for the binary and, after provisioning, `talosctl --talosconfig /tmp/tpc4/talosconfig version` for the fixture server? | Before resuming Document 02 Part D        | Unanswered; B6 remains open and fixture work is stopped                                                  |

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

### 2026-10-13 — document 02, restricted reader fixture setup

- **Document:** 02, F3 Part A steps 3–4, completing admin/setup separation and UID-anchored cleanup.
- **Session:** GPT-6; base revision `f4e10e2`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; Part A setup and a restricted Pod read are complete. Bounded list implementation, IPC, view, and the remaining F3 acceptance cases are still ahead.
- **Acceptance cases:** (1)–(9) unexecuted; (10) manifest rejection unit coverage and the live identity/version preflight are partial evidence, but the complete rejection matrix is not run; (11)–(12) unexecuted; (13) unexecuted because the real read was a named Pod GET, not the production paginated list.
- **What changed:**
  - `src-tauri/tests/kubernetes_fixture.rs`: create the allowlisted namespace, ServiceAccount, Pod-only Role and RoleBinding, exactly 201 inert Pods, and a 600-second token; serialize a minimal reader-only kubeconfig outside the repository, validate/import it through the normal Rust path, and use the restricted session to read one named Pod. Cleanup deletes the exact Pod names and named RBAC/ServiceAccount objects, then deletes the namespace with the recorded UID as a server-side precondition and verifies absence.
  - `tests/fixtures/talos-c4.json`: refresh the second provisioning cycle's CA fingerprint before any API request.
  - `docs/verification/fixtures/talos-c4-disposable.md`: record the complete setup, mTLS identity, restricted read, partial-failure cleanup, and host restoration.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2, talosctl v1.14.2):
  - `pnpm format:rust:check`, `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets --features native-test -- -D warnings`, and `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets --features native-test`: pass. The suite reported 95 library tests passed, 1 ignored, and all 5 Kubernetes session integration tests passed; fixture-specific tests remained ignored in the broad suite.
  - `pnpm kubernetes:fixture -- --manifest tests/fixtures/talos-c4.json --admin-kubeconfig /tmp/tpc4/kubeconfig`: first attempt rejected the generated reader kubeconfig because it used the admin context label as the cluster name. The second attempt rejected it because `kind: Config` and `apiVersion: v1` were missing. Both happened after setup; after each failure, the exact 201 Pod names and named RoleBinding, Role, and ServiceAccount were deleted, then the namespace was deleted with its UID precondition and verified absent. The corrected third invocation passed: admin version preflight, setup, reader credential validation/import/session open, GET of `list-probe-000` under the restricted identity, exact cleanup, and namespace absence.
  - The second provisioning cycle reported endpoint `https://10.79.0.1:6443`, selected context `admin@talos-pilot-c4-20261009`, Kubernetes `v1.36.5`, and Talos `v1.14.2` on all four nodes. CA SHA-256 `f33619f91a6e1d2e4705576f500b7d798b2598ae465ba2d4c10406cbf3b45526` was checked into the manifest before the first API request. The admin kubeconfig had inline client certificate/key and no token/basic fields; `/version` succeeded over that mTLS identity.
  - `gh pr checks 2`: for `f4e10e2`, both renderer jobs passed, CodeQL actions and JavaScript/TypeScript passed, and Trivy passed. Push Foundation run `38317325326` and PR Foundation run `38317331114` remained queued, with Windows and Ubuntu jobs in progress and both macOS jobs queued. Security run `38317331067` remained in progress: CodeQL actions/JavaScript and Trivy filesystem scan passed; CodeQL Rust was in progress. None of the three runs was read to completion.
- **Evidence class:** deterministic Rust feature tests/build checks passed; a real `/version` read and one real namespaced Pod GET passed through production Rust session/client validation. The fixture setup mutations used the native-test harness. No actual Tauri window/capability run and no paginated Pod list.
- **Fixture:** `talos-pilot-c4-20261009`, Talos v1.14.2 / Kubernetes v1.36.5, 3 control planes + 1 worker. Baseline `/tmp/talos-f1a-tools/f3-session-2026-10-13-second-baseline.txt`. No bootstrap fallback. Runbook step 7 destroyed the fixture, removed the exact five iptables rules (both `10.79.0` counts were 0), deleted the temporary firewalld zone, removed `/tmp/tpc4` and state, and restored zones, active interfaces, links/addresses, and route (`10.79.0.2` again via `tun0`). No QEMU process or fixture interface/address remained.
- **Failed or unexecuted:** two reader-kubeconfig setup attempts failed as described above; both partial fixture setups were cleaned by exact resource names and UID-preconditioned namespace deletion, then verified absent. The third live setup/read/cleanup passed. The full F3 list behavior, pagination bounds, error states, native Tauri capability checks, browser E2E, and remaining list-related gates are unexecuted because Parts B–D are unfinished. Hosted checks for `f4e10e2` remain incomplete.
- **Review findings:** the reader kubeconfig now contains only the fixture endpoint, CA, namespace, reader context, and ServiceAccount token; it excludes admin client certificate/key material. Pod image pulls are disabled. Namespace cleanup checks the UID and includes it as a server-side delete precondition, preventing a delete race from targeting a replacement namespace.
- **Assumptions confirmed or refuted:** the second cycle reconfirmed the fixture's endpoint, Kubernetes version, and mTLS client-certificate authentication. The restricted ServiceAccount successfully read a Pod in its own namespace through the normal Rust credential/session path.
- **Questions and blockers raised:** none.
- **Next:** first read hosted runs for the latest branch head to completion using `gh pr checks 2`, `gh run list`, and `gh run view`. Then continue document 02 Part B step 5: implement backend-owned server-side pagination, namespace/selector validation, byte/field bounds, aggregate caps, and resource-version preservation.

### 2026-10-13 — document 02, bounded Pod pagination foundation

- **Document:** 02, F3 Part B step 5, initial bounded server-side Pod collection.
- **Session:** GPT-6; base revision `c3ae5ef`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; pagination, caps, retry logic, and initial synthetic evidence are implemented. Hosted default-feature testing has one Ubuntu failure under investigation; step 6 still needs distinct unsupported-API and expired-continuation outcomes.
- **Acceptance cases:** (1) partial — two-page deterministic synthetic TLS list passes, while restricted-identity real pagination remains unexecuted; (2) unexecuted for list requests; (3) unexecuted; (4) unexecuted; (5) partial — malformed namespace, selector syntax, exact 1 KiB selector limit, and no-dispatch behavior are covered, while broader Kubernetes grammar cases remain; (6) partial — exact/one-over 2 MiB body, all projected-field limits, the 10,000-object incomplete result, and session budget cap/release are covered; (7) unexecuted; (8) partial — prior session admission tests pass, but list-specific saturation is unexecuted; (9) partial — budget release and transient retry exhaustion are covered, while cancellation cleanup is unexecuted; (10) partial — harness identity/version evidence is in the preceding entry; (11)–(12) unexecuted; (13) unexecuted — no real paginated list has run.
- **What changed:**
  - `src-tauri/src/kubernetes/list.rs`: namespace and selector validation, 200-item server-side pagination with backend-owned continuation, pre-decode 2 MiB response bounds, bounded projected fields and continuation tokens, collection resource-version consistency, 10,000-item/51-page caps with explicit incomplete snapshots, 16 MiB per-session retained-projection accounting, a 60-second snapshot deadline, and three attempts for transient failures with 0.5/1-second backoffs.
  - `src-tauri/src/kubernetes/session.rs`, `error.rs`, `mod.rs`, and `lib.rs`: admitted list reads, session-bound projection accounting, snapshot types, and a redacted invalid-query error mapping.
  - `src-tauri/src/kubernetes/synthetic.rs`: multi-page, retry, retry-exhaustion, aggregate-cap, response-byte, selector, and projection tests over production client/request paths.
  - `src-tauri/Cargo.toml` and `Cargo.lock`: exact `futures-util` 0.3.34 pin with only I/O support for bounded response streaming.
- **Commands and results** (openSUSE Tumbleweed x86_64; Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2):
  - `pnpm format`, `pnpm format:check`, `pnpm format:rust:check`, and `git diff --check`: pass.
  - Native-test `cargo clippy --all-targets --features native-test -- -D warnings`: pass.
  - Native-test `cargo test --all-targets --features native-test`: pass after the latest code changes; 104 library tests passed and 1 was ignored, with all 5 Kubernetes session integration tests passing. Live fixture suites were ignored.
  - Default-feature `cargo test --all-targets`: pass locally after the hosted failure; 104 library tests passed and 1 was ignored. `cargo test --doc`: pass (0 doctests). `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps`: pass.
  - Hosted runs for `c3ae5ef`: Security run `38318040880` completed with CodeQL Rust, Actions, JavaScript/TypeScript, Trivy filesystem, and Trivy checks passing. Push Foundation run `38318036536` and PR Foundation run `38318040985` had renderer passing; Ubuntu failed in the PR run's default-feature `cargo test --all-targets` step; other desktop matrix jobs were pending at the last read. The failed job log was not yet available before this commit because the overall workflow was still running. Earlier Foundation runs for `f4e10e2` also had matrix jobs pending when last read; its Security run `38317331067` completed successfully.
- **Evidence class:** deterministic Rust tests using a synthetic HTTPS Kubernetes API server and the production client. No native Tauri run, browser flow, or real paginated fixture read was performed.
- **Fixture:** none used in this session; fixture identity and restoration evidence remain recorded in the preceding entry.
- **Failed or unexecuted:** the first native-test all-targets invocation failed in 16 helper fixture builds, then the same command passed after an individual helper test and cache warm-up. The hosted c3ae5ef Ubuntu default test job failed, while the matching local default-feature all-targets command passed; retrieve its hosted log after the workflow completes to identify the difference. Expired-token and unsupported-API states, cancellation, Tauri IPC, browser E2E, and real paginated list remain unexecuted.
- **Review findings:** HTTP response data is read through the bounded stream API before JSON decoding; projected outputs omit specs, annotations, addresses, and raw status data. A session-owned atomic lease counts all retained snapshot projections and releases capacity when a snapshot is dropped. Repeated continuation tokens and page overflow return incomplete output instead of looping indefinitely.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** none.
- **Next:** first retrieve and inspect the failed Ubuntu job log from run `38318040985` once available, then check the latest hosted runs to completion. Continue document 02 Part B step 5 verification and step 6 error-state distinctions only after resolving the hosted discrepancy.

### 2026-10-13 — document 02, list outcomes and limited API discovery

- **Document:** 02, F3 Part B steps 6–7, distinct list terminal outcomes and core Pod API discovery.
- **Session:** GPT-6; base revision `a4f413d`; final revision: the commit carrying this entry.
- **Status after this session:** in progress; the Rust list has bounded core discovery and distinct API, namespace, authorization, empty-result, and expired-continuation outcomes. IPC, view, native capability, and live-cluster acceptance work remain.
- **Acceptance cases:** (1) partial — deterministic two-page synthetic TLS pagination passes; restricted identity and real fixture pagination remain unexecuted; (2) passed synthetically — 401 and 403 are distinct and neither retries; (3) partial — unsupported API, TLS failure, empty list, and missing namespace each have distinct outcomes; (4) passed synthetically — HTTP 410 on a later page returns no mixed snapshot and releases its projection budget; (5) partial — malformed namespaces/selectors and selector bounds reject before requests; (6) partial — exact/over page bytes, projected-field limits, aggregate-object cap, and projection-budget release are covered; (7)–(8) unexecuted for UI replacement and list-specific saturation; (9) partial — retry exhaustion, expiry cleanup, and budget release pass, but cancellation cleanup remains untested; (10) partial — fixture identity/version preflight evidence is recorded above, but every wrong-identity case remains unexecuted; (11)–(12) unexecuted; (13) unexecuted — no real Pod list has run.
- **What changed:**
  - `src-tauri/src/kubernetes/list.rs`: GET only `/api/v1`, require a namespaced `Pod` resource with `get` and `list` verbs, and apply the same response byte cap, request deadline, snapshot deadline, and transient retry policy as list pages.
  - `src-tauri/src/kubernetes/error.rs` and `src-tauri/src/lib.rs`: distinguish unsupported core Pod API, absent namespace, expired continuation, 401, 403, and TLS errors with separate redacted application codes; add classification coverage.
  - `src-tauri/src/kubernetes/synthetic.rs`: exercise discovery, missing namespace, forbidden, unauthorized, TLS mismatch, empty list, expired second page, and pagination/retry request counts through the production client.
  - `docs/verification/dependency-inventory.json`: regenerate the committed inventory after the exact `futures-util` dependency added in the prior step.
  - This ledger: records this step and the completed/failed/pending hosted states.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2):
  - `pnpm format`, `pnpm format:check`, `pnpm format:rust:check`, `pnpm inventory:check`, and `git diff --check`: pass. `pnpm inventory:generate` refreshed the inventory to 529 npm, 601 Cargo, and 143 Go modules; its subsequent check passed.
  - `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` and the same command with `--features native-test`: pass.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets` and the same command with `--features native-test`: pass; each library suite reports 107 passed, 0 failed, and 1 ignored. The native-feature run also reports all 5 Kubernetes session integration tests passed; live fixture tests are ignored.
  - Focused list/discovery classifier, outcome, and application-code tests: pass.
  - `cargo test --manifest-path src-tauri/Cargo.toml --locked --doc`: pass (0 doctests); `RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps`: pass; `cargo build --manifest-path src-tauri/Cargo.toml --locked`: pass.
  - `gh pr checks 2`: for `a4f413d`, push run `38319121267` and PR run `38319125901` each failed at Ubuntu `Verify the generated dependency inventory`; its log says the inventory is stale, which this session fixed and verified locally. Their renderer jobs pass; Windows is running and macOS jobs are queued. Security run `38319125830` has Actions, JavaScript/TypeScript, Trivy, and Trivy filesystem scan passed; CodeQL Rust is still in progress. These runs were not complete when recorded.
  - `gh api --allow-escape-sequences repos/agiledevel/talos-pilot/actions/jobs/115039274573/logs`: the earlier `c3ae5ef` Ubuntu default Rust test failed in `storage::database::tests::concurrent_initialization_serializes_the_first_migration` with SQLite `DatabaseBusy` / “database is locked”. The matching local suite passed; hosted Windows is still running and macOS jobs remain queued, so that overall workflow is still in progress.
- **Evidence class:** deterministic Rust tests over a synthetic HTTPS endpoint using the production Kubernetes client and request-stream path. No native Tauri command run and no live-cluster Pod list run.
- **Fixture:** none touched in this session; the fixture remains destroyed and host restoration is recorded in the earlier fixture entries.
- **Failed or unexecuted:** the two `a4f413d` Ubuntu hosted jobs failed because the generated dependency inventory was stale; it was regenerated and `pnpm inventory:check` passes locally, but a hosted verification of that fix awaits this commit's runs. The earlier `c3ae5ef` hosted default Rust suite had the unrelated SQLite concurrency failure above. E2E, native Tauri capability checks, list cancellation/admission saturation, and real restricted-identity pagination remain unexecuted because IPC/view work and the live read are later packet steps. Current hosted matrix jobs are pending or in progress, not passes.
- **Review findings:** the discovery request is limited to core `/api/v1` and is bounded by the list snapshot's shared deadline and response cap. A discovery 404 maps to unsupported API; a namespaced list 404 maps to missing namespace; a 410 maps only to expired continuation. Error mappings expose no SDK message or raw cluster response. The generated dependency inventory was stale and is now corrected.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** none.
- **Next:** first reread `gh pr checks 2` and the runs for this commit to completion, including any failed logs and the remaining platform jobs. Then continue document 02 at Part B step 8: add the Pod-list command, DTOs, permissions, renderer parser/transport/mock, protocol documentation, and native capability tests.

### 2026-10-13 — document 02, Pod-list IPC and native gate blocker

- **Document:** 02, F3 Part B step 8, Pod-list command, DTOs, generated types, capability, renderer adapter, mock coverage, and protocol contract.
- **Session:** GPT-6; base revision `3257e78`; final revision: the commit carrying this entry.
- **Status after this session:** blocked by B5. Step 8's implementation and deterministic checks are complete; the required actual Tauri command and ACL run could not start after the command permission filter rejected its cleanup invocation.
- **Acceptance cases:** (1) partial — the native command targets the same session and namespace across the adapter's two server-side pages, and browser transport parsing is covered; the real restricted-identity fixture list remains unexecuted; (2) passed synthetically in the preceding entry; (3) partial — deterministic error distinctions are covered, but user-visible states wait for Part C; (4) passed synthetically in the preceding entry; (5) partial — Rust rejects malformed query input before request and renderer parsing rejects malformed responses; broader grammar remains; (6) partial — backend byte/field/object/session caps and renderer list length/field validation are covered; (7)–(8) unexecuted for UI identity replacement and list-specific request saturation; (9) partial — retry, expiry cleanup, and budget release are covered, while cancellation cleanup remains; (10) partial — fixture preflight evidence is recorded in earlier entries; (11) blocked by B5 — the native main-window and unauthorized-window capability checks were added but could not run; (12) unexecuted — the Workloads view belongs to Part C; (13) unexecuted — no real Pod list has run.
- **What changed:**
  - `src-tauri/src/contracts.rs`, `src-tauri/src/bin/export_ipc_types.rs`, and generated `src/lib/ipc/generated/KubernetesPod*.ts`: add the bounded Pod-list and readiness DTOs with generated TypeScript declarations.
  - `src-tauri/src/lib.rs`, `src-tauri/build.rs`, and `src-tauri/capabilities/main.json`: register `list_kubernetes_pods` for the main window, map the bounded adapter projection, and grant only its generated command permission to that window.
  - `src/lib/ipc/validation.ts`, `transport.ts`, and `transport.test.ts`: validate session, namespace, byte-bounded fields, readiness state, item count, and namespace consistency; add the typed transport function and explicit browser-mock and malformed-response coverage.
  - `tests/native/kubernetes-session.spec.ts`: exercise the command's two-page projection and add it to the unauthorized-window denial checks.
  - `docs/protocol/application-ipc.md`: document arguments, bounds, partial results, and projected fields.
  - This ledger: record B5 and the stopped native gate.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2):
  - `pnpm format`, `pnpm check`: pass on the final code; `pnpm check` reports Oxfmt, Oxlint/type diagnostics, Svelte diagnostics (0 warnings/errors), 127 renderer tests across 15 files, and the production Vite build passing.
  - `pnpm contracts:generate`, `pnpm contracts:check`: pass; Rust producer and checked-in TypeScript outputs match.
  - `pnpm test:e2e`: pass, 7 tests.
  - `pnpm format:rust:check`; Clippy with and without `native-test`; default and `native-test` `cargo test --all-targets`; `cargo test --doc`; `RUSTDOCFLAGS="-D warnings" cargo doc --no-deps`; and locked `cargo build`: pass. Each all-target library suite reports 108 passed, 0 failed, and 1 ignored; the native-feature run also passes all 5 Kubernetes session integration tests. Live fixture tests are ignored.
  - An initial full Rust test run failed because the command omitted the pinned Go 1.27.2 module-cache binary from `PATH`, so helper fixture builds failed. Rerunning the same gates with the pinned Go path passed.
  - `pnpm test:native` was rejected before process launch by the command permission filter because the attempted invocation included `rm -rf` to clean its private XDG directory. No native test process or Tauri window started. `pnpm desktop:build` and `pnpm production:check` were not run because the packet's required native test could not be run and the prescribed release-build-after-native sequence was therefore not reached.
  - `gh pr checks 2`: for `3257e78`, push Foundation `38319659325` and PR Foundation `38319666302` both have renderer passed, Ubuntu/Windows in progress, and macOS jobs queued; Security `38319666333` has CodeQL Actions, CodeQL JavaScript/TypeScript, Trivy, and filesystem scan passed, with CodeQL Rust in progress. These hosted runs remain incomplete.
  - Earlier runs: `a4f413d` Security run `38319125830` is now complete and passed; both Foundation runs `38319121267` and `38319125901` failed at the stale inventory check fixed in this series, with other platform jobs still incomplete. For `c3ae5ef`, the failed Ubuntu default test log identified `DatabaseBusy` in `storage::database::tests::concurrent_initialization_serializes_the_first_migration`; Windows remains in progress and macOS jobs queued.
  - `pnpm format:check`, `pnpm contracts:check`, and `git diff --check` are rerun after the ledger update before commit. The first post-ledger `pnpm contracts:check` invocation omitted the pinned protoc directory and failed to start `protoc`; rerunning with the documented pinned Node, Go, Cargo, and protoc paths passed.
- **Evidence class:** deterministic Rust, TypeScript, and browser E2E checks; generated producer/consumer contract checks. No native Tauri run and no real-cluster Pod-list run.
- **Fixture:** none touched; the fixture is destroyed and the host restoration is documented in earlier entries.
- **Failed or unexecuted:** the native command/permission test is blocked by B5. Desktop build and production artifact exclusion checks are unexecuted because the required native run did not occur. The hosted jobs for `3257e78` remain pending/in progress. The real restricted-reader list and Part C UI cases remain unexecuted.
- **Review findings:** the Rust command returns only the allowlisted projection and preserves the request's session and namespace in its result. The runtime parser enforces per-field UTF-8 bounds and rejects any row whose namespace differs from the query. The main capability contains the command while the unauthorized test window has no grant. The actual ACL behavior awaits the blocked native run.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** B5.
- **Next:** first read the hosted results for this commit to completion. Then resolve B5 before attempting the native test; when permitted, run `pnpm test:native` on a private Xvfb display with X11 and isolated XDG directories, rebuild with `pnpm desktop:build`, and run `pnpm production:check` before continuing document 02 Part C.

### 2026-10-13 — document 02, hosted checks for the Pod-list IPC push

- **Document:** 02, F3 Part B step 8, hosted-run handoff for the IPC commit.
- **Session:** GPT-6; base revision `06135e7`; final revision: the commit carrying this entry.
- **Status after this session:** blocked by B5; the implementation is pushed and deterministic checks pass, while actual Tauri/ACL verification remains unexecuted.
- **Acceptance cases:** no acceptance status changed; see the preceding step 8 entry. Native acceptance case (11) remains blocked by B5, and real Pod-list case (13) remains unexecuted.
- **What changed:** this ledger records the hosted jobs started for `06135e7`; the status board carries B5 and directs the next session to finish hosted inspection before a native rerun.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh pr checks 2`: PR Foundation run `38320088624` has renderer and Ubuntu/Windows in progress, with both macOS jobs queued.
  - `gh run list --branch ft-foundation-completion --limit 12 --json databaseId,headSha,name,status,conclusion,createdAt`: push Foundation run `38320095237` and Security run `38320095247` are queued; all three runs target `06135e7`.
  - `gh run view 38320088624 --json status,conclusion,jobs`: PR Foundation is queued overall; renderer, Ubuntu, and Windows are in progress; macOS 15 and macOS 15 Intel are queued.
- **Evidence class:** hosted states only; no run was read to completion in this handoff.
- **Fixture:** none; fixture remains destroyed and host restoration is recorded in the earlier fixture entries.
- **Failed or unexecuted:** all three hosted workflows for `06135e7` are queued or in progress. The prior B5 native-run permission denial remains unresolved; this entry does not retry it.
- **Review findings:** none; this entry records the exact statuses returned by the GitHub CLI.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** B5 remains open.
- **Next:** first read `gh pr checks 2` and runs `38320088624`, `38320095237`, and `38320095247` to completion, including failed logs. Resolve B5 before attempting `pnpm test:native`; then rebuild and run the production check before continuing document 02.

### 2026-10-13 — document 02, latest hosted queue state

- **Document:** 02, F3 Part B step 8, hosted-run status recording.
- **Session:** GPT-6; base revision `560c4e7`; final revision: the commit carrying this entry.
- **Status after this session:** blocked by B5; no native test was attempted, and the hosted runs for the code and ledger commits have not completed.
- **Acceptance cases:** unchanged from the step 8 entry; native permission verification (11) is blocked by B5 and real Pod-list case (13) is unexecuted.
- **What changed:** this ledger records hosted queue states for `560c4e7` and changes the next action to inspect the latest pushed runs before resuming.
- **Commands and results** (openSUSE Tumbleweed x86_64):
  - `gh pr checks 2`: PR Foundation run `38320126408` and Security run `38320129833` have all jobs pending.
  - `gh run list --limit 20 --json databaseId,headSha,name,status,conclusion,createdAt`: push Foundation run `38320129862`, PR Foundation run `38320126408`, and Security run `38320129833` all target `560c4e7` and are queued.
  - `gh run view 38320126408 --json status,conclusion,jobs`: overall queued; renderer and all four desktop jobs are queued.
- **Evidence class:** hosted states only; no completion or pass is claimed.
- **Fixture:** none; fixture remains destroyed and restoration is documented in earlier entries.
- **Failed or unexecuted:** the three `560c4e7` hosted workflows are queued. The three `06135e7` workflows also remain queued or in progress at the latest branch listing. B5 still prevents the native Tauri run.
- **Review findings:** none; the states match the GitHub CLI output.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** B5 remains open.
- **Next:** first reread `gh pr checks 2` and finish the hosted runs for the latest branch commit, including failed logs. Then resolve B5 before attempting native Tauri verification; do not resume Part C until the native and production checks pass.

### 2026-10-13 — document 02, Workloads view and blocked fixture preflight

- **Document:** 02, F3 Part C steps 9–13 and the Part D fixture preflight.
- **Session:** GPT-6; base revision `112b012`; final revision: the commit carrying this entry.
- **Status after this session:** blocked by B6. The Workloads view and local gates are complete, but no live restricted paginated list was run because the runbook's `talosctl version` command resolved the host's ambient Talos configuration and contacted a server outside the fixture allowlist.
- **Acceptance cases:** (1) partial—synthetic two-page list coverage exists; the restricted-identity fixture pagination is unexecuted; (2) passed synthetically—401 and 403 are separate and non-retryable; (3) passed—unsupported API, TLS, empty, and namespace outcomes are distinct in deterministic coverage, and empty/unsupported are separately rendered; (4) passed synthetically—expired continuation returns no mixed snapshot; (5) passed—Rust rejects malformed input before requests, renderer selectors are passed unchanged, and IPC validates responses; (6) partial—backend byte, field, item, and retained-projection bounds have deterministic coverage, while the live aggregate-cap behavior is unexecuted; (7) passed—renderer tests discard late namespace and replaced-session results; (8) partial—general admission saturation is covered, but list-specific saturation remains unexecuted; (9) partial—error/expiry cleanup and budget release are covered, but list cancellation cleanup remains unexecuted; (10) partial—manifest identity/version rejection evidence exists, but the full wrong-identity/version/manifest live matrix is unexecuted; (11) passed—native Tauri permits the list command in the main window and denies it to a window without the capability; (12) passed—browser accessibility and shell behavior at 1280×800, 1024×700, and 720×480; (13) blocked—no new real Pod list was run.
- **What changed:**
  - `src/features/kubernetes/WorkloadsView.svelte`, `src/lib/state/kubernetesWorkloads.svelte.ts`, and `src/components/PilotApp.svelte`: add a shell-owned Kubernetes session and a read-only Workloads view backed by TanStack Svelte Query. Query identity includes session, namespace, resource, selectors, complete-snapshot page identity, and a request generation; changing query/session hides prior data.
  - `src/lib/format/status.ts` and its tests: add the independent Kubernetes context summary to the persistent status bar.
  - `tests/e2e/workloads.spec.ts`, `tests/e2e/shell.spec.ts`, and `src/components/PilotApp.test.ts`: cover scoped requests, distinct states, late responses, native-disabled browser mode, responsive layout, and accessibility.
  - `package.json`, `pnpm-lock.yaml`, `docs/dependencies.md`, and `docs/verification/dependency-inventory.json`: pin TanStack Svelte Query 6.3.1 and record its Svelte `^5.25.0` peer compatibility with Svelte 5.57.2.
  - `docs/workflows/kubernetes-workloads.md`: document importing a context, opening a session, listing Pods, and closing the session.
  - `docs/plans/foundation-finish/ledger.md`: resolve B5 with the successful native run, add B6 and Q4, and mark document 02 blocked pending owner direction on the fixture-only version check.
- **Commands and results** (openSUSE Tumbleweed x86_64; Node 26.11.1, pnpm 12.10.1, Rust/Cargo 1.99.0, Go 1.27.2, protoc 36.2):
  - `pnpm install --frozen-lockfile`: pass.
  - `pnpm inventory:generate`, `pnpm inventory:check`: pass; inventory contains 531 npm, 601 Cargo, and 143 Go modules.
  - `pnpm audit --audit-level=low`: no known vulnerabilities. `pnpm audit:go`: 0 vulnerabilities in called symbols; 1 required-module advisory is not called. `pnpm advisories:check`: the two recorded GTK/glib advisories still match the dependency path and linked executable.
  - `pnpm format`, `pnpm check`: pass; Oxlint and Svelte diagnostics are clean, 142 renderer tests pass, and the Vite production build passes.
  - `pnpm test:e2e`: pass, 8 tests. The first browser run exposed document overflow at 720×480; the shell now bounds content in the main scroll region, and the final run verifies the shell and status bar remain in the viewport at all three sizes with no horizontal overflow and no axe violations.
  - `pnpm contracts:check`: pass with pinned `protoc`; Rust, Go, and TypeScript contracts are current. `git diff --check` passes. Changed Markdown links resolve.
  - `pnpm test:native`, on a private Xvfb display with fresh XDG paths: pass, 2 spec files and 16 tests on WebKitGTK 605.1.15. This resolves B5. The main-window list and unauthorized-window denial checks both pass; the script confirmed no helper process or synthetic endpoint remained.
  - `pnpm desktop:build`, then `pnpm production:check`: pass; production artifacts exclude WebDriver and expose no driver listener.
  - `talosctl version --help`: pass and shows the `--client` option. The preceding `talosctl version` invocation returned client v1.14.2 and server node `10.0.10.79`; it had resolved the ambient host Talos configuration, so this session stopped fixture work immediately. No fixture was provisioned and no host firewall or route mutation was issued.
  - The latest fully read hosted runs for base `112b012` were Foundation `38364248109` and Security `38364248050`; all included jobs passed. The Mac Intel runner was deliberately absent from that workflow matrix and is not claimed as executed.
- **Evidence class:** deterministic Rust/renderer tests, browser E2E, and a native Tauri run passed. No live Kubernetes Pod-list evidence was produced in this session.
- **Fixture:** none provisioned. The initial host-baseline command did not yield a captured baseline after the ambient Talos preflight. No fixture remediation or setup mutation was performed. Do not reuse this as a completed runbook session.
- **Failed or unexecuted:** an initial `pnpm inventory:generate` used system Go 1.27.1 and failed the repository's 1.27.2 floor; rerunning with the pinned Go path passed. An initial `pnpm contracts:check` used an inaccessible system `protoc`; rerunning with pinned protoc 36.2 passed. An early browser run failed the 720×480 shell overflow assertion; the final E2E run passed after correcting the bounded layout. Part D preflight and the restricted live list remain blocked by B6. The hosted workflows for this commit have not run yet. No macOS Intel build ran, by deliberate workflow scope.
- **Review findings:** the narrow-height Workloads screen initially exposed page-level vertical overflow; the shell now constrains the work area and scrolls its main region while keeping the status bar in view. The runbook's unqualified `talosctl version` can contact an ambient server; B6/Q4 record this before any fixture provisioning or Kubernetes API request.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** B6 and Q4. B5 is resolved by this entry.
- **Next:** get the owner's answer to Q4. If the runbook is amended, repeat its baseline from the beginning, use `talosctl version --client` for the local binary and an explicit fixture Talos config for any server version check, run the restricted Kubernetes list, then always complete destroy-and-restore before considering document 02 done.

### 2026-10-13 — document 02, hosted results for `6be6029`

- **Document:** 02, hosted verification for the Part C implementation and blocked Part D preflight.
- **Session:** GPT-6; base revision `6be6029`; final revision: the commit carrying this entry.
- **Status after this session:** blocked by B6; all hosted checks for the implementation commit passed, but the live restricted Kubernetes list still requires the owner's answer to Q4.
- **Acceptance cases:** unchanged from the preceding entry: 11 and 12 are passed; 13 is blocked; the restricted real pagination, cancellation cleanup, and list-specific saturation evidence remain incomplete.
- **What changed:** this ledger records the completed Foundation and Security workflows for `6be6029`; document 02 remains blocked (B6), and Q4 remains unanswered.
- **Commands and results** (GitHub-hosted runners):
  - `gh pr checks 2`: all reported checks passed, including Foundation, Security/CodeQL, and Trivy.
  - `gh run list --branch ft-foundation-completion --limit 10 --json databaseId,headSha,name,status,conclusion,createdAt`: Foundation `38372754535` and Security `38372754419` both completed successfully on head `6be6029fe757312520300031a5ba34c2d1a4cbf3`.
  - `gh run view 38372754535 --json status,conclusion,jobs`: `Decide desktop scope`, renderer, `desktop (ubuntu-22.04)`, `desktop (windows-2022)`, `desktop (macos-15)`, and the final result job all succeeded.
  - `gh run view 38372754419 --json status,conclusion,jobs`: CodeQL Actions, JavaScript/TypeScript, Rust, and Trivy filesystem scan all succeeded.
- **Evidence class:** hosted CI. These results complement the local deterministic, browser, and native evidence in the preceding entry. No live Kubernetes Pod list ran.
- **Fixture:** none; B6 remains open and no fixture or host remediation was performed.
- **Failed or unexecuted:** no included hosted job failed. macOS Intel was deliberately absent from the workflow matrix and is not claimed as executed. The new ledger commit's hosted workflows have not run yet.
- **Review findings:** all completed jobs target the implementation commit; no result is inferred from a queued or superseded run.
- **Assumptions confirmed or refuted:** none.
- **Questions and blockers raised:** Q4 remains unanswered; B6 remains open.
- **Next:** resolve Q4, then restart the fixture runbook at its baseline and use only client-only binary verification plus an explicit fixture configuration for server checks. After that, run the restricted Pod list and complete destroy-and-restore.

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
