# 0021 — Expiring build-only deepmerge applicability exception

- **Status:** owner approved 2026-10-28; implemented in protected PR #9 (`2831d4a`), required PR/exact-main Foundation and Security passed; [qualification evidence](../verification/f9-linux-packages.md)
- **Decision source:** user form `deepmerge-remediation`, answer `approve-scoped-temporary-exception`
- **Expiry:** **2026-11-11 00:00:00 UTC** (the exception is invalid at that instant)
- **Evidence:** [B14 investigation](../verification/b14-build-advisories.md)

## Context

GHSA-gcqx-w48m-w2h4 / CVE-2026-93753 reports prototype poisoning in deepmerge
4.3.1. Its only installed consumer is dev-only `@sveltejs/vite-plugin-svelte`
7.3.1. Both were latest and had no published fix when reviewed. The plugin
merges trusted repository/default/inline configuration, not renderer, imported
cluster data or remote user configuration. An actual production Vite diagnostic
inspected 2,362 module IDs without finding the vulnerable package in the renderer.
That applicability evidence does **not** patch the library or make arbitrary
build inputs safe. The separate x/net findings were fixed, not excepted.

The owner explicitly approved a narrowly scoped temporary exception instead of
holding for upstream or qualifying a replacement. This accepts residual
**trusted-build-input risk**, not runtime exposure, a permanent exclusion or a
change to platform/product scope. No merge/protection bypass was approved.

## Enforced decision

1. `pnpm audit:npm` still executes **`pnpm audit --audit-level=low --json`**.
   The audit must exit 1 with exactly the reviewed low advisory, version 4.3.1,
   one dev/non-optional/non-bundled finding and sole path
   `.>@sveltejs/vite-plugin-svelte>deepmerge`. All other severity counts are zero.
   Registry errors, malformed JSON, spawn/timeout/overflow errors, unexpected
   status, new/changed or disappearing findings fail. A published remediation
   also invalidates the exception. No `auditConfig` ignore list is added.
2. Live `pnpm why deepmerge --json` must show only plugin **7.3.1**, then the
   repository's dev dependency. `pnpm list deepmerge --prod --json --depth Infinity`
   must show no production placement. New consumers, versions or placement fail.
3. Reviewed SHA-256s in `scripts/lib/npm-advisory.ts` bind package scripts/pins,
   the pnpm lock/workspace and npm configuration, Svelte configuration, and both
   Vite configurations. Missing/changed inputs fail. These are deliberately
   reviewed baselines, **not auto-regenerated output**; do not re-bless drift to
   make CI green. Any changed scope requires applicability re-review.
4. Both the actual main and worker Vite plugin lists install a production
   module-graph guard. It rejects `node_modules/deepmerge` IDs, including
   Windows/proxy IDs, regardless of tree shaking. `pnpm build` and native/package
   hooks therefore cannot ship that dependency. The audit command proves audit
   and dependency placement; **only the actual build establishes renderer/worker
   absence**. Both are required. Existing unchanged-input CI reuse rules still
   apply; no new permission to reuse unexecuted evidence is introduced.
5. The audit and build guard fail at the expiry instant, with no environment,
   CLI or date override. The injected date in pure unit tests is not a CLI
   bypass. Processes have 90-second/4-MiB bounds; failures never log raw child
   output/error causes, which could contain registry credentials.

The guard is build tooling, never renderer code: expiry does **not** disable an
already installed application. No dependency is upgraded, downgraded, forked or
misrepresented as patched by this decision. No Talos/Kubernetes fixture,
installed-runtime, signing, release, or F9 acceptance is inferred.

## Alternatives and consequences

- **Hold for upstream:** preserves zero unresolved findings but blocks delivery
  of the independently verified package fix. The owner did not select it.
- **Qualify a maintained replacement:** may remove the finding, but adds a new
  publisher/dependency and compatibility scope. Not selected at this point.
- **Ignore the advisory ID globally / prod-only audit:** rejected; would hide
  changed consumers or new build exposure.

This is intentionally short-lived maintenance cost. Before expiry, remove the
exception machinery and restore the ordinary full audit after a compatible
upstream fix (or withdrawal) is verified; preserve this decision as history.
Do not silently renew, widen scope, rewrite tests, or disable the graph guard.
A further unpatched extension requires a new owner-directed risk decision.

## Verification

Unit regressions cover scope, additional findings/consumers/counts, production
placement, input drift, scanner errors, malformed output/privacy, expiry and
Windows/proxy IDs. Real Vite builds using the actual production config reject
synthetic main **and worker** imports and accept clean builds. These fixtures
never execute/repackage the real vulnerable dependency. Live npm audit/placement
checks and the actual application build also pass locally. Final aggregate **517 tests / 56 files**, browser **31/31**, actual private-XDG
native **31 tests / 5 specs**, production and hosted PR/exact-main checks passed;
executions and limits are recorded in the ledger/F9 record, not presumed from
these narrow tests. This finding remains unpatched and accepted only within the
expiring scope above.
