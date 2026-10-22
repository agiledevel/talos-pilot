# Foundation close-out plan: from the current branch to milestone 2

Date: 2026-10-22. Status: planning aid; no packet is accepted by this document.
Audience: an implementing model starting a new session with no memory of earlier
sessions.

This document sequences the remaining work of the [foundation finish
series](README.md) so that a fresh session can pick up the correct next packet
without re-deriving the state. The normative authorities remain the
[locked design](../../design.md), [quality.md](../../quality.md),
[AGENTS.md](../../../AGENTS.md), the [foundation completion
plan](../foundation-completion-flash.md), the per-packet documents in this
directory, and the [ledger](ledger.md). If this document and a packet document
disagree, the packet document wins and the disagreement is recorded in the
ledger instead of being resolved silently.

The goal is narrow: finish documents 01 to 09 on Linux, leave document 10
deferred for the owner's macOS and Windows hardware, and record enough evidence
that the milestone 2 plan's entry gate is met on Linux. This document does not
start feature work, does not reduce the v1 scope, and does not mark any row as
passed.

## 1. Definition of foundation complete

Foundation is complete for the purpose of starting milestone 2 when all of the
following are true:

1. Documents 01, 04, 05, 06, 07, 08, and 09 in the series are `done` on Linux.
   Documents 02 and 03 are already `done`.
2. Every acceptance case in those documents has recorded evidence, or is
   explicitly recorded as unexecuted with the missing resource named.
3. The milestone 1 checkpoint table records the Linux state honestly. C4, C5,
   C6, C7, C8, and C9 have their Linux rows evidenced; C8 remains open only for
   the deferred macOS and Windows rows.
4. The repository README's current-stage paragraph says foundation is complete
   on Linux, milestone 1 remains open for the deferred platform rows, and
   milestone 2 is unblocked by the owner's 2026-10-12 decision.
5. The milestone 2 plan's entry gate is marked met on Linux, with a date and a
   link to the closing ledger entry.
6. The separate final review of the series diff is recorded, and the owner has
   the short UX/tradeoff review required by document 09.

Anything short of that is `in progress`, `blocked`, or `deferred`. A green
hosted run, a successful compile, a synthetic test, or an installer build is not
by itself a completed foundation row.

## 2. Verified starting point

This section is a snapshot taken on 2026-10-22, not a substitute for the ledger.

| Item                           | State                                                                                                                                                                                                                                                                                                            |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Branch                         | `ft-foundation-completion`                                                                                                                                                                                                                                                                                       |
| Head commit                    | `2ef72ab` (`test(talos): keep the live reboot row from panicking during long outages`)                                                                                                                                                                                                                           |
| Pull request                   | #2, "Foundation Next", open, not a draft; do not merge, close, retarget, or edit it                                                                                                                                                                                                                              |
| Working tree                   | One uncommitted file: `src-tauri/tests/talos_fixture.rs` (+145/−67). It compiles and passes the Rust gates but has no ledger entry. See Q9                                                                                                                                                                       |
| Hosted foundation checks       | Run `38416194064` for `2ef72ab`: scope, renderer, ubuntu-22.04, windows-2022, macos-15, and result all pass                                                                                                                                                                                                      |
| Hosted security scans          | Run `38416194074` for `2ef72ab`: success                                                                                                                                                                                                                                                                         |
| Local checks run on 2026-10-22 | `pnpm format:check`, `pnpm check`, `pnpm format:rust:check`, Clippy, both Rust test configurations, Go format/vet/test/build, `pnpm contracts:check`, `pnpm test:e2e`, `pnpm icons:check`, and `pnpm inventory:check` (with pinned Go) pass                                                                      |
| Local checks not run           | `pnpm test:native`, `pnpm desktop:build`, `pnpm production:check`, `pnpm advisories:check`, `pnpm audit`, `pnpm audit:go`, package builds, performance measurement, and every live fixture run                                                                                                                   |
| Toolchain caveat               | The default shell had Node 24.21.0, Go 1.27.1, and no protoc. The checks above used Go 1.27.2 from the module cache and a digest-verified protoc 36.2 in `/tmp`; Node 26.11.1 was not installed                                                                                                                  |
| CI tiering                     | [Decision 0016](../../decisions/0016-ci-test-tiering.md), accepted 2026-10-22: required CI is deterministic plus Playwright; native WebdriverIO is a manual/weekly reusable workflow and a release-QA call; live fixtures, clean-VM package smoke, and performance measurement are local or explicit manual runs |

Completed packets that must not be redone: F0, F1 (with its owner re-scoped
row), F2, F3, and F4. F1a's implementation is done, and its live rows are
document 01; documents 02 and 03 are already `done` in the ledger.

Remaining packets:

| Document | Packet         | Status           | Main dependency                                   |
| -------- | -------------- | ---------------- | ------------------------------------------------- |
| 01       | F1a step 4     | Blocked by Q5/B7 | Fixture firewall permission                       |
| 04       | F5             | Not started      | Q5 for 1.36; Q6/Q7 for 1.35/1.37 and CI           |
| 05       | F6             | Not started      | None                                              |
| 06       | F7             | Not started      | Document 05's lazy/cleanup pattern                |
| 07       | F8             | Not started      | Final dependency set from 05 and 06; Trivy expiry |
| 08       | F9.0/F9.1/F9.4 | Not started      | Document 07; clean Linux VMs; hosted artifacts    |
| 09       | F10            | Not started      | Documents 01 to 08                                |
| 10       | F9.2/F9.3      | Deferred         | Owner's macOS and Windows hardware                |

## 3. Open owner decisions

The ledger records these as Q5 to Q14. The default is what a session may do
without another answer; a default marked "none" means the session must stop and
wait rather than choose.

| ID  | Decision                                | Options                                                                                                                                                                                     | Default for a session                                                                                                                                              | Impact if unresolved                                                                                           |
| --- | --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Q5  | Fixture firewall/iptables authorization | (a) add a permission rule for the exact runbook commands; (b) run fixture sessions under a policy that permits them; (c) defer fixture work                                                 | None. Stop before provisioning                                                                                                                                     | Documents 01 and 04 cannot finish; document 09 cannot close                                                    |
| Q6  | Kubernetes-only 1.35/1.37 fixture route | (a) kind over the working Docker daemon with pinned node images; (b) k3d; (c) QEMU VMs; (d) hosted CI only                                                                                  | Decided 2026-10-22: (a), with disposable `talos-pilot-*` clusters; never touch the existing containers. Hosted kind is optional evidence                           | Document 04's 1.35/1.37 rows stay unexecuted                                                                   |
| Q7  | Fixture CI job shape                    | (a) explicit `workflow_dispatch` workflow, not a PR gate; (b) PR gate; (c) no CI job                                                                                                        | Decided 2026-10-22: (a). Hosted kind is acceptable for 1.35/1.37; the Talos 1.36 run stays local. Required CI has no live fixture                                  | Document 04's CI evidence row is unexecuted                                                                    |
| Q8  | Toolchain bootstrap                     | (a) add a checked-in digest-verifying bootstrap script; (b) keep the manual procedure in the series README                                                                                  | (b) until approved. Do not add a new script speculatively                                                                                                          | Sessions keep losing time to missing Node 26.11.1, protoc 36.2, and Go 1.27.2                                  |
| Q9  | Uncommitted `talos_fixture.rs` change   | (a) review, record, and commit as document 01 Part A; (b) revert and redo from `2ef72ab`                                                                                                    | (a). The change compiles and passes the Rust gates                                                                                                                 | The work is lost or silently mixed into a later commit                                                         |
| Q10 | Trivy exception renewal authority       | (a) renew only after re-proving the recorded evidence, without widening; (b) stop for the owner before renewing; (c) remove when a fix exists                                               | (a), with no automatic renewal and no widening. If the evidence no longer holds, stop                                                                              | The 2026-11-30 expiry fails security and release gates                                                         |
| Q11 | Sequencing while Q5 is open             | (a) start document 05 now, then 06, 07, 08; do 01/04 when Q5 resolves; close with 09; (b) wait for Q5 before any further work; (c) do the Kubernetes-only part of 04 first                  | (a). The series README explicitly allows 05 to 07 while a fixture document is blocked                                                                              | The branch idles while a fixable permission issue is open                                                      |
| Q12 | Clean Linux VM images for document 08   | (a) download pinned Ubuntu 22.04 and current Fedora cloud images and run them under QEMU with user-mode networking; (b) provide other machines; (c) leave F9.1 unexecuted                   | (a), if downloads and disk use are acceptable. No host firewall change is needed                                                                                   | The Linux C8 rows stay unexecuted                                                                              |
| Q13 | Owner UX/tradeoff review timing         | (a) schedule the review before document 09 is marked done; (b) document 09 records the review as delivered but acceptance pending; (c) defer the review                                     | (a). If the owner is unavailable, record it as pending and leave milestone 1 open                                                                                  | Document 09 cannot honestly claim its owner-review exit                                                        |
| Q14 | CI test tiering                         | (a) keep deterministic CI and Playwright; move native WebdriverIO to a manual/weekly workflow and release QA; run live fixtures locally; (b) keep all in required CI; (c) delete native/e2e | Decided 2026-10-22: (a), per [decision 0016](../../decisions/0016-ci-test-tiering.md). Keep synthetic Kubernetes/session tests in required CI. Move, do not delete | A required CI job cannot provide the native or live-cluster evidence; release QA must call the native workflow |

A session that needs an unanswered question writes it in the ledger's "Questions
for the owner" table before stopping. It does not invent an answer, and it does
not silently pick the default when the table says "None".

Q6, Q7, and Q14 were decided by the owner on 2026-10-22. Q5, Q8, Q9, Q10, Q11,
Q12, and Q13 remain open; the plan uses the stated defaults only where they are
not marked "None".

## 4. Rules that apply to every session

Read these before the first edit:

1. [AGENTS.md](../../../AGENTS.md), [quality.md](../../quality.md), and the
   relevant sections of [docs/design.md](../../design.md).
2. The series [README](README.md), the [ledger](ledger.md), and the packet
   document for the session.
3. The project skills for the changed domain: `talos-pilot-rust`,
   `talos-pilot-tauri`, `talos-pilot-svelte`, `talos-pilot-typescript`, and the
   framework `svelte` skill when applicable.

Then:

- Set the document's status board row to `in progress` before the first code
  edit. Fill the date.
- Write the packet's acceptance cases into working notes before editing.
- Implement one packet, or one numbered part of a packet, per session. Do not
  start the next document in the same session unless the current one is fully
  recorded and committed.
- State every bound, owner, cancellation path, and cleanup path for new tasks,
  buffers, streams, workers, and child processes.
- Add a dependency only when the packet needs it. Pin it exactly, commit the
  lockfile, and record its license and upstream source.
- Do not hand-edit generated files. Edit the source definition and regenerate.
- Do not widen a capability, CSP source, allowlist, retry policy, or platform
  target to make a check pass.
- Keep deterministic tests, native Tauri runs, and real-cluster runs separate in
  the record. A browser mock does not prove native behavior; a synthetic API
  server does not prove cluster behavior.
- Never use an owner cluster, ambient kube context, or ambient talosconfig as a
  fixture.
- Run every gate for every changed boundary on the final tree. A check that did
  not run is `unexecuted`, not `passed`.
- Required CI green is not enough for a native, fixture, packaging, or
  performance boundary. Run the manual/weekly `Native tests` workflow or a
  recorded local equivalent, the explicit fixture harness, the clean-VM smoke,
  or the performance command, and record its tier and result.
- Review the final diff as a separate pass for correctness, failure paths,
  ownership, secrets, bounds, and documentation accuracy.
- Append a session entry to the ledger, update the status board, and commit the
  code and the ledger entry together. End the commit message with
  `Co-Authored-By: <model name> <noreply@example.com>`.
- Push to `ft-foundation-completion` after each commit. Never force-push, tag,
  release, push to `main`, or edit pull request 2.
- Do not move a native or fixture gate back into required CI, and do not add a
  live fixture job to required CI, without a new owner-directed decision.
- Read the hosted result for a non-ledger commit before the session ends when it
  is available. When a change touches a native boundary, dispatch the `Native
  tests` workflow for the final revision (or run `pnpm test:native` locally under
  Xvfb) and record that result separately. Never make a follow-up ledger-only
  commit just to record the result of a ledger-only commit.

## 5. Host and toolchain bootstrap

The host is openSUSE Tumbleweed on x86_64. `sudo -n` works and `/dev/kvm`
exists. Do not install anything system-wide and do not change host
configuration outside the recorded fixture remediation.

The pinned tools are:

| Tool     | Pin     |
| -------- | ------- |
| Node     | 26.11.1 |
| pnpm     | 12.10.1 |
| Rust     | 1.99.0  |
| Go       | 1.27.2  |
| protoc   | 36.2    |
| talosctl | v1.14.2 |

Provision them into a session scratch directory and verify provenance. A
representative procedure, to be adapted only when an upstream artifact changes:

```sh
SCRATCH="$(mktemp -d)"
mkdir -p "$SCRATCH/tools"

# Node 26.11.1, checked against the published SHASUMS256.txt.
curl -fsSL https://nodejs.org/dist/v26.11.1/SHASUMS256.txt -o "$SCRATCH/SHASUMS256.txt"
curl -fsSL https://nodejs.org/dist/v26.11.1/node-v26.11.1-linux-x64.tar.xz \
  -o "$SCRATCH/node-v26.11.1-linux-x64.tar.xz"
grep ' node-v26.11.1-linux-x64.tar.xz$' "$SCRATCH/SHASUMS256.txt" \
  | (cd "$SCRATCH" && sha256sum --check)
tar -xJf "$SCRATCH/node-v26.11.1-linux-x64.tar.xz" -C "$SCRATCH/tools"
export PATH="$SCRATCH/tools/node-v26.11.1-linux-x64/bin:$PATH"
npm install --global pnpm@12.10.1

# protoc 36.2. The digest is the one recorded in
# .github/actions/install-protoc/action.yml.
curl -fsSL \
  https://github.com/protocolbuffers/protobuf/releases/download/v36.2/protoc-36.2-linux-x86_64.zip \
  -o "$SCRATCH/protoc.zip"
echo "121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278  $SCRATCH/protoc.zip" \
  | sha256sum --check
unzip -q "$SCRATCH/protoc.zip" -d "$SCRATCH/tools/protoc"
export PATH="$SCRATCH/tools/protoc/bin:$PATH"

# Go 1.27.2 from the module cache. Verify the version, do not trust PATH.
export PATH="$HOME/go/pkg/mod/golang.org/toolchain@v0.0.1-go1.27.2.linux-amd64/bin:$PATH"
go version    # must print go1.27.2

# Rust 1.99.0 is selected by rust-toolchain.toml. Put rustup's bin first.
export PATH="$HOME/.cargo/bin:$PATH"
rustc --version    # must print 1.99.0
```

`talosctl` for fixture sessions lives in `src-tauri/.local-tools/talosctl`.
Verify its SHA-256 against the v1.14.2 release's `sha256sum.txt`; the recorded
Linux amd64 value is
`c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4`, but verify
it again rather than trusting this line. Run only `talosctl version --client`
before provisioning, and keep `TALOSCONFIG` pointed at an existing empty guard
file as the [runbook](fixture-runbook.md#step-1-tools) describes.

For native tests, use a private display and private XDG directories:

```sh
Xvfb :99 -screen 0 1280x800x24 &
export DISPLAY=:99
export GDK_BACKEND=x11
export XDG_DATA_HOME="$SCRATCH/xdg-data"
export XDG_CONFIG_HOME="$SCRATCH/xdg-config"
export XDG_CACHE_HOME="$SCRATCH/xdg-cache"
pnpm test:native
```

`pnpm test:native` replaces the release executable. Run `pnpm desktop:build`
again before `pnpm production:check` or `pnpm advisories:check`.

If Q8 is approved, replace this manual section with the checked-in bootstrap
script and keep the same pins and digest checks. Do not make the script depend
on a system-wide installation.

## 6. Session sequence

The sequence below is the default when Q5 is still open: start with the
independent UI and supply-chain documents, then take the fixture documents when
Q5 is answered, and close with document 09. If Q5 is answered before document
05 starts, move documents 01 and 04 earlier; record the reordering in the
ledger.

### Session A — Reconcile the tree and the baseline

**Prerequisite:** none.

**Read:** this document, the series README and ledger, document 01, quality.md
section 3, and the current `git diff`.

**Work:**

1. Inspect the uncommitted `src-tauri/tests/talos_fixture.rs` diff. Confirm it
   is the document 01 Part A hardening described in the last ledger entry: it
   drives the probe stream while waiting, fails before a terminal outcome, and
   restructures the reboot row to assert the outcome actually observed.
2. If Q9 permits keeping it, run:
   - `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
   - `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
   - the same with `--features native-test`
   - `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets`
   - the same with `--features native-test`
   - `git diff --check`
3. Append a document 01 ledger entry that records the uncommitted change as
   Part A completion, including the hosted results for `2ef72ab`
   (`38416194064`, `38416194074`), and commit the test change with the ledger.
4. Provision the pinned toolchain. Run the baseline gates that the previous
   session did not run under the pinned Node: `pnpm install
   --frozen-lockfile`, `pnpm check`, Rust gates, Go gates including
   `go test -race ./...`, `pnpm contracts:check`, `pnpm test:e2e`,
   `pnpm test:native`, `pnpm desktop:build`, `pnpm production:check`,
   `pnpm inventory:check`, and `pnpm icons:check`. Record exact results.
5. Fix only regressions caused by the reconciliation. Do not refactor unrelated
   code.

**Evidence:** a clean tree, a ledger entry for the harness change, and a fresh
baseline record under the pinned tools.

**Exit:** clean working tree; Q9 resolved; no unexplained failure.

### Session A2 — Implement the CI tiers (decision 0016)

**Prerequisite:** Session A. This is the implementation of
[decision 0016](../../decisions/0016-ci-test-tiering.md), not a new packet.

**Work:**

1. Add `.github/workflows/native.yml` with `workflow_call`,
   `workflow_dispatch` with a revision input, and a weekly `schedule`. Use the
   pinned toolchain and the four-runner desktop matrix. Run `pnpm test:native`
   after its build, upload bounded logs/evidence, and keep read-only repository
   permissions.
2. Remove the `Run actual Tauri IPC tests` step from `.github/workflows/check.yml`.
3. Rework the `check.yml` Cargo cache-prune/save condition so it no longer
   depends on the release example compiled by `pnpm test:native`. Verify one
   complete dependency build per lockfile and no unbounded first-party cache
   growth. The native workflow keeps its own build/cache.
4. Update `.github/workflows/release.yml` so release QA calls `native.yml` for
   the exact revision in addition to the deterministic foundation checks.
5. Validate both workflows with the pinned actionlint. Push, confirm required
   CI runs without `pnpm test:native`, and dispatch the native workflow for the
   same revision. Read both results and record their run IDs.
6. Prove the required check set still fails on a deterministic defect and that
   the native workflow can be dispatched for a non-default branch revision.
7. Record in the ledger that the native workflow is not a required
   branch-protection check but is a merge and release gate for native-boundary
   changes.

**Exit:** required CI green without the native step; the native workflow green on
all four runners; release QA wiring validated or its unexecuted reason recorded;
the cache behavior verified; the ledger entry names the run IDs and tiers.

### Session B — Document 05: F6 offline Monaco/YAML workers under the packaged CSP

**Prerequisite:** Session A2. No fixture.

**Read:** [document 05](05-f6-editor-workers-csp.md), decisions 0008 and 0009,
quality.md sections 3 and 6, `src-tauri/tauri.conf.json`, `PilotApp.svelte`,
`src/components/ui/`, `src/lib/state/shell.svelte.ts`, `src/styles.css`,
`vite.config.ts`, `vite.native-test.config.ts`, the e2e and native tests, and
the Svelte skills' lifecycle/attachment sections.

**Research before code:** the current Monaco editor and YAML language-support
packages from their upstream sources. Pin exact versions. Record versions,
licenses, and sources in `docs/dependencies.md`. Do not write a version from
memory.

**Work:**

1. Re-verify the shell items document 05 lists: saved and rejected appearance
   preferences, focus restoration after menus/dialogs, visible target context,
   scaling, and both density modes.
2. Add a lazily loaded YAML editor and a diff view as reusable components with
   `@component` comments and documented props. Keep the Monaco model, worker,
   and listeners owned by the component or its `.svelte.ts` state module.
3. Bundle every worker and schema asset as a same-origin file. Do not fetch a
   schema or any remote resource at runtime. Do not add `blob:`, `unsafe-eval`,
   a remote origin, or a wildcard to the CSP. If the CSP must change, stop and
   prepare an ADR with native evidence; do not widen it quietly.
4. Add a feasibility surface inside an existing working view. Do not add a
   navigation entry. The surface shows a benign malformed YAML sample, a
   diagnostic produced by the worker, the corrected text with the diagnostic
   cleared, a real diff, and the target context.
5. Add tests:
   - browser: malformed/corrected YAML, diff, both themes, both densities, the
     three supported sizes, keyboard access, and axe checks;
   - CSP negative tests: an unauthorized script origin and an inline script are
     blocked; no request leaves the application for a remote origin;
   - cleanup: repeated open/close, prop replacement, resize, and theme change
     return worker, model, and listener counts to baseline;
   - a cancelled lazy import leaves nothing mounted or pending.
6. Record the initial shell chunk size and the editor chunk size. These are
   observations for document 09, not budgets.
7. Run the native release-executable evidence through the manual `Native
   tests` workflow for the final revision, or a recorded local `pnpm test:native`
   run under Xvfb. It proves the lazy chunk, worker diagnostic, and cleanup under
   the actual WebView. Then run `pnpm desktop:build` and `pnpm production:check`;
   required CI also runs those two.
8. Record every acceptance case from document 05, labelled browser or native.
   C6 stays `in progress` until document 08 supplies installed-package evidence.

**Gates:** the TypeScript/Svelte set, `pnpm test:e2e` in both themes at
1280×800, 1024×700, and 720×480, `pnpm test:native` through the manual/nightly
native workflow or a recorded local run, `pnpm desktop:build`,
`pnpm production:check`, dependency gates, and `pnpm contracts:check` if any
DTO changed.

**Exit:** document 05's acceptance cases 1 to 9 have evidence and the document
is `done`.

### Session C — Document 06: F7 bounded terminal and chart wrappers

**Prerequisite:** document 05. No fixture.

**Read:** [document 06](06-f7-terminal-chart.md), document 05's implementation
and ledger entries, quality.md section 6, `src/components/ui/`, `styles.css`,
and the shell state module.

**Research before code:** the current xterm.js and uPlot package names and
versions from upstream. Pin exact versions and record licenses.

**Work:**

1. Add one attachment-based terminal wrapper and one chart wrapper, each with an
   `@component` comment and documented props. Each owns its instance, resize
   handling, theme mapping, and disposal.
2. Enforce the starting retention bounds in the wrapper or its state module:
   1 MiB or 10,000 lines for the terminal, whichever is reached first; 2,000
   samples per series; at most 8 series. Test each bound and one step beyond.
3. Centralize theme and density mapping from the existing tokens. Do not
   duplicate color values in the wrappers.
4. Respect reduced motion. Do not connect the terminal to a process, socket, or
   helper. Inputs are synthetic.
5. Lazy-load each wrapper as its own chunk. A cancelled lazy import must leave
   nothing mounted or pending.
6. Add a feasibility surface inside an existing view that feeds synthetic
   output and synthetic series.
7. Test resize, theme change, and disposal in every order; repeated mount,
   unmount, and prop replacement; oversize batches; cancellation; keyboard and
   accessible names.
8. Run native evidence in the release executable through the manual `Native
   tests` workflow or a recorded local run: both wrappers render, assets resolve
   offline, and cleanup counts return to baseline.

**Gates:** the same set as document 05, including native and production
exclusion.

**Exit:** document 06's acceptance cases 1 to 9 have evidence; the final bounds
are recorded; the document is `done`.

### Session D — Document 07: F8 dependencies, notices, and security evidence

**Prerequisite:** documents 05 and 06, because they finalize the dependency set.

**Date checkpoint:** if the date is on or after 2026-11-15 and document 06 is
not done, pause the sequence and re-evidence or renew/remove the two Trivy
exceptions first. Do not let the 2026-11-30 expiry surprise the branch.

**Read:** [document 07](07-f8-dependencies-notices-security.md),
`docs/dependencies.md`, `docs/ci-release.md`, decision 0006, decision 0002,
`.trivyignore.yaml`, the inventory/advisory scripts, the generated inventory,
the security workflow, and the automation record.

**Work:**

1. Regenerate the dependency inventory from source. Review every difference
   against the committed file. Counts in old evidence are snapshots, not
   targets.
2. Review the licenses of the packages added by documents 05 and 06, including
   target-specific optional packages. Record obligations, MPL source
   obligations, and any modified third-party files.
3. Generate license and NOTICE texts from the same sources as the inventory.
   Package them with the binaries and frontend assets. Add a deterministic
   check that fails when the generated notices differ from what is committed or
   packaged. Wire it into CI with real exit codes.
4. Run `pnpm inventory:check`, `pnpm audit --audit-level=low`, `pnpm audit:go`,
   `cargo audit --file src-tauri/Cargo.lock`, and `pnpm advisories:check` on the
   final tree. For every finding: fix it with a compatible update, or record an
   applicability decision with dependency-path and call-graph evidence and a
   gate that re-proves it.
5. Re-prove the two Trivy exceptions: the dependency path is unchanged, the
   linked artifact does not contain the affected code, and no fix is available.
   Renew only with that evidence; never widen or renew automatically. If the
   evidence no longer holds, stop and ask the owner.
6. Read the exact-commit CodeQL and Trivy results for the final revision. Record
   run IDs and conclusions. Do not claim a scan that did not run.

**Gates:** frozen/locked installs, inventory check, npm/Go/Cargo audits,
advisory applicability, notice drift, exact-commit security scans, and the
producer/consumer gates for any changed script or contract.

**Exit:** C7 is complete on Linux for the current dependency set; document 07 is
`done`.

### Session E — Document 08: F9.0, F9.1, and the Linux part of F9.4

**Prerequisite:** document 07. Needs Q7 for the installer-artifact workflow and
Q12 for the clean VMs.

**Read:** [document 08](08-f9-linux-packages.md), `docs/ci-release.md`,
`docs/release-preview.md`, the release workflow and release Tauri
configuration, the check workflow, the release-asset scripts, the production
exclusion script, `scripts/build-helper.ts`, `src-tauri/tauri.conf.json`,
decision 0004, and decision 0010.

**F9.0 — installer artifacts for a chosen revision:**

1. Add a packaging path that builds the same release-configuration bundles for a
   chosen revision on the four runners and uploads them as workflow artifacts
   with hashes. It creates no tag and no release.
2. Reuse the release job's steps through a reusable workflow or shared composite
   action. Do not copy them.
3. Validate the workflow with the pinned actionlint, push, trigger it for the
   current revision, read the result, and download the Linux artifacts. If the
   hosted result cannot be read or artifacts cannot be downloaded, record a
   blocker and mark F9.0's hosted row unexecuted. Do not substitute a locally
   built installer for the reference build.

**F9.1 — Linux clean targets:**

1. Obtain clean Ubuntu 22.04 and current Fedora images. Verify each against its
   published digest. Record the image name, source, and digest.
2. Use QEMU user-mode networking. Do not add a host firewall rule, bridge, or
   zone change for these VMs.
3. Write the smoke procedure as a repeatable script or documented command
   sequence with real exit codes.
4. On Ubuntu: run the AppImage (rendered launch/shutdown) and install, reinstall,
   and uninstall the DEB.
5. On Fedora: run the AppImage and install, reinstall, and uninstall the RPM.
6. On both, with the installed application:
   - the window renders and the WebKit processes/resources are present;
   - the helper starts from its packaged path and completes its handshake with
     no global command-line tool installed;
   - Secret Service available, locked, and unavailable each produce the
     documented state;
   - a credential stored through the vault survives an application restart;
   - the offline editor, terminal, and chart from documents 05 and 06 load from
     the installed package with no network.
7. Failure cases: install path with spaces and non-ASCII characters; missing
   helper; wrong helper; mismatched build identity; stalled startup;
   application crash; helper crash; quitting with an active stream.
8. Observe child processes, tasks, and listeners are gone afterwards, including
   after an abrupt parent exit.
9. Reinstalling keeps user data; uninstalling follows the documented behavior.
   Record what remains on disk.
10. If a Talos or Kubernetes fixture is reachable from a VM without a host
    network change, exercise a safe read and stream. Otherwise record the
    combination as unexecuted.

**F9.4 — Linux integrity and final exclusion:**

1. Record package hashes and the preview signing state.
2. Document helper signing/integrity feasibility: what would be signed, with
   what, and what the application would verify at startup. This is a
   feasibility record, not production signing.
3. Confirm the target-specific notices from document 07 are inside each Linux
   package.
4. Run the final-artifact scans from document 07 on the Linux packages.
5. Run `pnpm production:check` on the default production artifacts after any
   test-feature build, and record a green manual `Native tests` run for the same
   revision.

**Gates:** workflow validation, `pnpm release:check`,
`pnpm release:check-linux` before using an AppImage, `pnpm release:assets`, the
smoke procedure on both VMs, `pnpm desktop:build` followed by
`pnpm production:check`, a green native-tier run for the revision, and
TypeScript gates for changed scripts.

**Exit:** every Linux acceptance case has evidence or a named unexecuted
resource; the packaged-installer helper startup and Linux vault-restart carried
rows are executed; C8 is complete on Linux and remains open only for macOS and
Windows; document 08 is `done`.

### Session F — Document 01: F1a live stall, exhaustion, idle, and reboot rows

**Prerequisite:** Q5 answered. A fixture session; nothing else in this sequence
depends on the fixture except document 04.

**Read:** [document 01](01-f1a-live-stall-rows.md), decision 0013, decision
0011 with its amendment, decision 0007, `src-tauri/tests/talos_fixture.rs`,
`helper/cmd/talos-pilot-helper/main.go`,
`helper/internal/talosprobe/client.go`, the F1a evidence in the milestone
ledger, and the fixture allowlist.

**Work:**

1. Follow the [fixture runbook](fixture-runbook.md) from step 0. Verify the host
   baseline before any change. Apply only the recorded fixture remediation.
2. Run the live harness from step 6. Keep the complete output.
3. While the reboot row runs, record when the stale marker appears relative to
   the reboot. If it appears about 30 to 45 seconds after the last projection,
   the watch stayed silent across the broken connection, supporting decision 0013. If a watch failure arrives immediately, record that the reading is
   wrong for this case.
4. Verify all eight acceptance cases:
   - suspended worker goes stale within 45 seconds;
   - the subscription ends `TALOS_UNAVAILABLE` within the terminal bound and
     presents nothing as current after the stale marker;
   - a worker resumed at the stale marker recovers under generation plus one,
     sequence plus one, same session;
   - an idle healthy stream stays current for more than two windows;
   - the reboot row records its measured outage and asserts the matching
     outcome;
   - no live case leaves the worker suspended on success, failure, or panic;
   - the six earlier live rows still pass on the changed harness;
   - the host is restored to baseline.
5. If a row fails, read the output before changing anything. Decide whether the
   test is wrong or the product differs from decision 0013. Fix a wrong test
   and re-run; report a product difference rather than tuning the policy.
6. Complete runbook step 7 whatever the result. Record baseline and restoration
   evidence.
7. Update decision 0013's unverified assumptions, the milestone C4 row, the
   allowlist status line, and the ledger.

**Gates:** Rust gates in both feature configurations, `pnpm format:check`,
`git diff --check`, and the live harness command from the runbook.

**Exit:** all eight acceptance cases have recorded results; F1a is accepted;
document 01 is `done`.

### Session G — Document 04: F5 Kubernetes 1.35 to 1.37 fixtures

**Prerequisite:** F4 done; Q5 for the Talos-hosted 1.36 run; Q6 and Q7 for the
Kubernetes-only fixtures and CI. This document may be split:

- **04a:** generalize the harness and run Kubernetes-only 1.35 and 1.37
  fixtures. This can start while Q5 is open.
- **04b:** run 1.36 in the Talos fixture, add the CI job, and close the
  document. This needs Q5.

Record the split and partial evidence in the ledger.

**Read:** [document 04](04-f5-kubernetes-version-fixtures.md), the F5 section of
the foundation plan, quality.md section 7, the Kubernetes fixture harness and
manifest from documents 02 and 03, the fixture allowlist, the check workflow,
and decision 0012.

**Work:**

1. Discovery, before designing anything:
   - verify which container runtime works without host changes (Docker daemon,
     podman, or neither);
   - determine whether kind or k3d can be pinned and run with it;
   - record what you checked and what you found.
     If a candidate needs a host firewall, zone, or bridge change, stop: that is
     outside the recorded remediation.
2. Pin exact 1.35 and 1.37 patch images by digest after checking upstream
   release lists. Do not write a version or digest from memory. A container CLI
   used for fixture setup is not a runtime dependency of the shipped
   application; say so in `docs/dependencies.md`.
3. Generalize `scripts/kubernetes-fixture.ts` and
   `scripts/lib/kubernetes-fixture.ts` beyond the single hardcoded fixture ID,
   version, endpoint, context, namespace, and scope. Keep exact checks before
   dispatch: fixture identity, expected server version, endpoint, CA/cluster
   identity, namespace, and allowed setup/cleanup scope. Refuse an ambient
   context. Each fixture gets its own checked manifest and its own allowlist
   entry written before use.
4. For each of 1.35, 1.36, and 1.37, run:
   - a real paginated list;
   - a valid read and a restricted read;
   - watch changes for add, change, delete, and delete-then-recreate;
   - cancellation and disconnect recovery;
   - cleanup after the run, including after a partial setup or failed test.
5. Use synthetic namespaces and restricted identities. Keep setup authority
   separate from the read identity. Require the recorded namespace anchor to
   match before cleanup. Never use an ambient current context.
6. Where a live fault is impractical, cover it with a deterministic TLS or 410
   fault and label it as such.
7. Add an explicit fixture workflow (default: `workflow_dispatch`, not a PR
   gate) using the same harness command and evidence artifacts, or record a
   documented local harness run with its evidence. Per decision 0016, required
   CI has no live fixture. Push a workflow change if one is added, read the
   result, and record it. If the result cannot be read, add a blocker and record
   the row as unexecuted.
8. Destroy every fixture and verify cleanup, including after a partial setup or
   failed test. The Talos 1.36 run uses the fixture runbook's destroy-and-
   restore procedure.

**Evidence:** real paginated lists, restricted reads, watch changes,
cancellation, and reconnect across all three versions; deterministic TLS/410
faults where needed; rejection of a wrong identity, version, or manifest;
cleanup on partial failure. Store redacted versions/topology/results, never
credentials or raw payloads.

**Exit:** every required C5 version row has evidence; C5 is complete on Linux;
document 04 is `done`.

### Session H — Document 09: F10 measured budgets and the Linux close

**Prerequisite:** documents 01 to 08 are `done`, or each open one is recorded as
blocked with its reason. This document may take two sessions: Part A/B
(harness and budgets), then Part C (matrix review and close).

**Read:** [document 09](09-f10-budgets-and-linux-close.md), the original
milestone acceptance matrix, the milestone checkpoint table, every series
ledger entry, quality.md sections 6 and 9, and the milestone 2 plan's section 1.

**Part A — harness:**

1. Add a reproducible performance command and a numeric budget check as real
   scripts with real exit codes. Wire them into CI.
2. For every run, record hardware, operating system, WebView, display, artifact
   revision, sampling method, and repetition count.
3. Measure cold and warm startup distributions, interaction latency for the
   main views, idle CPU and memory, and sustained-stream duration and growth.
4. Repeat each measurement enough times to report a distribution, not a single
   value.
5. Keep native, real-Talos-stream, real-Kubernetes-watch, and synthetic
   renderer measurements separate. A Talos stream ends at its 256-event cap;
   state that beside the result and use the Kubernetes watch for sustained
   growth.

**Part B — budgets:**

6. Derive each threshold from the measured baseline: measured value, spread,
   chosen margin, and why.
7. Prove the check works: introduce a deliberate overrun, show it fails, remove
   it, show it passes. Record both runs.

**Part C — Linux close:**

8. Review every row of the original acceptance matrix against the final
   revision. Link the implementation and the recorded result. Historical
   evidence may give context but is not a pass after later changes. List every
   deferred or unexecuted row with its reason.
9. Re-run every applicable final-candidate gate on the final tree: the README's
   gate table, including both Rust feature configurations, Go race tests,
   contracts, production exclusion, security scans, the new performance check,
   and a green manual `Native tests` run for the final revision plus the local
   fixture and clean-VM evidence.
10. Validate documentation and contracts: setup, protocol, storage, recovery,
    relative links, and `pnpm contracts:check`.
11. Perform the separate final review of the whole series diff: correctness,
    security boundaries, resource ownership, maintainability, and missing
    failure-path coverage.
12. Write the short milestone UX and tradeoff review for the owner: what works,
    what is rough, which tradeoffs were made, and what you would change.
13. Record the closing state:
    - milestone checkpoint table: each Linux checkpoint complete, deferred rows
      named;
    - series ledger: status board, deferred rows, and the closing entry;
    - README: foundation complete on Linux, milestone 1 open only for the
      deferred platform rows, milestone 2 unblocked;
    - milestone 2 plan: entry gate met on Linux, with the date and a link.

**Exit:** every acceptance case has evidence; budgets are enforced and proven to
fail on an overrun; document 10 is the only document not `done`; milestone 1 is
complete on Linux; document 09 is `done`.

### Deferred — Document 10: macOS and Windows

Do not run this until the owner says the platforms are available and names the
machines. Record the OS versions, architectures, and access method in the
ledger. Hosted macOS 15 and Windows Server runners are build/native evidence
only; they are not macOS 13.3 or Windows 11 qualification. Do not use the
owner's `Win11 Jump` VM unless the owner explicitly makes it a test target and
the ledger records that.

## 7. Critical path and parallel work

```text
Q5 (owner) ─────────────────────────────┐
                                        v
Session F (doc 01) ──► Session G (doc 04) ──► Session H (doc 09)
                                        ^
Session A ──► A2 (CI tiers) ──► B (doc 05) ──► C (doc 06) ──► D (doc 07) ──► E (doc 08)
```

- **Critical path:** Q5 → document 01 → document 04 → document 09.
- **Independent path:** documents 05 → 06 → 07 → 08.
- **Default order while Q5 is open:** A → A2 → B → C → D → E → F → G → H.
- **If Q5 is answered early:** move F and G ahead of B/C/D/E, because fixture
  sessions are the least predictable and the close depends on them. A2 still
  comes first so every later session records evidence against the correct CI
  tiers.
- **Partial work:** document 04a (harness generalization plus Kubernetes-only
  1.35/1.37) may run before Q5; document 04b (Talos 1.36, CI, and closure)
  waits for Q5.
- **Calendar checkpoint:** by 2026-11-15, decide whether the Trivy exceptions
  must be re-evidenced before document 07. The hard expiry is 2026-11-30.
- **Do not** start milestone 2 implementation until Session H is recorded.

## 8. Evidence and gate matrix

Run the gates for every boundary the change touches, on the final tree. The
canonical commands are in [quality.md](../../quality.md#3-required-command-contracts)
and the series README's gate table.

| Boundary changed                        | Minimum evidence                                                                                                                                                                |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Any file                                | `pnpm format:check`, `git diff --check`                                                                                                                                         |
| Markdown                                | `pnpm format` before commit; every relative link and heading anchor resolves                                                                                                    |
| TypeScript or Svelte                    | `pnpm check`, `pnpm test:e2e`, relevant tests                                                                                                                                   |
| Rust                                    | `pnpm format:rust:check`; Clippy default and `native-test`; tests default and `native-test`; doctests; rustdoc with `-D warnings`                                               |
| Go helper                               | `gofmt -l` empty; `go vet ./...`; `go test ./...`; `go test -race ./...`; `go build ./...`                                                                                      |
| IPC, DTOs, Protobuf                     | `pnpm contracts:check`, plus producer and consumer gates                                                                                                                        |
| Tauri commands, capabilities, packaging | `pnpm test:native` in the manual/weekly native workflow or a recorded local run, then `pnpm desktop:build` and `pnpm production:check` (the latter two also run in required CI) |
| Dependencies                            | `pnpm install --frozen-lockfile`, `pnpm inventory:check`, `pnpm audit --audit-level=low`, `pnpm audit:go`, `pnpm advisories:check`, license/notice checks                       |
| Fixture or live cluster                 | The exact runbook/harness command, fixture identity/version/topology, baseline before, restoration after                                                                        |
| Performance                             | The new performance command and budget check in the local/explicit tier, with environment and repetitions                                                                       |

Tier is part of the evidence record:

| Tier                      | Where it runs                               | What it covers                                                                                                                                                               |
| ------------------------- | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Required deterministic CI | `Foundation checks`                         | Format, lint, types, Svelte, renderer unit, production build, Playwright mock, Go unit/race, Rust unit/deterministic integration, contracts, inventory, advisories, security |
| Manual/weekly native CI   | `Native tests`                              | `pnpm test:native` on the four-runner desktop matrix, and the release-QA call                                                                                                |
| Local or explicit fixture | Runbook/harness, clean VMs, manual workflow | Live Talos/Kubernetes fixtures, package/vault/helper smoke, performance measurement                                                                                          |

Evidence classes are recorded separately: deterministic tests, actual native
Tauri runs, real-cluster runs, hosted CI, and manual inspection. A skipped check
is `unexecuted` with its reason and practical limit. A green row in one tier
does not satisfy a row in another.

## 9. Close-out checklist

Before declaring the foundation complete on Linux:

- [ ] Documents 01, 04, 05, 06, 07, 08, and 09 are `done`; 02 and 03 remain
      `done`.
- [ ] Document 10 is `deferred`, with the missing macOS and Windows resources
      named.
- [ ] The status board's last commit and next action columns are current.
- [ ] The session log has one entry per session and no earlier entry was
      rewritten.
- [ ] Every open question is answered or recorded as blocking with its owner
      and impact.
- [ ] Every blocker is resolved or recorded with the exact missing resource.
- [ ] The deferred-rows table names every row that is not executed, its owner
      document, and why it is open.
- [ ] The unverified-assumptions table is confirmed or refuted by live evidence
      where a document claimed it would be.
- [ ] The milestone checkpoint table reflects the Linux state and the deferred
      macOS/Windows rows.
- [ ] README's current stage is accurate and does not imply completion of
      unexecuted rows.
- [ ] The milestone 2 plan's entry gate is marked met on Linux with a date and
      link.
- [ ] Required CI runs no `pnpm test:native` and no live fixture job.
- [ ] The `Native tests` workflow exists with manual, weekly, and release-call
      triggers, and has a green run for the final revision.
- [ ] Release QA calls the native workflow for the exact revision.
- [ ] The required-CI cache-prune condition no longer depends on the native
      workflow's release example.
- [ ] Native, fixture, package, and performance rows name the tier that
      produced their evidence.
- [ ] The final diff review is recorded and has no unresolved defect in scope.
- [ ] `git diff --check`, formatting, link checks, contracts, and the final gate
      set pass on the final tree.
- [ ] The owner has the UX/tradeoff review or it is explicitly recorded as
      pending, with milestone acceptance left open accordingly.

## 10. Prompt template for a new session

Use this as the first message of a session, replacing the placeholders:

```text
Read AGENTS.md, docs/design.md, docs/quality.md, the foundation finish series
README, docs/plans/foundation-finish/ledger.md, and
docs/plans/foundation-finish/closeout-plan.md. Work on document <NN> (<packet>),
part <part> only. Start by reading the packet document and the files it lists.
Set the status board row to in progress. Write the acceptance cases into your
notes before editing. Provision the pinned toolchain from the close-out plan and
record the versions. Apply the project skills for the changed domain. Preserve
the locked architecture and unrelated changes. Apply the CI tiers in decision
0016: required CI is deterministic plus Playwright; run the manual `Native
tests` workflow for native-boundary work; run live fixtures locally or in an
explicit manual workflow. Run the gates for every changed boundary on the final
tree, including the pinned-toolchain and native/real-cluster evidence the packet
requires. Do a separate review of the final diff.
Append a ledger entry with exact commands and results, update the status board,
commit the code and ledger together, and push to ft-foundation-completion. Do
not start another document. If a decision in section 3 is unanswered and is
required for this work, stop and record the question in the ledger instead of
choosing silently.
```

## 11. Short answers to likely session questions

- **May I skip a live row because the fixture is unavailable?** No. Mark it
  unexecuted, name the missing resource, and leave the document `in progress` or
  `blocked`.
- **May I treat a hosted runner as the minimum OS?** No. Hosted macOS 15 and
  Windows Server 2022 are hosted evidence only.
- **May I add a dependency without a packet?** No. Pin it when its packet needs
  it, record the license, and commit the lockfile.
- **May I widen the CSP, a capability, or the fixture allowlist to pass a
  test?** No. Use the minimum change, record the evidence and an ADR where
  required, or stop.
- **May I use the owner's cluster or ambient kube context?** No.
- **May I mark a document done with a skipped gate?** No. A skipped gate is
  `unexecuted`.
- **May I merge or edit pull request 2?** No.
- **May I force-push, tag, release, or push to main?** No.
- **May I leave a fixture or host remediation in place between sessions?** No,
  unless the owner separately agrees and the ledger names what remains.
- **May I use the `Win11 Jump` VM?** No, unless the owner explicitly makes it a
  test target and the ledger records that.
