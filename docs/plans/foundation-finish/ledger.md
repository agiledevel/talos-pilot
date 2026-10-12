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

| Document                                                                        | Packet           | Status      | Last commit | Updated    | Next action                                                                                             |
| ------------------------------------------------------------------------------- | ---------------- | ----------- | ----------- | ---------- | ------------------------------------------------------------------------------------------------------- |
| [01 F1a live stall rows](01-f1a-live-stall-rows.md)                             | F1a step 4       | not started | `aaedf79`   | 2026-10-12 | Start here. Steps 1–3 are committed and green on hosted CI at `aaedf79`; step 4 needs a fixture session |
| [02 F3 Kubernetes list probe](02-f3-kubernetes-list-probe.md)                   | F3               | not started | —           | 2026-10-12 | After 01                                                                                                |
| [03 F4 Kubernetes watch](03-f4-kubernetes-watch.md)                             | F4               | not started | —           | 2026-10-12 | After 02                                                                                                |
| [04 F5 Kubernetes version fixtures](04-f5-kubernetes-version-fixtures.md)       | F5               | not started | —           | 2026-10-12 | After 03                                                                                                |
| [05 F6 editor workers and CSP](05-f6-editor-workers-csp.md)                     | F6               | not started | —           | 2026-10-12 | After 04, or earlier if a fixture document is blocked                                                   |
| [06 F7 terminal and chart wrappers](06-f7-terminal-chart.md)                    | F7               | not started | —           | 2026-10-12 | After 05                                                                                                |
| [07 F8 dependencies, notices, security](07-f8-dependencies-notices-security.md) | F8               | not started | —           | 2026-10-12 | After 06; mind the 2026-11-30 date below                                                                |
| [08 F9 Linux packages](08-f9-linux-packages.md)                                 | F9.0, F9.1, F9.4 | not started | —           | 2026-10-12 | After 07                                                                                                |
| [09 F10 budgets and Linux close](09-f10-budgets-and-linux-close.md)             | F10              | not started | —           | 2026-10-12 | After 08                                                                                                |
| [10 Platform revisit](10-platform-revisit.md)                                   | F9.2, F9.3       | deferred    | —           | 2026-10-12 | Owner has no macOS or Windows machine; revisit when they are available                                  |

## Standing owner decisions

Recorded on 2026-10-12. Their full wording is in the series [README](README.md#what-the-owner-has-decided).

| Date       | Decision                                                                                                                    |
| ---------- | --------------------------------------------------------------------------------------------------------------------------- |
| 2026-10-12 | Milestone 1 may stay open. The macOS and Windows rows are deferred and do not block milestone 2                             |
| 2026-10-12 | The owner has no macOS or Windows machine                                                                                   |
| 2026-10-12 | The fixture-scoped host firewall remediation may be applied in the session, exactly as the allowlist records it             |
| 2026-10-12 | Pushing to `ft-foundation-completion` is permitted; no force-push, tags, releases, or push to `main`                        |
| 2026-10-12 | The fixture may shadow the VPN route covering `10.79.0.0/24` indefinitely (answers Q1)                                      |
| 2026-10-12 | A node reboot that outlasts the reconnect budget ends the Talos subscription; the retry policy is unchanged (decision 0013) |
| 2026-10-12 | F1 is closed with its live retry-exhaustion row re-scoped to F1a; F2 is accepted                                            |

Add a row when the owner decides something new. Quote the owner's words or cite where they are recorded.

## Dates that matter

| Date       | What happens                                                                                                                                | Owner document |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| 2026-11-30 | Both Trivy exceptions in `.trivyignore.yaml` expire. The security workflow and the release gate fail afterwards until they are re-evidenced | 07             |

## Blockers

| ID  | Opened     | Blocker                                                                                                                                                                                    | Affects                                          | Status                                                                                           |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| B1  | 2026-10-12 | `git push` failed with HTTP 403 for the stored account `TIT-IT`                                                                                                                            | Every hosted-CI row; F9.0 in document 08         | Resolved 2026-10-12: the owner switched the remote to SSH and `b662b1a` was pushed               |
| B2  | 2026-10-12 | `gh` is not installed, and no session has yet read a hosted CI result from this host                                                                                                       | Recording hosted-CI results; F9.0 in document 08 | Resolved 2026-10-12: the owner installed and configured `gh`; hosted runs were read the same day |
| B3  | 2026-10-12 | Hosted `desktop (windows-2022)` failed at `b662b1a` and `481421a` in `go test`: `TestProbeCancellationDuringBackoffEndsCleanly` raced its cancellation against the first reconnect attempt | Hosted evidence for every commit until fixed     | Resolved 2026-10-12: fixed in `aaedf79`, whose hosted run 38301882786 passed all five jobs       |

## Questions for the owner

| ID  | Asked      | Question                                                                                                                                                                                                                                    | Needed by                              | Answer                                    |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| Q1  | 2026-10-12 | The fixture network `10.79.0.0/24` sits inside a VPN route on the host. The owner accepted shadowing it for the 2026-10-12 run only. Is that accepted from now on?                                                                          | The first fixture session, document 01 | Answered 2026-10-12: allowed indefinitely |
| Q2  | 2026-10-12 | The security workflow (CodeQL and Trivy) runs only for pushes and pull requests to `main`. Exact-commit scan results for this branch need a pull request to `main`. May a session open one, as a draft, when document 07 needs the results? | Document 07                            | Open                                      |

## Deferred and carried rows

Rows that no current document closes, or that a named document must pick up. A row leaves this table only by being executed, with a link to the entry that did it.

| Row                                                                                   | Owner                         | Why it is open                                                                                |
| ------------------------------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------- |
| macOS 13.3 and current, Apple Silicon and Intel: clean install, Keychain, helper, CSP | Document 10                   | Deferred by the owner; no macOS machine                                                       |
| Windows 11: NSIS and WebView2 install, Credential Manager, helper lifecycle           | Document 10                   | Deferred by the owner; no Windows machine                                                     |
| Mutual-TLS client handshake against a real API server                                 | Document 02                   | The Talos fixture's kubeconfig is expected to use a client certificate; confirm and record    |
| Basic-auth client handshake                                                           | Unassigned                    | Selection and rejection tests only; no live endpoint is planned                               |
| Live cancellation during an in-flight reconnect attempt or backoff                    | Unassigned                    | Deterministic evidence only; the 2026-10-12 live cancellation landed on an established stream |
| Real OS-vault restart of a Kubernetes credential on Linux                             | Document 08                   | Unit tests use injected keys; the packaged run can exercise the Secret Service                |
| Packaged-installer helper startup                                                     | Document 08, then document 10 | Belongs to F9                                                                                 |
| R3: helper status and probe serialization                                             | Deferred                      | No feature polls helper status during a probe; deliver its contract first if one does         |
| Legacy Kubernetes 1.33 and 1.34 browsing and migration                                | Later milestone               | Outside milestone 1                                                                           |

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
