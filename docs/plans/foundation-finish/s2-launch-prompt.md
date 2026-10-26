# S2 launch prompt: terminal and chart feasibility

Status: **HISTORICAL; executed and superseded by S2 acceptance** (updated
2026-10-26). Originally prepared from `main` `a7ada06` on
`docs/s2-flash-readiness`. S2/F7 is accepted on Linux, its corrective findings are
resolved, and PR #4 merged at `41b1e00` with successful exact-main results read.
See [document 06](06-f7-terminal-chart.md) and the ledger for attributed evidence.
Do not re-run this prompt; the next task is the [S3 launch prompt](s3-launch-prompt.md).
The original task text below is retained as historical scope, not new authority.

## Copy-paste task prompt

```text
Implement S2/F7 for Talos Pilot: document 06's synthetic bounded terminal and
chart feasibility. Work one small checkpoint at a time, qualify the final tree,
and stop after F7 is accepted on the development Linux WebView or at an exact
recorded blocker. Do not implement F8, fixtures, installers, budgets or M2.

START / AUTHORITY
- Repository: /developer/ifjkt/talos-pilot. Inspect branch, revision, log and
  status/diff first. The preparation branch is docs/s2-flash-readiness, based on
  main a7ada06; use the actual owner-designated implementation branch. Do not
  switch back to historical ft-foundation-completion or ft-editor-bounds based
  on their old prompts. Preserve unrelated work; no reset/clean/automatic stash.
- Read AGENTS.md, docs/design.md, docs/quality.md, docs/flash-pace.md, the
  foundation-finish series README, current ledger status/latest entries,
  follow-up-to-m2.md's S2 and all of 06-f7-terminal-chart.md. The packet's
  source map, contracts, acceptance IDs and gates are the implementation guide.
  Read required Svelte/TypeScript/tooling/Tauri skills and linked references.
- Document 05/S1 is done on Linux, including the later newline-normalization
  bounds fix. Preserve it; do not run the historical S1/Session B prompt.
  S0 is accepted by owner exception only: B11 remains unresolved/not fixed.
  Keep browser assertions/diagnostics; investigate new actionable recurrence,
  not speculative focus fixes or another browser stress campaign.
- No fixture is needed. Do not use ambient credentials, owner clusters, VMs,
  network/firewall changes, desktop/services or system-wide tool installations.
- Read the actual starting revision's hosted Foundation/Security results once
  with gh run list/view; discover the current PR if one exists. Old hard-coded
  gh pr checks 2/3 references are historical, not this branch's CI. Distinguish
  executed, reused, pending and skipped jobs. Reuse/verify the private pinned
  toolchain with the bootstrap. Do not update unrelated pins.
- Mark F7 in progress before code. Record F7-01 through F7-08 and the selected
  finite terminal geometry/cell limits in the ledger working entry. A partial
  checkpoint is not packet acceptance. No automatic next-packet work.

IMPLEMENT IN FOUR SMALL CHECKPOINTS
A. Query primary release/registry/API sources for maintained xterm.js/uPlot
   packages and any necessary fit addon. Select exact compatible pins, record
   release-specific sources/licenses/NOTICE obligations in dependencies.md,
   update package.json/pnpm-lock.yaml and regenerate the inventory. No generic
   wrapper framework, dependency sweep or global supply-chain-policy bypass.
   Implement/test admission and eviction before integrating the libraries.
B. Build the read-only terminal wrapper/session with an attachment, independent
   lazy Home surface, bounded replacement/replay, appearance/resize and cleanup.
C. Build the chart wrapper/session with a separate lazy Home surface, bounded
   aligned replacements, appearance/resize, accessible numeric equivalent and
   cleanup. Do not make either surface import the other library or Monaco.
D. Qualify the final tree with real browser/native libraries, production rebuild,
   exclusion/advisories and separate review; record every acceptance ID.

CONTRACT HIGHLIGHTS — READ THE PACKET FOR THE COMPLETE RULES
- These are synthetic prop-fed replacement snapshots, not a streaming transport.
  Use synchronous typed readers plus revision for oversized proposals; generate
  them on demand and do not cache their returned source in options/closures.
  No stdin, process/socket, exec, helper, API logs, metrics or forwarding.
- Terminal: newest suffix within BOTH 1,048,576 UTF-8 bytes and 10,000 logical
  lines after CRLF-to-LF normalization, with the packet's exact line definition
  and Unicode-safe cuts. One huge line retains only its fitting newest suffix.
  Empty clears; unsupported controls reject visibly and preserve accepted data.
  Enforce before full split/encode/copy or xterm dispatch, not only in caller.
- xterm scrollback is not a byte limit, and write() has an asynchronous queue.
  Use finite geometry/scrollback; reset/replay admitted replacements, at most
  one active replay plus one latest bounded snapshot and a 64 KiB encoded
  write awaiting its callback. Supersede at the next callback then reset.
  A 5-second stalled callback visibly fails/disposes without auto-retry.
  Bound newline rendering expansion too. Document bounded duplicate copies;
  1 MiB retention is not a claim about process heap or emulator cell memory.
- Chart: at most 8 value series (excluding time), newest 2,000 aligned samples.
  Unix-second retained timestamps are finite/strictly increasing; values finite.
  Extra sample evicts one aligned row. Ninth series, bad shape/values/IDs or
  >80-code-point metadata rejects the whole replacement, preserving prior data.
  Empty clears and valid input recovers. Coalesce work; never accumulate arrays.
- Attachments own instances, observers/listeners, frames/deadlines and teardown;
  partial failures and repeated cleanup are safe. Ignore zero-size resize and
  late callbacks. Root attributes AND OS system-theme changes update a central
  token-to-library appearance mapping. No animation under reduced motion.
- Lazy imports cannot actually be aborted: generation invalidation prevents a
  cancelled/stale success or failure from mounting or overwriting a new open.
  Show loading, safe failure/retry, empty, overflow/rejection and focus return.
- Keep restrictive CSP/capabilities unchanged; bundle JS/CSS/assets. No remote
  font, script, HTML label/tooltip, clipboard/link addon or new test-only IPC.
  Enable terminal accessibility; chart canvas alone is not accessible. Show a
  bounded numeric equivalent, names and synthetic/no-cluster identity.
- Observe actual disposal and retained/pending sizes with honest diagnostics;
  zeroed counters alone are not proof. No transcript/data logging/persistence.

FINAL GATES / HANDOFF
- Use focused tests while iterating, then pnpm check:ci and normal pnpm
  test:e2e on the final tree. Keep editor/shell regressions, normal concurrency,
  axes/themes/densities/three viewport sizes and lazy/CSP assertions. No sleeps,
  extra retries, relaxed checks or duplicate unchanged unit/coverage aggregates.
- Exercise the real pinned terminal/chart in browser and actual Linux Tauri
  pnpm test:native under private XDG directories and the accepted explicit X11
  fixture: xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env
  GDK_BACKEND=x11 pnpm test:native (one shell command; see packet). Bare default
  Xvfb has recorded rendering failures. Clean owned resources on failure and
  success. Extend tests/native, using the existing release-mode
  test executable with embedded assets/CSP, not a Vite development URL.
  Cover the F7 matrix with terminal content/chart rendering, over-limit/recovery,
  replacement/resize/theme/close, offline assets and CSP denial. Record a bounded
  native keyboard/rendered visual pass (human or trusted OS-input script, naming
  the method; DOM-dispatched events are not trusted OS input). Unit-injected stalls/errors and
  browser mocks are not native rendering or native timeout evidence.
- Native overwrites the shared executable. Then run IN ORDER:
  pnpm desktop:build; pnpm production:check; pnpm advisories:check.
  Do not race dist or src-tauri/target outputs. Run pnpm install --frozen-lockfile,
  inventory:generate/check for new pins, pnpm audit --audit-level=low, audit:go,
  and the required current Cargo audit/applicability and license review. Apply
  Rust/Go/contract/configuration gates if those inputs actually change.
- Separately review final correctness, admission/queue/source ownership,
  errors/recovery, lazy assets/CSP, accessibility and missing failure coverage.
  Fix findings and rerun affected gates. Validate docs links/format/whitespace.
- Update document 06, README/current plan and ledger consistently. Link a new
  F7 verification record only once evidence exists. Record source revision,
  commands/environment/WebView, each F7 ID's outcomes, native versus mock versus
  injected evidence, geometry/data/queue bounds, cleanup, scans, hosted URLs,
  missing evidence and exact next action. Do not relabel F6 results as F7 passes.
- Commit coherent scoped checkpoints with their ledger entries. This prompt
  grants no push/PR permission beyond the active owner's instructions. Never
  merge/retarget/close a PR, force-push, push main, tag or release. If hosted
  qualification cannot run, leave final acceptance pending rather than infer
  a pass from a local build. Avoid ledger-only result-commit loops.
- Mark F7 done on Linux only after all applicable evidence and review passes.
  Otherwise leave in progress/blocked. C6 stays in progress for installed
  packages (document 08/F9) and deferred WebViews (document 10). C7, milestone 1,
  Q13 owner review and M2 entry stay open. Final report names branch/commits,
  actual results/limits, acceptance disposition and S3/document 07 as next;
  DO NOT start S3 in this launch.
```
