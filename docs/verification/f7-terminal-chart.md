# F7 evidence: synthetic bounded terminal and chart wrappers

Date: 2026-10-25. Packet: [document 06](../plans/foundation-finish/06-f7-terminal-chart.md),
mapped to C6.3 and FND-005. This record covers the implementation checkpoints
S2-A–D on `docs/s2-flash-readiness`. It does **not** close C6, C7, milestone 1,
the Q13 owner review or the M2 entry gate.

**Disposition:** implementation and local Linux qualification are complete;
packet acceptance is **pending hosted CI**. The branch was not pushed and has no
pull request, because this session holds no push/PR authorization. Branch pushes
do not start Foundation/Security runs, so no hosted result exists for this
revision. Everything below is local Linux evidence except where explicitly
labelled unexecuted.

## Source revision

- Branch: `docs/s2-flash-readiness`, based on `main` `a7ada06` (PR #3 merge).
- Implementation commits: `f40cc61` (S2-A pins and admission), `09987dd`
  (S2-B terminal), `449288b` (S2-C chart).
- S2-D change: the acceptance commit containing this record plus the product
  changes found during qualification and independent review — the uPlot
  `navigator.language` workaround
  ([chartLocale.ts](../../src/features/charts/chartLocale.ts)), the read-only
  terminal PageUp/PageDown/Home/End viewport handler, the chart frame-coalescing
  re-drive, and the allocation-free bounded metadata rejection — together with
  the native and X11 harnesses and documentation. Every gate below ran on the
  source tree this commit records; only documentation changed afterwards.
- Entry summary: `5a616d6` changed documentation only and has no hosted run.
  The merged starting revision `a7ada06` passed Foundation
  [40226383021](https://github.com/agiledevel/talos-pilot/actions/runs/40226383021)
  and Security
  [40226383015](https://github.com/agiledevel/talos-pilot/actions/runs/40226383015);
  those are unchanged-input entry evidence, not F7 execution.

## Environment

| Item               | Value                                                                    |
| ------------------ | ------------------------------------------------------------------------ |
| Host               | openSUSE Tumbleweed x86_64, kernel `7.2.8-1-default`                     |
| WebView            | WebKitGTK 605.1.15 (actual Tauri release-mode test executable)           |
| Node / pnpm        | 26.12.1 / 12.15.0 (private `.tools` prefix)                              |
| Rust / Go / protoc | 1.99.1 / 1.27.3 / 36.2                                                   |
| talosctl           | v1.14.2 (client check only; no cluster used)                             |
| Browser            | Playwright 1.64.0 Chromium against the scripted IPC transport            |
| X11 harness        | xdotool 4.20260303.1 (XTEST), ImageMagick 7.1.2-31, private Xvfb `:99`   |
| Fixture            | none; no cluster, VM, network, firewall, package or host setting touched |

## Selected libraries and bounds

The exact pins, primary sources, licenses, NOTICE position and the locale
workaround are in [dependencies.md](../dependencies.md).

| Item                | Selected value                                                                                                                                                                      |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Terminal library    | `@xterm/xterm` 6.0.0 (MIT) with `@xterm/addon-fit` 0.11.0 (MIT)                                                                                                                     |
| Chart library       | `uplot` 1.6.32 (MIT)                                                                                                                                                                |
| Terminal transcript | 1,048,576 UTF-8 bytes **and** 10,000 logical lines (LF after CRLF folding)                                                                                                          |
| Terminal emulator   | 20–200 columns × (5–50 visible + 1,000 scrollback) rows ⇒ ≤ 210,000 cells                                                                                                           |
| Replay              | one active replay, one latest pending snapshot, one write in flight; ≤ 32 KiB canonical / ≤ 64 KiB encoded per write; 5,000 ms stall deadline; no auto-retry                        |
| Resident copies     | admitted snapshot (≤ 1 MiB) + one pending snapshot (≤ 1 MiB) + one rendered write chunk (≤ 64 KiB); xterm's own cell memory is separate and bounded by the cell count, not by bytes |
| Chart window        | ≤ 8 value series × 2,000 newest aligned samples (2,000 × 9 × 8 = 144,000 bytes for a full window), copied into independent `Float64Array`s                                          |
| Chart metadata      | ≤ 80 Unicode code points per ID and label                                                                                                                                           |
| Chart geometry      | plotting area clamped to 240–1,600 × 160–480 CSS pixels; zero-size hosts ignored                                                                                                    |
| Lazy assets         | separate `TerminalSurface` and `ChartSurface` chunks; Home, each surface and the editor never load another surface's library                                                        |

## Acceptance matrix

Evidence classes: **unit** = deterministic Vitest; **browser** = real pinned
libraries in Chromium against the mock IPC transport; **native** = actual Linux
Tauri/WebKitGTK release-mode test executable under the packaged CSP; **X11** =
trusted OS input (XTEST) plus rendered-window capture.

| ID    | Outcome                                        | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | ---------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F7-01 | Pass                                           | **Unit:** `terminalSnapshot.test.ts` hits both ceilings exactly, +1 byte, +1 line, CRLF folding, multibyte and 4-byte code-point cuts, lone-surrogate byte counting, combined limits and the single-oversized-line suffix. **Browser:** byte+1 (`Retained: 1.00 MiB`, `evicted 1 B`), line+1 (`evicted 1 older line`, newest `line 010001`), burst and one-oversized-line actions with bounded emulator rows. **Native:** the same byte+1, line+1, burst and oversized-line actions in WebKitGTK with real emulator inspection (`≤ 1,050` rows).                                                                                                                                                                                                                     |
| F7-02 | Pass                                           | **Unit:** oversize single line/burst produce only a bounded canonical suffix; controls (ESC/OSC, bare CR, NUL, backspace, DEL, C1) reject with no transcript; empty clears; ownership tests keep only admitted data or an intent. **Browser:** real xterm renders the suffix, the escape action is rejected while the accepted transcript remains, Clear empties the emulator, and the next sample recovers; responsive close remains available. **Native:** same rejection/clear/recovery with real WebKitGTK emulator rows.                                                                                                                                                                                                                                        |
| F7-03 | Pass (deterministic) / native replay exercised | **Unit:** injected writer/clock covers one-write-at-a-time replay, ≤ 64 KiB encoded writes, coalescing to one latest pending snapshot, reset-before-supersede, duplicate/stale callbacks, 5 s stall failure with pending drop and no retry, disposal mid-write and idempotent cleanup. **Browser/native:** real xterm replay, rapid replacements, close and baseline counters; the 5 s stall itself is **not** native evidence (no trustworthy native stall injection), as the packet requires.                                                                                                                                                                                                                                                                      |
| F7-04 | Pass                                           | **Unit:** 8 × 2,000 admitted; 2,001 keeps the newest aligned 2,000; ninth series, duplicate ID, > 80 code-point metadata, misalignment, non-finite timestamp/value rejected; retained-only validation; empty clears; later valid recovers; independent copies. **Browser:** real uPlot paints 8 × 2,000 and the newest window, every malformed replacement preserves the painted chart and 8 summary rows, Clear destroys the canvas and a valid proposal recovers. **Native:** same limits, rejection preservation, canvas destruction and recovery in WebKitGTK.                                                                                                                                                                                                   |
| F7-05 | Pass                                           | **Unit:** zero-size/negative/NaN geometry ignored, clamps applied; owned resources dispose idempotently; frame/deadline cancellation; late callbacks inert; surface-state transitions. **Browser/native:** repeated open/replace/resize/root-theme/density/close cycles at 1280×800, 1024×700 and 720×480 with data preserved, canvas/text intact, instance/listener/observer/frame/deadline counters back to zero and no page errors. OS system-theme changes use the `prefers-color-scheme` listener; root `data-mode`/`data-density` changes are observed.                                                                                                                                                                                                        |
| F7-06 | Pass                                           | **Unit:** `lazySurface.test.ts` covers load, close-during-load, stale success, stale failure, newest-attempt wins, safe failure/retry. **Browser:** Home requests neither library; opening the terminal requests/loads only its chunk (not uPlot or Monaco) and opening the chart only its chunk (not xterm or Monaco). **Native:** recorded `import.meta.url` chunk diagnostics and injected stylesheet/script elements are same-origin; the reloaded document starts with neither chunk loaded.                                                                                                                                                                                                                                                                    |
| F7-07 | Pass                                           | **Browser:** no remote request, same-origin assets, CSP meta denial of inline/unauthorized scripts, real library rendering. **Native:** packaged-CSP denial of inline and unauthorized-origin scripts, no cross-origin `fetch` attempt, all observable stylesheets/scripts and recorded chunk URLs same-origin, no `blob:` asset, real xterm text and uPlot canvas pixels. WebKitGTK exposes no Resource Timing entries; the DOM asset lists and chunk diagnostics are used instead, and no remote-request claim rests on an empty list alone.                                                                                                                                                                                                                       |
| F7-08 | Pass                                           | **Browser:** named synthetic surfaces and “offline, no cluster” identity; axe scans in light/dark and both densities; keyboard focus/selection/scroll, disclosure operation, focus return on close; no animation/`getAnimations` entries and no auto-producer under reduced motion; three viewport sizes with the fixed shell. **Native:** named surfaces, real rendered terminal/chart, numeric-summary disclosure, focus return and baseline counters. **X11:** 64 trusted XTEST keys (no script-dispatched events) opened the terminal, triggered the burst, scrolled with PageUp and returned with End, closed with focus return, opened the chart, collapsed/expanded the numeric summary with Return, closed with focus return, and captured rendered windows. |

## Commands and results

All commands ran from the repository root with the private pinned toolchain on
`PATH` (`Node 26.12.1`, `pnpm 12.15.0`, `Rust 1.99.1`, `Go 1.27.3`,
`protoc 36.2`).

| Command                                                                                       | Result                                                                                                                                                                                                                                                                            |
| --------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                              | Passed; lockfile unchanged and up to date.                                                                                                                                                                                                                                        |
| `pnpm inventory:check`                                                                        | Passed: 538 npm, 614 Cargo, 143 Go modules current.                                                                                                                                                                                                                               |
| `pnpm audit --audit-level=low`                                                                | No known vulnerabilities.                                                                                                                                                                                                                                                         |
| `pnpm audit:go`                                                                               | 0 vulnerabilities affecting the helper's call graph (1 module-only finding not called).                                                                                                                                                                                           |
| `pnpm check:ci`                                                                               | Passed: format, type-aware Oxlint, `svelte-check` 0 errors/0 warnings, **318 tests / 43 files** with coverage (67.54% statements / 73.62% branches), production frontend build. Log: `/tmp/tp-f7-check-ci.log`.                                                                   |
| `pnpm test:e2e`                                                                               | **30/30 passed** in 26.8 s at configured concurrency, including the seven new specialized-view flows and all existing editor/shell/workloads/appearance flows. Log: `/tmp/tp-f7-e2e.log`.                                                                                         |
| `xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 … pnpm test:native` | **31/31 passed across 5 spec files** in 15 s: 4 chart, 5 editor, 12 helper/shell, 7 Kubernetes-session, 3 terminal. Private `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME`/`XDG_RUNTIME_DIR`; no helper process or synthetic endpoint remained. Log: `/tmp/tp-f7-native.log`. |
| `… wdio run wdio.native.conf.ts --spec ./tests/native-x11/specialized-views.spec.ts`          | **1/1 passed** in 1.5 s with 64 trusted XTEST keys on a private `:99` display, one exact “Talos Pilot” window. Log: `/tmp/tp-f7-native-x11.log`.                                                                                                                                  |
| `pnpm desktop:build`                                                                          | Passed; ordinary release executable SHA-256 `3b26456fbb0ac560ff12d836807a20cb1d9c7e9a450ff6aecbf1dca1e7586e83`. Log: `/tmp/tp-f7-desktop-build.log`.                                                                                                                              |
| `pnpm production:check`                                                                       | Passed: production artifacts exclude WebDriver and expose no driver listener.                                                                                                                                                                                                     |
| `pnpm advisories:check`                                                                       | Passed: 67,079 demangled symbols against the five recorded advisories.                                                                                                                                                                                                            |
| `pnpm format:check`, `git diff --check`                                                       | Passed.                                                                                                                                                                                                                                                                           |

Bundle observations (not budgets): initial `index` 306.66 kB / 91.36 kB gzip
with **zero** `xterm`/`uplot` occurrences; `TerminalSurface` 342.03 kB /
87.23 kB gzip (+ 3.96 kB CSS); `ChartSurface` 59.17 kB / 25.52 kB gzip
(+ 1.64 kB CSS); lazy editor unchanged at 2,748.35 kB.

## Native keyboard and rendered visual pass

Method: trusted OS input only. `xdotool key --clearmodifiers …` delivered every
key through XTEST to the single visible “Talos Pilot” window on the owned Xvfb
display; no `SendEvent`, no script-dispatched `KeyboardEvent`, and no script
focus assignment. The WebView observed focus and recorded `event.isTrusted` for
each keydown; all 64 observed keys were trusted. The numeric summary is a native
`<details>/<summary>` disclosure operated with Return.

Rendered evidence was captured from the exact window with
`import -window <id>` and hashed:

| Artifact                             | Size     | SHA-256                                                            |
| ------------------------------------ | -------- | ------------------------------------------------------------------ |
| `/tmp/tp-f7-native-x11/terminal.png` | 1200×800 | `bd94c99a7c247182c845a7c120e63fb5a8c688c45142597296d0e5cebdec377b` |
| `/tmp/tp-f7-native-x11/chart.png`    | 1200×800 | `46139edac6e4baa2e660938b6cfe8572797a8e5a06df63c4761f3b7fbf84ed5f` |

The terminal capture shows the burst's newest rows (`line 011997`–`line 012000`)
rendered by xterm with its scrollbar; the chart capture shows both series with
axes/legend and the focused numeric-summary disclosure. Both captures also show
a large unpainted black region over scrolled-out shell chrome on the left; that
is an Xvfb/WebKitGTK partial-composite capture artifact of the explicit fixture,
not a surface failure: the DOM, canvas pixels and emulator text for both
surfaces were read directly in the same run and are consistent with the painted
regions. No full-window visual-perfection claim is made.

## Findings resolved during qualification

1. **uPlot 1.6.32 fails to import under a POSIX locale in WebKitGTK.** Its module
   body constructs `new Intl.NumberFormat(navigator.language)`; WebKitGTK reports
   `C` on an unconfigured host, which WebKit's ICU rejects with `RangeError`, so
   the lazy chart chunk never evaluated. The lazy loader now supplies `en-US` for
   that import only when the reported tag is unsupported and restores the real
   value immediately ([chartLocale.ts](../../src/features/charts/chartLocale.ts),
   four deterministic tests). This was found by the native run, not assumed.
2. **The terminal viewport was not keyboard-scrollable.** xterm maps
   PageUp/PageDown to application input, which a read-only synthetic terminal
   has none of. The attachment now scrolls the viewport on
   PageUp/PageDown/Home/End and reports the first visible/base row from the real
   scroll event, giving keyboard scrolling without a focus trap or addon.
3. **WebKitGTK has no Resource Timing entries.** Native asset evidence therefore
   uses the surface's recorded `import.meta.url` chunk diagnostic plus the
   injected stylesheet/script elements and same-origin checks; the native tests
   do not treat an empty resource list as a pass.
4. **The native service reuses one packaged page across spec files.** Lazy-chunk,
   stylesheet and view state otherwise survive between cases. `browser.refresh()`
   was unreliable late in a run and the WebDriver navigation command does not
   reload a custom `tauri://` document, so `openHome` issues an explicit
   `location.reload()` through `execute`, tolerates the navigation race in a
   bounded wait, then navigates to Home. Cross-library asset assertions compare
   before/after values rather than assuming a fresh page.
5. **Independent review found two defects, both fixed before the final gates.**
   (a) _Major:_ frame requests are coalesced, so a resize frame owning the frame
   an admitted chart replacement also requested could leave the new window
   unrendered while the UI reported it admitted; `resize()` now re-drives the
   latest pending snapshot, and the browser suite replaces immediately after a
   resize. (b) _Minor:_ `bounded()` in the chart rejection path materialised the
   whole oversized metadata string before truncating it; it now builds the
   prefix by iteration, with a rejection test using a 2,000,000-character label.
   The reviewer found no defect in terminal admission/eviction accounting,
   replay interleaving/chunk caps, ownership/teardown, lazy generation
   invalidation, CSP/security/logging, or assertion strength. Its environment
   notes (no gate execution) are recorded; the parent reran every affected gate
   afterwards, as listed above.

## Limits and unexecuted evidence

- **Hosted CI was not executed.** The branch is local and has no pull request;
  branch pushes do not start Foundation/Security runs. Packet acceptance is
  pending owner-authorized push and PR, then the exact Foundation/Security run
  results for this revision.
- No installed-package run (document 08/F9), no macOS/Windows WebView
  (document 10), no clean-VM package smoke and no measured performance budget.
- The 5 s stall, duplicate/stale callback and disposal-mid-write paths are
  deterministic injected evidence only; no native timeout injection exists.
- Browser rows use the scripted mock IPC transport; they do not establish
  native command registration, capabilities or the installed WebView.
- The X11 keyboard pass is trusted-input evidence for the Linux WebView; it is
  not installed-package or other-platform qualification. Its visual capture has
  the partial-composite artifact described above.
- Independent review was source-only: it ran no gates, and its behavioural claims
  were not treated as evidence. Only the parent-executed gates above count.
- Coverage percentages fell with the new attachment/DOM code; no coverage
  threshold was configured or relaxed, and critical failure paths have explicit
  tests. No performance or whole-heap claim is made from the byte bounds.

## Reproduction

```sh
export PATH="$PWD/.tools/node/bin:$PWD/.tools/go/bin:$PWD/.tools/protoc/bin:$HOME/.cargo/bin:$PATH"
pnpm toolchain:bootstrap
pnpm check:ci
pnpm test:e2e
SCRATCH=$(mktemp -d /tmp/tp-f7-native.XXXXXX)
mkdir -p "$SCRATCH"/{data,config,cache,runtime} && chmod 700 "$SCRATCH/runtime"
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$SCRATCH/data" XDG_CONFIG_HOME="$SCRATCH/config" \
  XDG_CACHE_HOME="$SCRATCH/cache" XDG_RUNTIME_DIR="$SCRATCH/runtime" pnpm test:native
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' sh -c \
  'env GDK_BACKEND=x11 XDG_DATA_HOME='"$SCRATCH"'/data XDG_CONFIG_HOME='"$SCRATCH"'/config \
   XDG_CACHE_HOME='"$SCRATCH"'/cache XDG_RUNTIME_DIR='"$SCRATCH"'/runtime \
   TALOS_PILOT_NATIVE_X11_DISPLAY=$DISPLAY TALOS_PILOT_NATIVE_X11_SHOTS=/tmp/tp-f7-native-x11 \
   pnpm exec wdio run wdio.native.conf.ts --spec ./tests/native-x11/specialized-views.spec.ts'
pnpm desktop:build && pnpm production:check && pnpm advisories:check
```

Remove `"$SCRATCH"` and the owned screenshots afterwards. The native suite
overwrites the shared release executable, so the ordinary production rebuild
must follow it, as above.
