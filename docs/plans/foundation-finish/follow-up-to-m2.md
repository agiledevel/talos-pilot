# Foundation follow-up: stabilization through owner review and M2.0

Date: 2026-10-25. Reviewed source: `889157f` on `ft-foundation-completion`.
Status: **S2/F7 is implemented but not accepted: review findings S2-R1/S2-R2
remain open.** PR #4 Foundation/Security passed at `114fbdb`; the [review and S3
readiness assessment](../../verification/s2-review-s3-readiness.md) explains why
merge alone does not unblock S3. S1's three P2 findings are corrected and accepted
(S1-P2-1/2/3) and document 05 is done on Linux. The saved [S1 launch
prompt](s1-launch-prompt.md) is now historical and must not be re-run. S0
remains accepted under the [B11 owner
exception](../../verification/s0-native-keyboard-acceptance.md); B11 is
unresolved/not fixed. The [F7 evidence
record](../../verification/f7-terminal-chart.md) holds every F7-01–F7-08
outcome, bounds and limit, subject to the review's evidence corrections. S3 and
later steps are not started; F7 needs corrective implementation and final
qualification, not merely the now-completed hosted runs.
Audience: an LLM starting with no conversation history.

## 1. Goal, authority, and stopping point

Restore a reliable foundation baseline, finish the remaining Linux foundation
packets, obtain the owner's UX/tradeoff review, then execute **M2.0 only**.
Stop with an evidence-backed M2.1 handoff; do not implement profiles or other
milestone 2 features in this sequence.

Read [AGENTS.md](../../../AGENTS.md), the [locked design](../../design.md),
[quality.md](../../quality.md), [FLASH pace](../../flash-pace.md), the
[series README](README.md), and the [ledger](ledger.md) before work. The
[foundation completion plan](../foundation-completion-flash.md) and packet
acceptance criteria remain normative. This file supersedes the older
[close-out plan](closeout-plan.md)'s starting snapshot and completed-session
instructions; it does not change scope, gates, or owner decisions. On a real
contract disagreement, record it and stop the dependent step rather than choose
silently.

The owner permits deferred macOS/Windows qualification, **not** missing Linux
or Kubernetes-version evidence. Documents 01–09 must be done on Linux and the
owner review recorded before the [M2 entry gate](../milestone-2-flash.md#1-authority-objective-and-entry-gate)
is met. Document 10 remains deferred, not passed. Preparing F10 tooling while a
prerequisite is blocked does not authorize closing F10 or starting M2.0.

## 2. Current state and evidence

| Boundary        | Current state                                                                                                       | Remaining work                                                                                            |
| --------------- | ------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F0/F1/F2        | Closed/accepted under recorded owner decisions                                                                      | Preserve; do not reimplement or reopen owner decisions                                                    |
| F3/F4           | Accepted Linux list/watch implementation, native and disposable Kubernetes 1.36 evidence                            | Refresh affected evidence after relevant corrections; F5 remains separate                                 |
| F1a/document 01 | Deterministic stall detection and Part A harness exist                                                              | Part B: all eight live cases, measured outcomes, cleanup and host restoration                             |
| F5/document 04  | Not started; existing 1.36 list/watch evidence is not the full matrix                                               | Pinned 1.35/1.37 fixtures plus the complete 1.36 harness cases                                            |
| F6/document 05  | Accepted on Linux 2026-10-25: S1 at `812c4fb`, P2 corrections at `cac672b`, final corrective evidence in the ledger | Preserve as attributed evidence; C6 rows for F7 wrappers, installed packages and deferred WebViews remain |
| F7/document 06  | Not started                                                                                                         | Synthetic bounded terminal/chart feasibility, including native evidence                                   |
| F8/document 07  | Inventory/advisory machinery exists; C7 not fully complete                                                          | Generated/packaged notices, drift enforcement, refreshed security/applicability                           |
| F9/document 08  | Linux package qualification not done                                                                                | Revision-based artifacts and clean Ubuntu/Fedora installed-runtime evidence                               |
| F10/document 09 | No measured budgets/harness or final acceptance                                                                     | Measurements, enforced budgets, final review, owner review                                                |
| Document 10     | Deferred by owner; no macOS/Windows hardware                                                                        | Revisit only when resources are explicitly available                                                      |
| M2.0            | Not started; entry gate unmet                                                                                       | Inventory accepted foundation and create milestone 2 evidence ledger after Linux close                    |

### Fresh review evidence at `889157f`

- `pnpm check:ci` passed on Linux with Node 26.12.1 and pnpm 12.15.0:
  191 tests/26 files, zero Svelte errors/warnings, 75.54% statement and 78.14%
  branch coverage, production frontend build. Vite warned about the large lazy
  Monaco chunk; that is an observation, not an established performance budget.
- `pnpm test:e2e`, first run: **14 passed, 2 failed**. Menu keyboard selection
  failed at `tests/e2e/appearance.spec.ts:132`; editor reset timed out at
  `tests/e2e/editor.spec.ts:120` after 120 seconds.
- Same command, second run without source edits: **15 passed, 1 failed**.
  Editor passed; menu focus failed at `appearance.spec.ts:127`.
- First-run traces showed an unexpected same-URL navigation/reload and reset
  application state. The cause is **not established**. Investigate Vite's lazy
  dependency loading and the menu focus path; do not call it only slow Monaco.
- Hosted head Foundation [39889189946](https://github.com/agiledevel/talos-pilot/actions/runs/39889189946)
  and Security [39889189929](https://github.com/agiledevel/talos-pilot/actions/runs/39889189929)
  are green. Desktop was skipped; renderer/CodeQL reuse of unchanged evidence
  is not a fresh full execution and does not supersede local failures.
- Rust/Go suites, native Tauri, real clusters, installer smoke, current advisory
  scans and performance measurements were **not rerun in this review**.
  The earlier [F6 evidence](../../verification/f6-editor-workers-csp.md) stays
  attributed to its revision/environment, not relabeled as a fresh pass.

### Source finding F6-B1: editor bounds

`src/lib/state/yamlEditorSession.svelte.ts` creates/replaces a Monaco model
and sends `model.getValue()` to the worker before
`src/features/editor/yamlAnalysis.ts` applies its 64 KiB parser bound.
`yamlDiffSession.svelte.ts` similarly accepts unrestricted model strings.
Debouncing is not an in-flight/queued-byte limit. This is a source finding,
not a measured crash or credential exposure; inputs are currently synthetic.
Resolve it before reusing these wrappers with real documents.

## 3. Session protocol and safety

1. Check the actual branch/revision/tree; preserve unrelated changes. Read
   `gh pr checks 2` and completed run details once at entry; record evidence
   reuse versus fresh execution. Do useful independent work while checks run.
2. Reuse the checked-in toolchain bootstrap/private installs; verify pins before
   gates. Read the mandatory skills for every changed domain. Research new
   dependencies/APIs from primary sources only when the packet needs them.
3. Work one step below, or one coherent numbered subpart, per checkpoint.
   Before code, record acceptance cases, affected contracts, resource ownership,
   bounds, failure paths, and final evidence needed. Update the ledger row.
4. Run narrow tests while iterating; run final applicable aggregates once after
   corrections. Use `pnpm check:ci` rather than repeating equivalent unit suites.
   Preserve types, assertions, accessibility checks, CSP and capability limits.
5. Review the final diff separately. Append exact commands/results, revision,
   environment, evidence class, run URLs, limitations and next action to the
   ledger. Commit coherent code/docs/evidence together under standing branch
   permissions; never merge/edit PR 2, force-push, tag, release or push to main.
6. Do not race Cargo/native builds or frontend outputs. Native tests overwrite
   the release executable: native evidence first, then `pnpm desktop:build`,
   `pnpm production:check`, and linked-artifact advisory checks as applicable.
7. Use only allowlisted disposable fixtures, explicit credentials and the
   existing empty `TALOSCONFIG` guard. Never inspect/use the owner's clusters,
   existing containers or `Win11 Jump` VM as implicit fixtures. Apply only
   recorded fixture-scoped host remediation; restore on success and failure.
   Clean Linux package VMs use QEMU user-mode networking, not host network edits.
8. An unavailable resource blocks its acceptance row, not independent work.
   Record it; do not substitute mocks or widen an allowlist after dispatch.
   Keep post-merge native/cache workflow entry points and owner-authorized
   release rehearsal in their carried rows. Local Linux native evidence is
   allowed; it does not establish other platforms or those hosted entry points.

## 4. Execution steps

### S0 — Reproduce and fix browser instability (document 05 follow-up)

**Disposition, 2026-10-25:** accepted with the owner's [bounded native keyboard
exception](../../verification/s0-native-keyboard-acceptance.md), not an explained
or fixed B11. The original strict exit below is retained as historical context;
the explicit owner decision supersedes its historical-cause requirement only.
Do not repeat this investigation without actionable recurrence. Continue at S1.

**Read:** `playwright.config.ts`, `vite.config.ts`, `tests/e2e/appearance.spec.ts`,
`tests/e2e/editor.spec.ts`, `src/components/ui/MenuBar.svelte`, shell state,
editor lazy-load state, and the latest ledger failures. Apply Svelte,
TypeScript and tooling skills, and Tauri guidance if native behavior changes.

1. Capture traces, page navigations, page errors and Vite/dependency-optimizer
   output before changing code. Preserve failing artifacts outside committed
   source; subsequent Playwright runs overwrite `test-results`.
2. Reproduce both from a cold **project-local frontend dependency cache** and
   with the cache warm. Record the reset method and worker count. Do not clear
   shared toolchain/Cargo caches or change dependency pins to manufacture a fix.
3. Establish whether reloads cause state loss and whether menu focus also fails
   without a reload. Fix the proven cause(s); test the real keyboard behavior.
   Do not hide a failure with sleeps, retries, focus forcing, removed assertions,
   broader timeouts, or a silent reduction in test concurrency.
4. Add regression evidence for the cause. If serving a production build or
   prebundling changes the harness, keep mock-transport isolation, lazy-load
   assertions, worker paths, CSP negative tests and offline claims accurate.
5. Run `pnpm check:ci`, `pnpm test:e2e` and a bounded repeated run using
   `pnpm exec playwright test --workers=2 --repeat-each=2`. Demonstrate cold and
   warm behavior, and the normal configured concurrency. Record failures too.

**Exit:** original failures have explained causes and regression coverage;
all required browser flows pass on the corrected tree. Run native/build gates
when changed application behavior or worker/build configuration requires them.
Do not close document 05 until S1 is also accepted.

### S1 — Bound editor/diff input and validation work (document 05 follow-up)

**Plan status, 2026-10-25: DONE. S1-P2-1/2/3 and document 05 are accepted on
Linux.** The initial UTF-8 admission and bounded queue implementation at
`812c4fb`, the three P2 corrections at `cac672b` and their final review, gates
and hosted acceptance are recorded in [F6 evidence](../../verification/f6-editor-workers-csp.md)
and the [ledger](ledger.md). The [launch prompt](s1-launch-prompt.md) is
historical and must not be re-run. S0's owner exception/B11 are unchanged.

#### Corrective acceptance cases

1. **S1-P2-1 — preserve the owning draft:** a rejected controlled replacement must
   not overwrite the last accepted draft, including accepted user edits. Closing
   and normally reopening returns that draft, with a real editor and no rejection
   alert. Keep a synthetic oversized _intent_, generating text synchronously at
   the editor admission boundary, rather than retaining the rejected payload in
   owner state. Cover intent recovery/reset/close deterministically, accepted
   user edits in Chromium, and close/reopen in the native application.
2. **S1-P2-2 — restore inline diagnostics:** rejected edits use `model.setValue`,
   which clears decorations as well as undo history. Restore the accepted
   document's inline markers without resubmitting validation, posting rejected
   text, changing the validation phase or publishing another diagnostic result.
   Assert a rendered squiggle before and after the browser-dispatched paste;
   checking only diagnostic text or marker-service entries is insufficient.
3. **S1-P2-3 — release rejected initial text:** retain only callbacks, labels and
   non-document options in sessions; store document text only after admission.
   Remove component mount-time copies. Exercise rejected editor/diff options,
   bounded recovery, live-session weak references to collected source options,
   and cleanup. A GC probe establishes options ownership, not a performance or
   whole-heap memory budget; review the absence of other rejected-text fields.

All existing S1 byte/queue/initial-recovery/CSP/lazy/offline/cleanup acceptance
cases below remain required. Run the applicable final gates in document 05,
including actual native verification and the ordered ordinary production
rebuild/exclusion/advisory checks. Preserve earlier evidence as historical, not
as a fresh result for changed code. These were the corrective acceptance gates;
acceptance is now complete as recorded above, including the subsequent
normalized-model bounds fix merged via PR #3. Do not reopen S1 from this
historical checklist.

**Read:** editor/diff session modules, components, worker protocol/parser,
[decision 0019](../../decisions/0019-offline-yaml-editor-worker.md), existing
editor tests and the resource-bound rules in quality.md.

1. Define and document model/document byte ceilings at initial mount,
   controlled replacement and user editing/paste. Begin with the existing
   64 KiB contract; bound both diff sides. Reject oversize input visibly and
   preserve a usable prior accepted document; never truncate silently.
2. Check size before worker transfer, with an allocation-conscious byte check.
   Bound validation to one in-flight request plus at most one coalesced latest
   bounded document. State timeout, worker error/restart and disposal semantics.
   Ignore stale results, including a response to an edit made before debounce
   dispatch; a stale diagnostic must not appear current for new text.
3. Cover exact/over-limit ASCII and multibyte text, initial/replaced/pasted
   documents, diff sides, a stalled worker, rapid edits, out-of-order responses,
   worker failure, timeout and close. Observe cleanup, not just callback calls.
4. Update the contract/ADR and F6 evidence. Run renderer/browser gates and actual
   native worker/CSP/cleanup evidence, then rebuild ordinary production and run
   exclusion checks. Refresh other affected boundary gates.

**Exit:** F6-B1 and S1-P2-1/2/3 have final corrective-revision evidence; S0's
existing owner exception is preserved. Document 05 was marked done only after
the applicable local/native/hosted gates and a separate review, with a ledger
acceptance entry that preserves earlier results. **Corrective acceptance
complete on 2026-10-25; F7 may start in a later task and is not part of this
launch.**

### S2 — F7 synthetic terminal and chart feasibility

**Implemented, but S2-R1/S2-R2 remain open; S3 is not ready on merge alone.**
The [review](../../verification/s2-review-s3-readiness.md) supersedes the
implementation handoff below for acceptance and hosted status. Fix the chart
resize race, reconcile final-artifact attribution and requalify before closing
F7. PR #4 Foundation/Security passed for `114fbdb`.

Historical implementation handoff: S2-A–D were completed on `docs/s2-flash-readiness` and [document
06](06-f7-terminal-chart.md) records the pins, admission/replay/chart contracts
and checkpoint order; the [F7 evidence
record](../../verification/f7-terminal-chart.md) records every F7-01–F7-08
outcome, the selected bounds, deterministic/browser/native/X11 evidence and the
pending hosted result. S1 and its normalized-model bounds correction are
accepted on Linux and merged via PR #3. To close S2, the owner must authorize a
branch push and a pull request (branch pushes alone start no Foundation/Security
runs), then a session reads those exact results and records acceptance; do not
start S3 before that.

The packet specifies independent lazy Home surfaces, synchronous snapshot
admission, ownership, appearance/resize/disposal races, keyboard/accessibility
and actual native offline/CSP evidence. Starting bounds: terminal **1,048,576
UTF-8 bytes and 10,000 logical lines**, whichever first; chart **8 value series
× 2,000 aligned samples**. Verify each limit and one beyond. The terminal is
read-only plain text, with bounded callback-paced replay; a ninth chart series
is rejected visibly, while an extra sample evicts the oldest aligned row.
No process/socket, exec, metrics, API logs or forwarding integration.

**Exit:** F7-01–08 and applicable final gates pass on the final relevant tree;
selected geometry/data/queue bounds and evidence classes are recorded. Until
then F7 remains in progress/blocked, not accepted. C6 stays open for
installed-package/deferred-platform rows. Stop before S3 in this launch.

### S3 — F8 notices, dependencies and security

Execute [document 07](07-f8-dependencies-notices-security.md). Generate notices
from dependency sources, enforce drift with a demonstrated failure/pass, package
them, review licenses and refresh inventory/advisory evidence for the final
set. Repeat each exception's dependency-path, linked-code and upstream-fix
assessment before renewing/removing it. Do not auto-renew or widen exceptions.

**Date override:** at or after **2026-11-15**, handle the two Trivy exceptions
before continuing another lengthy packet; hard expiry is **2026-11-30**.

**Exit:** document 07 accepted, including notice presence and fresh security or
properly labelled compatible reused evidence under decision 0018. Per-platform
final-artifact inspection remains assigned to F9; do not call C7 globally done.

### S4 — F9 Linux installer and vault qualification

Execute [document 08](08-f9-linux-packages.md). Build the same release-config
artifacts for a chosen revision without a tag/release, reusing packaging steps.
Read hosted results and download reference Linux artifacts. Qualify AppImage on
clean Ubuntu 22.04/current Fedora, DEB on Ubuntu and RPM on Fedora, with pinned
image digests and package hashes.

Include installed helper paths without global CLIs, vault available/locked/
unavailable and encrypted restart, offline editor/terminal/chart, failure cases,
crash/active-stream shutdown cleanup, reinstall/uninstall data behavior, notices,
artifact scans and production test-surface exclusion.

**Exit:** every required Linux package row has actual evidence; missing artifact
access or a failed smoke blocks acceptance, not just a sentence in the ledger.
macOS/Windows remain explicitly deferred.

### S5 — Fixture path: F1a and F5 (take as soon as a window is prepared)

This path may be interleaved with S2–S4 per owner Q11. Use a separate session
with exclusive fixture ownership; do not run simultaneous host remediation or
mutations against one fixture. It must finish before Linux close.

1. Execute [document 01 Part B](01-f1a-live-stall-rows.md): all eight live cases,
   including stale/exhaustion, recovery, idle healthy stream and measured reboot
   outcome; resume guests and restore the host on every exit. Keep the existing
   retry policy. Confirm/refute the ledger's live assumptions, not just output
   a success summary.
2. Execute [document 04](04-f5-kubernetes-version-fixtures.md), splitting 04a
   (pinned kind 1.35/1.37) and 04b (Talos-hosted 1.36/final matrix) if helpful.
   Define each manifest/allowlist before use. Preserve wrong identity/version/
   manifest rejection, restricted identities and cleanup after partial failure.
   Use the explicit fixture tier or recorded local harness per owner decisions.
3. Resolve the carried wrong-server-version regression and remove ineffective
   synthetic fixture assertions assigned to this path. Recheck primary-source
   versions; the recorded newer Talos 1.14.4 observation is dated, not a current
   release claim. Any refresh moves helper module, CLI, image and manifest
   together with live requalification. Never silently mix versions.

**Exit:** documents 01 and 04 done; real read/watch/cancel/reconnect cases on
1.35/1.36/1.37; exact cleanup/restoration evidence. A missing version stays open.

### S6 — F10 measurements, budgets and final technical review

Execute [document 09 Parts A/B and technical Part C](09-f10-budgets-and-linux-close.md).
Require S0–S5 accepted before final close. Preliminary measurement preparation
may happen earlier but must not bypass prerequisites.

- Measure the 20-profile/3-cluster/100-node/10,000-object workload, marking
  unimplemented features synthetic. Record hardware, OS/WebView/display,
  revisions, repeated distributions and sampling method. Separate native startup/
  IPC, real Talos, real Kubernetes watch and synthetic renderer results.
- Preserve the Talos 256-event cap; use Kubernetes watch for sustained growth.
- Derive numeric budgets from measurements, wire a real failure-propagating
  check into CI, demonstrate deliberate overrun failure, remove it and pass.
- Reconcile every original C/FND acceptance row with current evidence. Run
  final applicable deterministic/native/fixture/package/security gates; review
  the series diff separately for security, correctness, cleanup, maintainability
  and missing failure paths. Refresh affected artifacts after code corrections.
- Write `docs/verification/foundation-owner-review.md`: candidate revision,
  concise UX walkthrough, what works/rough edges, tradeoffs, measurements,
  supported Linux environments, deferred/unexecuted rows and precise decisions
  requested. Link evidence rather than copy raw logs or credentials.

**Exit:** technically review-ready candidate with no unexplained Linux gate
failure. Document 09 stays **in progress**; do not mark Linux accepted or the
M2 entry gate met before S7.

### S7 — Owner review, resolution and Linux close (human gate)

Present the review document to the owner and request an explicit outcome using
the available user-question mechanism. Do not invent approval from silence,
previous scope decisions or a green build. Stop here if the owner is unavailable.

Record date, reviewed candidate revision, requested changes, decisions and any
conditions in the review document and ledger. Resolve requested changes and
rerun affected gates; return material UX/tradeoff changes for review. A scope,
security-boundary or target change needs the owner-directed design/ADR record.

**Close only when:** S0–S6 and documents 01–08 have their Linux evidence, the
final review is resolved, and the owner's review outcome permits acceptance.
Mark document 09 done, update milestone checkpoints, README and the M2 entry
gate together with the evidence/decision links. Say **foundation complete on
Linux; milestone 1 open for deferred macOS/Windows rows**. Never imply v1 is
complete. Any remaining non-deferred required row keeps the gate unmet unless
the owner explicitly changes the acceptance decision and its consequences.

### S8 — Execute M2.0 only, then hand off

Read [M2.0](../milestone-2-flash.md#m20--accept-the-foundation-handoff-and-establish-the-evidence-ledger)
and execute its existing steps after S7. Do not redesign them here.

- Verify the real current tree and Linux entry gate, including owner review.
- Create `docs/verification/milestone-2.md` with packet IDs/criteria,
  base revision, pins, environments and pending evidence rows. Do not prefill
  future feature passes.
- Inventory actual accepted storage/profile handles, Kubernetes session/list/
  watch and acknowledged-delivery APIs, Talos scheduling limits, editor/terminal/
  chart ownership, performance commands/budgets and package/platform results.
  Identify extensions versus replacements; preserve the deferred R3 contract.
- Run M2.0's frozen/locked baseline gates and correct newly found defects before
  dependent work. Recheck upstream Talos/Kubernetes patches and security expiry
  dates with primary sources. Coordinate any required pin refresh and live
  requalification; unavailable evidence keeps M2.0 open.
- Record limitations and legacy 1.33/1.34 release rows. Review the final diff,
  update ledgers and README to reflect the actual state, and hand off M2.1 with
  its prerequisites and exact next action. **Do not implement M2.1.**

## 5. Gate selection and completion record

Use canonical commands in [quality.md section 3](../../quality.md#3-required-command-contracts)
and packet-specific gates; new notice/performance/package commands must be real
implemented harnesses, not invented command names or always-passing stubs.

For each checkpoint record: base/final source revision; changed files/contracts;
acceptance case → command/result/environment; deterministic versus browser mock,
native, fixture, installed-package and synthetic performance class; hosted run
URLs and scope reuse; cleanup observations; failed/unexecuted rows with reason;
separate diff-review findings; owner decisions and next smallest step. Reuse
unchanged valid evidence only under existing policy; a green cache/reused job
is not a new execution. A ledger-only result follow-up gets no result-only loop.

## 6. Launch prompt

> Read AGENTS.md, docs/design.md, docs/quality.md, docs/flash-pace.md,
> docs/plans/foundation-finish/README.md, its ledger, and
> docs/plans/foundation-finish/follow-up-to-m2.md. Inspect the actual current
> revision and evidence. Execute the next unaccepted step only, starting at S0
> unless a later ledger entry closes it. State acceptance cases before code;
> read the relevant skills; preserve architecture, scope, retry/CSP/security
> boundaries and unrelated changes. Run applicable final-tree gates and review
> the diff separately. Record exact results and limitations in the ledger.
> Do not jump past missing Linux/fixture evidence or the S7 owner review.
> Stop after the step's handoff; the overall plan ends after M2.0, not M2.1.
