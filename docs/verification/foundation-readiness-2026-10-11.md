# Foundation readiness review — 2026-10-11

## Result and reviewed baseline

**Foundation completion is not verified on this checkout.** Milestone 2 is
planned in [its FLASH document](../plans/milestone-2-flash.md), with foundation
acceptance as an explicit implementation entry gate. Continue foundation F1
steps 4–5, then F2–F10, using the
[foundation completion plan](../plans/foundation-completion-flash.md).

Reviewed branch `main`, revision
`f0731cf870ed832e30a5c3d0b4de7f668089e7c5`, with a clean working tree before
this documentation change. The owner's statement that foundation is complete
triggered this review; it cannot supply missing implementation or test evidence.
The locked [design](../design.md#9-development-course),
[quality standards](../quality.md), and
[original acceptance matrix](../plans/milestone-1-flash.md#8-milestone-acceptance-matrix)
define completion.

This is a current source/contract/documentation review. Historical native,
cluster and hosted results remain attributed to their original runs. No
application behavior, dependency, generated artifact, fixture or host network
configuration changed.

## Findings and concrete closure tasks

| Finding                                          | Current evidence                                                                                                                                                                                                                                                                                                                              | Closure and acceptance                                                                                                                                                                                                                                                  |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation C5 is unimplemented                   | [Cargo manifest](../../src-tauri/Cargo.toml) and lockfile contain no `kube`/`k8s-openapi`; [native module/command registration](../../src-tauri/src/lib.rs) has storage and Talos probes but no Kubernetes adapter/commands. The [ledger](milestone-1.md#checkpoint-status-and-acceptance-criteria) marks C5 pending.                         | F2–F5: backend credential handles/client sessions, bounded scoped Rust lists and watches, 410 relist, RBAC/TLS/isolation/cleanup, actual 1.36 fixture and affected 1.35/1.37 evidence.                                                                                  |
| Talos qualification is partial                   | [F1 evidence](milestone-1.md#f1-packet-evidence-part-1-provisioning-refresh-and-restricted-identities) explicitly leaves steps 4–5 undelivered. [WatchMachineStatus](../../helper/internal/talosprobe/client.go) returns on watch failure; application replacement snapshot/reconnect qualification is absent.                                | Remaining F1: bounded mid-stream reconnect/resync, stale/replacement generation semantics, real multi-event interruption/recovery/exhaustion/cancellation and cleanup. Preserve proven reader/denied identities and v1.14.2 refresh.                                    |
| Specialized UI feasibility is missing            | [package.json](../../package.json) has the Svelte/Skeleton shell but no Monaco/YAML worker, xterm.js or uPlot integration. The [source tree](../../src/) has shell, settings, clusters empty state and Talos probe views. C6 is pending.                                                                                                      | F6–F7 plus F9: real lazy offline editor/worker, bounded terminal/chart wrapper, disposal and native packaged CSP/WebView evidence.                                                                                                                                      |
| Package/vault/runtime qualification remains open | C1/C2/C3/C7 retain target-refresh/runtime qualifications in the ledger; C8 is pending. [Foundation CI](../../.github/workflows/check.yml) declares build/native jobs, but declared runners cannot prove all clean installers and minimum OS targets.                                                                                          | F8–F9: refresh dependency/security evidence; actual Linux reference/current Fedora, macOS 13.3/current on both architectures, Windows 11 packages/vault/helper/offline assets/shutdown/install/uninstall and integrity feasibility. Record each environment separately. |
| Measured foundation budgets are missing          | C9 is pending. [package scripts](../../package.json) and [foundation CI](../../.github/workflows/check.yml) have no delivered performance measurement/budget gate. F10 is still a planned packet.                                                                                                                                             | F10: repeatable declared native/synthetic measurements, derived numeric budgets, intentional overrun failure, enforceable CI and final acceptance/review.                                                                                                               |
| Repository status prose is stale in places       | README still pointed at the beginning of the completion phase. [Automation](automation.md#contract-drift-gate) said the contract step is immediately after protoc, while current CI places it last. It also described the reworked step's Windows execution as unexecuted; the hosted run at this revision has since executed it (see below). | README pointers and the automation placement text are corrected in this change, and the hosted run is recorded as new attributed evidence. Historical outcome claims stay as written.                                                                                   |

The next milestone is **Connections and read views**, not cluster creation.
Its prepared plan preserves the Rust Kubernetes/Go Talos boundary, encrypted
backend credentials, typed bounded IPC, independent API health, and the complete
v1 scope. It does not duplicate the unfinished foundation adapter or declare
milestone 1 accepted.

## Verification scope and executed environment

Source review inspected the design, quality standards, all four project domain
skills, milestone plans/ledgers, native registration, Cargo/npm manifests and
lockfiles, storage/import contracts, Talos watch implementation, renderer
transport/shell/cluster empty state, fixture authority, and CI command ordering.
`rg --files` and targeted `rg -n` searches confirmed the implementation and
command gaps above; a no-match result is source evidence, not a passing feature
test.

Host: openSUSE Tumbleweed Linux x86_64, kernel `7.2.9-1-default`. The default
shell resolves Node 24.21.0 (below the `engines` floor of 26), pnpm 12.10.1 and
system Rust 1.98.1 from `/usr/bin`. The pinned toolchains exist outside PATH:
Node 26.11.1 under `~/.local/toolchains/node-v26.11.1-linux-x64`, Go 1.27.2
under `~/.local/toolchains/go`, and Rust 1.99.0 under `~/.cargo/bin`. The `/tmp`
locations named in the F0 entry are gone. `protoc` is not installed, so this
host cannot run `pnpm contracts:check` or a Rust build without first
provisioning the CI-pinned `protoc` 36.2. The installed Oxfmt is 0.72.0.

### Hosted CI at the reviewed revision

Read from the GitHub Actions API at 2026-10-11T17:28Z, for the push of
`f0731cf` to `main`:

| Run                           | Job                              | Result                                                                                                                                                                                                                                |
| ----------------------------- | -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation checks 38158295458 | renderer                         | success                                                                                                                                                                                                                               |
| Foundation checks 38158295458 | desktop (ubuntu-22.04)           | success, including `Verify generated contracts are current`                                                                                                                                                                           |
| Foundation checks 38158295458 | desktop (macos-15)               | success, including the contract step                                                                                                                                                                                                  |
| Foundation checks 38158295458 | desktop (windows-2022)           | success: every step ran, including Clippy, both test sets, rustdoc, `desktop:build`, `production:check`, native IPC tests, `cargo audit` and the contract step. The inventory and advisory steps are Linux-only by workflow condition |
| Foundation checks 38158295458 | desktop (macos-15-intel)         | in progress at the read time, in `pnpm desktop:build`; no result claimed                                                                                                                                                              |
| Security scans 38158295539    | Trivy, CodeQL actions/js-ts/rust | success on all four jobs                                                                                                                                                                                                              |

This is the first hosted Windows execution of the reworked contract step, so
the F0 entry's unexecuted Windows row now has evidence. It is
hosted-runner evidence only: Windows Server 2022 is not Windows 11, and none
of these jobs exercises a clean installer, a real vault or a minimum OS.

Documentation checks for this change, as last run after the second review pass:

- `node node_modules/oxfmt/bin/oxfmt --check`: repository formatting, using
  Oxfmt 0.72.0 under the pinned Node 26.11.1; passed across 124 matched files.
  The first pass ran it under Node 24.21.0, below the `engines` floor.
- Local file/directory and Markdown heading links in the plan, this review,
  README, the milestone 1 ledger and the automation record: all 156 resolve to
  repository targets.
- `git diff --check`: passed for tracked changes; new documents also checked
  with `git diff --no-index --check /dev/null <document>`, with no whitespace
  findings.
- Separate final review of the first pass: milestone order, actual versus
  proposed commands, contract ownership, prerequisite/failure/cleanup coverage,
  secret handling, evidence attribution and documentation consistency.
  Corrected overview links that preceded their resource-detail destination and
  made the prohibition on credential arguments/environment explicit for exec
  providers.

Application, Rust/Go, generated-contract, browser/native, live fixture,
package/platform, performance and security suites were **not rerun** locally.
This change is documentation only; source-level missing deliverables already
prevent a completion finding. Those gates remain required for foundation
acceptance. The hosted runs above are attributed to their run IDs. No earlier
green run is presented as a fresh pass on this revision.

### Second review pass

A same-day recheck verified each finding against source. `kube`/`k8s-openapi`
are absent from the manifest and lockfile. `lib.rs` declares no Kubernetes
module. `WatchMachineStatus` returns on the first watch error. `package.json`
has no editor, terminal, chart or query dependency and no performance script.
All findings stand. The pass changed the following:

- **Environment.** The first pass reported the pinned toolchains as absent.
  Node 26.11.1, Go 1.27.2 and Rust 1.99.0 are installed outside PATH; only
  `protoc` is missing. Corrected above.
- **Hosted evidence.** The first pass fetched no CI result. The run at this
  revision was read and recorded, including the first Windows execution of the
  reworked contract step. The automation record's placement text was corrected
  to match the workflow.
- **Milestone 2 plan, revision 2.** The pass added a design-row placement table
  covering endpoint selection, containers, processes, Home, credential export
  and legacy versions. It recorded the session-only Talos store and its bounds,
  and storage v1's lack of tag/favorite fields. It aligned profile-name
  storage with 0005. It assigned 0008's deferred router choice to M2.2, and
  made M2.2 extend F3's query adapter instead of establishing a second one.
  M2.5 and M2.7 now retire the foundation feasibility views. M2.0 gained
  version and exception-expiry rechecks, the existing `pnpm talos:fixture`
  harness is named, and section 8 lists the decision triggers with defaults.
- **Owner decisions.** Asked afterwards, the owner accepted three
  recommendations: encrypted tags and favorites, a small hash router rather
  than SvelteKit, and explicit credential export in M2.1. Section 8 of the plan
  records them, and M2.1/M2.2 apply them.

No unresolved defect within this documentation change remains. The Intel macOS
job result and every local application gate remain unexecuted by this review.

## Handoff

The documentation deliverable is the
[milestone 2 FLASH plan](../plans/milestone-2-flash.md). Its packets define
profile/context import, connection linking and auth trust, context-safe routing,
Talos subscriptions/diagnostics, overview, Kubernetes discovery/browser, safe
details/YAML and final qualification, each with prerequisites and failure tests.

Next implementation: complete F1's reconnect/resync and live interruption
qualification. M2.0 starts only after foundation acceptance is evidenced. If
completion evidence exists on another revision, compare that revision and its
final acceptance ledger before applying this checkout's gap assessment to it.
