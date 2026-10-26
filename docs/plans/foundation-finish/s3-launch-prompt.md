# S3 launch prompt: dependency notices and security

Status: **HISTORICAL — S3/F8 accepted on Linux 2026-10-26**, merged via PR #5
at `4a2f991`. Do not re-execute this prompt. Use the [S4 launch
prompt](s4-launch-prompt.md) and [document 08](08-f9-linux-packages.md).
The original launch below is retained for provenance. Prepared on
`ft-dependency-notices-security` from merged `main`
`41b1e008abbcb9a663d02f425bdc67775f4170b6`. S2/document 06 is accepted on Linux,
merged via PR #4, and that exact main revision's Foundation
[40245086906](https://github.com/agiledevel/talos-pilot/actions/runs/40245086906)
and Security [40245086864](https://github.com/agiledevel/talos-pilot/actions/runs/40245086864)
passed; job/step results were read on 2026-10-26. They are entry evidence only.
This prompt launches [document 07](07-f8-dependencies-notices-security.md), not
F9, fixtures, budgets or milestone 2. It grants no push/PR/release authority.

## Copy-paste task prompt

```text
Implement S3/F8 for Talos Pilot: reproducible full license/NOTICE generation,
drift enforcement, Tauri legal-resource packaging and current dependency/security
evidence. Execute document 07's S3-A–D checkpoints and F8-01–08 acceptance cases.
Stop after acceptance on Linux or an exact blocker. Do not start S4/F9 or M2.

ENTRY / AUTHORITY
- Inspect actual branch, revision, tree/diff and recent ledger entries. The
  prepared branch is ft-dependency-notices-security, based on merged main
  41b1e00 (PR #4). Preserve unrelated work; no reset/clean/automatic stash.
  S2 and S1 are accepted on Linux. Historical S1/S2 prompts are not relaunches.
- Read AGENTS.md, docs/design.md, docs/quality.md, docs/flash-pace.md, the series
  README/current ledger, follow-up-to-m2.md S3, and all of document 07 including
  its source map, contracts, acceptance matrix and gate order. Read required
  TypeScript, Tauri and Rust skills before their domains; use Go/Svelte gates
  only if those inputs change. Follow primary licensing and Tauri references.
- Read starting-revision hosted results once. Discover the current branch's PR
  and exact head/checkout before attributing results; no hard-coded PR #2/#3/#4
  qualification for this implementation. The main runs above are entry evidence,
  not S3 passes. Verify/reuse the private pinned toolchain/bootstrap.
- Record acceptance IDs, source/target coverage, bounds, output paths and gate
  plan before code; move F8 to in progress then. Preparation is not implementation.
- No fixture, ambient credentials, owner cluster/VM, host networking/firewall or
  service restart. No broad renderer filesystem access, new IPC/CSP grants or
  legal-text download at app runtime. Preserve S0's owner exception, unresolved
  B11 and diagnostics, S1 bounds and S2 regressions; no new S0 stress campaign.

S3-A — REVIEW INPUTS / OBLIGATIONS
- Reuse authoritative pnpm/Cargo/Go graph sources. Regenerate/review inventory;
  explain differences, not force historical counts. The committed inventory is
  Linux-specific, not a target-neutral redistribution manifest. Go graph-only
  modules remain unobserved, independent of extra warm-cache sources.
- Choose reproducible all-target superset or target-specific legal outputs and
  checks; account for Linux x86_64, macOS Intel/ARM and Windows x86_64 differences.
  Record strategy and unavailable evidence. Runtime/final-platform qualification
  remains F9/document 10, never inferred from a Linux inventory or hosted build.
- Review actual full license/copyright/NOTICE/subcomponent text and alternatives,
  including Monaco ThirdPartyNotices.txt, bundled native data/code and helper
  obligations. Document MPL source availability and recipient notice even when
  files are unmodified; identify modifications or verified none. Unknown
  redistributed terms block; dev-only exclusions need path/absence evidence.
- Record narrow source exceptions/provenance and a notice-generation decision
  with obligations in docs/dependencies.md. No dependency sweep or incidental
  Go/Talos refresh.

S3-B — GENERATION / ENFORCEMENT
- Implement real notices:generate, notices:check and notices:check-packaged
  commands (proposed names in document 07; document final options). Separate
  collection/rendering/CLI/package inspection and reuse inventory inputs.
- Full upstream texts plus identity/digest manifest; deterministic sorting,
  relative provenance, generated header, no timestamps/cache paths. Validate
  unknown metadata and source paths; bound file/count/byte/process I/O and
  deadlines; reject escapes, missing/oversized/unreadable text and partial writes.
- Read-only checks compare live locked inputs and fail on stale/missing/extra
  output. Test isolated new-dependency/text drift -> failure -> regeneration ->
  pass, malformed/missing outputs and source failure paths. Repeated generation
  and clean/extra-cache runs must agree. Don't edit generated artifacts by hand.
- Wire required CI/build checks with real exit propagation. If legal inputs live
  under docs/ or another formerly ignored path, update fail-closed scope rules
  and regression tests so executable inputs cannot reuse stale analysis.

S3-C — PACKAGE / NATIVE EVIDENCE
- Bundle legal resources through Tauri, covering frontend, native and Go helper;
  document installed location and offline recipient access without new UI/IPC.
  Check before build so auto-generation cannot hide stale committed artifacts.
- Inspect an actual Linux bundle payload against full expected paths/hashes;
  fail missing/tampered payload tests. desktop:build is --no-bundle and source
  files/config/AppDir alone are not installer evidence. Use a locally buildable
  bundle such as DEB with .github/tauri.release.conf.json; extract privately
  without system installation. Do not re-open the known openSUSE AppImage issue.
  Unavailable bundle tooling blocks the row, not permission to claim a pass.
- Run affected actual native smoke under private XDG directories using:
  xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env
  GDK_BACKEND=x11 pnpm test:native
  (one command; see packet). Observe resource/helper resolution and cleanup;
  clean only owned resources on success/failure. Mocks cannot prove packaging.

S3-D — SECURITY / FINAL QUALIFICATION
- At/after 2026-11-15 assess exceptions first; hard expiry is 2026-11-30.
  Re-prove current paths, linked code/call graphs and upstream compatible-fix
  availability for BOTH Trivy exceptions. Review ADRs 0006 and 0017 and all
  current Cargo findings. Remove a fixed/absent exception, otherwise explicitly
  record evidence/review/expiry dates and residual risk before renewal. No
  automatic extension, broader exclusion or scanner weakening. Retain negative
  expiry verification. govulncheck alone is not every-target import evidence.
- Focused tests during implementation; final pnpm check:ci and pnpm test:e2e
  once per final relevant tree, pinned workflow validation, frozen/locked clean
  checkout builds, inventory/notices gates and affected Rust/Go/contracts gates.
- Shared native builds overwrite the production executable. After native, run
  IN ORDER pnpm desktop:build; pnpm production:check; pnpm advisories:check.
  Build/inspect the final ordinary bundle from the same source (never test
  config), recheck exclusion/applicability if outputs changed. Run fresh npm,
  Go and Cargo audits. Never race dist or src-tauri/target writers.
- Separate final diff review; fix findings and rerun affected gates. Update
  docs/verification/f8-notices-security.md with each acceptance ID only once
  evidence exists; record revision, environment, source/manifest/package hashes,
  commands/results, obligations and source availability, scans/expiry, native
  versus injected/payload/hosted evidence and exact limits. Validate doc links,
  format and whitespace. Commit coherent checkpoints with ledger entries.
- Discover/read final candidate Foundation/Security run details and actual
  checkout/head identity. Label compatible reused evidence as unchanged-input,
  not fresh. No authorized push/PR means pending/unexecuted hosted checks and an
  exact owner handoff, NOT F8 acceptance. Never merge/edit/retarget/close a PR,
  force-push, push main, tag or release. No CI/ledger-only result commit loop.
- Mark F8 done on Linux only with every applicable F8-01–08 row evidenced and
  review resolved. Otherwise in progress/blocked with the next smallest action.
  C6/C7, remaining formats/target artifacts, clean Ubuntu/Fedora runtime, deferred
  WebViews, fixture/version rows, budgets, Q13 owner review and M2 stay open.
  Final report names branch/commits, results/limits and S4/document 08 as next;
  DO NOT implement it in this launch.
```
