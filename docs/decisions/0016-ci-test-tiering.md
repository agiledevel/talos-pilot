# 0016 — Tier CI: deterministic required checks, manual native checks, local fixtures

- **Status:** accepted by owner direction on 2026-10-22.
- **Date:** 2026-10-22.
- **Context:** Foundation CI currently runs deterministic renderer, Rust, Go,
  contract, and security gates, Playwright browser flows with the mock
  transport, and native WebdriverIO tests on the desktop matrix. Live Talos and
  Kubernetes fixtures already run only through explicit local harnesses. The F5
  packet proposed adding a live Kubernetes fixture job to CI. The owner wants
  permission-sensitive integration work and the expensive native desktop tier
  out of required CI, with the relevant evidence produced locally or in
  explicit workflows. The cheap Playwright mock flows stay in required CI. The design and quality standards still require the same
  evidence before completion; only the trigger and required-check tier change.

**Feedback amendment:** [decision 0018](0018-ci-feedback-and-cache-budgets.md) adds conservative PR evidence reuse, bounded provisioning/caches and non-duplicated renderer checks. The tiers and native/fixture acceptance obligations below remain unchanged; release assets now compile alongside qualification, with publication still gated on all results.

## Decision

Use three tiers. The commands stay the same across tiers; the trigger, required
status, and evidence record differ.

### Tier 1: required deterministic CI

The `Foundation checks` workflow remains the required pull-request, `main`, and
release-QA gate for deterministic work. It runs:

- the desktop-scope decision;
- renderer formatting, Oxlint/type diagnostics, `svelte-check`, Vitest,
  production build, icon check, npm audit, Playwright `pnpm test:e2e`, and
  coverage;
- Go format, vet, unit tests, race tests, module verification, and build;
- Rust rustfmt, Clippy in both feature configurations, unit and
  deterministic integration tests in both configurations, rustdoc, and the
  affected builds;
- synthetic Kubernetes API/session tests, helper supervision tests, storage
  tests, and the deterministic fixture-manifest rejection tests;
- `pnpm desktop:build`, `pnpm production:check`, `pnpm contracts:check`,
  `pnpm inventory:check`, `pnpm advisories:check`, `cargo audit`, and
  `pnpm audit:go` on the runners that currently own them;
- the security scans.

Tier 1 does **not** run a live Talos or Kubernetes fixture, `pnpm test:native`,
clean-VM package smoke, or performance measurement.

### Tier 2: manual and scheduled native CI

Add a reusable `Native tests` workflow with these triggers:

- `workflow_dispatch`, with a revision/ref input, so a session can test a pull
  request head or a release candidate on demand;
- a weekly `schedule`, so native drift is still detected without blocking every
  pull request;
- `workflow_call`, so release qualification runs it for the exact revision.

It uses the same pinned toolchain and desktop setup as the foundation desktop
jobs, runs the full four-runner matrix (`ubuntu-22.04`, `macos-15`,
`macos-15-intel`, `windows-2022`), and executes `pnpm test:native` after the
build it requires. It uploads its logs or other bounded evidence artifacts and
reports the run URL in the ledger.

The required `Foundation checks` workflow no longer runs `pnpm test:native`.
The native workflow is not a required branch-protection check, but a change that
touches a native boundary must record a passing run for its final revision, or
a recorded local equivalent, before merge. Native boundaries include Tauri
commands, capabilities, plugins, sidecars, helper supervision, native IPC,
packaging, and test-only native surfaces.

### Tier 3: local and explicit fixture qualification

Live Talos and Kubernetes fixtures, clean-VM package smoke, and performance
measurement run locally or in explicit manual workflows, never as required
pull-request checks. The existing `pnpm talos:fixture` and
`pnpm kubernetes:fixture` harnesses remain the commands. Fixture identity,
allowlists, baselines, restoration, and evidence recording are unchanged.

F5's requirement to "wire a provisioned fixture job into CI or an explicit
fixture workflow" is satisfied by an explicit `workflow_dispatch` Kubernetes
fixture workflow or a documented local harness run with recorded evidence. A
hosted kind fixture workflow may cover the Kubernetes-only 1.35 and 1.37 rows;
the Talos-hosted 1.36 run remains local unless a suitable runner exists.

### Keep the cheap and deterministic checks

Keep Playwright `pnpm test:e2e` in required CI. It is fast, needs no cluster or
host permissions, and covers the shell, appearance, accessibility, and mock
transport.

Keep synthetic Kubernetes API/session tests and the deterministic fixture
manifests in required CI. They are not live integration tests and do not need
the fixture permission. Removing them would weaken the Rust and helper
regression net for no permission or cost benefit.

### Move, do not delete

The native WebdriverIO suite remains a release and milestone gate. It is moved
to Tier 2, not removed. The live fixture harnesses remain the only path for
real-cluster evidence. No acceptance row becomes `passed` because a tier was
removed from required CI; it becomes `unexecuted` until its tier runs.

### Release qualification

The release workflow calls the required deterministic checks and the native
workflow for the exact revision. Clean-target package, vault, helper, and
platform rows continue to come from the local or explicit qualification tiers.
A release cannot claim native or real-cluster evidence from a job that did not
run for that revision.

## Alternatives

- **Keep native and live fixture jobs in required CI.** Rejected: the owner
  wants permission-sensitive and expensive work outside required CI; hosted
  runners do not have a reliable disposable Talos fixture path.
- **Delete native and browser tests.** Rejected: both provide evidence the
  release gate still requires. Moving them preserves the evidence without
  making them required on every pull request.
- **Run Playwright only locally.** Rejected: it is cheap, permission-free, and
  catches renderer regressions early.
- **Remove synthetic Kubernetes tests with the live fixture.** Rejected: the
  synthetic tests are deterministic, fast, and cover list/watch/session
  boundaries without a cluster.
- **Make the native workflow a path-filtered required check.** Deferred. It
  could reduce the manual trigger burden later, but it would still make native
  infrastructure a required pull-request dependency and was not chosen now.

## Consequences

Required CI becomes faster and no longer depends on native display or helper
test infrastructure. Native IPC and packaging changes need an explicit
`workflow_dispatch` run or a recorded local run before merge, so the evidence
burden moves to the session and ledger. Release qualification must call the
native workflow explicitly; it must not assume the foundation run covered it.
Live fixture evidence remains local, so the ledger must distinguish it from
hosted CI.

The `Foundation checks` cache currently prunes first-party artifacts using the
release example that `pnpm test:native` compiles. Removing the native step
changes the last required build in that job. The implementing change must
rework the cache-prune condition so it still saves one complete dependency
build per lockfile and never grows indefinitely. The native workflow may keep
its own cache or compile its own artifacts.

No security boundary, capability, cluster permission, or product scope changes.
The fixture allowlist and the no-ambient-credential rules remain unchanged.

## Implementation checklist

1. Add `.github/workflows/native.yml` with `workflow_call`, `workflow_dispatch`,
   and a weekly `schedule`; use the pinned toolchain, the four-runner matrix,
   and `pnpm test:native`; upload bounded logs/evidence.
2. Remove the `Run actual Tauri IPC tests` step from `check.yml`.
3. Rework the `check.yml` Cargo cache-prune/save condition so it no longer
   depends on the native workflow's release example; verify one complete
   dependency build per lockfile and no unbounded first-party cache growth.
4. Update `release.yml` so its QA job calls `native.yml` for the exact revision
   in addition to the deterministic foundation checks.
5. Update `docs/ci-release.md`, `docs/quality.md`, `docs/design.md`, the
   repository README, the foundation finish series README, and the
   foundation-completion plan to describe the tiers.
6. Validate both workflows with the pinned actionlint, push, run required CI on
   a pull request, dispatch the native workflow for the same revision, and
   record both results in the ledger.
7. Prove the required check set still fails on a deterministic defect and that
   the native workflow can be dispatched for a non-default branch revision.
8. Record that a native-boundary change without a native-tier result remains
   unverified, even when required CI is green.

## Verification

- `actionlint` on both changed workflows.
- A pull-request run showing the required checks pass without `pnpm
  test:native`.
- A manual `Native tests` run on all four desktop runners for the same
  revision.
- A release QA rehearsal that calls the native workflow and records its
  run URL.
- A ledger entry naming the run IDs, the required/non-required status, and any
  runner that did not execute.
