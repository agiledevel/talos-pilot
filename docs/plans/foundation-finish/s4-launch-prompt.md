# S4 FLASH launch — tag-free installer artifacts, then Linux qualification

Prepared: 2026-10-26. Branch: `ft-linux-package-qualification`, based on merged
`main` `4a2f9914ddac222433ba99437e8aa39d54314078` (PR #5). **READY; F9
implementation not started.** This prompt is not evidence of a completed build
or authority for remote operations.

## Copy-ready implementation prompt

> Work on `ft-linux-package-qualification`. Read AGENTS.md, docs/design.md,
> docs/quality.md, docs/flash-pace.md, docs/plans/foundation-finish/README.md,
> its ledger/current summaries, docs/verification/f8-review-s4-readiness.md and
> docs/plans/foundation-finish/08-f9-linux-packages.md completely. Follow the
> current follow-up-to-m2.md sequence; S0/S1/S2/S3 are accepted on Linux and
> must not be restarted. B11 remains unresolved under the owner's S0 exception.
>
> Execute **S4-A only** (F9.0 shared, tag-free artifact production), or its
> smallest complete numbered subpart. State acceptance/failure cases and file
> ownership before code. Mark document 08 in progress in the series ledger;
> open docs/verification/f9-linux-packages.md with F9-01–F9-10 pending rows.
> Read Tauri/TypeScript skills and Rust/Go/Svelte skills for any affected domain.
>
> Verify the actual branch/tree and pinned private tools. Read the exact merge
> revision's main Foundation 40313099783 and Security 40313099694 final job/step
> results if the ledger has not already recorded them. They were in progress
> at planning entry, not assumed green. Discover the current branch's PR/checks
> rather than hard-coding historical PR #2. Address actionable failures before
> dependent acceptance; do useful independent work while hosted jobs run.
>
> Reuse release.yml's build recipe through one shared path, retaining all four
> targets, pins, release config, notices, AppImage resource/runtime checks and
> source/QA/security/native/assets publication dependencies. Introduce an
> untagged qualification wrapper with immutable SHA validation, matching package
> versions, explicit Rust/Go build identity and downloaded-artifact provenance.
> Never create/fake a release tag, weaken release:check or duplicate the recipe.
> Exclude the maintainer export_ipc_types executable at source without breaking
> contracts:check; verify intended payload executables rather than deleting
> files from completed installers. Cover malformed/ref-injection inputs,
> version/provenance mismatch, missing/duplicate/stale outputs and partial failure.
>
> Keep build permissions read-only, input interpolation safe, artifact sets and
> retention bounded. Run narrow regression tests while iterating, then the
> applicable final-tree gates in document 08 once, including native verification
> where required. Native first, ordinary builds/bundles next, actual final-byte
> exclusion/advisory checks last. A local target/release binary or extracted
> source legal directory is not downloaded/installed artifact evidence.
>
> Use only active owner permission for push/PR/dispatch. This planning request
> authorized a local branch and docs commit, not remote actions. If a new manual
> workflow is not yet on default, request the required owner publication/dispatch
> action; do not use tags or temporary publishing triggers as a workaround.
> Hosted artifacts unavailable means F9-01 stays unexecuted/blocked. Do not claim
> F9 complete after a refactor or a successful no-bundle build.
>
> Separately review the final diff for correctness, security, provenance,
> cleanup, duplicated gates and contract/documentation agreement. Record exact
> source/run/artifact identities, commands, environments, results, evidence
> classes, cleanup and remaining limits in the evidence file and ledger. Commit
> a coherent checkpoint under current authority; preserve unrelated work.
> Stop with the precise S4-A continuation/blocker or an S4-B handoff. Do not
> start guest mutations, F1a/F5 fixture work, F10, owner acceptance or M2 features
> in this launch.

## Subsequent sessions (not part of the first launch)

- **S4-B:** primary-source image/digest research and QEMU user-mode clean desktop
  guest/smoke procedure; real vault, no development toolchain in runtime guests.
- **S4-C:** exact hosted Linux packages on Ubuntu 22.04 and recorded current
  Fedora; installed helper/vault restart/offline assets/fault and cleanup matrix.
- **S4-D:** all-format payload notices, production exclusion, fresh artifact
  scans, signing feasibility, final gates/review and F9 acceptance if complete.

Use the [packet's acceptance matrix](08-f9-linux-packages.md#4-acceptance-matrix)
and stop conditions. Real guest evidence cannot be replaced by browser mocks,
CI compilation, a test-feature installer, unexecuted steps or the development
host's F8 DEB extraction. macOS/Windows runtimes stay owner-deferred. S5 fixtures,
S6 budgets and S7 owner review still precede Linux foundation close and M2.0.
