# 05 — F6: offline Monaco/YAML workers under the packaged CSP

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs no fixture.

Plan packet: [F6](../foundation-completion-flash.md#f6--qualify-svelte-shell-and-offline-monacoyaml-workers). Maps to checkpoints C6.1 and C6.2 and task FND-005. Prerequisite in the plan: F5. It may be taken earlier when a fixture document is blocked, if the ledger records why.

**Current status, 2026-10-25: in progress; S1 corrective plan READY.** The
initial S1 implementation/native/hosted results remain attributed in
[F6 evidence](../../verification/f6-editor-workers-csp.md) and the append-only
[ledger](ledger.md). A subsequent review reopened acceptance for three P2 cases:
preserving the owning accepted draft across rejection/close/reopen, restoring
rendered inline diagnostics after a rejected edit, and releasing rejected initial
options/component copies. Corrections are prepared; use the
[ready corrective plan](follow-up-to-m2.md#s1--bound-editordiff-input-and-validation-work-document-05-follow-up)
and [launch prompt](s1-launch-prompt.md) to finish final qualification and acceptance.
S0 remains [accepted under its owner exception](../../verification/s0-native-keyboard-acceptance.md);
B11 is unresolved/not fixed and diagnostics stay. F7 has not started. C6 stays
**in progress** for terminal/chart wrappers, installed packages and deferred
WebView platforms.

## Outcome

A lazily loaded YAML editor and a diff view work offline in the release executable, under the packaged content security policy, without weakening that policy. They show which target they belong to, and they dispose their models and workers when closed. The shell's themes, density modes, and accessibility are re-verified on the way.

## Read before you start

| File                                                                                    | Why                                                                     |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- |
| [Decision 0008](../../decisions/0008-svelte-skeleton-renderer.md)                       | The renderer stack and its rules                                        |
| [Decision 0009](../../decisions/0009-desktop-shell-layout.md)                           | The shell layout, the View menu, and the navigation rule                |
| [quality.md section 6](../../quality.md#6-frontend-and-native-ux-quality)               | The UX and accessibility gates                                          |
| `src-tauri/tauri.conf.json`                                                             | The packaged CSP                                                        |
| `src/components/PilotApp.svelte`, `src/components/ui/`, `src/lib/state/shell.svelte.ts` | The shell, the wrapped UI primitives, and appearance state              |
| `src/styles.css`, `vite.config.ts`, `vite.native-test.config.ts`                        | Styling tokens and build configuration                                  |
| `tests/e2e/`, `playwright.config.ts`                                                    | Browser flows with axe checks                                           |
| `tests/native/helper-status.spec.ts`                                                    | The native shell tests, including a theme change under the packaged CSP |
| The `svelte` and `talos-pilot-svelte` skills, in particular attachments and lifecycle   | How cleanup is expressed in Svelte 5                                    |

Apply the `talos-pilot-svelte`, `talos-pilot-typescript`, and `talos-pilot-tauri` skills.

## Context

### The current policy

The packaged CSP is:

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self'; connect-src ipc: http://ipc.localhost;
object-src 'none'; base-uri 'none'; frame-src 'none'
```

It has no `worker-src`, so workers fall back to `script-src 'self'`. A worker loaded from a bundled same-origin URL is allowed. A worker created from a `blob:` URL is not, and neither is `eval`. `style-src` allows inline styles because Skeleton and Bits UI set inline style attributes.

The goal is to make the editor work inside this policy. Any change to it must be the minimum needed, justified by native evidence, and must not broaden executable script sources or add a remote origin.

### What exists

- No Monaco, YAML, terminal, chart, or query dependency was installed when this series was written, apart from whatever document 02 added. Check `package.json`.
- The shell has system, light, and dark themes and two density modes, stored through Rust and applied from the View menu.
- No installable package exists for this host before document 08. The release executable with its embedded production assets is the native target here. Installed-package behavior is a row for document 08.

### The sample content

Use a benign synthetic YAML document. It must not be, or resemble, a machine configuration with secrets. This packet does not introduce a secret-bearing machine editor.

## Do not

- Do not add `blob:`, `unsafe-eval`, a remote origin, or a wildcard to the CSP.
- Do not remove `'unsafe-inline'` from `style-src` without native evidence that the component libraries still render correctly.
- Do not let the editor fetch a schema or any other resource at runtime. Bundle what it needs, or reject the reference explicitly.
- Do not add a navigation entry for a view that is not a working view of a design group. A feasibility surface can live inside an existing view.
- Do not treat React Strict Mode double-invocation as a test contract. This is Svelte.

## Work

1. **Shell first.** Re-verify, and fix where needed: saved and rejected appearance preferences, focus restoration after menus and dialogs, the visible target context, scaling, and both density modes. Extend the existing accessible patterns; do not reimplement the shell.
2. **Pin the editor.** Research the current compatible Monaco and YAML language-support packages from their upstream sources. Pin exact versions. Record them and their licenses in `docs/dependencies.md`.
3. **Bundle the workers.** Configure the build so every worker and schema asset is emitted as a bundled same-origin file with a source-bundled worker URL.
4. **Lazy loading.** The editor is a separate chunk loaded on first use. The initial shell bundle must not grow by the editor's size.
5. **The feasibility surface.** A component with an `@component` comment and documented props, and a `.svelte.ts` state module:
   - show a malformed YAML sample and a diagnostic that the worker actually produced;
   - correct the sample and show the diagnostic clear;
   - render a real diff between two versions;
   - keep the target context visible.
6. **Cleanup.** Use attachments for setup and teardown. Closing the surface disposes models, editors, workers, and listeners. Expose counters or diagnostics that a test can read to prove it.
7. **CSP evidence.** Add negative tests: a script from an unauthorized origin and an inline script must be blocked. Show no request leaves the application for a remote origin.
8. **Native evidence.** In the release executable: lazy chunk loading, offline asset resolution, and the worker producing its diagnostic. Then open and close repeatedly, replace props, resize, and change theme, while observing that workers, models, and listeners return to baseline.

## S1 follow-up acceptance (2026-10-25)

F6-B1 was the source finding that the parser rejected documents above 64 KiB
only after model creation and full worker transfer, while the diff accepted
unrestricted strings and debouncing left queued work unbounded. The initial S1
implementation adds the following contract without changing the CSP; final
acceptance now also requires S1-P2-1/2/3 in the linked corrective plan:

- the 64 KiB value is an explicit UTF-8 **byte** ceiling, admitted before model
  creation/replacement and before worker transfer for initial, replaced and
  edited/pasted/undo-redo documents and both diff sides;
- rejection is visible, the prior accepted document stays usable, nothing is
  truncated, the rejected text is not retained, and a rejected initial document
  creates no model and recovers when a bounded replacement arrives;
- validation keeps one in-flight request and at most one coalesced latest
  document, invalidates diagnostics immediately on a document change, and
  ignores stale/duplicate/out-of-order replies;
- timeout, worker error, bounded restart and disposal are explicit and tested by
  observing dispatched/in-flight/queued work and resource counters.

The evidence matrix, commands and limits are in
[F6 evidence](../../verification/f6-editor-workers-csp.md#s1-bounds-and-bounded-validation-acceptance--2026-10-25)
and the S1 entry in the [ledger](ledger.md). This follow-up changes no
acceptance case below; it makes cases 3 and 8 hold under bounded input as well.

## Acceptance cases

1. Both themes and both density modes render correctly at 1280×800, 1024×700, and 720×480, with keyboard navigation and axe checks passing.
2. A rejected preference save leaves the visible state and the stored state consistent, and says so.
3. Malformed YAML produces a worker diagnostic; the corrected text clears it.
4. A diff renders, with its target context visible.
5. The editor chunk loads only on first use.
6. With the network unavailable, the editor still works and makes no remote request.
7. An unauthorized script source and an inline script are blocked by the CSP.
8. After repeated open and close, prop replacement, resize, and theme change, worker, model, and listener counts are back at baseline.
9. All of 3 to 8 hold in the release executable on the development WebView, not only in a browser.

## Gates

- TypeScript and Svelte gates, `pnpm test:e2e` in both themes at the three sizes, `pnpm test:native`, then `pnpm desktop:build` and `pnpm production:check`.
- Dependency gates for the new pins.
- A recorded bundle size for the shell chunk and the editor chunk, as an observation for document 09, not as a budget.

## Done means

- Every acceptance case has recorded evidence, with browser and native results labelled separately.
- Any CSP change is recorded in a decision record with the native evidence that justified it. If the CSP did not change, say so.
- The plan's exit holds: native offline editor and worker feasibility passes without a CSP bypass.
- C6 stays `in progress` in the milestone ledger: the installed-package rows belong to document 08, and the macOS and Windows WebView rows to document 10.
