# S1 corrective follow-up: normalized model bounds and merge policy

Status: implemented and locally qualified on Linux, following the owner's
2026-10-25 review request. Hosted disposition is tracked in the [ledger](ledger.md).
Source baseline: `07dccb8` on `ft-editor-bounds` (PR #3).

## Trigger and intended behavior

The review found that admission measured the source string, but Monaco 0.57
normalizes CR, LF and CRLF to one model EOL. A CR-majority document can grow
past 65,536 UTF-8 bytes after admission. For example,
`"#" + "x".repeat(65530) + "\r\n\r\n\n"` has 65,536 source bytes and 65,537
model bytes. The existing initialization and controlled replacement paths do
not reject that expansion. This reopens only the S1 model-bounds finding;
previous S1 evidence remains attributed to its revision.

The source and the representation Monaco will store must both fit the ceiling
before any editor/diff model is created or replaced. Admission must not truncate
or rewrite supplied text. Both diff sides remain one admission unit. Worker
messages retain their existing raw UTF-8 limit, queue ownership and timeout
contract. No CSP, dependency, IPC or credential boundary changes.

## Acceptance and verification

- Reject normalized expansion for editor initial and controlled replacement
  values, retaining no rejected initial model and preserving the last accepted
  replacement value and diagnostics.
- Reject either diff side atomically for initial and replacement pairs.
- Accept exactly-at-limit normalized models and ordinary LF/CRLF documents;
  cover mixed endings, standalone/trailing CR, ties, BOM and multibyte text.
- Recover from initial rejection with a bounded value and release every owned
  model, worker, listener and timer on disposal.
- Exercise the real Monaco models in the required browser gate, not only a
  duplicate normalization formula; run the existing rendered S1 regressions.
- Correct the GC probe's timer commentary: an unattached recovered session does
  not submit validation or arm a debounce timer. Preserve the historical review
  record with an explicit correction rather than claiming it was accurate.
- Run `pnpm check:ci`, `pnpm test:e2e`, actual Linux `pnpm test:native`, then
  `pnpm desktop:build`, `pnpm production:check` and `pnpm advisories:check` in
  that order. Perform separate final review and read hosted results after push.
  Unavailable or failed gates remain explicitly unverified.

## Repository policy correction

The owner also authorized removing the persistent merge blocker. Replace the
active Main ruleset's `update` restriction with required pull requests (zero
external approvals for this solo project) and the five stable checks already
specified in [CI/release setup](../../ci-release.md#security-scans-codeql-and-trivy).
Preserve deletion, force-push and creation protection and the existing admin
bypass. Do not require matrix job names, native jobs or an approval by another
person. Read the saved ruleset back and verify the current PR status; do not
merge, retarget, tag or push to main. Record the applied policy and its scope in
CI/release documentation so future setup does not restore `Restrict updates`.

## Results

Implemented the projection in shared model admission, without changing source
text or importing Monaco into the shell/worker byte-bound module. All editor and
diff admission paths already call this boundary. Raw-only queue/worker predicates
remain unchanged.

- Failing-before evidence: the new deterministic tests produced six failures on
  the baseline implementation (`/tmp/tp-s1-normalized-before.log`).
- Focused checks after the correction: 41 tests in three Vitest files and seven
  targeted Chromium flows passed.
- `pnpm check:ci`: passed, 227 tests / 28 files, zero Svelte errors/warnings,
  format/type-aware lint and production frontend build. Coverage: 72.57%
  statements / 76.1% branches (`/tmp/tp-s1-normalized-check-ci.log`).
- `pnpm test:e2e`: passed 23/23 with five workers. Includes 243 real-Monaco
  normalization comparisons, model-free initial rejection, exact-limit recovery
  and atomic replacement rejection for both diff sides, plus all existing UI,
  accessibility, lazy/offline/CSP and cleanup flows
  (`/tmp/tp-s1-normalized-e2e.log`). Source-module probes remain mandatory in this
  gate; preview cannot serve them and its existing source-spec exclusion is
  unchanged.
- GitHub policy: applied to Main ruleset 24978792 and read back successfully.
  `update` is absent; PRs require zero external approvals and resolved review
  threads, and the five stable GitHub Actions checks are required with up-to-date
  branches. Existing deletion/non-fast-forward/creation/admin-bypass rules
  remain. At application time PR #3 changed from BLOCKED to CLEAN at `07dccb8`.
  No merge was executed.

Separate fresh-context read-only review of the final source/tests and policy
returned **no findings**. It compared the projection with installed Monaco,
traced editor/diff admission and recovery, verified the timer correction, read
the live ruleset and checked diff whitespace. The parent also reviewed the full
diff for ownership, security boundaries, diagnostics and missing failure paths.

The first two fresh native runs each passed 23/24, failing the rendered-diff
assertion. The first read its snapshot immediately after the independent YAML
diagnostic; the harness now waits for the unchanged diff predicate, but the
second run still timed out. A bounded native diagnostic found that the default
Xvfb configuration reported a visible document while delivering no animation
frame and leaving Monaco's view-lines empty. Scrolling, actual X11 window focus
and software-compositor mode did not restore frames. The documented fixture in
[the native reproduction](../../verification/s0-native-keyboard-acceptance.md#reproduction)
uses `xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp'` and `GDK_BACKEND=x11`;
that configuration delivered the frame and both rendered diff documents. This
is evidence of a fixture-configuration difference, not proof that the readiness
wait fixed frame delivery or that all Xvfb configurations work.

Final native qualification with the explicit documented display and private XDG
directories **passed 24/24** (5 editor, 12 helper/shell, 7 Kubernetes-session),
WebKitGTK 605.1.15 on Linux x86_64. The subsequent ordered
`pnpm desktop:build` → `pnpm production:check` → `pnpm advisories:check` all
passed; production excludes the driver/listener and the advisory baseline
matched 67,079 symbols / 5 recorded advisories. Final native-harness
`pnpm lint` and zero-warning `pnpm lint:svelte` also passed after the readiness
correction. The narrow follow-up independent review found no assertion weakening
or other defect.

- Native-test executable SHA-256:
  `f4568db89686da0e183cc4e8678e9f485aefac19dd18af280d86f6090e5f8a05`.
- Restored ordinary executable SHA-256:
  `c5caa2eb343e31137d9b1a9fa0cf51c922f339caa4e074e52f53b0da28d3cf69`.
- Final logs: `/tmp/tp-s1-normalized-{native,production,qualification-final,native-cleanup}.log`.
  No owned app, helper, synthetic server, Xvfb or xkbcomp process remained; the
  private XDG root was removed.
- Failed logs remain `/tmp/tp-s1-normalized-native-failed.log` and
  `/tmp/tp-s1-normalized-native-default-xvfb-failed.log`. Bounded diagnostic JSON
  is retained under `/tmp/tp-s1-native-diff-{no-compositor-fix,software,focus,screen}.json`.

The new mixed-newline cases are Chromium/source-module evidence; the fresh native
suite requalifies packaged editor/diff, workers, offline/CSP and cleanup behavior
in the declared display fixture, not a direct native execution of those exact
mixed-newline candidates. No installed package, macOS/Windows WebView, trusted OS
paste, real cluster or performance result is claimed. Unchanged Rust/Go/contract
unit suites were not repeated locally; real native/ordinary builds compiled the
backend/helper. Hosted evidence must be read for the pushed correction before
claiming its CI gates pass; the final run disposition is recorded separately in
the ledger rather than asserted by this pre-push record.
