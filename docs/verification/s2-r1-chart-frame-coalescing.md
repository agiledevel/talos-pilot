# S2-R1 corrective evidence: one coalesced chart frame

Date: 2026-10-25. Corrects **S2-R1** from the [S2 implementation review and S3
readiness](s2-review-s3-readiness.md). Source revision: `5e306a5` on
`docs/s2-flash-readiness`, on top of the reviewed `114fbdb` (which is based on
merged `main` `a7ada06`). This record also reconciles the **S2-R2** attribution
in [the F7 evidence record](f7-terminal-chart.md), which now carries the values
of the execution it describes.

**Disposition:** S2-R1 is fixed with a committed failing-before/passing-after
regression, and the affected renderer, browser, native, trusted-input and ordered
production gates were rerun on the corrective tree on Linux. F7 is **not** moved
to accepted here: the corrective revision has no hosted Foundation/Security run
yet (the branch push needs owner authorization), so document 06 stays in
progress and S3 stays gated on that run and on the owner's merge.

## Defect and fix

The reviewed defect was in
[chartAttachment.svelte.ts](../../src/features/charts/chartAttachment.svelte.ts):
the chart owned one animation frame, a resize delivery and an admitted
same-shape replacement could both request it, and only the first callback was
kept. `resize()` re-drove a pending replacement, but `flush()` measured the host
size and never applied it, so with a **data-first** request order the chart kept
its old canvas dimensions while reporting zero pending work.

The attachment now has one drain for both kinds of work. `drain()` runs from the
single owned frame whether a replacement or a `ResizeObserver` delivery
requested it, reads the replacement and the measured size at frame time, applies
a changed size through `applySize()` (which skips an unchanged size), and then
applies the data in place or recreates the instance for a changed shape. The
separate `resize()` callback is gone, so neither request order can leave stale
dimensions or an unrendered window behind. No framework, API, IPC, CSP,
dependency or packaging change was introduced.

## Regression evidence

Committed in [tests/e2e/specialized-views.spec.ts](../../tests/e2e/specialized-views.spec.ts):
`one coalesced chart frame applies a replacement and a resize in either order`.
It holds the page's animation-frame callbacks in a gate (real Chromium, real
pinned uPlot, scripted appearance/storage IPC only), uses real `ResizeObserver`
deliveries for the shrunk host, and asserts rendered geometry and rendered data
rather than counters alone:

| Step             | Assertion                                                                                                                                                                                                                                                                                                                  |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Data first       | Clicking "Next sample" leaves exactly one held frame and `Queue: 1`; shrinking the host to 300 px and waiting for the real observer delivery still leaves exactly one held frame (the delivery's request was dropped); after releasing it the canvas is **292 px** for a 300 px host, with `Queue: 0` and `Scheduled: 0 B` |
| Replacement data | Back at the original geometry, the canvas pixel digest differs from the pre-replacement digest taken at the same size, so the replacement reached the canvas during the shared frame and did not remain unrendered                                                                                                         |
| Resize first     | Shrinking first to 420 px leaves one held frame; the replacement admitted afterwards stays `Queue: 1` with one held frame; after release the canvas is **412 px** and the bounded window is still `2 series × 300 aligned samples`                                                                                         |

Before/after:

| Command                                                                      | Tree                                                 | Result                                                                                                                           |
| ---------------------------------------------------------------------------- | ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm exec playwright test tests/e2e/specialized-views.spec.ts -g coalesced` | `114fbdb` attachment (fix reverted, regression kept) | **Failed as intended:** `Expected: 292`, `Received: 726` at the data-first dimension assertion. Log: `/tmp/tp-r1-e2e-prefix.log` |
| same                                                                         | `5e306a5`                                            | **1 passed**; the full specialized-view file passed **8/8**                                                                      |

The unfixed run reproduces the reviewed observation exactly (host 300 px, chart
726 px instead of 292 px); the committed regression therefore fails without the
fix. It is browser/scheduler evidence only: it does not establish native WebView
frame behavior.

## Final gates on the corrective tree

All commands ran from the repository root with the private pinned toolchain
already installed by an earlier session's `pnpm toolchain:bootstrap`
(`Node 26.12.1`, `pnpm 12.15.0`, `Rust 1.99.1`, `Go 1.27.3`, `protoc 36.2`); this
session did not reinstall or refresh it.

| Command                                                                       | Result                                                                                                                                                                                                                                   |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:ci`                                                               | Passed: Oxfmt, type-aware Oxlint, `svelte-check` 0 errors/0 warnings, **319 tests / 43 files** with coverage (67.54% statements / 73.62% branches), production frontend build. Log: `/tmp/tp-r1-check-ci.log`                            |
| `pnpm test:e2e`                                                               | Passed **31/31** in 26.0 s, including the new coalescing regression and every existing terminal/chart/editor/shell/workloads/appearance flow. Log: `/tmp/tp-r1-e2e.log`                                                                  |
| `xvfb-run … pnpm test:native` (explicit `-screen 0 1280x800x24`, private XDG) | Passed **31/31 across 5 spec files** (4 chart, 5 editor, 12 helper/shell, 7 Kubernetes-session, 3 terminal) in WebKitGTK 605.1.15 under the packaged CSP; no helper process or synthetic endpoint remained. Log: `/tmp/tp-r1-native.log` |
| X11 trusted-input pass (`tests/native-x11/specialized-views.spec.ts`)         | Passed **1/1** with 64 trusted XTEST keys on a private `:99` display and one exact "Talos Pilot" window; new captures in `/tmp/tp-r1-native-x11`. Log: `/tmp/tp-r1-native-x11.log`                                                       |
| `pnpm desktop:build`                                                          | Passed; ordinary release executable SHA-256 `e44ad92b0f5763a29e77c747b79944337af092a446ca32f6a85f4c474f46ceb2`. Log: `/tmp/tp-r1-desktop-build.log`                                                                                      |
| `pnpm production:check`                                                       | Passed: production artifacts exclude WebDriver and expose no driver listener. Log: `/tmp/tp-r1-production.log`                                                                                                                           |
| `pnpm advisories:check`                                                       | Passed: 67,079 demangled symbols against the five recorded advisories. Log: `/tmp/tp-r1-advisories.log`                                                                                                                                  |

Ordered as required: native execution first, then `pnpm desktop:build`,
`pnpm production:check`, `pnpm advisories:check`. The native suite overwrote the
shared release executable, and the ordinary rebuild above restored the
production artifact recorded here.

New trusted-input captures for this revision:

| Artifact                             | Size     | SHA-256                                                            |
| ------------------------------------ | -------- | ------------------------------------------------------------------ |
| `/tmp/tp-r1-native-x11/terminal.png` | 1200×800 | `3378f7ad0a7a22015b5a54ca2058f3e0573fc5019bf0c2b1e938a256e52a7121` |
| `/tmp/tp-r1-native-x11/chart.png`    | 1200×800 | `46139edac6e4baa2e660938b6cfe8572797a8e5a06df63c4761f3b7fbf84ed5f` |

These are the hashes of _this_ execution's retained files and log, not a claim
that a rendered-window PNG is byte-stable between executions: the terminal
capture of this run differs from the S2-D capture, which is expected for a
window that contains a blinking cursor and pointer-dependent chrome. A capture
digest identifies the artifact of the run that recorded it; adding it to a
different run's record is what made S2-R2's attribution inconsistent.

## S2-R2 reconciliation

[The F7 evidence record](f7-terminal-chart.md) now states the test count and the
three artifact digests of the execution it claims to describe, taken from the
retained final S2-D evidence: 319 tests / 43 files (`/tmp/tp-f7-check-ci.log`),
executable `c6a4eeef…`, `terminal.png` `4f679ef1…` and `chart.png` `8041ebf0…`
(matching the append-only S2-D ledger entry and `/tmp/tp-f7-native-x11.log`). It
also records that the earlier values in that file were stale, and that this
corrective revision's artifacts are recorded only here.

## Limits

- The regression controls frame dispatch by replacing the page's
  `requestAnimationFrame` in the test harness; the application runtime is
  unchanged. It proves the attachment's coalescing behavior in Chromium, not
  that a particular native compositor schedules frames identically.
- The native suite reruns the F7-05 appearance/resize/cleanup flow in WebKitGTK,
  but it does not control the native frame order, so it is corroboration rather
  than the ordering regression itself.
- No hosted Foundation/Security result exists for `5e306a5`. Hosted desktop
  builds are not native WebView, minimum-OS or installed-package qualification.
- No installed package, macOS/Windows WebView, clean-VM smoke, fixture, cluster
  or performance measurement was involved; the pinned dependency set is
  unchanged, so inventory/advisory-input regeneration was not repeated beyond
  `pnpm advisories:check`. No CSP, capability, IPC or credential boundary changed.

## Reproduction

```sh
export PATH="$PWD/.tools/node/bin:$PWD/.tools/go/bin:$PWD/.tools/protoc/bin:$HOME/.cargo/bin:$PATH"
pnpm toolchain:bootstrap
pnpm check:ci
pnpm test:e2e
SCRATCH=$(mktemp -d /tmp/tp-r1-native.XXXXXX)
mkdir -p "$SCRATCH"/{data,config,cache,runtime} && chmod 700 "$SCRATCH/runtime"
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$SCRATCH/data" XDG_CONFIG_HOME="$SCRATCH/config" \
  XDG_CACHE_HOME="$SCRATCH/cache" XDG_RUNTIME_DIR="$SCRATCH/runtime" pnpm test:native
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' sh -c \
  'env GDK_BACKEND=x11 XDG_DATA_HOME='"$SCRATCH"'/data XDG_CONFIG_HOME='"$SCRATCH"'/config \
   XDG_CACHE_HOME='"$SCRATCH"'/cache XDG_RUNTIME_DIR='"$SCRATCH"'/runtime \
   TALOS_PILOT_NATIVE_X11_DISPLAY=$DISPLAY TALOS_PILOT_NATIVE_X11_SHOTS=/tmp/tp-r1-native-x11 \
   pnpm exec wdio run wdio.native.conf.ts --spec ./tests/native-x11/specialized-views.spec.ts'
pnpm desktop:build && pnpm production:check && pnpm advisories:check
```

To reproduce the failing-before result, restore the `114fbdb` chart attachment
while keeping the committed regression and run only that browser test; remove
`"$SCRATCH"` and the owned screenshots afterwards.
