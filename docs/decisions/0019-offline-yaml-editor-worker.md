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

## Amended 2026-10-25: UTF-8 document bounds and bounded validation ownership (S1)

S1 resolved F6-B1 without changing the CSP, the worker boundary or the chosen
packages. The original 64 KiB parser check still existed, but it ran inside the
worker after Monaco had already created a model and transferred the full text,
and the diff accepted unrestricted strings. Debouncing alone also did not bound
queued work or stale results.

### Decision

- **The ceiling is 65,536 UTF-8 bytes, not characters or code units.** A shared
  `documentBounds.ts` measures with an allocation-conscious scan: it rejects by
  string length first, then counts code units and stops at the first byte above
  the limit. Well-formed surrogate pairs cost four bytes and an unpaired
  surrogate costs three, matching `TextEncoder`. The worker re-checks the same
  ceiling on each request as defense in depth.
- **Admission precedes every model and worker transfer.** The editor checks the
  initial value, each controlled replacement, and every user mutation that
  reaches `onDidChangeContent` — typing, paste and undo/redo. An oversized edit
  is reverted to the last accepted text in the same content event. The diff
  admits both sides as one pair. Rejected text is never truncated, never retained
  in a model after that event and never posted to the YAML worker; a visible
  message names the ceiling. The content-event guard is a synchronous revert,
  not a claim that Monaco never transiently allocates a user-supplied edit.
- **A rejected replacement preserves the last accepted document.** A rejected
  initial document creates no model or worker and leaves the attachment alive;
  a later bounded replacement mounts the editor. For the diff, either rejected
  side keeps both previous sides so the reviewed pair stays coherent.
- **One in-flight request and one coalesced latest document.** A dedicated
  `YamlValidationQueue` owns one debounce timer, one in-flight timeout and one
  pending document. Rapid edits replace the pending document instead of adding
  tasks; a document queued while a request is in flight still waits for its own
  quiet period before dispatch. Each request carries a monotonic request id and the document version it
  analyses; only the newest version can publish `ready` diagnostics. Submitting
  a document publishes `pending` immediately, which clears the previous
  diagnostics and markers before the debounced dispatch, so a stale result can
  never look current for newer text.
- **Failure is bounded and explicit.** A five-second timeout or worker error
  publishes one safe failure diagnostic, clears the in-flight and queued work,
  terminates the failed worker and does not retry the same document. The next
  accepted document change starts a fresh bounded request. Disposal cancels
  both timers, drops queued work, removes listeners, terminates the worker and
  ignores every late response.

### Alternatives rejected

A longer debounce or a smaller diagnostic count does not bound model retention,
transfer bytes or the queue, so it leaves the source finding open. Rejecting only
in the worker keeps the oversized model and message. Retrying a failed document
could loop against a broken worker. An unbounded request queue or per-keystroke
request would convert one slow worker into unbounded pending work. Truncating at
the ceiling would silently change the reviewed document.

### Consequences

- While a changed document waits for its bounded dispatch, the surface shows
  `Checking YAML…` instead of the previous result; a failure message replaces the
  diagnostics until the next accepted document change.
- Recovery from a rejected _edit_ or _replacement_ requires an accepted document
  change. The feasibility surface exposes explicit oversized-draft controls so
  this user-visible rejection and recovery path is exercised, not hidden behind
  a test-only hook.
- A rejected user edit is reverted with `model.setValue`, which also clears the
  model's undo/redo history and decorations. Clearing history is deliberate: it
  guarantees the rejected full text leaves both the model and the undo stack.
  The corrective implementation reapplies the accepted diagnostic markers after
  the revert without resubmitting validation or changing its phase/publications.
  The accepted text, diagnostic results and worker ownership remain; only earlier
  undo steps are lost. A later real-document editor may replace this with a
  reviewed inverse edit that preserves history, outside this feasibility packet.
- The feasibility owner retains only the last admitted draft plus an oversized
  attempt **intent**. A synchronous `readValue` prop generates proposed synthetic
  text at the editor admission boundary; no oversized payload is cached in owner
  state or component initialization. Closing clears the attempt, not the accepted
  draft, so reopening preserves accepted user edits. This reader is controlled
  and synchronous, not an asynchronous loading protocol.
- Editor/diff sessions snapshot only callbacks, accessible labels and other
  non-document options. They do not retain constructor options or mount-time
  component copies that could keep rejected initial documents alive after
  bounded recovery. Callers still own any strings they themselves retain.
- The worker is recreated lazily after a timeout/error. That single recreation
  per accepted document change is intentional; there is no background retry.
- No CSP, capability, dependency, IPC command, schema-fetch path or credential
  boundary changed. The worker is still a bundled same-origin module.

### Verification

The S1 matrix in [F6 evidence](../verification/f6-editor-workers-csp.md) records
deterministic byte-bound and queue tests (exact/over ASCII and multibyte,
coalescing, one-in-flight/one-latest, stale/out-of-order/duplicate replies,
timeout, worker error, disposal, and atomic diff-pair rejection), browser flows
for initial/replaced/pasted documents, and a fresh Linux Tauri/WebKitGTK run that rejects oversized initial
and replacement documents while the existing worker diagnostic, diff, lazy
assets, CSP denial, offline behavior and model/worker/listener cleanup still
pass. The corrective revision (S1-P2-1/2/3) was approved by a separate review,
covered by fresh local renderer/browser and Linux native evidence, and accepted
with hosted Foundation/Security results on 2026-10-25; the acceptance is recorded
in the [ledger](../plans/foundation-finish/ledger.md) and closes document 05 on
Linux. Installed-package and other-platform rows remain with documents 08 and 10.
