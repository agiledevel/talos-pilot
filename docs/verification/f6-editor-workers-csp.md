# F6 offline YAML editor and packaged CSP evidence

Date opened: 2026-10-23. Packet:
[05 F6 editor workers and CSP](../plans/foundation-finish/05-f6-editor-workers-csp.md).
Base revision: `d9db19b` on `ft-foundation-completion`. Final revision: the
commit carrying this record. This record follows the
[series ledger](../plans/foundation-finish/ledger.md), which carries the summary
and the next action.

Document 05 was taken before the fixture document 04 because the owner answered
Q11 with "Finish Session A2, then documents 05 to 08; run documents 01/04 as
soon as a fixture window is prepared." No fixture, live cluster, installed
package, or completed F5 claim is involved. The CI prerequisite handoff is
closed; its head results at `d9db19b` were documentation-only evidence
(Foundation `39881901336` in 41s and Security `39881901333` in 27s, desktop
skipped, renderer/browser and CodeQL reused executed evidence from `facf409`).

## Acceptance matrix

`Browser` is Chromium through Playwright or a renderer test. `Native` is the
actual Tauri release executable built by `pnpm test:native` with embedded
production assets, the development WebView (WebKitGTK 605.1.15), and the
packaged CSP. Browser mocks are not used for a native row.

| Case                                       | Result                                                                                           | Evidence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Themes, densities, sizes, keyboard, axe | **Pass — browser**. Native not required by case 9; the editor also rendered in the native suite. | `tests/e2e/editor.spec.ts`: light/dark × comfortable/compact × 1280×800/1024×700/720×480, axe after the worker diagnostic at each state, no page scroll, status bar context, keyboard activation and focus return. `pnpm test:e2e` passed 16 tests.                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 2. Rejected preference save                | **Pass — browser and deterministic**. Native not required by case 9.                             | `tests/e2e/editor.spec.ts` scripts a rejected `set_appearance_settings` for Dark: the root stays without `data-mode`, the View menu keeps System checked, the stored value remains `{theme:system,density:comfortable}`, and an alert is shown. `src/lib/state/shell.test.ts` also covers the state transition.                                                                                                                                                                                                                                                                                                                                                     |
| 3. Worker diagnostic and correction        | **Pass — browser and native**.                                                                   | The worker uses `yaml` 2.9.1 on the synthetic malformed document; the browser and native runs observed a nonempty `YAML diagnostic:` from the worker, then `No YAML diagnostics` after Apply correction. Renderer tests cover the malformed/corrected/oversized parser paths.                                                                                                                                                                                                                                                                                                                                                                                       |
| 4. Real diff with target context           | **Pass — browser and native**.                                                                   | The read-only Monaco diff rendered both `batches:` lines and the visible `Malformed sample`/`Corrected sample` labels; the target line `Synthetic release preview (offline, no cluster)` is visible in the surface and status bar.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 5. Lazy editor chunk                       | **Pass — browser request evidence; native first-use state plus build graph**.                    | Before opening, the browser made no `YamlEditorSurface`/Monaco request, and the native panel read `Editor chunk: not-loaded` with zero workers. Opening made the browser requests for the surface, Monaco and YAML worker; the native panel then read `Editor chunk: loaded` with the same-origin `YamlEditorSurface` URL and both bundled worker names. The production shell chunk contains no Monaco import; the editor chunk is a separate `YamlEditorSurface-*.js` graph. Native WebKitGTK returned no resource-timing entries, so the native assertion uses the application's first-use observation and the reviewed build manifest rather than a network log. |
| 6. Offline / no remote request             | **Pass with the stated simulation limit — browser and native**.                                  | Browser: every non-test-server request was aborted and the editor corrected successfully with zero remote requests. Native: non-local `fetch` was rejected and recorded, the editor corrected successfully, all bundled assets stayed on `location.origin`, and no `blob:` asset appeared. The host network was not disconnected. CSP also blocks remote scripts/images/fonts/workers by policy; the negative script test is below.                                                                                                                                                                                                                                 |
| 7. CSP denial                              | **Pass — native packaged CSP; browser supporting check**.                                        | Native appended an inline script and `https://example.invalid/talos-pilot-csp.js`; neither ran and `securitypolicyviolation` reported a `script-src` directive. Browser additionally reproduced the same denial with a CSP meta tag. The packaged CSP was not changed.                                                                                                                                                                                                                                                                                                                                                                                              |
| 8. Cleanup to baseline                     | **Pass — browser and native**.                                                                   | Three native open/close cycles exercised Apply correction, Reset, host resize, dark/light theme changes; the panel returned to `Workers: 0 · Models: 0 · Listeners: 0` after every close and after the final close. Browser repeat/close, navigation-away, and cancelled-import tests also returned to zero; unit tests cover idempotent listener/worker/model counters.                                                                                                                                                                                                                                                                                            |
| 9. Release executable (cases 3–8)          | **Pass — native**.                                                                               | `pnpm test:native`: 4 editor tests passed in the release executable with embedded assets, alongside the 12 existing helper/shell tests and 7 Kubernetes session tests (23 total, 3 spec files). Cases 3–8 are the four editor tests plus the shared CSP/cleanup assertions; see the command record below.                                                                                                                                                                                                                                                                                                                                                           |

## Implementation and invariants

- `src/features/editor/editorMonaco.ts` installs the worker factory and a small
  YAML language/tokenizer. It imports `monaco-editor/editor/editor.api`, not the
  all-language root. Both workers are emitted by Vite as same-origin files and
  constructed with an inline `new Worker(new URL(..., import.meta.url), {type:"module"})`.
  The Monaco light theme has one darkened key-token override because the theme
  API requires hex colours and the stock token failed WCAG AA on the diff
  inserted-line background; the dark base theme is unchanged.
- `src/features/editor/yamlAnalysis.ts` owns the 64 KiB document bound, the
  20-diagnostic/message bounds, one-based positions, and runtime validation of
  worker requests/responses. `src/lib/state/yamlDiagnostics.worker.ts` is the
  dedicated worker and never fetches a schema or remote document.
- `src/lib/state/yamlEditorSession.svelte.ts` owns one model, editor, worker,
  debounce timer, content listener, resize observer, appearance observer, and
  worker listeners. A stale response id is ignored. `src/lib/state/yamlDiffSession.svelte.ts`
  owns two read-only models and one diff editor. Both attach through
  `{@attach}` and release their resources in the attachment cleanup.
- `src/lib/state/editorRuntimeDiagnostics.svelte.ts` exposes the user-visible
  worker/model/listener counters and the first-use editor-chunk/worker-asset
  observations. These are application diagnostics, not test-only commands.
- The surface is inside the existing Home view (`EditorFeasibilityPanel`); no
  navigation entry was added. The initial shell only imports the panel state and
  a dynamic import of `YamlEditorSurface.svelte`.

## CSP

The packaged policy in `src-tauri/tauri.conf.json` is unchanged:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost;
object-src 'none'; base-uri 'none'; frame-src 'none'
```

No `worker-src` is needed: the same-origin worker assets use the `script-src
'self'` fallback. `style-src 'unsafe-inline'` remains because Skeleton, Bits UI,
and Monaco use inline style attributes/elements; the native editor and diff
rendered without a policy violation. No `blob:`, `unsafe-eval`, wildcard or
remote source was added. A follow-up review should keep the style allowance
scoped to native evidence; this packet did not narrow it.

## Commands and results

Environment: openSUSE Tumbleweed x86_64; Node 26.12.1, pnpm 12.15.0, Rust
1.99.1, Go 1.27.3, protoc 36.2, talosctl v1.14.2; Linux WebKitGTK 605.1.15.
The pinned toolchain was provisioned by the checked-in bootstrap; Go 1.27.3
was verified against the published SHA-256. No host network, firewall, owner
cluster, container, or VM was changed.

| Command                                                                                             | Result                                                                                                                                                                                                         |
| --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm install --frozen-lockfile`                                                                    | Passed.                                                                                                                                                                                                        |
| `pnpm check:ci`                                                                                     | Passed: format (`oxfmt --check`), type-aware Oxlint, zero Svelte errors/warnings, renderer tests with coverage, production build. 191 tests in 26 files; coverage summary 75.54% statements / 78.14% branches. |
| `pnpm test:e2e`                                                                                     | Passed: 16 Playwright tests, including 8 new editor flows (one checks navigation-away disposal); axe clean in both themes/densities at the three viewports.                                                    |
| `pnpm test:native` (private Xvfb `:92`, private `XDG_DATA_HOME`/`XDG_CONFIG_HOME`/`XDG_CACHE_HOME`) | Passed: 23 tests across 3 spec files — 4 editor/worker/CSP tests, 12 helper/shell tests, 7 Kubernetes session tests. The harness reported no remaining helper process or synthetic endpoint.                   |
| `pnpm desktop:build`                                                                                | Passed; rebuilt the ordinary production executable after the native-test build.                                                                                                                                |
| `pnpm production:check`                                                                             | Passed; production artifacts exclude WebDriver and expose no driver listener.                                                                                                                                  |
| `pnpm advisories:check`                                                                             | Passed against the current ordinary binary: 67,043 demangled symbols, 5 recorded advisories still match the scanner report, dependency paths, and linked executable.                                           |
| `pnpm audit --audit-level=low`                                                                      | No known vulnerabilities.                                                                                                                                                                                      |
| `pnpm audit:go`                                                                                     | No called vulnerabilities; one uncalled module vulnerability reported, as before.                                                                                                                              |
| `pnpm inventory:check`                                                                              | Current: 535 npm, 614 cargo, 143 Go modules.                                                                                                                                                                   |
| `pnpm contracts:check`                                                                              | Current: Rust, Go, and TypeScript contracts.                                                                                                                                                                   |
| `pnpm format:check`, `git diff --check`                                                             | Passed on the final tree.                                                                                                                                                                                      |

### Native test details

The editor spec:
`tests/native/editor-worker.spec.ts`.

1. Before opening: panel counters all zero, `Editor chunk: not-loaded`, worker
   assets `not loaded`. After opening: a worker-produced diagnostic, 3 models,
   active worker/listener counts, `Editor chunk: loaded` at the same-origin
   `YamlEditorSurface` URL, both worker names, a diff with both samples and the
   target, no CSP violation, then correction clears the diagnostic, reset
   restores it, close returns all counters to zero and focus to the opener.
2. Three cycles of open → correction → reset → host resize → dark/light theme →
   close. Each close observed `Workers: 0 · Models: 0 · Listeners: 0` and no
   `blob:` worker asset.
3. Non-local `fetch` rejected and recorded; correction still worked; every
   worker/asset URL was same-origin; no remote attempt was recorded.
4. Inline and unauthorized-origin scripts were blocked with a `script-src`
   security-policy violation.

### Bundle observations (not budgets)

From the final ordinary production build:

| Asset                                 | Size       | Gzip      |
| ------------------------------------- | ---------- | --------- |
| Initial shell JavaScript `index-*.js` | 283.69 kB  | 85.05 kB  |
| Initial shell CSS `index-*.css`       | 173.20 kB  | 18.45 kB  |
| Lazy `YamlEditorSurface-*.js`         | 42.14 kB   | 15.96 kB  |
| Lazy Monaco `editor-monaco-*.js`      | 2703.36 kB | 694.29 kB |
| Lazy Monaco CSS `editor-monaco-*.css` | 99.14 kB   | 14.21 kB  |
| Bundled YAML worker                   | 98.01 kB   | —         |
| Bundled Monaco worker                 | 303.77 kB  | —         |

The shell JavaScript chunk does not contain Monaco; the editor graph is loaded
only when the surface opens.

## Findings during implementation (all resolved before the final run)

- The first native predicate matched `No YAML diagnostics` because it searched
  for `YAML diagnostic` without the colon; it was corrected to require the
  diagnostic text before asserting.
- An intermediate `new URL(...)` was stored in a variable before `new Worker`,
  so Vite emitted the TypeScript worker source as a `data:video/mp2t` asset
  instead of a worker chunk. The worker did not start and the surface showed
  the safe worker-start diagnostic. Inlining the `new URL` expression in the
  `new Worker` call emitted both `yamlDiagnostics.worker-*.js` and
  `monacoEditor.worker-*.js`; the final native run proved the real worker
  diagnostic and cleanup. No CSP bypass was used.
- The first browser axe scan found the stock Monaco YAML key token at 4.12:1 on
  the diff inserted-line background. The light theme now darkens that one token
  (hex required by Monaco); both themes pass axe in the final suite.
- WebKitGTK 605.1.15 returned an empty `performance.getEntriesByType("resource")`
  list for the embedded custom protocol. Native lazy evidence therefore uses
  the application's first-use chunk/worker observation plus the reviewed build
  manifest and browser request log; this limitation is stated rather than
  presenting an empty list as proof.

## Uninstalled and cross-platform limits

- No installable package was built or exercised. Installed-package asset
  resolution, Linux package smoke, and the macOS 13.3/current and Windows 11
  WebView rows remain with documents 08 and 10.
- Native evidence is Linux WebKitGTK only. The manual `Native tests` workflow
  entry point is not dispatchable before PR 2 reaches the default branch (the
  recorded HTTP 404 limitation); no hosting result is claimed for this work.
- The host network/VPN was not disconnected. Offline behavior was simulated
  inside owned test resources by rejecting non-local `fetch` and by the CSP's
  remote-source prohibition; this is not a physical link-down test.
- Native resource-timing was unavailable as described above. Browser request
  logs and the production chunk graph provide the complementary lazy evidence.
- No real cluster or fixture was used. No Rust, Go, or contract source changed;
  the Rust/Go/contract gates were not rerun except for the native build and the
  recorded dependency/contract checks.

## Review record

The final diff review checked: CSP unchanged; same-origin worker construction;
no remote schema request; 64 KiB/20-diagnostic/20-request bounds; stale
response ids; idempotent attachment cleanup; no `blob:`, `unsafe-eval`, or
production test capability; no credential or cluster data in the surface;
Monaco's `dompurify` override reviewed against advisories; generated inventory
updated from lockfiles; and documentation links/anchors. Findings were corrected
before the final gates; no skipped gate is reported as a pass.
