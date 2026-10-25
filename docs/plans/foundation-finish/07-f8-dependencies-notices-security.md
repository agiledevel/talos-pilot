# 07 — F8: dependency, notices, and security evidence

Status: **READY for S3 implementation; F8 not started** (2026-10-26).
S2/document 06 is accepted on the development Linux WebView and merged via
[PR #4](https://github.com/agiledevel/talos-pilot/pull/4) at
`41b1e008abbcb9a663d02f425bdc67775f4170b6`. That exact `main` revision passed
Foundation [40245086906](https://github.com/agiledevel/talos-pilot/actions/runs/40245086906)
and Security [40245086864](https://github.com/agiledevel/talos-pilot/actions/runs/40245086864);
the jobs/steps were read on 2026-10-26. These are entry evidence, not S3 results.
Preparation/implementation branch: `ft-dependency-notices-security`, created
from that merged revision. Use the [S3 launch prompt](s3-launch-prompt.md).

Read the series [README](README.md) and current [ledger](ledger.md) first.
Normative packet: [F8](../foundation-completion-flash.md#f8--refresh-dependency-notices-and-security-evidence).
Maps to C7 and FND-007/008. Prerequisite: document 06 done and merged-revision
results read (**met**). No fixture, cluster access or host/network change is
needed. F1a/F5 remain independent open fixture work under owner Q11.

**Date override:** at or after **2026-11-15**, do the exception assessment first;
both current Trivy exceptions expire on **2026-11-30**. Do not let a lengthy
notice implementation postpone that gate.

## Outcome and stopping point

Deliver reproducible dependency/license evidence, generated full license and
NOTICE material, enforceable source and packaged-payload checks, and current
security/applicability evidence. Qualify notice packaging on the development
Linux host with an actual Tauri build and an actual Linux bundle payload.
This is not the clean-VM installer/runtime matrix in document 08.

Stop after F8 acceptance on Linux or a precise blocker. Do not implement F9
installer qualification, F10 budgets, fixture work or M2. No new settings UI,
generic renderer filesystem access, IPC, CSP relaxation or helper protocol is
needed to redistribute static legal material. C7 is not globally complete while
deferred target/artifact rows remain unexecuted. Preserve S0's owner exception
and unresolved B11, accepted S1/S2, and the later Q13 owner-review gate.

## Read before implementation

| File                                                                                                                                                                                                            | Purpose                                                                         |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| [Dependencies](../../dependencies.md), [CI/release](../../ci-release.md)                                                                                                                                        | Pins, obligations, current open notice work and release layout                  |
| [Decision 0006](../../decisions/0006-gtk3-advisory-applicability.md), [0017](../../decisions/0017-keyring-zbus-advisory-applicability.md), [0002](../../decisions/0002-wdio-transitive-advisory-remediation.md) | All accepted Cargo findings and earlier npm remediation                         |
| [Decision 0018](../../decisions/0018-ci-feedback-and-cache-budgets.md), [FLASH pace](../../flash-pace.md)                                                                                                       | Conservative CI scope, unchanged-input evidence and build ordering              |
| [Automation evidence](../../verification/automation.md)                                                                                                                                                         | OpenPGP applicability, expiry-negative test and inventory cache-history failure |
| `scripts/dependency-inventory.ts`, `scripts/lib/inventory.ts`, `scripts/lib/inventory.test.ts`                                                                                                                  | Existing graph inputs, parsers and their limits                                 |
| `scripts/advisory-baseline.ts`, `scripts/lib/advisories.ts`, `scripts/go-vulnerability-scan.ts`, `.trivyignore.yaml`                                                                                            | Executable applicability gates and expiring exceptions                          |
| `docs/verification/dependency-inventory.json`, `package.json`, all three lock/module sets                                                                                                                       | Generated Linux inventory and authoritative dependency identities               |
| `src-tauri/tauri.conf.json`, `.github/tauri.release.conf.json`, `scripts/build-helper.ts`, `scripts/appimage-resources.ts`                                                                                      | Resource layout, helper, release configuration and known AppImage limit         |
| `.github/workflows/check.yml`, `security.yml`, `release.yml`, `scripts/lib/ci-scope.ts` and its tests                                                                                                           | Enforcement, analysis inputs and artifact publication                           |

Read the TypeScript skill for scripts; Tauri and Rust skills for packaging/native
changes (and Rust source if needed). Go changes require its quality gates.
Read Svelte/framework skills only if renderer behavior actually needs changing.
Consult pinned package sources and official licensing/Tauri resource guidance;
record source-specific obligations rather than inferring them from SPDX labels.

## Existing machinery and gaps

- `pnpm inventory:generate` / `inventory:check` use `pnpm licenses list --json`,
  locked Cargo metadata and the Go module/package graph. Current recorded counts
  are **535 npm, 614 Cargo, 143 Go (35 linked)**. They are snapshots, not targets.
  Re-read the generated file; explain differences, do not force these counts.
- The inventory is a **Linux view**, including development and optional packages;
  it is not a redistribution manifest or a complete cross-platform bill of
  materials. Go graph-only modules are intentionally `unobserved`; do not read
  whichever extra sources happen to exist in a warm cache.
- `hasNotice` detects only root files named `NOTICE` (optionally with an
  extension). Monaco's `ThirdPartyNotices.txt` is a known counterexample. License
  identifiers/booleans cannot substitute for the actual copyright/license texts.
- `pnpm advisories:check` compares the Cargo scanner output, reverse paths,
  inactive-feature absence and the actual unstripped Linux production executable.
  `pnpm audit:go` checks the helper's linked call graph. npm audit, CodeQL and
  Trivy retain their existing failure semantics.
- `pnpm desktop:build` uses `--no-bundle`; it does **not** prove installer notice
  presence. The release overlay enables bundles. AppImage on this openSUSE host
  has a recorded missing-WebKit-helper problem; do not restart that investigation
  or count an AppDir alone as a qualified installed package.

## Contract to establish before code

### Dependency coverage and obligations

1. Derive notice identities from the same authoritative graph inputs as the
   inventory; share a small collector if useful, not a second hard-coded package
   list. Record ecosystem, exact version, target/build scope, selected license
   alternative, source/provenance and text digest. Exclude first-party workspace
   members from third-party obligations.
2. Separate redistributed frontend/workers/CSS/assets, production Rust native
   code and the Go helper from build/test-only or inactive graph entries. A
   conservative superset is acceptable if labelled; it must not imply dev tools
   ship. Include bundled/runtime code and data not adequately described by a
   top-level package license (for example vendored SQLite and Unicode data).
3. Review actual license, copyright and notice files, including third-party
   subcomponent notices and nested license locations. Support `LICENSE`,
   `COPYING`, `COPYRIGHT`, `NOTICE`, `ThirdPartyNotices.txt` and reviewed
   package-specific variants. Keep upstream attribution/text intact. SPDX
   `AND` requires all obligations; `OR` needs a documented compatible selection.
   Do not use a guessed canonical MIT text in place of upstream attribution.
4. Account for Linux x86_64, macOS x86_64/arm64 and Windows x86_64 differences.
   Choose either a reproducible all-target superset from pinned sources or
   deterministic target-specific outputs with checks on the existing desktop
   matrix. Do not silently copy the Linux inventory to other targets. Record
   the strategy and any unavailable target evidence before implementation;
   platform runtime/final-artifact acceptance still belongs to F9/document 10.
5. Document MPL source-availability obligations even for unmodified covered
   files: exact upstream version/source, how recipients obtain corresponding
   source, modifications (or verified none), and how the required recipient
   notice ships. A public repository link alone is not an unreviewed blanket
   compliance claim. Review other non-MIT obligations and optional packages too.
6. Unknown/missing licenses on redistributed code block acceptance. An explicit
   reviewed development-only exclusion such as `css-value@0.0.1` may remain,
   with its path and non-redistribution evidence. Manual source overrides must
   be narrow, version-bound, digest-checked and explained; never edit output.

### Generation and failure semantics

- Proposed commands to **implement**, not existing commands:
  `pnpm notices:generate`, `pnpm notices:check`, and
  `pnpm notices:check-packaged -- <payload-root>`. Exact paths/options are fixed
  at S3-A and documented alongside the real scripts/tests. Keep collection,
  pure rendering/comparison, and package inspection separately testable.
- Generated UTF-8 output has a source/regeneration header, stable sorting and
  relative provenance; no timestamps, absolute cache paths, host usernames or
  nondeterministic directory ordering. Include full required texts plus a
  machine-readable identity/digest manifest. Commit generated source artifacts.
- Generate/check against live locked inputs, not just another possibly stale
  committed inventory. `--check` is read-only and fails nonzero on stale,
  missing, unexpected or malformed output. Missing/unreadable/oversized source
  text is an actionable error, not an empty text or silent skip.
- Validate metadata and paths at runtime. Resolve only declared package roots
  and explicitly reviewed sources; reject traversal/symlink escapes. Declare
  finite file/count/byte/output bounds, subprocess deadlines/output limits and
  cleanup of temporary files. Fail safely without partially replacing good
  output; deterministic tests cover failure paths and repeat generation.
- Normal generation must not scrape mutable `latest` pages or depend on extra
  warm-cache content. Any necessary source retrieval uses versioned sources,
  integrity verification, bounded I/O and a documented clean-checkout route.
  Never fetch legal text at application runtime.

### Packaging and CI

- Ship generated legal resources with the **application**, covering frontend
  assets, native code and bundled helper; document their installed location and
  how a recipient finds/reads them without developer tooling or network access.
  Reuse Tauri resources; no broad filesystem capability or new renderer bridge.
- Wire generation/drift checks into the existing build/QA/release paths so a
  stale notice cannot ship. A build that regenerates output must not mask a
  stale committed artifact: check it before build/copy. Check the actual bundle
  payload against expected relative paths and hashes, not only configuration
  strings, a nonempty directory or a pre-bundle source copy.
- Run source drift enforcement in required CI with the necessary graph tools;
  package checks run wherever real bundles are produced and before upload.
  New executable inputs under `docs/` (if chosen), curated legal inputs and
  packaging resources must invalidate relevant CI evidence. Update fail-closed
  scope rules and regression tests; do not treat build inputs as ignored docs.
- S3 requires one actual development-Linux bundle payload inspection and native
  smoke for the changed packaging boundary. Use a locally buildable format such
  as DEB with the existing release overlay, then extract without system install
  and compare full legal payload bytes. Record package and executable digests,
  commands and resource resolution. Unavailable bundle tooling blocks that row;
  an AppDir or `desktop:build` alone does not pass it. All three Linux formats,
  clean Ubuntu/Fedora installation, vault behavior, final-artifact scans and
  macOS/Windows installed-package qualification remain F9 work.

## Four implementation checkpoints

### S3-A — Evidence inputs and license review

Record F8-01–08 below and the affected boundaries before code; mark F8 `in
progress` then. Verify the private pinned toolchain/frozen install. Regenerate
and review inventory; trace additions through F2–F7 and later security fixes.
Choose target coverage, exact output/resource paths, bounds and source policy.
Review selected license terms, NOTICE/subcomponent files and MPL source delivery
in `docs/dependencies.md`. Record a linked notice-generation decision with
alternatives, consequences and verification. No dependency sweep or unrelated
pin refresh.

### S3-B — Deterministic generator and enforced drift

Implement source collection, notice rendering, read-only checks and meaningful
unit/CLI tests. Demonstrate stale-input failure and regeneration recovery using
an isolated synthetic package/graph fixture, not an unexplained production
lockfile edit. Also fail for changed/missing text, missing/unexpected output and
unresolved redistributed licenses. Exercise cold/extra-cache independence and
stable output on repeated generation. Wire required CI/build gates and any
scope-regression changes with real exit-code propagation.

### S3-C — Legal resources and package verification

Integrate Tauri resources and release artifact inspection. Add negative
missing/tampered-package tests and a real bundle payload pass, with actual native
smoke for resource/helper resolution and unchanged security/cleanup behavior.
Native evidence uses private XDG directories and the accepted explicit screen:
`xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 pnpm test:native`.
Use an explicitly owned private display/process lifecycle; clean owned resources on
success/failure. Do not race `dist` or `src-tauri/target` outputs.

### S3-D — Security refresh, final review and acceptance

Run current npm/Go/Cargo scans and applicability gates on ordinary production
outputs. Re-assess decision 0017 as well as 0006; a new, changed, vanished or
newly linked finding must not be silently accepted. For each Trivy exception:

| Finding / path                                 | Required renewed evidence                                                                                                                                                |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GHSA-wrw7-89jp-8q8g` / `src-tauri/Cargo.lock` | Current GTK3 reverse path/version constraints, primary-source compatible-fix assessment and affected-symbol absence in the freshly rebuilt unstripped Linux executable   |
| `GO-2026-5932` / `helper/go.mod`               | Current module/import paths and target-specific helper package/call-graph evidence excluding `golang.org/x/crypto/openpgp`, plus primary-source advisory/fork assessment |

Remove an exception when its cause is fixed/absent. Otherwise renew only after
re-proving applicability; record evidence date, explicit next review/expiry date,
residual risk and gate in the decision/evidence and `.trivyignore.yaml`. Never
widen IDs/paths, auto-renew, suppress scanners or claim `govulncheck` alone proves
every target's package exclusion. Preserve expiry enforcement with an isolated
expired-exception negative check. A necessary Go/Talos change requires coordinated
source/compatibility/fixture/security evidence; if unavailable, stop the affected
row rather than refresh pins incidentally.

Read exact-candidate Foundation/Security jobs, including CodeQL and Trivy. Discover
the actual branch/PR with `gh pr list --state open --head "$(git branch --show-current)"`
and read `gh pr checks <number>` / `gh run view <id>` details, including `headSha`
and analyzed checkout identity. Do not copy `main` or old PR results as S3
qualification. Decision 0018 may reuse compatible executed inputs only when CI
reports it; label that **unchanged-input evidence**, not a fresh scan. New legal
build inputs must not reuse stale analysis. Without authorized push/PR access,
record candidate hosted checks as pending/unexecuted, add the precise owner
question and stop before acceptance. Do not open/modify a PR by inference.

## Acceptance matrix

Record each ID in a new `docs/verification/f8-notices-security.md` only when
implementation/evidence exists. Include revision, command, target, result,
artifact/manifest hashes, review decisions and missing evidence; keep injected,
native, payload-inspection and hosted classes separate.

| ID    | Observable outcome and required evidence                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F8-01 | Frozen install and locked builds from a clean checkout of the final source succeed; inventory matches regeneration and every series addition has provenance. Repeated generation is byte-stable, independent of extra cache contents.                                              |
| F8-02 | Reviewed coverage accounts for frontend/workers/native/helper and target-specific dependencies; full required texts/attributions, chosen alternatives, subcomponent notices (including Monaco) and MPL recipient/source obligations are present. Unknown redistributed terms fail. |
| F8-03 | Isolated new-dependency/text drift fails the real check nonzero without rewriting output; generation then passes. Missing/unexpected/malformed output and unreadable/escaping/over-limit source fail. CI/build wrappers propagate those failures.                                  |
| F8-04 | An actual Linux bundle payload contains legal resources byte-for-byte matching its manifest; deleting/tampering with one fails inspection. Native resource/helper/cleanup smoke passes. Configuration/source-directory assertions alone are insufficient.                          |
| F8-05 | Current npm audit, Go scan, Cargo audit/applicability pass or every finding has a recorded, executable re-proof; decisions 0006/0017 remain valid on the fresh production executable/graphs. No unexplained finding.                                                               |
| F8-06 | Each Trivy exception is removed or freshly justified and explicitly dated before 2026-11-30; negative expiry enforcement remains effective. No automatic renewal/widening.                                                                                                         |
| F8-07 | Final candidate Foundation and Security results are read and recorded with checkout/head identity, run URLs and fresh versus compatible reused evidence. Pending/unexecuted is not acceptance.                                                                                     |
| F8-08 | Separate final diff review resolves correctness/security/documentation/failure-path findings; README, plans, dependencies, CI/release and ledger agree. F9 carries remaining format/target/clean-runtime scans, C6/C7 and owner-review/M2 limits remain honest.                    |

## Final gates and evidence order

- Narrow generator/CLI/package/scope tests while iterating; final
  `pnpm check:ci` and `pnpm test:e2e` once for the final relevant tree. Validate
  changed workflows with the pinned actionlint/ShellCheck procedure. Do not
  repeat unchanged unit and coverage aggregates or the S0 stress campaign.
- `pnpm install --frozen-lockfile`, `pnpm inventory:check`, implemented notice
  source/package gates, and frozen/locked clean-checkout builds. Use canonical
  Rust/Go/contracts gates from [quality.md](../../quality.md) for changed inputs;
  changes to shared graph collection must preserve inventory regression tests.
- Native evidence first; then **in order** `pnpm desktop:build`,
  `pnpm production:check`, `pnpm advisories:check`. Build/inspect the ordinary
  Linux bundle from the same final source, never the native-test feature/config;
  re-run exclusion/applicability against final ordinary output if overwritten.
  Run `pnpm audit --audit-level=low`, `pnpm audit:go`, and
  `cargo audit --file src-tauri/Cargo.lock` with the pinned scanner.
- Separate diff review, local documentation links/format/whitespace, coherent
  commits with ledger entries, and exact-candidate hosted checks. This packet
  grants no push, PR, tag, release, merge or host-service authority. Follow the
  one-ledger-follow-up rule; don't create a CI/result-only commit loop.

## Done means

All F8-01–08 have final applicable evidence and review; generated notices and
packaged presence/drift checks are enforced, not merely planned. Remove the
notice-packaging-open wording in `docs/dependencies.md` only for rows actually
qualified, leaving F9/platform limits explicit. Mark document 07 done on Linux
only then and hand off to document 08 in a later task. Missing hosted, bundle or
native evidence leaves F8 in progress/blocked; it is not an accepted exception.
