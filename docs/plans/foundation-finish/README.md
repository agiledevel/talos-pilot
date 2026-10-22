# Foundation finish series: start here

Date: 2026-10-12. Audience: an implementing model working one session at a time, with no memory of earlier sessions. Read this file completely before any packet document. It holds the rules every packet shares, so the packet documents do not repeat them.

This series finishes milestone 1 (feasibility and foundation) on the Linux development host. It splits the remaining packets of the [foundation completion plan](../foundation-completion-flash.md) into one document each, with the context a fresh session needs. The plan stays the normative definition of each packet. Where a packet document and the plan disagree, stop and record the disagreement in the [ledger](ledger.md) instead of choosing one.

## The documents

| Order | Document                                                                     | Plan packet      | Needs the Talos fixture |
| ----- | ---------------------------------------------------------------------------- | ---------------- | ----------------------- |
| 01    | [F1a live stall rows](01-f1a-live-stall-rows.md)                             | F1a step 4       | Yes                     |
| 02    | [F3 Kubernetes list probe](02-f3-kubernetes-list-probe.md)                   | F3               | Yes                     |
| 03    | [F4 Kubernetes watch](03-f4-kubernetes-watch.md)                             | F4               | Yes                     |
| 04    | [F5 Kubernetes version fixtures](04-f5-kubernetes-version-fixtures.md)       | F5               | Yes, plus two others    |
| 05    | [F6 editor workers and CSP](05-f6-editor-workers-csp.md)                     | F6               | No                      |
| 06    | [F7 terminal and chart wrappers](06-f7-terminal-chart.md)                    | F7               | No                      |
| 07    | [F8 dependencies, notices, security](07-f8-dependencies-notices-security.md) | F8               | No                      |
| 08    | [F9 Linux packages](08-f9-linux-packages.md)                                 | F9.0, F9.1, F9.4 | No                      |
| 09    | [F10 budgets and Linux close](09-f10-budgets-and-linux-close.md)             | F10              | Optional                |
| 10    | [Platform revisit](10-platform-revisit.md)                                   | F9.2, F9.3       | Parked                  |

Two shared documents support them:

- [ledger.md](ledger.md) is the progress record. **Every session must update it.** The rules are in its first section.
- [fixture-runbook.md](fixture-runbook.md) is the procedure for provisioning, using, and destroying the disposable Talos fixture.

For the recommended close-out order, the session-by-session sequence, the critical path, and the current owner decisions, see [closeout-plan.md](closeout-plan.md). It sequences this series; it does not replace the per-packet documents or the ledger.

Work the documents in order. Documents 05 to 07 do not depend on the fixture and may be taken while a fixture document is blocked, but only if the ledger records why the earlier one is blocked.

## What the owner has decided

These decisions were made on 2026-10-12, and items 8 and 9 on 2026-10-13. Do not reopen them and do not ask again.

1. **Milestone 1 may stay open without blocking further work.** The owner has no macOS or Windows machine. The macOS and Windows rows of packet F9 are deferred to [document 10](10-platform-revisit.md) until those platforms are available. Milestone 2 feature work may start once documents 01 to 09 are done on Linux.
2. **Deferred is not passed.** A deferred row is recorded as unexecuted, with the missing resource named. Hosted CI runners for macOS 15 and Windows Server 2022 are hosted evidence only. Never count them as macOS 13.3 or Windows 11 qualification.
3. **The fixture's host firewall remediation may be applied in the session.** Apply exactly the block recorded in the [fixture allowlist](../../verification/fixtures/talos-c4-disposable.md), nothing broader, and remove it at the end of the same session. If your session's permission policy denies those commands, stop and record it. Do not look for another way to change host networking.
4. **Pushing to `ft-foundation-completion` is permitted.** No force-push, no tags, no releases, no push to `main`. The owner opened pull request 2 from this branch to `main` on 2026-10-12. It is the owner's: never merge it, close it, retarget it, or change its title or description.
5. **The fixture may shadow the VPN route indefinitely.** The fixture network `10.79.0.0/24` sits inside a VPN route on the host. Do not ask about it again.
6. **A node reboot that outlasts the reconnect budget ends the Talos subscription.** This is [decision 0013](../../decisions/0013-talos-stream-stall-detection.md). The retry policy must not be changed.
7. **F1 is closed and F2 is accepted.** Do not redo them.
8. **`talosctl` never loads the host's ambient configuration in a fixture session.** Check the binary with `talosctl version --client`, give every server command an explicit fixture `--talosconfig`, and keep `TALOSCONFIG` on an existing empty guard file for the whole session. The [fixture runbook](fixture-runbook.md#step-1-tools) has the commands. This answers question Q4 in the ledger.
9. **A commit that changes only the ledger gets no follow-up commit for its hosted result.** The next working session reads that result and records it inside its own entry. See [Hosted results](#hosted-results).
10. **CI is tiered by [decision 0016](../../decisions/0016-ci-test-tiering.md).** Required CI keeps the deterministic gates and Playwright mock flows. Native WebdriverIO moves to a manual and weekly reusable workflow, which release qualification calls explicitly. Live Talos/Kubernetes fixtures, clean-VM package smoke, and performance measurement remain local or explicit manual runs. Synthetic Kubernetes/session tests stay in required CI. The native and fixture gates are moved, not removed; a change is not complete until its tier has run and the result is recorded.
11. **The agent may override the local firewall/iptables policy for exactly the recorded fixture remediation.** Apply nothing broader and restore the host at the end of the session. The reviewed document 01 Part A harness change is committed; Part B is next.
12. **The remaining questions are answered (Q8 and Q10 to Q13).** Add the toolchain bootstrap script after researching current upstream versions and compatibility. Renew the Trivy exceptions only with re-proven evidence. After Session A2, work documents 05 to 08 and run documents 01/04 as soon as a fixture window is prepared. Use QEMU user-mode Linux VMs for document 08. The owner reviews the UX/tradeoff summary before document 09 is marked done.

## How to run one session

1. Read this file, then the [ledger](ledger.md). The ledger's status board tells you which document is next.
2. Read that packet document completely, then the files it lists under "Read before you start".
3. Read [AGENTS.md](../../../AGENTS.md) and the sections of [quality.md](../../quality.md) for the areas you will change. Read the skill files AGENTS.md names for each domain before changing that domain.
4. Set the document's status to `in progress` in the ledger before your first edit.
5. Write the acceptance cases into your working notes before the first code edit. Each packet document lists them.
6. Implement, test, and run every gate listed for the boundaries you changed.
7. Review your final diff as a separate pass. Look for correctness, missing failure paths, leaked secrets, unbounded buffers or tasks, and documentation that no longer matches.
8. Append a session entry to the ledger and update its status board. Then commit.
9. If you are stopping before the document is done, the ledger entry must say exactly what is finished, what is not, and what the next session should do first.

One session should finish one document, or one numbered part of it. Do not start the next document in the same session unless the current one is fully recorded and committed.

## Rules that apply to every packet

### Architecture

- The design in [docs/design.md](../../design.md) is locked. The stack is Tauri 2, Rust, a bundled Go helper for Talos, Svelte 5, strict TypeScript, Vite, pnpm, Oxc, Skeleton, and Bits UI.
- Rust owns Kubernetes clients, credentials, sessions, and watches. The Go helper has no Kubernetes role.
- Credentials never reach the renderer. The renderer gets typed, bounded projections over application IPC.
- No generic shell execution and no broad filesystem access for the renderer.
- Every buffer, queue, task count, retry, and timeout has a stated bound. Every watch, task, and child process has an owner and a cleanup path.
- No `unwrap`, `expect`, `unsafe`, `any`, unchecked casts, or non-null assertions in production code. No broad lint suppressions.
- Generated files are never edited by hand. Edit the source, regenerate, and commit both.
- Add a dependency only when its packet needs it. Pin it exactly and commit the lockfile.

### Evidence

- A skipped or unrunnable check is reported as unexecuted. It is never a pass.
- Keep three kinds of evidence separate in every record: deterministic tests, native Tauri runs, and real-cluster runs.
- Browser mocks do not prove native behavior. A synthetic API server does not prove cluster behavior.
- Do not write a test that always passes, and do not weaken an assertion to make a run green.
- Never use an owner cluster or an ambient kube context as a fixture. Only the allowlisted disposable fixtures.

### Stop and ask the owner

Stop the current document, write the question into the ledger's "Questions for the owner" section, and continue with any independent document, when:

- a change would alter the stack, the release scope, a security boundary, the platform targets, the retry policy, or [decision 0005](../../decisions/0005-native-kubeconfig-import.md);
- something needs a host change beyond the recorded fixture remediation;
- a resource cannot be obtained;
- a packet document and the plan disagree.

## The development host

The host is openSUSE Tumbleweed on x86_64. `sudo -n` works and `/dev/kvm` exists. Facts that have cost earlier sessions time:

- **The pinned toolchain is not on `PATH`.** The pins are Node 26.11.1, pnpm 12.10.1, Rust 1.99.0, Go 1.27.3, protoc 36.2, and `talosctl` v1.14.2. Provision them into your session's scratch directory and verify each download against its published digest. Do not install anything system-wide and do not change host configuration.
  - Node: the nodejs.org tarball, checked against `SHASUMS256.txt`. Install pnpm into that Node prefix.
  - Rust: `rustup` resolves 1.99.0 from `rust-toolchain.toml`. Put `~/.cargo/bin` first on `PATH`, because the system Cargo is older.
  - Go: download `go1.27.3.linux-amd64.tar.gz` from the Go release list and verify SHA-256 `65efbc80fdc1fa2cd2631cad5b481777a68e8725f34e89f50fc6ac714e379b40` before use. The system `go` is older, and the module cache holds only the superseded 1.27.2 toolchain.
  - protoc: the digest is in `.github/actions/install-protoc/action.yml`.
  - `talosctl`: lives in the ignored directory `src-tauri/.local-tools/`. Verify its SHA-256 against the release's `sha256sum.txt` before use.
- **Git has no identity configured.** Commits on this branch are made as `Tamas Kiss <ifjkt@ifjkt.com>` with per-command options: `git -c user.name="Tamas Kiss" -c user.email="ifjkt@ifjkt.com" commit ...`. Do not edit git config.
- **Pushing works over SSH** since the owner changed the remote on 2026-10-12. Push after each commit. If a push fails, continue locally, do not change remotes or credentials, and record it as a blocker in the ledger.
- **`gh` is installed and signed in** (account `agiledevel`, since 2026-10-12). Read hosted results with `gh pr checks 2`, `gh run list --branch ft-foundation-completion`, and `gh run view <id>`. To read one job's log while its run is still going, use `gh api --allow-escape-sequences repos/agiledevel/talos-pilot/actions/jobs/<job id>/logs`. [Hosted results](#hosted-results) says which results to record and when.
- **`pnpm test:native` opens application windows.** Run it on a private `Xvfb` display with the X11 GDK backend, and point `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, and `XDG_CACHE_HOME` at your scratch directory.
- **`pnpm test:native` replaces the release executable.** Run `pnpm desktop:build` again before `pnpm production:check`.
- **A VPN route covers the fixture network.** The owner accepts the fixture shadowing it. See the [fixture runbook](fixture-runbook.md).
- **The libvirt virtual machine `Win11 Jump` belongs to the owner.** Never start it, inspect it, or use it as a test target.
- **The `docker` command pointed at a podman socket that was not running** on 2026-10-12. Check what container tooling actually works before relying on it.

## CI tiers

[Decision 0016](../../decisions/0016-ci-test-tiering.md) splits checks by trigger. Required pull-request CI runs the deterministic renderer, Rust, Go, contract, inventory, advisory, Playwright mock, and security gates. Native WebdriverIO runs in a manual and weekly reusable workflow and in release qualification; it is not a required pull-request check. Live Talos/Kubernetes fixtures, clean-VM package smoke, and performance measurement run locally or in explicit manual workflows. A change is not complete until its tier has run and the result is recorded; moving a gate out of required CI does not remove it.

## Gates

Run the gates for every boundary your change touches, on the final tree. The exact commands are in [quality.md section 3](../../quality.md#3-required-command-contracts). The common sets:

| Boundary you changed           | Commands                                                                                                                                                                                                                                                                                                           |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Any file                       | `pnpm format:check`, `git diff --check`                                                                                                                                                                                                                                                                            |
| Markdown                       | `pnpm format` before committing; check that every relative link and heading anchor you added resolves                                                                                                                                                                                                              |
| TypeScript or Svelte           | `pnpm check` (format, lint, `svelte-check`, renderer tests, build), `pnpm test:e2e`                                                                                                                                                                                                                                |
| Rust                           | `pnpm format:rust:check`; in `src-tauri/`: `cargo clippy --locked --all-targets -- -D warnings` and the same with `--features native-test`; `cargo test --locked --all-targets` and the same with `--features native-test`; `cargo test --locked --doc`; `RUSTDOCFLAGS="-D warnings" cargo doc --locked --no-deps` |
| Go helper                      | In `helper/`: `gofmt -l .` prints nothing, `go vet ./...`, `go test ./...`, `go test -race ./...`, `go build ./...`                                                                                                                                                                                                |
| IPC, DTOs, or Protobuf         | `pnpm contracts:check`, plus both the producer and the consumer gates                                                                                                                                                                                                                                              |
| Tauri commands or capabilities | `pnpm test:native` through the manual/nightly native workflow or a recorded local run; then `pnpm desktop:build` and `pnpm production:check` (the latter two also run in required CI)                                                                                                                              |
| Dependencies                   | `pnpm install --frozen-lockfile`, `pnpm inventory:check`, `pnpm audit --audit-level=low`, `pnpm audit:go`, `pnpm advisories:check`                                                                                                                                                                                 |

`pnpm format:check` covers Markdown. An earlier handoff failed CI because a ledger table was not formatted.

## Hosted results

Each push updates the pull request's foundation and security runs. Branch pushes do not start foundation or security runs of their own; a branch is checked once it has a pull request. The native workflow runs only on manual dispatch, the weekly schedule, or the release call. Do not wait idle for a run; keep working and read it when it finishes. A pushed commit is not a passed run: a run you did not read to completion is recorded as unexecuted or still in progress.

- **At the start of a session**, read the hosted result for the branch head you start from and record it in your session entry. This is where the result of the previous session's last commit is recorded.
- **A commit that changes anything besides the ledger**: read its result before your session ends, if it finishes in time, and record it in your session entry. If your entry is already committed, one further ledger-only commit may record it.
- **A commit that changes only the ledger gets no follow-up commit.** Never commit only to record the hosted result of a ledger-only commit. The next working session records it under the first rule. The owner decided this on 2026-10-13, after five consecutive commits each recorded the result of the one before.
- A ledger-only push runs `pnpm format:check` in the renderer job and skips the desktop matrix. Run `pnpm format` and `pnpm format:check` before every commit, so that this job cannot fail on the ledger's tables.

## Commits

- Commit each document's work as its own commit or a small series. Use the existing message style: `type(scope): summary`, then a body that says what changed and why.
- End each commit message with `Co-Authored-By:` and the name of the model that did the work.
- Commit only after the ledger entry is written. The ledger entry and the code it describes go in the same commit.
- Do not commit credentials, kubeconfigs, talosconfigs, tokens, or raw cluster output.
