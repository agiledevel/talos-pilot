# FLASH worker pace: short feedback, complete evidence

These instructions apply to every implementing session. They complement, never relax, [AGENTS.md](../AGENTS.md), [quality.md](quality.md), the active packet and its ledger. The CI policy is [decision 0018](decisions/0018-ci-feedback-and-cache-budgets.md).

## Start once, then work in checkpoints

1. Read the branch-head hosted results once at session start (`gh pr checks 2` and `gh run view <id>`). Record failures or in-progress results; do not repeatedly poll while another useful task is available.
2. Verify the pinned toolchain with the bootstrap and reuse its private installation. Do not redownload/install tools or refresh dependency pins without a packet need or an observed failure. Never use ambient cluster credentials.
3. Write the packet's acceptance cases and affected boundaries before code. Decide which deterministic, native, fixture and package evidence the final revision needs. Read the relevant skills, existing contracts and tests; avoid rereading unrelated historical logs.
4. Make one small coherent increment. Run the narrow relevant tests while iterating, plus lint/types for touched code. Fix the first actionable failure before paying for another broad run. Do not weaken checks or assertions.
5. Before a checkpoint push, format and run `git diff --check`. Push coherent tested checkpoints, not every edit, dependency experiment or progress-note sentence. Checkpointing does not mean withholding a safety fix or combining unrelated packets.

## Use each gate once for the state it verifies

For the final renderer tree, run `pnpm check:ci` (format, lint/types, Svelte diagnostics, unit tests **with coverage**, and production build) and `pnpm test:e2e`. This satisfies the same renderer aggregate as `pnpm check`; do not immediately rerun `pnpm check`, `pnpm test:run` and `pnpm test:coverage` over unchanged inputs just to repeat it. Rerun affected checks after any source correction. The packet's additional gates still apply.

Keep default and `native-test` Rust Clippy/test configurations, Go race checks, contract generation, inventory/advisory checks and affected production builds where required. Do not replace a platform-sensitive check with a Linux result. Use the same checked-in commands locally and in CI.

CI owns its scope decision. Do not add skip labels, `continue-on-error`, broad path exclusions or scanner exceptions to hurry a change. A cache hit does not prove tests passed; a reused analysis is labelled **unchanged-input evidence**, not a fresh execution. Unknown paths, changed merge bases and missing evidence run checks conservatively. Main, manual, scheduled and release qualification remain full.

## Overlap independent work; never race shared outputs

After pushing a checkpoint, continue independent documentation, test design or review while CI runs. Read job details when a run finishes or when a failure appears; do not wait idle, push a cosmetic change to restart a slow job, or rerun a healthy run speculatively. New PR pushes already cancel superseded runs. Do not cancel main/release/manual qualification to free capacity.

Parallel workers need disjoint file ownership and an explicit integration checkpoint. Do not run overlapping Cargo/native builds against `src-tauri/target`, frontend builds against `dist`, or fixture mutations against one cluster. Native tests overwrite the release executable: run native evidence first, then `pnpm desktop:build`, then `pnpm production:check` (and linked-binary advisory checks when applicable). Never use stale production output.

If CI is slow, inspect **step timings** and cache hits/misses before changing it. Distinguish runner queue, mirror/download, cache restoration, compilation, test execution and security analysis. Re-run a failed infrastructure job only after identifying a transient cause; a finding or deterministic failure needs a fix. Do not churn lockfiles or bump cache namespaces to troubleshoot ordinary application changes. Cache maintenance defaults to dry-run on manual dispatch and must not delete caches used by active runs.

## Native and fixture qualification stay real

For native-boundary changes, run the manual `Native tests` workflow for the final relevant revision or a recorded local equivalent. Dispatch only when the workflow exists on the default branch; HTTP 404 before merge is not a passing test. Linux local native tests use private Xvfb and private XDG directories, with process/display cleanup on failure as well as success. Hosted macOS/Windows results are not clean minimum-OS qualification.

Document 05 specifically still requires the actual Tauri WebView to demonstrate offline lazy editor/worker loading, worker-produced YAML diagnostics, diff rendering, blocked unauthorized/inline scripts, no remote requests, and worker/model/listener cleanup. Browser mocks and a successful build cannot replace these rows. Run final native evidence after relevant changes, not after every intermediate UI edit.

Live fixtures, clean-VM package smoke and performance measurements stay in their explicit tier. Use only allowlisted disposable fixtures; never substitute an owner cluster or an ambient kube/Talos context. Unavailable evidence stays unexecuted.

## Close without a CI/ledger loop

Review the final diff separately. Record the source revision, command/environment, result, run URL, evidence class, scope reuse, remaining limitations and precise next action. A code checkpoint's final result must be read before declaring its gates passed; if it has not finished, hand off as pending/unverified, not complete.

One ledger-only follow-up may record the hosted result of a code change. Never create another ledger-only commit solely to record that follow-up's result; the next session records it. Do not merge/retarget/close the owner's PR, tag, release, force-push or push to `main`.

The goal is to eliminate idle time and duplicate work, **not to remove evidence**. Session B remains document 05; this CI change does not implement or complete it.
