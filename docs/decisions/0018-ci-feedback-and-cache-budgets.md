# 0018 — Shorten CI feedback without removing qualification

- **Status:** accepted by owner direction on 2026-10-22; hosted verification is recorded in the foundation finish ledger.
- **Context:** the owner requested all pipeline optimisations before Session B and FLASH guidance for subsequent workers. This amends decisions [0014](0014-ci-scope-and-caching.md) and [0016](0016-ci-test-tiering.md) where noted below; their platform and qualification tiers remain unchanged.

## Evidence and acceptance

The reviewed Foundation run [39866348063](https://github.com/agiledevel/talos-pilot/actions/runs/39866348063) completed in 9m 37s after the native split. Documentation-only run [39873299673](https://github.com/agiledevel/talos-pilot/actions/runs/39873299673) took 1m 56s. Rust CodeQL in runs [39870301723](https://github.com/agiledevel/talos-pilot/actions/runs/39870301723) and [39866348033](https://github.com/agiledevel/talos-pilot/actions/runs/39866348033) spent 20m and 25m 28s installing prerequisites, before analysis. Browser installation in [39860072812](https://github.com/agiledevel/talos-pilot/actions/runs/39860072812) took 12m 27s. Logs show slow Azure Ubuntu mirror downloads/retries. Cache inventory was 10,316,833,159 bytes across 15 entries; scratch native-probe entries consumed about 2.8 GiB.

Acceptance: bounded authenticated provisioning with an official fallback; scope must fail closed and never turn a skipped/reused result into fresh evidence; preserve main/scheduled/manual/release coverage and every native/fixture acceptance gate; bound cache growth; execute renderer unit tests once with coverage; avoid the redundant desktop frontend build; parallelise release compilation without relaxing publication dependencies; document worker checkpoints and truthful handoff.

## Decisions

### Scope and evidence

`scripts/ci-desktop-scope.ts` now serves both Foundation and Security workflows. Only pull requests may reuse earlier evidence. The search remains bounded to 50 successful runs and ten job lookups, with 20-second API deadlines. A missing/invalid response, history, output, or evidence runs checks or fails the result gate, never silently skips them.

The verified head must be an ancestor of the current head and already contain the current PR base. A base update not contained in that head forces fresh checks; while the branch remains behind its base it may conservatively keep running them. The mutable `pull_requests[].base` field in historical API results is not trusted as immutable execution provenance.

- Desktop still skips **only documentation**, and evidence requires successful Linux, Apple Silicon macOS and Windows matrix jobs (plus no failed extra desktop jobs).
- Renderer may reuse unchanged documentation inputs, but formatting and the fresh npm audit still execute. Full renderer evidence requires a successful full-check step, not a format-only green job.
- Each CodeQL language is independent. Documentation affects none. Known renderer `.ts`/`.svelte`/`.css`/`.html` source and browser/native TypeScript tests affect JavaScript/TypeScript. Rust `.rs` under its source/test/example roots affects Rust. Build scripts, shared fixtures, schemas, dependencies, workflows, configuration and unknown paths affect **every language**.
- CodeQL evidence requires the actual successful `Require zero CodeQL results` step. Reused checks retain stable job names, state the reason in the job summary, and upload no fresh SARIF. A reused green job cannot become the evidence base for another reuse.
- Trivy still scans every PR tree, including Markdown secrets, once. Its SARIF drives both the upload and the zero-results gate; scanner errors and malformed reports fail. The gate validates report structure and logs only the finding count and up to 50 rule/location summaries: Trivy secret-result messages contain the matched value and must not be printed. A regression test executes the checked-in shell gate with clean, nonzero, malformed and synthetic secret-bearing reports. Scheduled scans, main pushes, manual runs and exact-revision release calls always run every analysis.

This is reuse of unchanged inputs, not a claim that skipped tests executed. Qualifying native, fixture and package evidence is never inferred from it.

### Linux provisioning

The shared `linux-prerequisites` action uses a hosted-runner-only script with isolated apt configuration, sources, lists and archives. Ubuntu 22.04/24.04 and their archive keyring are required. It uses signed HTTPS Ubuntu archive/security repositories, `--no-install-recommends`, 15-second network timeouts and one transport retry. Each mirror attempt bounds metadata to 90 seconds and package downloads to 180 seconds. The official Azure Ubuntu mirror is tried once if the main archive fails. All attempts must preserve signature/hash verification.

Only network phases are killed on a deadline; dpkg installs offline with `--no-download`, under the job's overall timeout. Installation failure remains a failure. The job owns and removes the temporary directory. No development-host apt/mirror configuration is changed.

Browser packages come from the pinned Playwright CLI's missing-dependency report, parsed as package names without `eval`, and are rechecked after installation. Chromium headless-shell binaries are cached by OS/architecture/Playwright version; `playwright install chromium --only-shell` still validates/installs the exact required revision. The CLI is cached separately from application dependencies; pnpm installations remain pinned and application installation remains `--frozen-lockfile`. pnpm 12's reviewed install hooks must run (`npm install --global --allow-scripts=pnpm pnpm@12.15.0`, allowed for this package/invocation only) to place its native binary and regenerate Windows shims; its Node entry is `bin/pnpm.mjs`, not the older `pnpm.cjs`. The hosted Windows finding is recorded in the ledger; the CLI cache namespace was bumped to v2 to exclude the no-hooks attempt.

A prebuilt matching Playwright image was considered, but `mcr.microsoft.com/playwright:v1.64.0-noble` returned HTTP 404 during this change. Do not substitute an older browser/image. The bounded installer and browser cache are the implemented alternative. A custom native image would need publication, digest pinning and security-refresh ownership; it is not introduced as an unverified infrastructure dependency.

### Dependencies, caches and duplicate builds

- `pnpm check:ci` is the same renderer aggregate as `pnpm check`, replacing the single Vitest execution with its coverage-enabled execution. CI no longer runs both suites. Both commands are available locally.
- Tauri's existing `beforeBuildCommand` owns the helper and production frontend build. The redundant earlier desktop `pnpm build` is removed; both Rust feature configurations, all native platforms and production exclusion checks remain.
- Cargo/native **v2** cache keys separate runner and toolchain/configuration from lockfile. Fallback is allowed only within that runner/toolchain/configuration family; Cargo validates fingerprints and builds changed dependencies. Native jobs may seed from compatible deterministic dependency caches. For migration, when no Cargo configuration file exists, an exact old v1 toolchain/lockfile entry may seed v2 once; no cross-lockfile or new-configuration v1 fallback is allowed.
- Before saving, remove first-party debug/release outputs and generated rustdoc. Native caches also drop the entire debug tree inherited from a deterministic-cache seed, because native qualification builds only release targets. Save only after the job's release executable exists. There is no caching of credentials or native runtime data.
- The daily/manual default-branch-only maintenance workflow retains two recently accessed v2 entries per Cargo/native family, runner and ref. It removes v1 only after a v2 replacement exists for that family/runner/ref. Explicitly retired A2 probe refs may be removed. Active workflow refs are protected; unknown cache namespaces are left alone. API/validation failures abort before deletion, and more than 50 proposed deletions require manual review. Manual dispatch defaults to dry-run.
- Caches are performance aids, never source or qualification evidence. Cache eviction or a concurrent race can cost compilation time, not change whether Cargo checks the source. Bump the v2 prefix when compiler/profile/system-library compatibility changes.

Release package compilation now starts after source validation, in parallel with deterministic/security/native qualification. It still builds from source without Cargo-cache restoration. Only the draft job can publish; it still depends on every qualification and asset job for the exact revision. Failed qualification can waste compilation but cannot create a release draft.

## Alternatives and consequences

Dropping cross-platform tests, changing feature combinations, weakening security findings, skipping native CSP tests, and using a persistent development host as an untrusted PR runner were rejected. More splitting/sharding adds setup cost to already-short renderer jobs and was not justified by the measurements.

Warm documentation feedback near two minutes and warm code feedback below ten minutes are measurement targets, not promises. Cold dependency builds, native qualification and queue delays remain slower. Scope decisions, cache hits/misses and provisioning duration must be recorded before making a speed claim.

## Verification and recovery

Unit and subprocess fixtures cover source classification, malformed/missing/skipped evidence, ancestor/base handling, failed-code-plus-documentation changes, unconditional non-PR execution, bounded cache selection and provisioning failure propagation. Validate all workflows/composite actions with pinned actionlint and shellcheck. Run `pnpm check:ci`, browser tests, and actual desktop/native evidence for changed setup; record hosted code and documentation runs separately in the [ledger](../plans/foundation-finish/ledger.md).

New manual/scheduled workflows become dispatchable only after they reach the default branch. Until then, exercise the code through the PR jobs or a recorded local/probe equivalent, and mark undispatched workflow entry points unexecuted. To force fresh evidence, dispatch the Foundation/Security workflows; to invalidate caches, bump their namespace rather than bypassing compilation. See [CI setup](../ci-release.md) and [FLASH pace](../flash-pace.md).
