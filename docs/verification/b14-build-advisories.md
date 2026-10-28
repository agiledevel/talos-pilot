# B14 — resumed qualification security findings

Date: 2026-10-28. Status: **Go remediated and hosted-verified; scoped temporary npm
exception approved by the owner and implemented/hosted-verified**.
See [decision 0021](../decisions/0021-temporary-build-advisory-applicability.md).
No global ignore or protected-branch bypass is authorized.
This record supplements [F9 evidence](f9-linux-packages.md) and
[the ledger](../plans/foundation-finish/ledger.md).

## Fixed Go findings

Required Trivy run [40668175820](https://github.com/agiledevel/talos-pilot/actions/runs/40668175820)
reported CVE-2026-78661 and CVE-2026-97045 against `helper/go.mod`.
The official Go records identify **golang.org/x/net 0.62.0** as the minimum fixed
version for both:

- [GO-2026-6860](https://pkg.go.dev/vuln/GO-2026-6860): quadratic HTML text coalescing.
- [GO-2026-6866](https://pkg.go.dev/vuln/GO-2026-6866): HTML raw-text namespace transitions.

The helper now selects 0.62.0. Its required module graph also selects x/crypto
0.58.0, x/sys 0.49.0 and x/text 0.43.0; tidy updates x/sync/x/tools test-graph
sums. Go **1.27.3**, Talos/Helm pins, application APIs and protocols are unchanged.
Inventory and both notices artifacts were regenerated from their source graphs,
not edited by hand. The four redistributed modules retain the identical
**BSD-3-Clause** license text, SHA-256
`911f8f5782931320f5b8d1160a76365b83aea6447ee6c04fa6d5591467db9dad`.

Local gofmt-empty-diff, vet, tests, race tests, build and module verification
passed. `pnpm audit:go` reports **zero called vulnerabilities and zero affected
imported packages**. Its one module-only result is the pre-existing
[GO-2026-5932](https://pkg.go.dev/vuln/GO-2026-5932), unmaintained
`x/crypto/openpgp`, which is not imported/called; no new exclusion was added.
Contracts, regenerated inventory and notices consistency checks passed.
Hosted [Security 40671911707](https://github.com/agiledevel/talos-pilot/actions/runs/40671911707)
then passed Trivy and all three CodeQL languages for `873d8fb`, confirming this
Go remediation in the dependency scan. Final later revisions still need their
own required checks; local symbol analysis does not substitute for that scan. No real Talos lifecycle fixture was
executed or accepted by this dependency correction.

## Unpatched npm finding — owner-approved build-only applicability

Required Foundation run
[40668175939](https://github.com/agiledevel/talos-pilot/actions/runs/40668175939)
failed the unchanged `pnpm audit --audit-level=low` gate for
[GHSA-gcqx-w48m-w2h4 / CVE-2026-93753](https://github.com/advisories/GHSA-gcqx-w48m-w2h4),
prototype poisoning in **deepmerge 4.3.1**. GitHub gives no first patched version.
On this date the official npm registries still report
[deepmerge 4.3.1](https://registry.npmjs.org/deepmerge/4.3.1) and
[Svelte Vite plugin 7.3.1](https://registry.npmjs.org/@sveltejs/vite-plugin-svelte/7.3.1)
as latest; the plugin still requires `deepmerge ^4.3.1`. A downgrade, invented
patched version, blanket dev-dependency exclusion or silent audit suppression
is not a remediation.

### Actual applicability evidence

- `pnpm why deepmerge` finds exactly one path:
  `@sveltejs/vite-plugin-svelte@7.3.1 > deepmerge@4.3.1`, a dev dependency.
- Installed pinned plugin source `src/utils/options.js:185–192` initializes
  `mergeConfigs` with an ordinary `{}` target, then merges the trusted repository
  Svelte/default/inline Vite configuration. It does not consume renderer,
  cluster, imported-manifest or backend-helper input. This reduces exposure;
  it is **not a claim that the upstream package is patched**.
- An actual diagnostic production Vite build inspected Rollup's module IDs and
  failed if the exact `node_modules/deepmerge/` package entered the renderer
  graph. It passed: **2,362 renderer modules; vulnerable deepmerge absent**.
  `deepmerge-ts` is a different package and was not confused with this advisory.
- At that diagnostic checkpoint no audit configuration, exception file or gate
  had been changed. Logs:
  `/tmp/tp-deepmerge-renderer-graph.log`,
  `/tmp/tp-archive-final-foundation-failed.log`.

### Owner resolution

The owner selected **`approve-scoped-temporary-exception`** in the
`deepmerge-remediation` user form on 2026-10-28. This authorizes only option 1
below through **2026-11-11 00:00:00 UTC**, not a patched-version claim, global
ignore or permanent policy change. The original alternatives are retained as
context:

1. **A narrow temporary build-only applicability exception**, expiring
   **2026-11-11**, only for this advisory at these exact package versions/path.
   Enforce expiry, exact dependency placement and no renderer inclusion; keep
   every other vulnerability and scanner/registry error fatal. Record that this
   accepts a trusted-build-input risk, not a package fix. Re-review/remove it on
   any changed inputs or upstream fix. This is the selected option.
2. **Hold protected delivery** until upstream publishes a fixed compatible
   plugin/dependency. Continue branch packaging verification, but do not merge.
3. **Investigate and qualify a maintained compatible replacement**, keeping the
   PR draft and all current gates while reviewing the extra dependency change.

Implementation retains the live full low-or-higher audit and validates the exact
advisory/finding, actual sole dev chain, absence from production placement, and
reviewed build/audit input hashes. Actual main/worker builds reject the package
in their module graphs. New/disappearing findings, scope drift, scanner errors
and expiry all fail; no pnpm ignore list is added. **46 focused tests**, including
real Vite main/worker negative fixtures using the production configuration, plus
live `pnpm audit:npm`, actual frontend build, lint/types and actionlint passed.
Final aggregate **517 tests / 56 files**, browser **31/31**, actual isolated
native **31 tests / 5 specs**, production gates and required PR/exact-main
Foundation/Security all passed. Exact-main qualification **40685092801** also
passed all four targets. Full execution/byte evidence is in the F9 record.

Existing Rust decisions did not authorize this npm exception; the explicit new
owner answer does. PR #9 merged ordinarily as `2831d4a` only after final-source
actual four-target qualification and required checks passed. Exact-main checks,
qualification and independent Linux byte verification then passed, closing
F9-01 only. Installed-runtime qualification is separate and pending. No
protection bypass, tag/release or installed-runtime acceptance follows from
this applicability decision; deepmerge remains unpatched within accepted scope.
