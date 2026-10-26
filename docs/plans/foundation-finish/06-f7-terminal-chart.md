# 06 — F7: bounded terminal and chart wrappers

Status: **implemented; S2-R1 is fixed and requalified, S2-R2 is reconciled, and
the corrective candidate's hosted Foundation/Security checks passed. Document 06
is done on the development Linux WebView.** The [implementation
review](../../verification/s2-review-s3-readiness.md) at `114fbdb` recorded S2-R1
(chart resize coalescing/F7-05) and S2-R2 (final evidence attribution); the
[S2-R1 corrective record](../../verification/s2-r1-chart-frame-coalescing.md)
records the fix in `5e306a5`, the failing-before/passing-after browser
regression, the rerun renderer, browser, native, trusted-input and ordered
production gates, and the hosted runs for PR head `4fcc9d2`. PR #4's earlier runs
covered `114fbdb` only. **Entry update, 2026-10-26:** PR #4 merged at `41b1e00`;
that exact main revision's Foundation/Security passed and were read, satisfying
the S3 entry gate (run links in [document 07](07-f8-dependencies-notices-security.md)).
This packet does not close C6, C7, milestone 1, the Q13 owner review or the M2
entry gate.

The following is the historical implementation handoff, superseded by that
review where it describes current acceptance or hosted status. Reviewed against `main` at `a7ada06` on 2026-10-25, after PR #3
merged the accepted S1 corrections and normalized-model bounds fix. S2-A–D are
complete on `docs/s2-flash-readiness`; the [F7 evidence
record](../../verification/f7-terminal-chart.md) lists every F7-01–F7-08
outcome, bounds, native/X11 evidence and limits. The original pending-hosted
handoff is superseded by the corrective acceptance above; the
[S2 launch prompt](s2-launch-prompt.md) is now historical, not a restart or the
next task. Continue with S3/document 07 in a later implementation task.

Read the series [README](README.md) and current [ledger](ledger.md) status first.
Plan packet: [F7](../foundation-completion-flash.md#f7--qualify-bounded-terminal-and-chart-wrappers).
Maps to C6.3 and FND-005. Prerequisite: document 05 is `done` on Linux (met).
The owner-approved fixture-independent sequence permits F7 while documents
01/04 remain open. No fixture or host/network change is needed here.

## Outcome and scope

A lazily loaded xterm.js terminal showing synthetic output and a separately
lazy-loaded uPlot chart render under the editor's packaged CSP, enforce bounds
inside their adapters, and dispose explicitly. This proves specialized-view
feasibility, **not** a container terminal or a metrics feature.

- Add the feasibility controls inside the existing Home view, beside rather
  than inside the editor surface. Show “Synthetic / offline / no cluster” at
  each surface. Do not change routing or add a product navigation destination.
- Inputs are props; the wrapper/session admits them before retaining/copying or
  handing them to a library. Caller-side trimming alone is not enforcement.
- Terminal output is read-only synthetic plain text in this packet. No stdin,
  process, socket, helper, exec, API logs, metrics collection or forwarding.
  No new IPC, capabilities, credential access or browser persistence is needed.
- Preserve S1's editor/diff/worker behavior and the S0 owner exception. B11 is
  unresolved/not fixed; retain browser assertions/diagnostics. Investigate a
  new actionable recurrence, not another speculative menu stress campaign.
- Do not broaden script sources or add remote assets, inline scripts, `eval`,
  HTML-injected labels/tooltips, terminal link/clipboard integrations or WebGL
  addons. Keep the CSP unchanged unless the existing F6 minimum-change rule
  and actual native evidence justify a change; a security-boundary change
  still needs the owner-directed decision required by AGENTS.md.

## Read before you start

Read AGENTS.md, design.md, quality.md sections 1–6 and 8–9, FLASH pace, the
`talos-pilot-svelte`, `talos-pilot-typescript`, `svelte`, `svelte-tooling` and
`talos-pilot-tauri` skills. Follow the Svelte reference links relevant to
attachments, effects, props and cleanup. Read the Rust skill only if touching
Rust; no Rust/helper change is expected.

| Existing source                                                                                                                                  | Purpose / reuse boundary                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| [Document 05](05-f6-editor-workers-csp.md), [decision 0019](../../decisions/0019-offline-yaml-editor-worker.md), latest S1 entries in the ledger | Accepted lazy/offline/CSP/ownership baseline; do not replay historical tasks                                                           |
| `src/features/clusters/ClustersView.svelte`, `src/features/editor/EditorFeasibilityPanel.svelte`                                                 | Existing view insertion point and explicit open/close/focus pattern                                                                    |
| `src/lib/state/editorFeasibility.svelte.ts`, `editorRuntimeDiagnostics.svelte.ts` in the same directory                                          | Generation cancellation and observable ownership pattern; do not import Monaco eagerly or reuse editor-specific errors/counters for F7 |
| `src/features/editor/editorLifecycle.ts`, `src/styles.css`, `src/lib/state/shell.svelte.ts`                                                      | Attachment teardown, root appearance tokens and media-query changes                                                                    |
| `tests/e2e/editor.spec.ts`, `tests/e2e/browser.ts`, `playwright.config.ts`                                                                       | Explicit mocked IPC, browser diagnostics, lazy assets, axe and layout patterns                                                         |
| `tests/native/editor-worker.spec.ts`, `wdio.native.conf.ts`, `scripts/test-native.ts`                                                            | Actual release-mode Tauri test executable with embedded assets/CSP; no installed-package claim                                         |
| `src-tauri/tauri.conf.json`, `src-tauri/tauri.native-test.conf.json`, `scripts/check-production-exclusion.ts`                                    | Keep production/test surfaces separate; native build replaces the shared executable                                                    |
| `package.json`, `pnpm-workspace.yaml`, `docs/dependencies.md`, `scripts/dependency-inventory.ts`                                                 | Exact pins, supply-chain policy, license research and generated inventory                                                              |

The two new feature directories and their session/state/test filenames are to
be introduced, not assumed to exist. Prefer `src/features/terminal/` and
`src/features/charts/`, with asynchronous UI state under `src/lib/state/`.
Do not build a shared specialized-view framework. Extract a small existing
helper only for demonstrated reuse and keep all editor regressions passing.

## 1. Resolve packages once

The design selects xterm.js and uPlot, not substitute widgets. Query primary
upstream sources for current stable package names, versions, exports, CSS,
licenses and required peers before pinning. Start from
[xterm's repository](https://github.com/xtermjs/xterm.js), its
[API](https://xtermjs.org/docs/api/terminal/classes/terminal/),
[flow-control guide](https://xtermjs.org/docs/guides/flowcontrol/) and
[security guide](https://xtermjs.org/docs/guides/security/), and
[uPlot's repository/API types](https://github.com/leeoniya/uPlot/blob/master/dist/uPlot.d.ts).
Verify the APIs against the **selected release**, not only a moving default
branch. Evaluate the maintained fit addon only if needed for sizing; no
framework wrapper dependency is needed.

Record release-specific source URLs, exact pins, compatibility, license/NOTICE
obligations and selected APIs in [dependencies.md](../../dependencies.md).
Commit package.json and pnpm-lock.yaml together. Regenerate the dependency
inventory with its script; never edit generated JSON or relax pnpm's
release-age/lifecycle policy globally. These pins do not authorize an unrelated
toolchain, Talos or dependency sweep. F8 notice packaging stays a separate task.

## 2. Admission, retention and delivery contracts

These clarify F7's starting bounds; any evidence-backed refinement must be
recorded consistently in this packet, the plan and the ledger, not silently
implemented. They are retained-data/queue limits, **not** a whole-heap budget or
an F10 performance result.

Use a typed synchronous snapshot-reader prop plus a change revision for
on-demand oversize proposals, following S1's `readValue` admission pattern.
Consume the returned source at admission; sessions retain only bounded accepted
data and non-payload options. The synthetic owner stores bounded accepted data
or a generation intent, not the oversized proposal. This avoids keeping an
oversized array/string alive in component props after trimming it in a session.

### Terminal

Use a controlled **replacement snapshot** prop for this feasibility wrapper;
a new synthetic-output action replaces it with the next snapshot. This avoids
inventing a streaming transport. Append/interactive VT semantics belong to the
later exec/log adapters.

1. Canonical text uses LF newlines (normalize CRLF before accounting). Define
   a line as an LF-terminated segment or a final nonempty partial segment;
   empty text has zero lines, and a trailing LF adds no extra empty line.
   Render-only CR insertion must not create another retained unbounded copy.
2. Keep the newest suffix satisfying **both 1,048,576 UTF-8 bytes and 10,000
   logical lines**. Drop oldest complete lines first; if a single remaining
   line alone exceeds the byte limit, retain its newest Unicode-safe suffix.
   Count UTF-8, not UTF-16 string length; lone surrogates count/render as U+FFFD
   (TextEncoder semantics). Account after normalization, and preserve code
   points when cutting. Report eviction visibly, separately from the transcript.
3. Bound before splitting/encoding/copying an entire oversized snapshot or
   writing it to xterm. Materialize the admitted suffix in independent bounded
   storage: a substring view may keep its oversized backing string alive. Do
   not retain rejected/evicted source props in session options or closures.
   The synthetic producer must also avoid a growing history; oversized test
   payloads are generated on demand, then released.
4. Only printable synthetic text and normalized newlines are supported. Reject
   other terminal controls (including ESC/OSC and bare CR) visibly, preserving
   the prior accepted transcript. Do not reinterpret hostile controls as HTML
   or reproduce a VT parser. Empty input clears the surface.
5. xterm `scrollback` alone is **not** a byte limit and excludes visible rows.
   Its `write()` is asynchronous and queues data. Maintain an admitted bounded
   snapshot and reset/replay it on replacement so evicted/replaced output
   cannot remain in the emulator. Use one active replay and at most one latest
   coalesced bounded replacement, never a queue per prop update. Feed at most
   **64 KiB of encoded output per write**, awaiting the real write callback;
   normalize render newlines within that cap. A newer replacement supersedes
   the unfinished replay at the next callback, then resets before replaying.
6. A missing write callback for **5 seconds** fails the session visibly,
   disposes the terminal and drops pending data; no automatic retry loop.
   Explicit close/reopen may retry. Generation-check callbacks so late work
   after replacement/close cannot revive a disposed instance. Clear the single
   deadline on progress/disposal. Test timeout with an injected writer.
7. Set finite emulator scrollback and geometry limits as well as transcript
   limits. Before code, record chosen row/column clamps, total visible plus
   scrollback rows and the resulting cell bound in the ledger; verify them at
   the supported viewport sizes. Soft-wrapped screen rows are not logical
   input lines. No private xterm buffer mutation to implement retention.

A replay can temporarily own the previous admitted snapshot and one next
snapshot, plus one capped library write. Document these separate bounded
copies honestly; do not claim the whole process uses at most 1 MiB. Closing
releases them all. Read-only output must still permit keyboard focus,
selection/scrolling and leaving the terminal without a focus trap.

### Chart

Use bounded **replacement snapshots**, not growing history inside uPlot.

- Input: one aligned timestamp array and named numeric series of the same
  length. Timestamps are Unix seconds; retained timestamps must be finite and
  strictly increasing. Retained values must be finite numbers. Document this
  narrow synthetic contract; missing/null metrics are later integration work.
- Admit at most **8 value series** (the x/time axis does not count). A ninth
  series, inconsistent lengths, duplicate IDs or malformed retained values
  reject the whole replacement visibly and preserve the last accepted chart.
  With no accepted chart, show a recoverable empty/error state, not a crash.
- For a valid shape, select the newest **2,000 aligned samples** before copying
  or handing data to uPlot. The 2,001st sample evicts the oldest timestamp and
  every corresponding value together. Validate the retained window; discarded
  history is not rendered or retained. Copy the admitted window rather than
  keeping a typed-array subarray backed by the oversized source. Never trim
  each series independently.
- Bound metadata too: at most 80 Unicode code points per ID/label; reject
  oversize metadata rather than retain it in options/legends. No HTML labels.
- Empty timestamps or no value series produce an explicit empty state and
  release stale plotted data. A later valid snapshot recovers without reopen.
- Use one chart instance per attachment, in-place data/size updates where the
  pinned API supports them, and at most one scheduled render with one latest
  bounded snapshot. Release previous arrays/options when replaced and on close.

## 3. Ownership, appearance and lazy loading

Each wrapper has documented typed props and an `@component` comment. Put
admission, async work, state transitions and library ownership in small typed
session/state modules, not the Svelte markup.

- Each surface independently transitions `closed → loading → ready | failed`.
  Close/cancel invalidates the import generation and drops owner references;
  stale success/rejection cannot mount or overwrite a later open. `import()`
  itself is not abortable and a loaded module may remain cached. “Cancelled”
  means no owned pending state/instance, not cancellation of module fetching.
- Do not construct instances or register global resources at module scope.
  The attachment owns library instance, observers/listeners, pending frame,
  deadline and teardown. Partial setup failure and repeated cleanup are safe;
  late callbacks are inert. Catch initialization/load errors with safe visible
  retry controls. Do not log transcript/data payloads.
- ResizeObserver ignores hidden/zero-size hosts; defer sizing until positive
  dimensions and clamp before passing to the library. Coalesce resize work,
  disconnect on close and cancel the scheduled frame/deadline.
- Map theme/density from existing CSS tokens in one appearance adapter. Resolve
  actual library-compatible color values; do not assume a canvas accepts every
  CSS token/color syntax. Observe root attributes **and** OS theme changes when
  in system mode. Handle compact/comfortable changes without losing data.
- Do not animate chart updates or auto-run a synthetic producer when reduced
  motion is requested. Prefer manual “next sample/burst” controls here; any
  optional producer must have one bounded timer and explicit stop/cleanup.
- Lazy JS and library CSS must resolve from bundled assets; opening Home loads
  neither library and opening only one surface must not import the other or
  Monaco. Check the emitted production asset graph, not just import syntax.
- Expose small renderer-owned diagnostics for active instances, owned
  listeners/observers, frames/deadlines and retained/pending sizes. Counter
  decrements follow actual teardown, never a blanket reset to zero. Supplement
  counters with detached DOM/no-late-callback assertions and real library
  rendering; counters alone do not establish cleanup or memory usage.

Provide visible names, target identity and focus return on close. Enable the
pinned xterm accessibility support. A canvas chart needs an adjacent accessible
summary and keyboard-accessible numeric equivalent (for example per-series
latest value and range), not only an aria-label or color legend. Keep that
projection bounded; do not put 16,000 values in a hidden accessibility DOM.

## 4. Small implementation checkpoints

Work these in order; a checkpoint can be a separate session, but **only the
last accepts document 06**. Mark the ledger in progress before code, with
acceptance IDs and selected emulator geometry limits.

1. **S2-A — pins and bounded data:** primary-source research; documented pure
   admission/eviction contracts and tests for both adapters; exact lockfile and
   generated inventory. Decide finite geometry clamps before terminal code.
2. **S2-B — terminal:** attachment/session, controlled replay/backpressure and
   timeout, independent lazy Home surface, theme/resize/focus/cleanup tests.
3. **S2-C — chart:** aligned bounded data, attachment/session, independent lazy
   Home surface, accessible numeric equivalent, appearance/cleanup tests.
4. **S2-D — qualification:** final browser/native matrix, ordered ordinary
   production rebuild/exclusion/advisories, separate final diff review and
   complete ledger evidence. Fix findings and rerun affected gates before done.

Do not start F8, fixtures, package VMs, budgets or milestone 2 in this launch.
Do not race builds writing `dist` or `src-tauri/target`.

## 5. Acceptance matrix

Deterministic tests may inject library/import/scheduling boundaries; browser
and native rendering rows must use the real pinned libraries. Add dedicated
terminal/chart tests; keep the existing editor/shell suites intact.

| ID    | Observable outcome                                                                                                                                            | Required evidence                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F7-01 | Exact byte and line ceilings retain data; +1 byte/line evicts oldest; newest partial/multibyte/CRLF suffix is correct                                         | Unit boundary tests independently hitting each limit; real terminal at/over limits in browser and native                                                                             |
| F7-02 | Oversize single line and burst are admitted without retaining full source; control input is rejected; empty clears; evicted text is absent after replay       | Unit admission/ownership and real xterm rendered/buffer inspection, including browser/native oversize action and a responsive close control                                          |
| F7-03 | Slow/stalled writer plus rapid replacements stays within active/latest/chunk limits; stale callback and timeout cannot revive a session                       | Deterministic injected callbacks/clock (including disposal mid-write); browser/native real replay, replacement and close; injected stall is not native timeout proof                 |
| F7-04 | 8 × 2,000 aligned values render; 2,001 keeps newest aligned window; ninth series/malformed replacement preserves accepted chart; empty then valid recovers    | Unit shape/value/metadata boundaries; real browser/native chart at/over sample and series limits, visible rejection/recovery                                                         |
| F7-05 | Resize, root/OS theme and density change before/during/after close leave no errors, data loss or live resources                                               | Deterministic late/zero-size/partial-init failures and idempotent cleanup; repeated browser/native mount, replacement, resize/theme/density/close cycles with observed baseline      |
| F7-06 | Independent lazy loading, close while loading, stale success/failure and reopen are safe                                                                      | Deferred-import tests; browser request interception for each cancel/reopen; browser/native first-use asset observations                                                              |
| F7-07 | Both surfaces render with local CSS/assets and no remote request; inline and unauthorized-origin scripts remain blocked                                       | Browser network assertions plus actual native offline/CSP denial and real library rendering; build success alone is insufficient                                                     |
| F7-08 | Named surfaces, visible synthetic context, keyboard operation/exit/focus return, chart numeric equivalent, no motion under reduced-motion, fixed shell layout | Browser axe/keyboard in light/dark and both densities at 1280×800, 1024×700, 720×480; bounded native keyboard/rendered visual pass (human or trusted OS-input script), record method |

Use observable completion predicates and bounded deadlines, not sleeps or
relaxed assertions. A jsdom canvas shim is not rendering evidence; a GC probe
is not a whole-heap budget. Record native screenshots/inspection results for
actual terminal text/chart paths (an empty canvas/container does not pass).

## 6. Gates and evidence handoff

Use the pinned private toolchain; bootstrap verifies it, not an excuse to
reinstall working tools. During iteration use focused tests, then on the final
source tree run:

1. `pnpm install --frozen-lockfile` after resolving pins/lockfile;
   `pnpm inventory:generate` when the graph changes, then `pnpm inventory:check`;
   review new license/NOTICE obligations and `pnpm audit --audit-level=low`.
2. `pnpm check:ci` and `pnpm test:e2e` at normal configured concurrency. Do not
   duplicate the same aggregate with `pnpm check` or another coverage run.
3. `pnpm test:native` on Linux in private Xvfb/XDG directories, with owned
   app/helper/server/display cleanup on failure and success. Use the accepted
   explicit-screen fixture, not bare default Xvfb:
   `xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 pnpm test:native`,
   with fresh private `XDG_DATA_HOME`, `XDG_CONFIG_HOME` and `XDG_CACHE_HOME`.
   The latest normalized-bounds ledger entry retains default-Xvfb rendering
   failures; do not rediscover or relabel them as a product fix. Extend the
   native suite to cover F7 with the actual release-mode test executable's
   embedded production assets and CSP. Keep test-only IPC out of production;
   DOM-observable diagnostics suffice, no new test command is expected.
4. After native, **in order**: `pnpm desktop:build`, `pnpm production:check`,
   `pnpm advisories:check`. The ordinary production rebuild removes the test
   executable; do not use stale output for exclusion/applicability checks.
5. Dependency gates include `pnpm audit:go` and current Cargo audit/applicability
   under the series rules; do not silently defer scans to F8. Run Rust/Go,
   contracts and further native/configuration gates if those inputs change.
   Required hosted CI must pass for the implementation candidate; separate
   executed checks from unchanged-input evidence and native/OS qualification.
6. Review the final diff separately for ownership, source retention, bounds,
   error/recovery paths, accessibility, lazy assets, CSP and documentation.
   Validate local links, formatting and `git diff --check`.

Record each F7 ID's command/test, source revision, host/toolchain/WebView,
pass/fail/unexecuted outcome and artifact/run URL in the ledger. A dedicated
`docs/verification/f7-terminal-chart.md` may be created when implementation
produces evidence; link it from the ledger rather than copying entire logs.
Record chosen final geometry/data/queue bounds and their evidence, advisory
results, actual cleanup and next action. Earlier F6 results remain attributed,
not fresh F7 evidence.

Only after every row and applicable final gate passes, mark document 06 done
**on the development Linux WebView** and update README/current plan/ledger
consistently. C6 remains `in progress`: F9/document 08 supplies installed-package
resolution and document 10 supplies deferred WebViews. S2 does not close C6,
C7, milestone 1, the Q13 owner review or the M2 entry gate. If evidence is missing,
leave F7 in progress/blocked with the exact remaining row and next command.
