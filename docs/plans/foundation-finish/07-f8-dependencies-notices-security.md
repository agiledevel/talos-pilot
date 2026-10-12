# 07 — F8: dependency, notices, and security evidence

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs no fixture.

Plan packet: [F8](../foundation-completion-flash.md#f8--refresh-dependency-notices-and-security-evidence). Maps to checkpoint C7 and tasks FND-007 and FND-008. Prerequisite: document 06 is `done`, so the dependency set is final.

**Date trigger: both Trivy exceptions expire on 2026-11-30.** If today is close to or past that date, do the "Trivy exceptions" part first, whatever else is in progress.

## Outcome

The dependencies added by documents 02 to 06 have a regenerated inventory, reviewed licenses, and packaged license and notice texts. Every advisory finding is either fixed or has a recorded, re-proven applicability decision. The exact-commit security scans still mean what they say.

## Read before you start

| File                                                                                            | Why                                                              |
| ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| [docs/dependencies.md](../../dependencies.md)                                                   | The dependency record, licensing notes, and what is still open   |
| [docs/ci-release.md](../../ci-release.md)                                                       | CodeQL, Trivy, and the release contract                          |
| [Decision 0006](../../decisions/0006-gtk3-advisory-applicability.md)                            | The GTK3 advisory applicability decision and how it is re-proven |
| [Decision 0002](../../decisions/0002-wdio-transitive-advisory-remediation.md)                   | An earlier advisory remediation, as a worked example             |
| `.trivyignore.yaml`                                                                             | The two exceptions, their statements, and their expiry           |
| `scripts/dependency-inventory.ts`, `scripts/lib/inventory.ts`                                   | The inventory generator                                          |
| `scripts/advisory-baseline.ts`, `scripts/lib/advisories.ts`, `scripts/go-vulnerability-scan.ts` | The advisory gates                                               |
| `docs/verification/dependency-inventory.json`                                                   | The generated inventory; never hand-edited                       |
| `.github/workflows/security.yml`, `.github/workflows/check.yml`                                 | Where the scans run                                              |
| [docs/verification/automation.md](../../verification/automation.md)                             | Recorded hosted runs                                             |

Apply the `talos-pilot-typescript` skill for script changes and `talos-pilot-rust` for Cargo changes.

## Context

### What exists

- `pnpm inventory:generate` writes the inventory from the lockfiles, `cargo metadata`, `pnpm licenses`, and the Go module graph. `pnpm inventory:check` regenerates it and fails on any difference. The last recorded counts were 529 npm, 601 Cargo, and 143 Go entries. Counts are snapshots, not targets.
- `pnpm advisories:check` compares the `cargo-audit` report, each recorded advisory's reverse dependency path, and the linked Linux executable against the accepted record. A new, drifted, vanished, or newly linked finding fails it.
- `pnpm audit:go` runs the pinned `govulncheck` and fails on a finding in the linked call graph.
- `pnpm audit --audit-level=low` covers npm.
- CodeQL and Trivy run on the exact commit in the security workflow.

### The two Trivy exceptions

| ID                    | Path                   | Why it is accepted                                                                                                            |
| --------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `GHSA-wrw7-89jp-8q8g` | `src-tauri/Cargo.lock` | RUSTSEC-2024-0429 in glib 0.18.5, reached only through Tauri's Linux GTK3 stack; the fixed line is incompatible with gtk 0.18 |
| `GO-2026-5932`        | `helper/go.mod`        | Deprecates the `golang.org/x/crypto/openpgp` packages in every version; the helper builds none of them                        |

Each expires on 2026-11-30. An exception is renewed only by repeating its applicability evidence and finding it still true. It is removed when a fix exists. It is never widened and never renewed automatically.

### What is still open

`docs/dependencies.md` records that packaging license and NOTICE texts with the installers is not done. This packet delivers that, with a check that fails when the packaged notices drift from the dependency set.

## Do not

- Do not edit `docs/verification/dependency-inventory.json` or any generated notice by hand.
- Do not add an advisory exclusion without a recorded applicability decision and a check that re-proves it.
- Do not upgrade the Go or Talos pins as a side effect. A pin refresh needs source, compatibility, fixture, and security evidence together.
- Do not change what the CodeQL and Trivy gates scan or when they fail.

## Work

1. **Inventory.** Run `pnpm inventory:generate` and review the difference against the committed file. Every added dependency must be explained by a packet in this series.
2. **Licenses.** Review each new license. Record obligations in `docs/dependencies.md`, including MPL source obligations and any modified third-party file. Include target-specific optional packages.
3. **Notices.** Generate the license and NOTICE texts from the same sources as the inventory, and package them with the binaries and frontend assets. Add a deterministic check that fails when the generated notices differ from what is committed or packaged. Implement it as a real script with real exit codes, and wire it into CI.
4. **Advisories.** Run the npm, Go, and Cargo scans. For each finding: fix it with a compatible update, or record an applicability decision with the dependency path and call-graph evidence, and make a gate re-prove it. An unexplained finding blocks this document.
5. **Trivy exceptions.** For each of the two, repeat the recorded evidence:
   - confirm the dependency path is unchanged;
   - confirm the linked artifact still does not contain the affected code;
   - check whether a fix has become available upstream.

   Then renew the expiry with the new evidence date, or remove the exception. Record which, and why, in the ledger and in the decision record.

6. **Hosted scans.** Push and read the CodeQL and Trivy results for the exact commit. If they cannot be read (blocker B2), record them as unexecuted.

## Acceptance cases

1. A frozen install and locked builds succeed from a clean checkout of the final tree.
2. `pnpm inventory:check` passes, and every dependency added in this series is explained.
3. `pnpm audit --audit-level=low`, `pnpm audit:go`, `cargo audit`, and `pnpm advisories:check` pass, or each finding has a recorded decision that a gate re-proves.
4. The notice check fails when a dependency is added without regenerating notices, and passes after regeneration.
5. The packaged notices are present in the built artifact.
6. Each Trivy exception is renewed with fresh evidence or removed, before 2026-11-30.
7. The exact-commit CodeQL and Trivy results are recorded, or recorded as unexecuted with the reason.

## Gates

Dependency gates from the README, the new notice check, workflow validation for any changed workflow, and the TypeScript gates for changed scripts.

## Done means

- Every acceptance case has recorded evidence.
- `docs/dependencies.md` no longer lists notice packaging as open.
- The plan's exit holds: current dependencies and redistributed obligations have reproducible evidence.
- Final-artifact scans per platform remain a row for document 08 on Linux and document 10 elsewhere.
