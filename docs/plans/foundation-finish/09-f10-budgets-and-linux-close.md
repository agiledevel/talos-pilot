# 09 — F10: measured budgets and the Linux close

Read the series [README](README.md) and the [ledger](ledger.md) first. A Talos fixture is needed only for the real-stream measurement; see the [fixture runbook](fixture-runbook.md).

Plan packet: [F10](../foundation-completion-flash.md#f10--measure-budgets-and-close-the-milestone). Maps to checkpoint C9, task FND-006, and the milestone review. Final close requires documents 01 to 08 `done` on Linux. Preliminary tooling may proceed while a prerequisite is recorded as blocked; a recorded blocker never substitutes for its acceptance. Follow [S6/S7 of the current plan](follow-up-to-m2.md) for technical readiness and the separate human review gate.

## Outcome

A reproducible performance harness measures the declared workloads on this host, budgets are derived from those measurements and enforced by a check that really fails on an overrun, and the whole milestone acceptance matrix is reviewed on the final revision. The series then ends with the foundation complete on Linux and milestone 1 open only for the deferred platform rows. Milestone 2 feature work may start.

## Read before you start

| File                                                                                                             | Why                                             |
| ---------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| [Original milestone plan, section 8](../milestone-1-flash.md#8-milestone-acceptance-matrix)                      | The acceptance matrix you review row by row     |
| [Milestone ledger checkpoint table](../../verification/milestone-1.md#checkpoint-status-and-acceptance-criteria) | The status of every checkpoint                  |
| [This series ledger](ledger.md), every entry                                                                     | The evidence for documents 01 to 08             |
| [quality.md sections 6 and 9](../../quality.md#6-frontend-and-native-ux-quality)                                 | The performance rule and the definition of done |
| [Milestone 2 plan, section 1](../milestone-2-flash.md)                                                           | The entry gate this document satisfies on Linux |
| [docs/design.md, development course](../../design.md#9-development-course)                                       | What milestone 1 is and what comes next         |

Apply the skills for whatever the harness touches: `talos-pilot-typescript` for scripts, `talos-pilot-rust` and `talos-pilot-tauri` for native measurement.

## Context

### The declared workloads

From the plan. These are verification workloads, not claimed supported limits.

- 20 saved profiles
- 3 active clusters
- 100 nodes in one cluster
- 10,000 objects

Features that are not implemented yet are measured with explicitly synthetic projections, and the record says so.

### What to keep separate

- Native startup and IPC measurements.
- Real Talos stream measurements. A Talos stream ends at its 256-event cap; state that limit beside the result.
- Real Kubernetes watch measurements. Use the watch for sustained-stream growth, because it is not capped the same way.
- Synthetic renderer measurements.

Never present a synthetic number as a native or real-cluster one.

### What exists

No performance harness and no measured budget exist. Bundle sizes recorded so far are observations only. Documents 05 and 06 recorded chunk sizes for this document to use.

## Do not

- Do not invent a budget, round a measurement into a claim, or copy a number from an older build.
- Do not raise the Talos 256-event cap to lengthen a measurement.
- Do not mark milestone 1 accepted, and do not change the repository README's stage to milestone 2. Milestone 1 stays open for the deferred platform rows.
- Do not relabel any failed or unexecuted row as passed in the matrix review.

## Work

### Part A: the harness

1. Add a reproducible performance command and a numeric budget check, as real scripts with real exit codes, and wire them into CI.
2. For every run, record: hardware, operating system, WebView, display, artifact revision, sampling method, and the number of repetitions.
3. Measure: cold and warm startup distributions, interaction latency for the main views, idle CPU and memory, and sustained-stream duration and growth.
4. Repeat each measurement enough times to report a distribution, not a single value.

### Part B: budgets

5. Derive each threshold from the measured baseline. Write down the rationale: the measured value, the spread, and the margin you chose and why.
6. Prove the check works: introduce a deliberate overrun, show the check fails, then remove it and show the check passes. Record both runs.

### Part C: the Linux close

7. Review every row of the acceptance matrix against the final revision. For each row, link the implementation and the recorded result. Historical evidence may give context; it is not a pass after later changes.
8. Re-run the applicable final-candidate gates on the final tree: every gate set in the README's table.
9. Validate documentation and contracts: setup, protocol, storage, and recovery guidance match the code; every relative link resolves; `pnpm contracts:check` passes.
10. Do the separate final review of the whole series diff: correctness, security boundaries, resource ownership, maintainability, and missing failure-path coverage.
11. Write the milestone UX and tradeoff review for the owner: what works, what is rough, which tradeoffs were made, and what you would change. Keep it short and concrete. Record it in `docs/verification/foundation-owner-review.md` with the candidate revision and linked evidence. Obtain the owner's review outcome before marking this document done (owner Q13); if unavailable, leave it `in progress`. Resolve requested changes and rerun affected gates before closing.
12. After the owner review permits acceptance, record the closing state:
    - in the milestone ledger's checkpoint table, each checkpoint as complete on Linux, with its deferred rows named;
    - in this series ledger, the status board, and the deferred rows that remain;
    - in the repository README's stage paragraph: foundation complete on Linux, milestone 1 open for the macOS and Windows rows, milestone 2 feature work unblocked by owner decision;
    - in the milestone 2 plan, the entry gate marked as met on Linux, with the date and a link to this entry.

## Acceptance cases

1. The performance command runs reproducibly and records its environment.
2. Native, real-cluster, and synthetic measurements are reported separately.
3. Each budget has a recorded derivation.
4. A deliberate overrun fails the budget check; removing it passes.
5. Every acceptance-matrix row has a link to implementation and to a result on the final revision, or is listed as deferred or unexecuted with its reason.
6. The final-candidate gates pass on the final tree.
7. The separate final review's findings are recorded and resolved, or listed as open with an owner.
8. The owner has reviewed the UX and tradeoff summary for the named candidate; the dated outcome and any requested changes are recorded, with blocking changes resolved (Q13).

## Gates

Every gate set in the README's table, on the final tree. The new performance command and budget check. Workflow validation for the CI change.

## Done means

- Every acceptance case has recorded evidence, including the owner's review outcome; delivery of a summary alone is not approval.
- The plan's exit is met **except** for the deferred platform rows. Say exactly that. The plan says unavailable platform evidence keeps the milestone open, and the owner has decided that this does not block further development.
- Document 10 is the only document not `done`, and it is `deferred`.
- The next session's first action is stated in the ledger: start the [milestone 2 plan](../milestone-2-flash.md) at its first packet.
