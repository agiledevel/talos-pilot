# 0019: Owned offline YAML worker for the packaged editor

Date: 2026-10-23. Status: accepted for the F6 feasibility surface. This record
covers the editor integration and its cleanup; it does not change the packaged
CSP.

## Context

F6 needs a lazily loaded Monaco editor and diff that work offline under the
packaged CSP, show a diagnostic produced by a real worker, and dispose their
models, workers, and listeners when closed. The current upstream packages were
researched from their published metadata and sources:

- `monaco-editor` 0.57.0 (MIT) is the current stable editor release.
- `monaco-yaml` 5.5.1 (MIT) is the current stable Monaco YAML plugin. Its peer
  range is `monaco-editor >=0.36`, but its released worker integration still
  calls the `createWebWorker({ moduleId, label, createData })` form that Monaco
  0.55 replaced. Its `dispose()` also disposes language providers without
  disposing the worker manager, which leaves a 30-second interval and a worker
  alive after the editor closes.
- `yaml` 2.9.1 (ISC) is the current stable YAML parser used by the YAML language
  server and by `monaco-yaml` itself. It is browser-safe and worker-safe.

The alternatives were to pin Monaco 0.54.0 with `monaco-yaml` 5.5.1 and
maintain a fork/patch for the worker-manager leak, or to use the current Monaco
with a small owned worker around the upstream parser. The first alternative
retains a standard schema/completion plugin but couples the editor to an older
Monaco line and a compiled third-party patch. The second keeps the current
editor and owns the small request protocol and cleanup path directly.

## Decision

Use `monaco-editor` 0.57.0 and `yaml` 2.9.1. The editor loads through
`monaco-editor/editor/editor.api` so the initial shell does not import every
Monaco language. A dedicated worker in `src/lib/state/yamlDiagnostics.worker.ts`
imports `analyzeYaml` from `src/features/editor/yamlAnalysis.ts`; it parses only
the supplied text, bounds documents at 64 KiB and diagnostics at 20 entries, and
returns one-based positions. The renderer validates every worker response at
runtime before setting Monaco markers.

The editor and diff are lazy chunks. Both worker entry points are emitted by
Vite as same-origin assets and constructed with
`new Worker(new URL(..., import.meta.url), { type: "module" })`. The Monaco
worker factory never returns a `blob:` URL or a remote URL. The synthetic
surface uses an inline schema-free document, performs no schema request, and
does not implement schema completion in this packet.

The surface lives inside the existing Home view. It is visible as a
feasibility panel, not a new navigation destination. The resource counters and
first-use chunk/worker names in the panel are application diagnostics, not test
hooks; the native suite reads the same text a user sees.

## Consequences

- The editor follows Monaco's base themes with one light-theme token override
  because Monaco's theme API requires hex colours; the Skeleton CSS variables
  cannot be passed to it. The key token is darkened to keep WCAG AA contrast on
  Monaco's inserted-line diff background. Skeleton tokens still own the shell.
- YAML completion, hovers, formatting, and schema validation are not implemented
  in this packet. They are implementation scope for a later editor view, using
  the same owned worker boundary if they are added.
- The bundled editor chunks are large (about 2.7 MB minified for Monaco and
  694 kB gzip), but they are loaded only on first use. The shell chunk remains
  free of Monaco imports. These are observations for F10, not budgets.
- `dompurify` is overridden from Monaco 0.57.0's pinned 3.4.15 to 3.4.17 because
  published advisories affect 3.4.15 on the dependency path
  `monaco-editor > dompurify`. This is a patch-level security refresh, not a new
  application dependency.
- The CSP does not change. Workers use the `script-src 'self'` fallback, the
  bundled stylesheet and inline style attributes stay allowed, and no `blob:`,
  `unsafe-eval`, wildcard, or remote executable source is added.

## Verification

See [F6 evidence](../verification/f6-editor-workers-csp.md) for the nine-case
matrix, the browser and native commands, the actual worker diagnostic and
correction, the diff, the lazy asset observations, the CSP negative tests, and
the observed worker/model/listener cleanup in the release executable. The
native rows ran on the Linux development WebView; installed-package and other
platform rows remain with documents 08 and 10.
