# S1 launch prompt: corrective implementation and acceptance

Status: **EXECUTED — closed 2026-10-25; do not re-run.** This prompt replaced the
historical pre-implementation prompt and was consumed by the S1 corrective
acceptance. The corrections are at `cac672b` on **`ft-editor-bounds`**, and the
outcome — S1-P2-1/2/3 resolved, document 05 accepted and done on Linux — is in
the [ledger](ledger.md) and [F6 evidence](../../verification/f6-editor-workers-csp.md).
PR [#3](https://github.com/agiledevel/talos-pilot/pull/3) targets main and
remains owner-controlled and unmerged.

Read the rest as the record of that corrective step, not as a current task: its
acceptance conditions were satisfied before S1/document 05 was recorded. The
next step is [document 06](06-f7-terminal-chart.md) (S2/F7) in a later task.

## Copy-paste task prompt

```text
Finish S1 corrective implementation and acceptance for Talos Pilot's document 05.
The original S1 implementation is present; DO NOT start it again from scratch.
Review/preserve the prepared P2 fixes, complete any missing correction or gate,
then carry the final tree through separate review, coherent commit/push and
hosted results. Stop after S1/document 05 is accepted or at a recorded blocker.
Do not implement F7/S2, fixtures, packages, budgets or milestone 2 features.

WORKSPACE / AUTHORITY
- Repository: /developer/ifjkt/talos-pilot. Existing branch: ft-editor-bounds.
  Base main checkpoint: ef2279d. Initial S1: 812c4fb; ledger follow-up: ac6799a.
  The current tree may contain the prepared corrective code/tests/docs, either
  uncommitted or in later commits. Inspect status/log/diff before doing anything.
  Preserve all prepared and unrelated owner work; no reset/clean/automatic stash.
- Use existing PR #3 (ft-editor-bounds -> main). Commit/push coherent scoped work
  only to this branch. Never merge, close or retarget a PR, push main, force-push,
  tag, release, rewrite the baseline or change owner-controlled PR metadata.
- Read AGENTS.md, docs/design.md, docs/quality.md, docs/flash-pace.md and relevant
  Svelte/TypeScript/Tauri skills/references. Read foundation-finish/README.md,
  the ledger's current status/latest entries, document 05, the S1 corrective
  section of follow-up-to-m2.md, F6 evidence and decision 0019.
- S0 is already accepted ONLY under the owner's native-keyboard/B11 exception.
  B11 is unresolved/not fixed. Retain assertions and diagnostics; do not resume
  menu stress campaigns or invent focus fixes. Investigate only a new actionable
  recurrence with bounded evidence. No permission to touch owner services,
  clusters, credentials, desktop, network/firewall or VM is implied.
- Read branch-head hosted results once, distinguishing fresh executions from
  reused evidence. Verify/reuse the pinned private toolchain with bootstrap.
  Do not refresh dependencies or reinstall tools without a demonstrated need.

THREE REQUIRED P2 CORRECTIONS
1. S1-P2-1: rejected replacement must not overwrite the owning accepted draft.
   Reproduction on old code: open -> edit a valid sample -> Try oversized
   replacement -> Close editor -> Open YAML editor. Old code reopened with a
   rejection and no editor, because owner state retained the rejected payload.
   Prepared approach: owner stores accepted text plus an oversized intent;
   readValue generates the proposed text synchronously at admission. Close
   drops the intent, not accepted text. Preserve accepted user edits, initial
   rejection/recovery, reset/correction and normal lazy cleanup. Cover the
   owner's transitions, browser user edits across close/reopen and native reopen.
2. S1-P2-2: a rejected paste must preserve the rendered inline diagnostic.
   Monaco model.setValue clears decorations as well as undo history. Prepared
   approach: reapply accepted diagnostic markers after the revert, without
   resubmitting analysis, sending rejected text or changing validation state.
   Assert an actual rendered squiggly-error before/after the browser-dispatched
   EditContext paste. Diagnostic message or getModelMarkers alone misses this.
   Preserve the deliberate undo-history consequence in decision 0019.
3. S1-P2-3: rejected initial text must not remain in retained options/initial
   component copies. Sessions must keep only non-document options and admitted
   text. Prepared tests use real compiled editor/diff sessions, reject initial
   options, recover with bounded documents and request Chromium GC while the
   sessions stay alive; WeakRefs to the source options must clear. This proves
   options ownership, not a whole-heap or performance budget. Separately review
   all retained fields and component initialization for rejected-text copies.

KEEP THE EXISTING CONTRACT
- 65,536 UTF-8 bytes, with allocation-conscious measurement and matching
  TextEncoder surrogate semantics. Admission before createModel, programmatic
  setValue, both diff-side replacements and YAML worker transfer. User mutations
  are synchronously reverted in the content event if rejected; never truncate.
- One debounce timer, one in-flight request and one coalesced latest bounded
  document; request/version correlation; immediate pending/marker invalidation;
  stale/duplicate/out-of-order replies ignored. Five-second timeout/error ends
  the worker, drops queued work and does not auto-retry; a new accepted document
  change may lazily start a new worker. Disposal releases all ownership/timers.
- Preserve atomic diff admission, rejected-initial no-model recovery, benign
  synthetic content, visible target, accessibility, lazy bundled offline assets,
  unchanged restrictive CSP, same-origin workers and no remote schemas. No new
  test-only IPC/capability, credential boundary, dependency or cluster operation.
- Keep business/state logic in typed cohesive modules, not Svelte wrappers.
  readValue is a synchronous controlled reader, not a cached oversized payload.

FINAL VERIFICATION / HANDOFF
- Read the latest ledger evidence first. Do not blindly duplicate applicable
  final-tree gates already executed by the preparatory session when source is
  unchanged; rerun affected gates after any code/test correction. Never label
  compilation, mocks, an ancestor run or a skipped job as current native proof.
- Required final renderer gates: pnpm check:ci and normal pnpm test:e2e. Keep
  all existing theme/density/viewport/axe/CSP/lazy/cleanup assertions and normal
  concurrency. Do not weaken gates, add sleeps/retries or rerun passing stress
  campaigns. Use narrow tests while iterating, then one final aggregate.
- Run/verify actual Linux pnpm test:native under private Xvfb and XDG dirs,
  cleaning owned app/helper/display/server resources on success and failure.
  The native editor spec includes rejected replacement -> close -> normal
  reopen, plus retained document 05 worker diagnostic/diff/CSP/offline/cleanup
  rows. Browser GC/paste evidence is NOT trusted OS paste or native memory proof.
- Native tests overwrite the release executable. Afterwards run IN ORDER:
  pnpm desktop:build, pnpm production:check, pnpm advisories:check. Do not race
  dist or src-tauri/target with other builds. Run other boundary gates only as
  applicable; record unchanged Rust/Go/IPC/dependency inputs truthfully.
- Update decision 0019/F6 evidence and current README/packet/plan/milestone/ledger
  statuses consistently. Preserve earlier attributed failures/passes. Validate
  local document links, formatting and git diff --check; separately review the
  final diff for correctness, ownership, security and missing failure paths.
- Commit/push prepared work plus any fixes coherently to ft-editor-bounds and
  inspect the final relevant Foundation/Security hosted results on PR #3.
  Fresh desktop CI builds do not qualify other-platform native runtimes. Use at
  most one ledger-only hosted-result follow-up; no result-commit loop.
- Only after all applicable final evidence and separate review, record S1-P2-1,
  S1-P2-2 and S1-P2-3 resolved and S1/document 05 accepted/done on Linux. Otherwise
  leave acceptance in progress with the exact missing/failed gate and next step.
  C6/M1, installed packages, deferred WebViews and later owner review stay open.
- Final report: changes, branch/commit/PR, actual commands/environments/results,
  hosted URLs/fresh versus reused evidence, cleanup, limitations and explicit
  disposition. Name S2/document 06/F7 as the later next step; DO NOT start it.
  The owner alone decides whether to merge PR #3.
```
