# S2 implementation review and S3 readiness

Date: 2026-10-25. Reviewed revision: `114fbdbb222cbd4e56380ab52c17e88d67cfe13e`
on `docs/s2-flash-readiness`, compared with merged `main` `a7ada06`.
Owner request: review completed S2 and determine whether S3 may start after the
owner merges. This review does not merge, push, implement a correction or start S3.

## Disposition

**Changes requested. S3 is not ready merely on merge of this revision.**
S2-R1 leaves F7-05 incomplete, and S2-R2 needs an evidence-record correction.
Document 06 remains in progress. The hosted-CI prerequisite is now satisfied for
the reviewed candidate, but not for a future corrective revision.

The implementation preserves the intended synthetic-only scope, independent
lazy library boundaries, backend credential/IPC boundaries and existing CSP.
Admission, replay/backpressure, cancellation and teardown have substantial
coverage. No additional defect was demonstrated in those areas during this
review; this is not proof of every platform or failure path.

## Findings

### S2-R1 — P2: data-first frame coalescing loses a chart resize

Location: [chartAttachment.svelte.ts](../../src/features/charts/chartAttachment.svelte.ts),
`flush()`, lines 156–160 at the reviewed revision, together with `schedule()`
and `OwnedSpecializedResources.scheduleFrame()`.

The resource owner keeps the first frame callback and discards later callbacks.
The previous correction handles **resize first, data second** by making
`resize()` re-drive pending data. The reverse order is still broken: when a
same-shape replacement schedules `flush()` first, a ResizeObserver delivery
before that frame cannot schedule `resize()`. `flush()` measures the new size,
but its same-shape branch only calls `setData()` and returns. No `setSize()` or
follow-up resize occurs. The chart retains its old dimensions indefinitely,
clipping the right side when its host shrinks, despite zero pending work.

**Reproduction:** real pinned uPlot in Chromium, scripted appearance/storage
IPC only, real ResizeObserver deliveries, with animation-frame dispatch held to
select the data-first ordering. Open the chart and settle; propose Next sample;
shrink its host to 300 CSS px; wait for the real ResizeObserver delivery;
dispatch the one owned frame; allow two normal browser frames to settle.

| Observation  | Result                                                   |
| ------------ | -------------------------------------------------------- |
| Before       | host 734 px, chart 726 px                                |
| After        | host 300 px, chart **726 px**, expected **292 px**       |
| Pending work | zero frames, `Frame: none`, `Scheduled: 0 B`, `Queue: 0` |

The regression assertion fails with `726 !== 292`. Scratch reproducer:
`/tmp/tp-s2-review-chart-resize.mjs`; log:
`/tmp/tp-s2-review-chart-resize.log`. Run from the repository root with
`.tools/node/bin/node /tmp/tp-s2-review-chart-resize.mjs`. These are local scratch
artifacts, not a committed regression harness or native evidence. Both browser
and Vite server close in `finally`.

**Smallest repair:** apply the measured size in the same-shape flush path, or
otherwise ensure the single scheduled drain services both data and size.
Avoid introducing a new framework. Add a regression that controls both callback
orders and checks actual rendered dimensions and replacement data, not merely
nonzero pixels or an empty queue. Requalify F7-05 and the affected final gates
before accepting document 06.

### S2-R2 — P2: the F7 evidence record identifies different final artifacts

Location: [f7-terminal-chart.md](f7-terminal-chart.md), Commands and results,
Native keyboard and rendered visual pass, and source-revision attribution.

The record says its gates ran on the final S2-D source, but its test count and
three artifact digests disagree with the final ledger entry and retained logs
and files. Read-only checks during this review confirmed:

| Item                        | F7 evidence record                                                 | Final retained evidence                                                                |
| --------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Unit tests                  | 318 / 43 files                                                     | **319 / 43 files** in `/tmp/tp-f7-check-ci.log`, also 319 in hosted renderer execution |
| Ordinary executable SHA-256 | `3b26456fbb0ac560ff12d836807a20cb1d9c7e9a450ff6aecbf1dca1e7586e83` | `c6a4eeefd474d9dbee52a96295469667dcb841848f02add8745f997687494654`                     |
| `terminal.png` SHA-256      | `bd94c99a7c247182c845a7c120e63fb5a8c688c45142597296d0e5cebdec377b` | `4f679ef10af2072d3f7e1ccf62d88f5ba7ddfc535b6391cece1ab8ec262a32fb`                     |
| `chart.png` SHA-256         | `46139edac6e4baa2e660938b6cfe8572797a8e5a06df63c4761f3b7fbf84ed5f` | `8041ebf010c6fd3bd2c425897153c279ac3d3a2c04fffa1da9b9217ac54014b1`                     |

The final hashes match the append-only S2-D ledger entry. Screenshot hashes also
match `/tmp/tp-f7-native-x11.log`. This does not show that native execution was
absent; it shows that the dedicated record is stale and cannot identify its
claimed final artifacts consistently. Correct its attribution from the actual
retained evidence, and record new artifacts separately when R1 is requalified.
Do not relabel an earlier execution as testing a future fix.

## Hosted evidence read during review

[PR #4](https://github.com/agiledevel/talos-pilot/pull/4) is open against `main`;
its head is exactly the reviewed revision. Both runs are completed successfully:

- [Foundation 40241146782](https://github.com/agiledevel/talos-pilot/actions/runs/40241146782):
  renderer and Ubuntu 22.04/macOS 15/Windows Server 2022 desktop jobs passed.
  The renderer log shows fresh aggregate execution, **319 unit tests / 43
  files**, production build and **30 Playwright flows**, not format-only reuse.
- [Security 40241146811](https://github.com/agiledevel/talos-pilot/actions/runs/40241146811):
  Trivy and CodeQL actions/JavaScript-TypeScript/Rust jobs passed.

These supersede the earlier statements that this branch is unpushed and has no
PR/run. Hosted desktop builds are not native WebView, minimum-OS or
installed-package qualification. The recorded Linux native/X11 runs remain
prior-session evidence; none was rerun by this review.

## S3 entry and preparation

After the owner merges, S3 may start **only after**:

1. S2-R1 is fixed with a failing-before/passing-after regression and the affected
   final renderer/browser/native gates are recorded. After native execution,
   preserve the order `pnpm desktop:build`, `pnpm production:check`,
   `pnpm advisories:check`. Read Foundation/Security for the actual corrective
   candidate; this review's green runs do not cover it.
2. S2-R2 and the current packet/evidence statuses are reconciled. Mark document
   06 done on Linux only when its final acceptance cases and gates hold.
3. Discover the actual merged revision and read its main-branch results; do not
   assume the merge revision equals the PR head or that merge itself passed CI.
   Preserve source/evidence attribution if the owner squashes or adds changes.

[S3/document 07](../plans/foundation-finish/07-f8-dependencies-notices-security.md)
is otherwise a defined, fixture-independent next packet. Before implementation,
replace its obsolete step 6 instructions about PR #2 with discovery of the
owner-designated active branch/PR and exact candidate runs. The series README's
old “S2 not started” wording must not become launch instructions. No historical
push permission grants authority over a new S3 branch.

S3 acceptance remains: reproducible inventory and license review; generated
license/NOTICE texts including Monaco's `ThirdPartyNotices.txt` and linked Go
notices; target-specific optional-package obligations; deterministic notice drift
failure/pass coverage; actual built-artifact notice presence; current
npm/Go/Cargo applicability and exact-candidate security evidence. Tauri resource
or packaging changes require their native/build gates. Installed-package and
per-platform final-artifact qualification remain with S4/document 08 and
document 10, not inferred from notice generation.

The two Trivy exceptions expire on **2026-11-30**; the follow-up plan prioritizes
re-evidence from **2026-11-15**. Do not automatically renew or widen them, or
refresh Go/Talos pins without the combined source/compatibility/fixture evidence.

C6/C7, remaining fixtures/packages/budgets, deferred WebViews, the Q13 owner
review and M2.0 remain open. B11 stays unresolved under S0's existing owner
exception; no new owner decision or scope reduction is needed for this review's
local repair.

## Review execution and limits

- Read the S2 diff, packet/evidence, S3 packet and relevant design, quality and
  framework/domain guidance; inspected existing admission, replay, resource,
  lazy-load, renderer and native tests.
- `pnpm toolchain:bootstrap`: passed, reused private Node 26.12.1, pnpm 12.15.0,
  Rust 1.99.1, Go 1.27.3 and protoc 36.2.
- Focused `pnpm test:run` over terminal replay/snapshot, chart snapshot,
  lazy-surface and specialized-resource tests: **52 passed / 5 files**.
- The focused chart resize regression probe **failed as intended**, demonstrating
  S2-R1 on the unchanged reviewed source. It is browser/scheduler evidence only.
- `sha256sum` of the retained executable and both X11 captures confirmed S2-R2.
- No application, dependency, IPC, CSP, fixture, host or packaging changes; no
  merge, push, branch switch, CI dispatch or S3 implementation. Broad aggregates,
  native tests and production rebuilds were not repeated because this is a
  review/documentation change; the exact-candidate hosted execution was read
  instead. No fresh native/platform/package/cluster/performance pass is claimed.
