# 0014: Scope pull-request checks and cache compiled Rust dependencies

Date: 2026-10-13. Status: accepted by owner decision; the hosted timings are
recorded in the [automation record](../verification/automation.md) once the
first cached runs complete.

**Amended on 2026-10-22 by [decision 0018](0018-ci-feedback-and-cache-budgets.md).** The original timings and owner choices below are historical. The current implementation uses per-domain executed evidence, a merge-base safeguard, renderer/CodeQL documentation reuse, v2 fallback dependency caches with bounded maintenance, and parallel release asset compilation. The desktop platform matrix and native qualification tiers are unchanged.

## Context

`Foundation checks` run 38309339162 (commit `1a4bbd0`, every job passing) took
57 minutes, and the pull-request run for the same commit took 83. Step timings
from that run:

| Job                      | Duration | Of which Rust compilation |
| ------------------------ | -------- | ------------------------- |
| renderer                 | 2 min    | none                      |
| desktop (ubuntu-22.04)   | 20 min   | about 17 min              |
| desktop (windows-2022)   | 27 min   | about 24 min              |
| desktop (macos-15)       | 20 min   | about 15 min              |
| desktop (macos-15-intel) | 57 min   | about 46 min              |

Five causes accounted for the time:

- No compiled Rust output was cached. Each desktop job compiled the dependency
  tree about eight times: Clippy and tests for both feature sets, two release
  builds, the release example, and the contract generator. The native suite
  itself ran for six seconds.
- The workflow ran on both `push` and `pull_request`, so every commit on a
  pull-request branch started ten jobs. Four of them were macOS jobs, which
  queue behind the hosted macOS concurrency limit; `desktop (macos-15)` waited
  21 minutes for a runner in that run.
- Nothing cancelled a superseded run. Nine stale runs were cancelled by hand on
  2026-10-12.
- Six of the twelve commits before this change touched only Markdown, and each
  still ran the whole matrix twice.
- `cargo install cargo-audit` compiled the scanner from source on both macOS
  runners, 170 to 373 seconds each, to scan a lockfile that is identical on
  every runner.

## Decision

The owner chose each of the following on 2026-10-13.

**Triggers and cancellation.** `Foundation checks` runs on pushes to `main`,
pull requests, manual dispatch, and as the release workflow's QA gate. A newer
push to a pull request cancels that pull request's running checks and scans.
Runs for any other event are grouped by commit and are never cancelled.

**Intel macOS runs on `main` and in the release gate, not on pull requests.**
Pull requests run `ubuntu-22.04`, `macos-15`, and `windows-2022`. Pushes to
`main`, the release workflow, and manual dispatch run those three and
`macos-15-intel`.

**A documentation-only pull-request push skips the desktop matrix.** The
`scope` job finds the newest ancestor of the pull-request head whose desktop
jobs all passed, and lists the paths that differ from it. The matrix is skipped
only when every path is Markdown under `docs/`, Markdown in the repository
root, or under `.agents/`. The renderer job always runs. The rules are in
[`scripts/lib/ci-scope.ts`](../../scripts/lib/ci-scope.ts).

- The comparison base is the last commit with passing desktop jobs, not the
  previous push. A code commit whose run failed or was cancelled therefore
  stays in the comparison, and a later documentation push still runs the matrix.
- When no such ancestor is found among the 50 newest successful runs, or the
  GitHub API or Git history cannot be read, the matrix runs and the run carries
  a warning annotation.
- Pushes to `main`, release qualification, and manual runs never skip.

**Compiled dependencies are cached with `actions/cache` v6.1.0**, pinned by
commit `55cc8345863c7cc4c66a329aec7e433d2d1c52a9`. The key is the runner label
plus the hash of `rust-toolchain.toml` and `src-tauri/Cargo.lock`. There are no
fallback keys, so an entry is one complete dependency build for one lockfile
and never accumulates stale output. A job saves an entry only when it missed
the cache and completed its last build, the release example that
`pnpm test:native` compiles. `cargo clean --package talos-pilot` removes the
first-party artifacts first. A test that fails after the last build therefore
does not prevent the save. CI sets `CARGO_INCREMENTAL=0` and
`line-tables-only` debug information for the `dev` and `test` profiles; the
commands are the ones in [quality.md](../quality.md#3-required-command-contracts).

**`cargo audit` runs on the Linux desktop job only**, next to
`pnpm advisories:check`, which was already Linux-only.

**`Foundation checks result` is the check to require.** It fails unless the
scope and renderer jobs passed and the desktop matrix either passed or was
skipped by the scope decision.

## Alternatives

- **Keep Intel macOS on every pull request.** No coverage change, and caching
  alone should bring it to an estimated 15 to 20 minutes. Not chosen: it stays
  the slowest job on every push and occupies a macOS runner slot.
- **`Swatinem/rust-cache`.** Less workflow code and automatic pruning. Not
  chosen: it adds a third-party action, and the exact-key design above needs no
  pruning.
- **`paths-ignore` on the workflow.** Not chosen: a required check that never
  starts stays pending, and it compares only the pushed commits, so a
  documentation push would hide a cancelled code run.
- **Compare a pull request against its base branch.** Safe, but a long-lived
  pull request that already contains code would never skip.

## Consequences

- An Intel-only regression is found on `main` after merge, or in the release
  gate, instead of on the pull request. Manual dispatch on a branch runs all
  four runners when Intel evidence is wanted before merge.
- A pull-request run checks the merge of the head into its base. The scope
  comparison is between head commits, so a base-branch change since the last
  passing run is not a reason to rerun the matrix. That change was checked by
  its own push to `main`.
- A pull request that does not change `Cargo.lock` or the toolchain restores
  the entry saved on `main`. One that does change them compiles from scratch
  once and saves an entry visible only to that pull request.
- The release workflow's `assets` jobs do not restore this cache, so published
  packages are always compiled from source. Release QA may restore an entry,
  and only entries saved by runs on `main` or the tag are visible to it.
- A runner-image change to a system library does not change the key. Bump the
  `cargo-v1` prefix in [check.yml](../../.github/workflows/check.yml) to
  discard every entry.
- The release workflow's `qa` job grants `actions: read` so the called
  workflow's scope job can list runs.

## Verification

- `scripts/lib/ci-scope.test.ts` covers path classification, the skip decision,
  and rejection of malformed API payloads.
- `node scripts/ci-desktop-scope.ts` was run on 2026-10-13 against this
  repository's API for commits `21d69cc` and `06135e7`. Both selected `b49ca11`
  (run 38311912771) as the comparison base and reported 26 non-documentation
  paths. An invalid token produced the warning and ran the matrix.
- actionlint 1.7.12 accepts the three workflows. The local run had no
  shellcheck, so the embedded-script checks ran only in CI.
- Cache hits, the skipped matrix, and the resulting durations require hosted
  runs and are recorded in the automation record.
