# 08 — F9 on Linux: installer artifacts and clean-target runtime

Plan revision: 3, 2026-10-26. **F9 in progress: shared packaging is on main;
qualification 40401994013 passed Windows/macOS but Linux upload is blocked by
AppImage reference validation (B12). Branch probe 40407825315 established that
runner data is already mode 0777 before bundling; authenticated, byte-identical
package-data candidates are being verified (retired installed versions are not
required or substituted into the build). Hosted acceptance remains pending.**
Original planning branch: `ft-linux-package-qualification`, from merged `main`
`4a2f9914ddac222433ba99437e8aa39d54314078` (PR #5). Local results and remaining
rows: [F9 evidence](../../verification/f9-linux-packages.md).
Read the series [README](README.md), [ledger](ledger.md), [readiness
review](../../verification/f8-review-s4-readiness.md) and [S4 launch
prompt](s4-launch-prompt.md). This replaces the earlier F9 task detail, not the
normative scope or its gates.

Plan packet: [F9](../foundation-completion-flash.md#f9--qualify-actual-packages-and-clean-target-runtimes),
F9.0/F9.1 and Linux F9.4; checkpoint C8, contributing to C1/C2/C3/C6/C7 and
FND-002/003/005/006/008. Prerequisite: document 07 is done on Linux, supported by
[the F8 evidence](../../verification/f8-notices-security.md). Read the merged
revision's Foundation/Security result before accepting S4; pending is not passed.
macOS/Windows installed-runtime qualification stays deferred to [document
10](10-platform-revisit.md). F1a/F5 fixtures remain independent open work under
Q11, not a reason to restart F8 or skip later Linux close prerequisites.

## 1. Outcome and non-goals

Build the same release-configuration bundles for one immutable revision on all
four desktop runners without creating a tag or release. Install and exercise
the Linux artifacts in clean Ubuntu 22.04 and current Fedora guests, including
vault, helper, offline specialized views, failure paths and observed cleanup.
C8 can then close **on Linux only**; it remains open for deferred platforms.

No cluster features, profile UX, general shell/filesystem IPC, production signing,
updater implementation, Talos/dependency refresh, performance budgets or M2 work.
Do not invoke the tag/release workflow just to obtain packages. Do not use the
owner's existing containers, clusters or `Win11 Jump` VM. No host firewall,
bridge, zone, daemon or service changes are authorized by this packet.

This planning branch grants no push, PR, dispatch, merge, tag or release
authority. Use current owner authorization before remote operations. A manual
workflow must exist on the default branch before dispatch; a 404 is a blocker,
not evidence. Record the exact resource/authorization needed and continue only
independent preparation. Never create a tag or temporary publishing trigger to
work around it.

## 2. Read and reuse

| Boundary                      | Sources and implication                                                                                                                                                                                                                                                                                                                                                  |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release pipeline              | `.github/workflows/release.yml`, `.github/tauri.release.conf.json`, [CI/release](../../ci-release.md), [preview contract](../../release-preview.md). Extract one shared asset build path; preserve the final draft's dependency on source, QA, security, native and all assets.                                                                                          |
| Version/provenance            | `scripts/release-metadata.ts`, `scripts/lib/release.ts`, `scripts/release-assets.ts` and their tests. The source validator requires a real tag and main ancestry; it cannot validate an untagged qualification build unchanged. The collector requires `RELEASE_TAG`, target-specific output directories and exactly one installer per format.                           |
| AppImage                      | `scripts/appimage-resources.ts`, `.github/actions/linux-prerequisites/action.yml`, `scripts/ci-linux-prerequisites.sh`. Preserve the pinned runtime hash and executable WebKit helper gate; an AppDir scan alone is not rendered launch evidence.                                                                                                                        |
| Payload and production checks | `scripts/check-production-exclusion.ts`, `scripts/advisory-baseline.ts`, `scripts/lib/notices/payload.ts`, [decision 0020](../../decisions/0020-dependency-notice-generation.md). Existing production/advisory scripts inspect the local default release executable, not downloaded installers. Extend narrow check inputs/tests instead of scanning the wrong artifact. |
| Packaged binaries             | `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml`, `src-tauri/examples/export_ipc_types.rs`, `scripts/build-helper.ts`, `src-tauri/build.rs`, `scripts/contracts.ts`. The F8 DEB included a maintainer exporter; it is now a Cargo example, and a payload allowlist keeps a future `src/bin` tool out. Preserve deterministic generation.                              |
| Runtime ownership             | `src-tauri/src/helper/`, `helper/cmd/talos-pilot-helper/`, `docs/protocol/helper-v1.md`, `docs/protocol/application-ipc.md`. Inspect actual packaged-path resolution, build identity, deadlines and crash/shutdown ownership before designing faults.                                                                                                                    |
| Vault/import                  | `src-tauri/src/storage/`, `src/features/settings/`, [decision 0004](../../decisions/0004-native-vault-integration.md), [decision 0005](../../decisions/0005-native-kubeconfig-import.md), [storage v1](../../storage/storage-v1.md). Startup must not open the vault; synthetic credential bytes never cross renderer IPC.                                               |
| Native and CI harness         | `tests/native/`, `scripts/test-native.ts`, `.github/workflows/native.yml`, `.github/workflows/check.yml`, `scripts/lib/ci-scope.ts` and its tests. Test-feature builds are distinct from the ordinary installed product.                                                                                                                                                 |

Read the Tauri and TypeScript skills before scripts/workflows/packaging work;
Rust for native/checker ownership changes, Go for helper changes, Svelte and its
project/TypeScript/tooling skills for affected renderer behavior. Follow
[quality.md](../../quality.md) and [FLASH pace](../../flash-pace.md).

## 3. Execution checkpoints

Use S4-A → S4-B → S4-C → S4-D. Each may span sessions; one coherent numbered
subpart per checkpoint is sufficient. Mark the ledger in progress before code,
open `docs/verification/f9-linux-packages.md` with the acceptance IDs below,
record commands and pending rows, and leave a runnable result. That evidence
file is now an append-only record of local and hosted attempts; do not copy
planned or failed results into it as passes.

### S4-A — Shared, tag-free artifact production (F9.0)

1. Inspect the actual tree, pins and hosted results. Write source validation,
   output/provenance, permissions and failure cases before changing CI.
2. Refactor existing matrix packaging into a reusable workflow or composite
   action plus a small wrapper. Both release and qualification must call the
   **same** build steps, targets, hooks and release configuration. Preserve
   Ubuntu 22.04 DEB/RPM/AppImage, macOS ARM/Intel app+DMG, Windows NSIS, frozen
   pnpm, locked Cargo, Go/protoc pins, icons, notices, AppImage runtime digest
   and resource checks. No copied second recipe or routine dependency refresh.
3. Give qualification a required source revision, resolved once to a full
   commit SHA; validate its shape/existence and record the exact checkout.
   Choose reviewed in-repository source only, not arbitrary repository URLs.
   Treat dispatch inputs as data, not shell fragments. Verify matching
   npm/Tauri/Cargo versions without requiring or creating a tag. Keep real-tag
   resolution, main ancestry and version checks mandatory in release mode.
4. Separate package version from publication identity. Refactor the collector
   to handle untagged qualification honestly; do not fabricate a `RELEASE_TAG`
   or relax `release:check`. Reject invalid SHA/target/version, missing/duplicate
   installers and stale outputs. Keep Windows process invocation portable.
5. Embed `TALOS_PILOT_BUILD_ID` as that same full SHA in Rust and Go, not the
   workflow controller's `GITHUB_SHA`. Upload bounded artifacts containing the
   expected packages, SHA-256 sums and provenance (source SHA, versions, target,
   workflow/run identity, config and helper/application digests). No credentials,
   signed publisher claim or local unrelated files. Keep artifact retention
   bounded (existing 14 days), read-only build permissions and finite timeouts.
6. Remove the maintainer `export_ipc_types` executable from shipped packages at
   the build/bundle source, not by deleting it from completed installers.
   Retain its use through `pnpm contracts:check`; add a payload allowlist check
   for intended application programs on each target. Include required platform/
   WebKit support executables explicitly; this is not a two-executable limit.
   Reject maintainer/test tools without rejecting required runtime helpers.
   If pinned Tauri cannot separate it, record evidence/proposal before changing
   the packaging contract. Do not remove or hand-edit generated DTOs.
7. Test source/ref injection rejection, version mismatch, missing/duplicate
   outputs, partial build/upload failure and provenance mismatch. Validate
   workflows with pinned actionlint/ShellCheck and run affected gates. Obtain
   owner-authorized hosted execution on all four runners, read job/step results
   and download the exact Linux artifact. Compare hashes and embedded identity.
   If publishing the workflow to default is needed, stop for that owner action.

**Exit:** F9-01 has executed hosted evidence, not a local substitute. If hosted
access/dispatch/artifacts are unavailable, record the blocker; S4-B image/smoke
preparation may proceed, but no installed reference-build pass is possible.
Release publication must still depend on every existing qualification job.

### S4-B — Reproducible clean guests and smoke procedure

1. Use QEMU/KVM with user-mode networking under Q12. Discover available disk,
   RAM, graphical access and tools without altering host services. Resolve exact
   Ubuntu 22.04/current Fedora cloud image URLs, release/architecture and
   published digests from primary sources; record retrieval date and hashes.
   No guessed version/digest or mutable `latest` as durable provenance.
2. Use an immutable verified base with disposable overlays, a non-root desktop
   user, a working graphical session, D-Bus/Secret Service and declared runtime
   prerequisites. A bare cloud image/Xvfb with no desktop vault is not enough.
   Record guest provisioning/packages; no Node/Rust/Go/global Talos/Kubernetes/
   Helm tools in the runtime image. Keep any test controller separate from it.
3. Create a repeatable script or precise command procedure with real exit codes,
   bounded waits, cleanup traps and explicit failure reporting. Record VM/disk/
   port ownership, no host-network changes, and remove overlays/processes on
   success and failure. Do not delete shared base-image caches or owner VMs.
4. Define rendered-launch, helper-handshake, vault and worker evidence collection
   before running it. Ordinary production has no WebDriver/test commands; use
   trusted desktop interaction/screenshots/process observations where needed.
   Do not enable test features, devtools bypasses, CSP relaxations or fake vaults
   in the installer to make smoke automatable. Native-test evidence is separate.
5. Transfer only verified packages and synthetic inputs. Stage network access
   for OS prerequisites, then disable guest external networking for offline
   asset rows while preserving local IPC/D-Bus. Record how isolation was enforced.

**Exit:** pinned guest recipe and observable assertions ready; this preparation
alone passes no installed-runtime acceptance row.

### S4-C — Installed Linux runtime and faults (F9.1)

Execute the following matrix using S4-A's exact hashes and clean S4-B overlays.
Never substitute the development-host executable or an extracted AppDir for an
installed launch.

| Guest                                         | Formats          | Required evidence                                                                     |
| --------------------------------------------- | ---------------- | ------------------------------------------------------------------------------------- |
| Ubuntu 22.04 x86_64                           | AppImage and DEB | AppImage rendered launch/shutdown; DEB install, rendered launch, reinstall, uninstall |
| Current Fedora x86_64, exact release recorded | AppImage and RPM | AppImage rendered launch/shutdown; RPM install, rendered launch, reinstall, uninstall |

For each guest/format record runtime dependency versions (WebKitGTK/GTK,
Secret Service, FUSE/AppImage mode), install/resource paths, app/helper digests
and identity. Do not disable WebKit sandboxing or run the app as root to bypass
a startup failure. Fix packaging or document a supported prerequisite and rerun.

1. Show the actual window/content and local assets. Confirm helper handshake
   from its packaged path, intended architecture and exact build identity with
   no global CLI. Verify startup remains vault-lazy.
2. Through the installed DEB/RPM application on each guest, import an offline,
   synthetic supported kubeconfig through the native picker. Exercise Secret
   Service available, locked and unavailable (cancel prompts where relevant);
   demonstrate explicit session-only choice, no plaintext fallback and recovery
   via explicit retry. Store a credential, quit/restart, explicitly list and
   reopen its saved handle without reimport. Check database/files/logs for a
   synthetic sentinel without printing it or the key. A real cluster is not
   required to demonstrate encrypted persistence.
3. Offline in **each format/guest**, open editor/diff, get worker-produced YAML
   diagnostics, render terminal/chart and change theme/density. Preserve F6/F7
   bounds, lazy loading, CSP denials and disposal. Native test-build results
   corroborate behavior but cannot establish installed production assets.
4. In disposable copies/overlays only, exercise path spaces/non-ASCII, missing
   helper, wrong helper/architecture, mismatched build identity, stalled startup,
   helper crash, parent crash and active-stream quit. Use synthetic fault helpers
   only in the guest fault copy, never official artifacts or renderer commands.
   Keep original hashes, record each injected alteration and restore afterward.
   No secret in args/environment/logs. An installed active-stream case needs a
   real allowlisted source or a clearly labelled synthetic external endpoint
   matching the production transport; a native-test command does not qualify it.
   If no source is available, keep this mandatory row open.
5. Observe process/listener baselines and return to them after normal exit,
   crashes, failed startup and every fault, not merely a cleanup callback. Check
   for orphan helper/WebKit children and retained tasks; retain redacted evidence.
6. Reinstall must retain user data. Record uninstall's exact retained database/
   vault/preferences behavior and a deliberate test-profile removal procedure.
   Do not delete user credentials silently as an uninstall convenience.
7. A safe live Talos/Kubernetes read/stream from a guest is conditional on an
   existing allowlist and reachable network without host changes. If unavailable,
   label that combination unexecuted; do not borrow an owner context or start a
   fixture inside this packet. This conditional row does not waive mandatory
   installed stream-cleanup evidence above.

**Exit:** F9-02–F9-07 have observed evidence. A missing image, desktop vault,
usable artifact or stream source keeps its required row in progress/blocked.

### S4-D — Final payload, security and acceptance (Linux F9.4)

1. Inspect DEB, RPM and AppImage payloads safely in private bounded extraction
   directories. Use `pnpm notices:check-packaged -- <actual-legal-directory>`
   against each format; test missing/tampered/wrong-revision payload failure on
   copies. The notices are an all-target superset under decision 0020, not newly
   target-minimized notices. Record helper paths and the exporter exclusion.
2. Adapt production exclusion/advisory inspection to explicit target/build or
   extracted artifact paths with regression tests; retain current defaults.
   Inspect the **actual bundled executable and renderer**, not the adjacent
   `target/release` file. Prove test/driver/mock surfaces absent and no driver
   listener on installed launches. The asset hash/provenance check must reject
   a swapped package. Do not recompile inside clean runtime guests.
3. Run fresh per-format artifact vulnerability/secret/misconfiguration scans
   using the pinned tools; distinguish them from lockfile scans. Explain any
   system-library finding and keep accepted exceptions ID/path/date-scoped;
   never broaden an exception or suppress an artifact finding to pass. If a
   scanner cannot inspect the payload, record that limit rather than a pass.
   Run linked-symbol checks on an unstripped equivalent where necessary with
   evidence tying it to the packaged binary; an unreadable/stripped binary is
   not an applicability pass. Record hashes before and after bundler patching.
4. Document publisher-signing/helper-integrity feasibility: what is signed,
   trust verification at startup, limitations of build-identity matching, and
   release credentials still needed. Hashes and matching build IDs do not prove
   publisher authenticity. Production signing remains a later release gate.
5. Run final applicable gates after fixes. If native tests share build outputs,
   native first, ordinary build/bundles next, then production/advisory inspection
   of those final bytes. Rebuild/requalify affected packages after corrections;
   do not reuse a hash or clean-VM pass from an older artifact.
6. Review the final diff separately, record candidate hosted CI/security and
   artifact run identities, update evidence/ledgers/docs. Close C8's Linux rows
   only after F9-01–F9-10 pass. Keep C6/C7 and global C8 open for deferred
   platforms; do not close F1a/F5/F10 or declare Linux foundation/M2 acceptance.

## 4. Acceptance matrix

All rows start **pending**. The implementing evidence file maps each ID to
source/artifact SHA, command or manual steps, guest and results; planned checks
and inherited F8 results cannot be marked fresh passes.

| ID    | Required observable result                                                                                                                                 | Checkpoint |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| F9-01 | Shared release/qualification path produces all four targets for one SHA without tag/publication; downloaded hashes/provenance match; release guards remain | S4-A       |
| F9-02 | AppImage renders and exits on clean Ubuntu 22.04 and recorded current Fedora                                                                               | S4-C       |
| F9-03 | Ubuntu DEB and Fedora RPM install, render, reinstall and uninstall with documented data retention                                                          | S4-C       |
| F9-04 | Packaged helper path/architecture/identity handshake, no global CLI, maintainer exporter absent                                                            | S4-A/C/D   |
| F9-05 | Real desktop vault available/locked/unavailable, explicit session-only/retry, encrypted restart and no plaintext sentinel leakage on both guests           | S4-C       |
| F9-06 | Each format/guest loads offline editor/worker/diff/terminal/chart under packaged CSP and cleans resources                                                  | S4-C       |
| F9-07 | Every path/helper/startup/crash/active-stream fault has a clear outcome, observed child/task/listener cleanup, original artifact preserved                 | S4-C       |
| F9-08 | Actual payloads exclude test/driver/mock code, installed launches expose no driver listener; missing/tampered/swapped artifacts fail                       | S4-D       |
| F9-09 | All three Linux payload notices verified, artifact scans reviewed, package/helper/app hashes and signing/integrity limits recorded                         | S4-D       |
| F9-10 | Final affected gates/hosted results read, separate review resolved, contracts/setup/runtime requirements/ledgers agree                                     | S4-D       |

## 5. Gates and stop conditions

Use existing [quality commands](../../quality.md#3-required-command-contracts),
not invented scripts. New qualification/provenance/payload commands are S4-A/D
deliverables and must have regression coverage and failure-propagating CI.

- Formatting, links and `git diff --check`; pinned actionlint 1.7.12 and
  ShellCheck 0.11.0 for workflows/shell. Test shared-call wiring and preservation
  of the release publication dependency graph, not only valid YAML syntax.
- For script/renderer changes: `pnpm check:ci` once on the final tree and
  `pnpm test:e2e`; targeted script/provenance/negative-payload tests during
  iteration. Do not immediately repeat equivalent coverage/non-coverage gates.
- `pnpm contracts:check`, `pnpm icons:check`, `pnpm notices:check`,
  `pnpm inventory:check`, `pnpm audit --audit-level=low`, `pnpm audit:go`,
  `pnpm advisories:check` and affected native builds. Include Rust default and
  `native-test` Clippy/tests, rustdoc/doctests and Go/race gates when touched.
- Actual `pnpm test:native` via the manual tier or a local isolated equivalent
  for native-boundary changes, followed by `pnpm desktop:build` and
  `pnpm production:check`; same revision's release-config bundles and actual
  payload/installed checks are additional, not replaced by these commands.
- Release-mode `pnpm release:check` still needs an existing valid tag: test its
  strict behavior through source-validator tests, but do not fabricate a tag
  for this task. Tag-free validation must be separately implemented/tested.
  Preserve `pnpm release:check-linux`, `pnpm release:assets` (extended honestly
  for qualification) and real guest smoke on both OSes.

A required unexecuted row means **in progress/blocked, not done**. Record the
missing resource and next action; never hide it in a done-with-limit footnote.
C8 becomes complete on Linux only with the full matrix, while document 10 stays
deferred. Next work after S4 is the remaining F1a/F5 fixture path (S5) before
F10 measurements, separate technical review and mandatory Q13 owner review.
M2.0 remains gated until that close; M2.1 is outside this launch.
