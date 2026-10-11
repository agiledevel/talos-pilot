# 0010: macOS 13.3 minimum for the packaged WebView stack

Date: 2026-10-11. Status: accepted. Owner-directed: asked to resolve the
contradiction between the declared macOS minimum and the renderer's browser
target, the owner chose to raise the declared minimum to macOS 13.3 rather
than keep 13.0 as a documented best-effort. The question and the alternatives
are recorded under [foundation completion](../plans/foundation-completion-flash.md#5-implementation-packets),
packet F0 step 5.

## Context

The foundation declared macOS 13.0 in two places while the renderer required a
newer engine than a stock macOS 13.0 provides:

- [`.github/tauri.release.conf.json`](../../.github/tauri.release.conf.json)
  sets `bundle.macOS.minimumSystemVersion` to `13.0`, which Tauri maps to the
  bundle's `Info.plist` `LSMinimumSystemVersion` and to
  `MACOSX_DEPLOYMENT_TARGET`
  ([Tauri configuration reference](https://v2.tauri.app/reference/config/)).
- [`vite.config.ts`](../../vite.config.ts) builds for
  `["es2022", "chrome111", "safari16.4"]`, and Tailwind CSS v4 documents its
  supported engines as Chrome 111, Safari 16.4, and Firefox 128
  ([Tailwind compatibility](https://tailwindcss.com/docs/compatibility)).

[0008](0008-svelte-skeleton-renderer.md#consequences) already recorded the
consequence as a caveat: "On macOS the design's 'macOS 13+' baseline now
effectively means the WebKit shipped with macOS 13.3 or a later Safari update."
The design's macOS row still read "macOS 13+ baseline"
([design](../design.md#initial-packaging-targets)), so the declared minimum and
the actual requirement disagreed. Packet F0 had to settle which engine a
`WKWebView` uses on 13.0 and on later 13.x releases.

## Evidence

| Claim                                                                                                                                                 | Source                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Tailwind CSS v4 is designed for and tested on Chrome 111 / Safari 16.4 / Firefox 128                                                                  | [tailwindcss.com/docs/compatibility](https://tailwindcss.com/docs/compatibility), read 2026-10-11                                                                                                                              |
| Tailwind's "Safari 16.4" is the release that added `@property`, which its registered custom properties (`--tw-*`) depend on; `color-mix()` needs 16.2 | [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/)                                                                                                                                |
| macOS Ventura 13.0 shipped with Safari/WebKit 16.1                                                                                                    | [WebKit Features in Safari 16.1](https://webkit.org/blog/13399/webkit-features-in-safari-16-1/): "Today, Safari 16 arrives for macOS Ventura … Numbered Safari 16.1"                                                           |
| Safari/WebKit 16.4 arrived with macOS Ventura 13.3 and was also offered as an update to earlier macOS 13 releases                                     | [WebKit Features in Safari 16.4](https://webkit.org/blog/13966/webkit-features-in-safari-16-4/), [Safari 16.4 release notes](https://developer.apple.com/documentation/safari-release-notes)                                   |
| A `WKWebView` on macOS renders with the system WebKit framework, which the OS and Safari updates replace; the application does not bundle it          | [Tauri webview versions](https://v2.tauri.app/reference/webview-versions/), [Apple Safari release notes](https://developer.apple.com/documentation/safari-release-notes) (they cover `WKWebView` changes together with Safari) |
| Apple publishes no API that reports the WebKit version of a `WKWebView` on macOS; the practical check is `WebKit.framework`'s `CFBundleVersion`       | [WebKit bug 278284](https://bugs.webkit.org/show_bug.cgi?id=278284)                                                                                                                                                            |

So a stock, never-updated macOS 13.0 carries WebKit 16.1 and falls short of the
built target, while any macOS 13 that has received the Safari 16.4 update — and
every macOS 13.3 or later — carries it. The runtime confirmation of what
13.3 actually renders remains with packet F9, which tests the declared minimum
on real hardware; this record establishes the version mapping only.

## Decision

The declared macOS minimum is 13.3:

1. `minimumSystemVersion` becomes `13.3` in the release configuration, so the
   shipped bundle's `LSMinimumSystemVersion` states the version the renderer
   actually needs.
2. The design's macOS packaging target becomes "macOS 13.3+ baseline".
3. F9 qualifies 13.3 as the minimum, on both Apple Silicon and Intel, and
   records the WebKit `CFBundleVersion` it observed there.

A macOS 13.0–13.2 installation that has applied the Safari 16.4 update would
in practice also render correctly. That is not used as the declared minimum,
because it is a property of one machine's patch level rather than of the OS
version the bundle claims to support, and because a user cannot be asked to
read a framework's `CFBundleVersion` to find out.

## Alternatives considered

- **Keep `13.0` and document the gap as a limitation.** Rejected by the owner.
  It declares support for systems the build target does not cover, and any
  Tailwind `@property`-based utility (`border`, `ring`, `shadow`, `transform`
  defaults) would degrade there without an error the user can act on.
- **Keep `13.0` and rely on release notes.** Rejected for the same reason: the
  bundle would launch on a WebKit that predates the target rather than refuse
  to start.
- **Lower the Vite build target to `safari16.1`.** Rejected: Tailwind v4's
  engine requirement is a framework-level dependency, not a syntax-lowering
  choice, and the project has no measurement showing the framework works below
  its documented floor.
- **Defer the decision to F9's runtime evidence.** Rejected by the owner: the
  contradiction is a source-level fact that can be settled now, and F9 would
  otherwise have to test a minimum the project does not intend to support.

## Acceptance criteria

1. The release configuration declares 13.3, and a built macOS bundle carries
   `LSMinimumSystemVersion` 13.3.
2. No document still states a macOS 13.0 minimum as the supported floor.
3. F9 records the observed `WebKit.framework` `CFBundleVersion` and the
   renderer's behaviour on a clean 13.3 installation for both architectures.

## Consequences

- **The supported floor rises to 13.3.** macOS 13.0–13.2 without the Safari
  16.4 update is outside the declared support, and macOS refuses to launch the
  bundle there. Their earlier rows in the milestone plans are read as 13.3.
- **The WebView baseline is now a requirement, not a caveat.** 0008's
  consequence stays as the reasoning behind the requirement.
- **Nothing else moves.** The Linux and Windows targets, the dependency set,
  the CSP, and the build target are unchanged, and the change adds no code.
- **Not yet established:** that 13.3 renders the packaged shell and its workers
  correctly. A version mapping is not a runtime result; F9 owns that row, and
  preview DMGs stay ad-hoc signed and un-notarized.

## Verification

- The evidence table above is from the cited primary sources, read on
  2026-10-11; the two version mappings were checked in both directions
  (13.0 → 16.1, 13.3 → 16.4).
- `bundle.macOS.minimumSystemVersion` → `Info.plist` `LSMinimumSystemVersion`
  is Tauri's documented mapping, read from the configuration reference above.
- The configuration edit is consumed by nothing local. `.github/tauri.release.conf.json`
  is referenced only by the release workflow, which passes it to
  `pnpm tauri build --config`; that is where the Tauri CLI validates it and
  where the resulting `Info.plist` can be observed. A local `pnpm check`
  therefore does not exercise this value, and no gate covers it before
  packaging. The release assets job and F9's packaging rows are where it
  becomes observable.
- Not executed here: a macOS build or an `Info.plist` inspection, and the F9
  runtime rows. This host is Linux x86_64 and has no macOS runner.
