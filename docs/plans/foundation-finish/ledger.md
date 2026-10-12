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

| Document                                                                        | Packet           | Status      | Last commit | Updated    | Next action                                                            |
| ------------------------------------------------------------------------------- | ---------------- | ----------- | ----------- | ---------- | ---------------------------------------------------------------------- |
| [01 F1a live stall rows](01-f1a-live-stall-rows.md)                             | F1a step 4       | not started | `b662b1a`   | 2026-10-12 | Start here. Steps 1–3 are committed; step 4 needs a fixture session    |
| [02 F3 Kubernetes list probe](02-f3-kubernetes-list-probe.md)                   | F3               | not started | —           | 2026-10-12 | After 01                                                               |
| [03 F4 Kubernetes watch](03-f4-kubernetes-watch.md)                             | F4               | not started | —           | 2026-10-12 | After 02                                                               |
| [04 F5 Kubernetes version fixtures](04-f5-kubernetes-version-fixtures.md)       | F5               | not started | —           | 2026-10-12 | After 03                                                               |
| [05 F6 editor workers and CSP](05-f6-editor-workers-csp.md)                     | F6               | not started | —           | 2026-10-12 | After 04, or earlier if a fixture document is blocked                  |
| [06 F7 terminal and chart wrappers](06-f7-terminal-chart.md)                    | F7               | not started | —           | 2026-10-12 | After 05                                                               |
| [07 F8 dependencies, notices, security](07-f8-dependencies-notices-security.md) | F8               | not started | —           | 2026-10-12 | After 06; mind the 2026-11-30 date below                               |
| [08 F9 Linux packages](08-f9-linux-packages.md)                                 | F9.0, F9.1, F9.4 | not started | —           | 2026-10-12 | After 07; F9.0 needs hosted CI results to be readable (B2)             |
| [09 F10 budgets and Linux close](09-f10-budgets-and-linux-close.md)             | F10              | not started | —           | 2026-10-12 | After 08                                                               |
| [10 Platform revisit](10-platform-revisit.md)                                   | F9.2, F9.3       | deferred    | —           | 2026-10-12 | Owner has no macOS or Windows machine; revisit when they are available |

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

| ID  | Opened     | Blocker                                                                              | Affects                                          | Status                                                                             |
| --- | ---------- | ------------------------------------------------------------------------------------ | ------------------------------------------------ | ---------------------------------------------------------------------------------- |
| B1  | 2026-10-12 | `git push` failed with HTTP 403 for the stored account `TIT-IT`                      | Every hosted-CI row; F9.0 in document 08         | Resolved 2026-10-12: the owner switched the remote to SSH and `b662b1a` was pushed |
| B2  | 2026-10-12 | `gh` is not installed, and no session has yet read a hosted CI result from this host | Recording hosted-CI results; F9.0 in document 08 | Open                                                                               |

## Questions for the owner

| ID  | Asked      | Question                                                                                                                                                           | Needed by                              | Answer                                    |
| --- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------- | ----------------------------------------- |
| Q1  | 2026-10-12 | The fixture network `10.79.0.0/24` sits inside a VPN route on the host. The owner accepted shadowing it for the 2026-10-12 run only. Is that accepted from now on? | The first fixture session, document 01 | Answered 2026-10-12: allowed indefinitely |

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
