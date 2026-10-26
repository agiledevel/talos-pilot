# F8 progress review and S4/F9 implementation readiness

Date: 2026-10-26. Reviewed source: clean `main`
`4a2f9914ddac222433ba99437e8aa39d54314078`, matching fetched `origin/main`.
PR [#5](https://github.com/agiledevel/talos-pilot/pull/5) merged at that revision.
Preparation branch: `ft-linux-package-qualification`.

**Disposition:** F8/document 07 is accepted on Linux under its existing
[evidence](f8-notices-security.md); S4/[document
08](../plans/foundation-finish/08-f9-linux-packages.md) is the next planned
implementation phase, READY but **not started**. Foundation milestone 1 and
M2's Linux entry gate remain open. This is a source/evidence review and planning
change, not a fresh implementation, security audit or runtime qualification.

## 1. Progress against the locked milestone order

| Area            | Supported disposition                                                                                                                                 | Still required                                                                                            |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| F0/F1/F2        | Closed/accepted under recorded owner decisions                                                                                                        | Preserve decisions and carried limitations                                                                |
| F3/F4           | Accepted Linux Rust Kubernetes list/watch with native and Talos-hosted Kubernetes 1.36 evidence                                                       | F5 version matrix is separate                                                                             |
| F1a/document 01 | Stall detection and Part A live harness implemented                                                                                                   | All eight Part B live cases, timing and restoration                                                       |
| F5/document 04  | Not started                                                                                                                                           | Real 1.35/1.37 pinned fixtures plus complete 1.36 matrix, identity/version rejection and cleanup          |
| S0              | Accepted only by owner exception after native keyboard pass                                                                                           | B11 remains unresolved/not fixed; retain diagnostics                                                      |
| S1/F6 and S2/F7 | Accepted on development Linux WebView, including corrections                                                                                          | Installed packages and deferred WebViews remain separate                                                  |
| S3/F8           | Full generated notice superset, deterministic drift/build enforcement, Linux DEB payload, native smoke, current scans and candidate hosted acceptance | RPM/AppImage, clean installed runtimes and final-artifact scans belong to F9; C7 is not globally complete |
| S4/F9           | Existing release recipe and resource checks, no tag-free qualification path                                                                           | Shared artifacts, clean Ubuntu/Fedora install/vault/assets/failure/cleanup matrix                         |
| S6/F10 and S7   | Not started                                                                                                                                           | Measurements, derived/enforced budgets, final review and explicit Q13 owner acceptance                    |
| Document 10     | Owner-deferred, unexecuted                                                                                                                            | macOS/Windows installed runtime/minimum OS qualification when resources exist                             |
| M2              | Prepared plan only                                                                                                                                    | M2.0 after Linux foundation close; no M2.1 features now                                                   |

Source/evidence authorities: [design](../design.md#9-development-course),
[milestone checkpoints](milestone-1.md#checkpoint-status-and-acceptance-criteria),
[series ledger](../plans/foundation-finish/ledger.md) and
[follow-up sequence](../plans/foundation-finish/follow-up-to-m2.md).

## 2. Hosted evidence and its limits

F8 was accepted using candidate `0bf8d75` in PR #5: Foundation
[40294023817](https://github.com/agiledevel/talos-pilot/actions/runs/40294023817)
and Security
[40294023939](https://github.com/agiledevel/talos-pilot/actions/runs/40294023939)
passed with freshly executed analysis, as the F8 record documents. This review
does not relabel those as merge-head, installed-runtime or new local results.

At session entry the exact merge SHA's Foundation
[40313099783](https://github.com/agiledevel/talos-pilot/actions/runs/40313099783)
and Security
[40313099694](https://github.com/agiledevel/talos-pilot/actions/runs/40313099694)
were **in progress**. `gh run view --json headSha,status,conclusion,jobs,url`
confirmed that SHA, full main execution in progress, completed Trivy/actions/JS
jobs and remaining Rust/desktop work. The final observation is recorded in the
planning session's ledger entry; do not infer success from merge or an earlier
PR result. Read any still-pending final result before S4 acceptance and address
failures. No pipeline was dispatched or cancelled by this preparation.

## 3. Source findings and concrete next work

These are planning findings, not reproduced runtime failures or vulnerabilities.

| ID    | Finding at reviewed source                                                                                                                                                                      | Required S4 resolution                                                                                                                                                                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S4-R1 | `release.yml` assets are embedded in a publishing workflow. Its manual input is a real tag; `release-metadata.ts` requires tag resolution/main ancestry.                                        | Extract one shared recipe for release and tag-free qualification; keep publication guards intact.                                                                                           |
| S4-R2 | `release-assets.ts` requires `RELEASE_TAG` and target-specific bundle directories. `build-helper.ts` can fall back to controller `GITHUB_SHA` if the explicit identity is absent.               | Separate version from publication identity, validate immutable source/checkout and bind both binaries, artifacts and evidence to it; reject missing/duplicate/stale/swapped output.         |
| S4-R3 | F8's real DEB lists `/usr/bin/export_ipc_types`; Cargo auto-discovers it from `src/bin`. It is a maintainer generator, not an app runtime dependency.                                           | Exclude at build/bundle source, preserve contracts generation and inspect payload executable allowlists; do not patch completed installers.                                                 |
| S4-R4 | `production:check` reads default `src-tauri/target/release/talos-pilot` and `dist`; advisory inspection also uses the local executable. Neither proves downloaded/installed artifact exclusion. | Add narrow explicit artifact inputs with regressions; scan actual packaged app/helper/assets and observe no listener on installed launches.                                                 |
| S4-R5 | `appimage-resources.ts` checks executable WebKit helpers in an AppDir. F8 inspected DEB legal bytes only.                                                                                       | Preserve AppDir gate and add real AppImage launch on both guests plus notices/scans across all three Linux formats.                                                                         |
| S4-R6 | No clean guest/smoke harness exists. A bare cloud guest does not provide a graphical Secret Service session; production has no test WebDriver.                                                  | Pin images, provision declared desktop/runtime prerequisites, use ordinary non-root app with trusted input and separate controller; record actual vault/offline/fault/cleanup observations. |
| S4-R7 | Current summaries disagree: ledger board/top and follow-up entry still say F8 not started; C6 still says F7 hosted pending; old expiry text says 2026-11-30.                                    | Reconcile current summaries to append-only acceptance evidence and actual 2027-02-28 expiry without rewriting historical entries.                                                           |

The refined packet defines **S4-A shared artifacts → S4-B clean guest procedure
→ S4-C installed runtime/faults → S4-D final scans/review**, with F9-01–F9-10
observable acceptance IDs. The [saved launch
prompt](../plans/foundation-finish/s4-launch-prompt.md) starts S4-A only; it does
not require one FLASH session to finish all VM work.

## 4. Review limits and handoff

- No application, generated artifacts, lockfiles, workflow, exceptions or skills
  changed. No local unit/browser/native/build/security/cluster/package/performance
  gate was rerun; historical results remain attributed to their records.
- No new OS/image/API/tool pin is asserted. The implementing session researches
  exact images and any newly required APIs from primary sources before use.
- Q12 already permits pinned Ubuntu/Fedora QEMU guests with user-mode networking;
  no additional host-network or service changes are inferred. No owner cluster
  or ambient credentials are a fixture.
- Branch creation and documentation commit are authorized by the current request.
  No push, PR, merge, workflow dispatch, tag or release is authorized here.
- Documentation formatting, local links/anchors, diff whitespace and the separate
  final review are recorded in the ledger. This preparation closes no new C/FND
  acceptance row. Remaining fixtures, budgets, owner review and platform gaps
  are not silently deferred by starting S4.
