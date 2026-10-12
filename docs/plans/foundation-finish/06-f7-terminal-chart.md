# 06 — F7: bounded terminal and chart wrappers

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs no fixture.

Plan packet: [F7](../foundation-completion-flash.md#f7--qualify-bounded-terminal-and-chart-wrappers). Maps to checkpoint C6.3 and task FND-005. Prerequisite: document 05 is `done`.

## Outcome

A lazily loaded terminal showing synthetic output and a lazily loaded chart render under the same packaged CSP as the editor, keep a bounded amount of data, and dispose explicitly. This proves the two remaining specialized view types are feasible. It does not build any feature that uses them.

## Read before you start

| File                                                                      | Why                                                           |
| ------------------------------------------------------------------------- | ------------------------------------------------------------- |
| [Document 05](05-f6-editor-workers-csp.md) and its ledger entries         | The lazy-loading, CSP, and cleanup pattern you repeat         |
| [quality.md section 6](../../quality.md#6-frontend-and-native-ux-quality) | The UX and accessibility gates                                |
| `src/components/ui/`, `src/styles.css`, `src/lib/state/shell.svelte.ts`   | Wrapped primitives, theme tokens, and appearance state        |
| The `svelte` skill's sections on attachments and reduced motion           | How the wrappers own their DOM and respect motion preferences |

Apply the `talos-pilot-svelte` and `talos-pilot-typescript` skills, and `talos-pilot-tauri` for the native evidence.

## Context

### Scope

Inputs are synthetic. This packet does **not** implement container exec, API log streaming, metrics collection, or port forwarding. Those belong to later milestones and bring their own security review. A wrapper here takes data through props and renders it.

### Starting bounds

From the plan. Verify behavior at each bound and one step beyond it, and refine a bound only with evidence.

| Bound                    | Starting value                                    |
| ------------------------ | ------------------------------------------------- |
| Terminal retention       | 1 MiB or 10,000 lines, whichever is reached first |
| Samples per chart series | 2,000                                             |
| Series per chart         | 8                                                 |

When a bound is reached, the oldest data is evicted. Retention must never grow past the bound, whatever the input rate.

### The packages

The plan names xterm.js and uPlot. Confirm the current package names and compatible versions from their upstream sources before pinning; do not write a name or version from memory. Record pins and licenses in `docs/dependencies.md`.

## Do not

- Do not connect the terminal to a process, a socket, or the helper.
- Do not change the CSP for these wrappers unless document 05's rule is met: minimum change, native evidence, nothing that broadens script sources.
- Do not put theme or density values in the wrappers. Map them in one place from the existing tokens.
- Do not animate when the user prefers reduced motion.

## Work

1. Pin the terminal and chart packages.
2. Write one wrapper component for each, cohesive and attachment-based, with an `@component` comment and documented props. Each wrapper owns its instance, its resize handling, and its disposal.
3. Centralize the mapping from the application's theme and density to each library's options.
4. Enforce retention in the wrapper or its state module, not in the caller.
5. Load each wrapper as its own lazy chunk. A cancelled lazy import, where the user leaves before the chunk arrives, must leave nothing behind.
6. Add a feasibility surface that feeds synthetic output and synthetic series, inside an existing view.
7. Test the races: resize, theme change, and disposal in every order, and repeated mount, unmount, and prop replacement.
8. Native evidence in the release executable: both wrappers render, assets resolve offline, and cleanup counters return to baseline.

## Acceptance cases

1. Terminal output at the retention bound stays within it; one line more evicts the oldest.
2. An oversize batch delivered at once does not exceed the bound and does not freeze the view.
3. A chart with 8 series of 2,000 samples renders; a ninth series or an extra sample is handled according to the documented rule.
4. Resize, theme change, and dispose in any order leave no error and no leaked listener.
5. Repeated mount and unmount, and prop replacement, return instance and listener counts to baseline.
6. A cancelled lazy import leaves nothing mounted and nothing pending.
7. Both wrappers work offline and under the packaged CSP.
8. Both are operable by keyboard, expose accessible names, and respect reduced motion.
9. All of the above hold in the release executable on the development WebView.

## Gates

TypeScript and Svelte gates, `pnpm test:e2e`, `pnpm test:native`, then `pnpm desktop:build` and `pnpm production:check`. Dependency gates for the new pins.

## Done means

- Every acceptance case has recorded evidence, with browser and native results labelled separately.
- The final bounds are recorded with the evidence that set them.
- The plan's exit holds: C6 specialized views pass on the development WebView.
- C6 stays `in progress` in the milestone ledger until documents 08 and 10 supply the installed-package and remaining platform evidence.
