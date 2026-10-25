# S1 launch prompt: bounded editor/diff documents and validation

Prepared 2026-10-25 after S0 checkpoint `b0988db`. Proposed branch:
**`ft-editor-bounds`**, created from updated `main` after the owner merges the
foundation checkpoint. This is not permission for an agent to merge that branch
or a claim that Linux foundation qualification is complete.

At preparation time the working tree also contains pre-existing documentation
edits and the untracked `follow-up-to-m2.md`. Preserve them deliberately before
switching branches; a merge does not carry uncommitted files to another
clone/worktree. The saved prompt should travel with the merged checkpoint and
repeats S1's acceptance criteria so it remains usable if the other working-tree
planning files have not been committed.

## Copy-paste task prompt

```text
Implement S1 of Talos Pilot's foundation follow-up completely: resolve F6-B1
editor/diff input and validation-work bounds, and re-establish document 05
acceptance. Work autonomously through implementation, failure-path tests, actual
native verification, documentation, separate review, commits and CI. Do not stop
after planning, scaffolding or browser mocks. Stop after S1/document 05 is
accepted, or at a genuine recorded blocker. Do not implement F7, fixtures,
packages, performance work or milestone 2 features.

REPOSITORY, BRANCH AND BASELINE
- Repository: /developer/ifjkt/talos-pilot.
- Work/push branch: ft-editor-bounds. Start from updated main AFTER the owner
  merges the foundation checkpoint containing b0988db's changes. Verify content
  rather than requiring that SHA as an ancestor if the merge was squashed.
  If this prerequisite is absent, report it; never merge the owner's PR yourself.
- Inspect status before switching/creating the branch. Preserve unrelated work,
  especially existing documentation edits and untracked planning files. Do not
  reset, clean, overwrite or automatically stash them. Do not accidentally
  include unrelated owner edits in an implementation checkpoint.
- Commit and push coherent work only to ft-editor-bounds. Open a separate S1 PR
  targeting main if needed for hosted checks; do not edit the foundation PR or
  merge any PR. No main push, force-push, tag or release.
- S0 is ALREADY accepted by explicit owner exception after a real Linux native
  keyboard pass. Read docs/verification/s0-native-keyboard-acceptance.md. B11 is
  unresolved/not fixed. Retain browser assertions, lifecycle/input diagnostics
  and hosted failure artifacts. Do not reopen S0 merely because its historical
  cause is unexplained, or resume repeated menu stress campaigns. A new
  actionable recurrence gets bounded evidence-led investigation, not guessed
  focus fixes, retries, forced focus, sleeps or relaxed timeouts/assertions.

AUTHORITIES AND STARTUP
1. Read AGENTS.md, docs/design.md, docs/quality.md, docs/flash-pace.md, the
   foundation-finish README and the ledger's current status/decisions/latest
   entries. Read document 05 completely, its F6 evidence and decision 0019.
   Read S1 in follow-up-to-m2.md if that planning file is present. Do not reuse
   the historical Session B prompt to reinstall/reimplement Monaco.
2. Read relevant project Svelte/TypeScript/Tauri skills, Svelte lifecycle/runes
   references and tooling guidance; Rust guidance before any Rust change.
3. Inspect yamlEditorSession.svelte.ts, yamlDiffSession.svelte.ts, editor
   components/state, yamlAnalysis.ts and the actual worker implementation,
   ownership counters, existing unit/browser/native tests and build/CSP setup.
   The parser's 64 KiB rejection currently happens after model creation/full
   worker transfer; debounce alone does not bound queued work or stale results.
4. Check current hosted baseline results once and record exact revisions and
   reuse versus fresh execution. Use the new branch/PR, not hard-coded PR 2.
   Reuse/verify pinned private tools with the repository bootstrap. Do not
   reinstall tools or refresh dependency pins without a demonstrated need.
5. Before code, record acceptance cases, affected contracts, ownership, byte
   limits, state transitions, failure/timeout semantics and final gates in the
   ledger. Keep document 05 in progress until all required evidence exists.

REQUIRED IMPLEMENTATION AND ACCEPTANCE
- Use the existing 64 KiB contract as an explicit UTF-8 BYTE ceiling, not a
  character count. Bound initial and replacement documents, user edits/paste,
  and both diff sides. Cover other mutation routes such as undo/redo where
  applicable. Reject oversize input visibly, preserve a usable prior accepted
  document, never truncate silently, and prevent unbounded model retention.
  Define usable behavior for rejected initial input when no prior model exists.
- Validate before creating/replacing models and before worker transfer, using
  an allocation-conscious size check. Keep worker-boundary runtime validation
  as defense in depth; parser-only rejection is insufficient.
- Bound analysis to ONE in-flight request and at most ONE coalesced latest
  bounded document. Debouncing must not leave an unbounded message/task queue.
  Document cancellation, response correlation, worker failure/restart, timeout
  and disposal. Keep retries/restarts bounded; do not add speculative machinery.
- Invalidate stale diagnostics on document change, including the window BEFORE
  the next debounce dispatch. Old/out-of-order responses cannot look current
  for newer text. Disposal must prevent late publication and release resources.
- Add observable regression tests for exact/over-limit ASCII and multibyte
  inputs; initial, replaced, edited/pasted documents; each diff side; rapid edits,
  stalled workers, stale/out-of-order replies, worker errors, timeout and close.
  Prove bounded dispatched/pending work and actual cleanup, not only that a
  cleanup callback or terminate spy was called. Preserve strict types and
  accessibility; keep logic in cohesive services/state, not component wrappers.
- Keep benign synthetic data, lazy loading, bundled same-origin offline workers,
  target context, appearance behavior and restrictive CSP. No remote schemas,
  blob:/unsafe-eval/remote executable sources, credentials or cluster operations.
- Update the contract/decision 0019 as appropriate, F6 evidence, current status
  documents and ledger in the same change. Preserve attributed historical
  failures and native passes. Do not claim B11 fixed or all of C6/M1 complete.

VERIFICATION AND FINISH
- Follow FLASH pace: narrow tests while iterating, disjoint delegated ownership
  when useful, useful review/docs work during CI. Do not race builds against
  shared dist or src-tauri/target. Run final pnpm check:ci and normal pnpm
  test:e2e; do not immediately duplicate the unchanged aggregate with check,
  test:run and test:coverage. Preserve the packet's theme/density/viewport/axe
  requirements and production lazy-loading guard.
- Extend/run tests/native/editor-worker.spec.ts as needed and run the actual
  Linux Tauri native suite. Fresh native evidence must establish changed bounds
  and failure/cleanup behavior plus document 05's real worker diagnostics, diff,
  offline/lazy assets, CSP denial, zero remote requests and model/worker/listener
  return to baseline. Browser mocks and compilation do not satisfy these rows.
  Use private Xvfb/XDG directories; clean owned processes/displays on failure
  and success. Do not touch the owner's desktop, network, clusters or services.
- Native tests overwrite the release executable. Afterwards run, IN ORDER,
  pnpm desktop:build, pnpm production:check and pnpm advisories:check. Run other
  affected Rust/Go/contracts/inventory/dependency gates required by quality.md;
  record why an unchanged boundary was not rerun. No installed-package or
  macOS/Windows qualification claim from a Linux development WebView pass.
- Review the final diff separately for correctness, security, maintainability,
  contract consistency and missing failure paths. Validate documentation links,
  formatting and diff whitespace. Never weaken gates to obtain green results.
- Push coherent checkpoints, inspect final relevant hosted results, fix actual
  findings, and distinguish fresh versus unchanged-input evidence. A push alone
  does not trigger this repository's PR CI without a PR; arrange the S1 PR or
  report that evidence as pending. Avoid ledger-only result-commit loops.
- Mark document 05 done only when F6-B1 and all applicable acceptance/gate rows
  are satisfied, recording S0's existing owner exception unchanged. If a required
  gate cannot run or fails, leave the packet incomplete/unverified with exact
  reason and next action; do not silently accept it.
- Final handoff: branch/commit/PR, behavior and bounds, commands/environments/
  results and hosted URLs, native versus browser evidence, cleanup, remaining
  risks, and explicit S1/document 05 disposition. Keep C6 in progress for later
  package/platform work. Name document 06/F7 as next; DO NOT start it. The owner
  alone decides whether to merge this S1 PR.
```
