# GitHub quality gate and preview releases

## Foundation checks: triggers, scope, and caching

The `Foundation checks` workflow ([check.yml](../.github/workflows/check.yml)) runs on pushes to `main`, on pull requests, on manual dispatch, and as the release workflow's QA gate. It does not run on pushes to other branches, so a branch is checked once it has a pull request. [Decision 0014](decisions/0014-ci-scope-and-caching.md) records the original policy; [decision 0018](decisions/0018-ci-feedback-and-cache-budgets.md) amends scope, provisioning, caches and feedback. Workers follow [FLASH pace](flash-pace.md), not a wait/push/ledger loop.

| Event                                | Desktop runners                                              | Can skip the desktop matrix |
| ------------------------------------ | ------------------------------------------------------------ | --------------------------- |
| Pull request                         | `ubuntu-22.04`, `macos-15`, `windows-2022`                   | Yes, for documentation only |
| Push to `main`, release QA, dispatch | `ubuntu-22.04`, `macos-15`, `macos-15-intel`, `windows-2022` | No                          |

A newer push to a pull request cancels that pull request's running `Foundation checks` and `Security scans`. Runs for every other event are grouped by commit and are not cancelled.

The `Decide desktop scope` job runs `node scripts/ci-desktop-scope.ts` for desktop and renderer evidence independently. On a pull request it finds the newest compatible ancestor with actually executed passing checks. The verified head must contain the current PR base; a changed base not contained in that head forces fresh checks. The desktop matrix skips only when every changed path is Markdown under `docs/`, root Markdown, or under `.agents/`. All three PR desktop runners must be present and successful in the evidence. Documentation-only renderer checks run formatting and a fresh npm audit rather than the whole unit/browser suite. The summary identifies reused inputs and the comparison commit; reuse is not fresh execution. No compatible evidence, unreadable history/API, or malformed data runs fresh checks. Invalid scope outputs fail the final gate. Main, manual and release calls never skip. To force all four runners, use **Actions → Foundation checks → Run workflow**.

Full renderer runs use `pnpm check:ci`: the same checks as `pnpm check`, with its one Vitest run collecting coverage. CI does not immediately run the same suite again without coverage. Playwright remains required for changed application inputs. Chromium headless-shell binaries are cached by platform/Playwright version, but the pinned installer still validates their presence. A matching prebuilt Playwright image was unavailable; no older image or browser was substituted.

Each desktop job restores compiled Rust dependencies with `actions/cache` **v6.1.0**, pinned to commit `55cc8345863c7cc4c66a329aec7e433d2d1c52a9`. Keys are `cargo-v2-<runner>-<toolchain/config hash>-<lockfile hash>`, with fallback only within that runner/toolchain/configuration family. Cargo validates fingerprints and recompiles changed dependencies after a lockfile update. For migration only, an exact old v1 toolchain/lockfile entry may seed v2 when no Cargo configuration file exists; it cannot seed a different lockfile or configuration. A cache miss (including a fallback hit) saves a new exact entry only after the job produced its release executable; it first removes first-party debug/release outputs and generated rustdoc. Exact hits save nothing. Bump `cargo-v2`/`native-v2` together when compiler flags, cache layout or system-library compatibility changes. The `Native tests` workflow owns a separate `native-v2` family and may seed from a compatible `cargo-v2` entry; its save drops inherited debug outputs because the native suite builds release targets only. Release `assets` jobs still build without these caches.

The daily/manual [cache maintenance workflow](../.github/workflows/cache-maintenance.yml) runs reviewed default-branch code only, with `actions:write` confined to that job. It retains two recently accessed entries per Cargo/native family/runner/ref, drops v1 only after a corresponding v2 exists, and may retire the named A2 probe refs. Active workflow refs and unknown namespaces are preserved. It aborts on unreadable/malformed API data or more than 50 deletions. Manual dispatch defaults to dry-run; the schedule applies the plan. Before merge, its entry points are unavailable on GitHub; its script can be reviewed/run locally with `GITHUB_REPOSITORY=agiledevel/talos-pilot node scripts/ci-cache-maintenance.ts` (add `--apply` only after reviewing the plan, and `--retire-probes` to include the retired A2 refs).

The shared [`setup-js`](../.github/actions/setup-js/action.yml) action caches only the pinned pnpm CLI and verifies its version; application dependencies are still installed with the frozen lockfile. The shared [`linux-prerequisites`](../.github/actions/linux-prerequisites/action.yml) action installs only required packages using isolated, authenticated Ubuntu sources. Each mirror gets bounded metadata/download phases and one transport retry, with the main Ubuntu archive first and the official Azure Ubuntu mirror as fallback. Dpkg configures downloaded packages offline; failures remain failures. This script rejects development/self-hosted runners and never rewrites the host's apt configuration. Tauri's existing production hook owns the helper/frontend build; the earlier duplicate desktop frontend build is removed.

`cargo audit` and `pnpm advisories:check` run in the Linux desktop job only: both read `src-tauri/Cargo.lock`, which is the same file on every runner.

## Test tiers

[Decision 0016](decisions/0016-ci-test-tiering.md) splits checks by trigger. The required `Foundation checks` workflow runs the deterministic renderer, Rust, Go, contract, inventory, advisory, Playwright mock, and security gates. It does not run `pnpm test:native` or a live Talos/Kubernetes fixture.

The `Native tests` workflow ([native.yml](../.github/workflows/native.yml)) runs `pnpm test:native` on `ubuntu-22.04`, `macos-15`, `macos-15-intel`, and `windows-2022` on manual dispatch with an optional revision input, a weekly schedule (Mondays 03:23 UTC), and the release QA call for the exact revision. It keeps read-only repository permissions, uploads a bounded per-runner log artifact, and is not a required pull-request check. A change touching a native boundary records a passing run for its final revision, or a recorded local equivalent, before merge; it is a merge and release gate, not a branch-protection check. Release qualification calls it explicitly, and the release draft job depends on it; asset compilation overlaps qualification without permission to publish. GitHub only registers and dispatches a workflow that exists on the default branch, so the dispatch and schedule entry points become usable once this workflow reaches `main`; until then, a session can prove the job body from a scratch branch with a temporary trigger, as the 2026-10-22 Session A2 probe did.

Live Talos and Kubernetes fixtures, clean-VM package smoke, and performance measurement run locally or in explicit manual workflows. The existing fixture harnesses and allowlists remain the authority. No required CI job provisions a live cluster.

## Security scans: CodeQL and Trivy

The `Security scans` workflow ([security.yml](../.github/workflows/security.yml)) runs on pushes to `main`, pull requests targeting `main`, a weekly schedule, manual dispatch, and as a reusable workflow for an exact release revision. It replaced the SonarCloud gate on 2026-10-08. SonarCloud never produced an analysis for this repository: the app-check gate in run 37811900492 and the CI-scanner gate in run 37815070833 both failed, and the owner directed its removal.

**CodeQL** analyzes `actions`, `javascript-typescript`, and `rust` with `build-mode: none`, using `github/codeql-action` **v4.38.1**, pinned by commit. The security scope job compares each language to its own actually executed zero-findings ancestor evidence. Only PRs can reuse unchanged inputs; docs affect no language, known JS/Svelte sources affect JS, known Rust source affects Rust, and shared fixtures/build/configuration/dependency/unknown paths force every language. The stable language job reports reuse without uploading SARIF; a reused result cannot become an executed evidence base. Trivy still scans every tree. Missing evidence runs fresh scans, and main/manual/scheduled/release runs always scan every language. The Rust job installs the pinned toolchain and the GTK/WebKit headers so that build scripts and proc macros resolve. Each language job fails unless its SARIF output contains zero results. On push, pull request, and schedule runs, results are also uploaded to GitHub code scanning. Release runs do not upload: a manually dispatched release can analyze a tag revision that differs from the triggering ref, so those runs gate only on the local SARIF.

**Trivy** **v0.74.0** scans the checked-out tree for dependency vulnerabilities (`pnpm-lock.yaml`, `src-tauri/Cargo.lock`, `helper/go.mod`), committed secrets, and misconfigurations, and fails on any finding at any severity. CI downloads the release archive and verifies its SHA-256 before running it, the same pattern as actionlint. `aquasecurity/trivy-action` is deliberately not used, because its tags were republished in March 2026. A single SARIF scan supplies both the upload (outside release runs, under the `trivy` category) and the zero-results gate. Scanner errors, malformed reports, and any unexcepted finding still fail.

[`.trivyignore.yaml`](../.trivyignore.yaml) holds the two accepted exceptions. GHSA-wrw7-89jp-8q8g (RUSTSEC-2024-0429, glib 0.18.5 from Tauri's GTK3 stack) is scoped to `src-tauri/Cargo.lock`, was re-proved and renewed on 2026-10-26, and expires on **2027-02-28**. After that date Trivy reports the finding again and the gate fails. The applicability decision and its evidence are recorded in [decision 0006](decisions/0006-gtk3-advisory-applicability.md) with the renewal review; `pnpm advisories:check` re-proves them in the Linux desktop job and fails if the scanner report, the dependency path, or the linked executable no longer matches the record. It also enforces the recorded absence of inactive advisory crates from the resolved graph ([decision 0017](decisions/0017-keyring-zbus-advisory-applicability.md)). `cargo audit` still reports the recorded advisories unignored.

GO-2026-5932 is scoped to `helper/go.mod`, was re-proved and renewed on 2026-10-26, and expires on **2027-02-28**. It marks the `golang.org/x/crypto/openpgp` packages as unmaintained in every `x/crypto` version with no fixed release, so no upgrade removes it; Trivy matches the module, not the packages a build uses. The helper builds none of those packages on any declared target: `go list -deps` shows only `x/crypto`'s argon2, blake2b, cast5, cryptobyte, hkdf and sha3 packages for linux/amd64, darwin/amd64, darwin/arm64 and windows/amd64, Talos request signing reaches `github.com/ProtonMail/go-crypto`, the maintained fork the advisory recommends, and `x/crypto` is required only for other packages. `pnpm audit:go` keeps that claim enforced, because `govulncheck` fails once an `openpgp` symbol is reachable from helper code. The evidence is in the [automation record](verification/automation.md#amendment-f8-trivy-exception-renewal) and the [F8 record](verification/f8-notices-security.md).

Any new exception needs one finding ID, a path, a statement, and an expiry date.

Repository setup:

1. Leave GitHub's code scanning **default setup** disabled. Code scanning rejects uploads from an advanced workflow while default setup is enabled.
2. Protect `main` with required checks for the three **CodeQL** jobs, **Trivy filesystem scan**, and **Foundation checks result**. That job fails unless the scope and renderer jobs passed and the desktop matrix either passed or was skipped by the scope decision. Do not require the individual **desktop** jobs: a pull request has no `macos-15-intel` job, and a skipped matrix reports no per-runner check, so those requirements would never be met. The workflow files create these checks; they do not change branch-protection settings. The `Native tests` workflow is deliberately not a required branch-protection check; a change touching a native boundary records its run for the final revision before merge, as [decision 0016](decisions/0016-ci-test-tiering.md) requires.

### Persistent main-branch merge policy

On 2026-10-25 the owner authorized correcting the active
[Main ruleset](https://github.com/agiledevel/talos-pilot/rules/24978792).
`Restrict updates` (`update`) blocked ordinary PR merges even with green checks.
It was removed, **not** bypassed for one merge. The saved ruleset now requires:

- A pull request, with zero external approvals for this solo project and review
  threads resolved; merge, squash and rebase methods remain allowed.
- The five stable checks listed above, bound to the GitHub Actions integration
  (app ID 15368), with the branch up to date before merging. Missing, pending or
  failed required checks still block merging; individual desktop/native matrix
  checks are deliberately not required.
- The existing deletion, non-fast-forward and branch-creation restrictions.
  The existing admin bypass is unchanged; routine PR merges need no bypass.

The corrected policy applies persistently to the default branch, including after
PR #3 is merged. Do not restore `Restrict updates` as a substitute for requiring
PRs: it restricts the merge update itself. Do not add another-person approval as
an accidental self-merge blocker. These settings live in GitHub, not the workflow
YAML. Recheck them after any ruleset administration:

```sh
gh api repos/agiledevel/talos-pilot/rules/branches/main
gh pr checks <number> --required
gh pr view <number> --json mergeable,mergeStateStatus,reviewDecision
```

The immediate read-back after applying the policy reported PR #3 `MERGEABLE` /
`CLEAN`, with all five required checks passing at `07dccb8`. This is a policy
verification of that head, not qualification of later code. The owner still
performs the merge; no merge was executed as part of the policy correction.

The desktop and release jobs need `protoc` because `prost-build` compiles the helper schema in `src-tauri/build.rs`, and hosted runners do not ship it. The local [`install-protoc`](../.github/actions/install-protoc/action.yml) action downloads the pinned 36.2 archive for the runner's platform, verifies its SHA-256, and adds it to `PATH`; a runner platform with no recorded digest fails the step. [`.gitattributes`](../.gitattributes) checks text out with LF on every platform, because rustfmt (`newline_style = "Unix"`) and the byte-for-byte generated-output comparisons reject the CRLF checkout that Git for Windows otherwise produces.

The desktop job's limit is 75 minutes, sized for a run with no cached dependencies. The `macos-15-intel` runner is roughly three times slower than `macos-15` on the Rust steps: at `88983a8` one uncached passing run took 38 minutes, at `1a4bbd0` one took 57, and an earlier one was cancelled by the previous 45-minute limit after every executed step had passed, with about five minutes of work left.

No repository secret is required. Fork pull requests get a read-only token; their scans still run and gate, but their code-scanning upload can be refused.

For a local Trivy check matching CI, install Trivy 0.74.0 and run this from a clean checkout. In a working tree, skip local build directories such as `node_modules` and `src-tauri/target` with `--skip-dirs`.

```sh
trivy fs --scanners vuln,secret,misconfig --ignorefile .trivyignore.yaml --exit-code 1 .
```

## Preview release contract

The release workflow supports `push` of `v*` tags and manual selection of an existing tag. Tags must be `vMAJOR.MINOR.PATCH`, optionally with `-alpha.N`, `-beta.N`, or `-rc.N`. It validates the tag's resolved commit, requires main-branch ancestry, and checks the npm, Tauri, and Cargo versions against the tag. QA and security scans operate on that exact source revision, not a newer main build. Asset compilation starts in parallel with qualification after source validation. It may produce retained build artifacts if qualification fails, but only the draft job can publish and it still requires every QA/security/native/asset job to succeed. QA calls the deterministic foundation checks and the `Native tests` workflow for the exact revision; clean-target package, vault, and platform rows remain local or explicit qualification evidence.

Version changes are reviewed source changes. Update `package.json`, `src-tauri/tauri.conf.json`, and the package version in `src-tauri/Cargo.toml`, then run Cargo to regenerate the application's entry in `Cargo.lock`. Dependency pins do not change with an application version bump. Rebuild, check, commit, and merge the version change before tagging.

For the currently initialized version, once this workflow change is committed and merged and the required checks are green:

```sh
git switch main
git pull --ff-only
git tag v0.1.0
git push origin v0.1.0
```

Alternatively, use **Actions → Release preview → Run workflow**, choose the default branch containing the workflow, and supply the existing tag. The pipeline does not create a release tag from unreviewed or mismatched source. `RELEASE_TAG=v0.1.0 pnpm release:check` runs the source validation locally after the tag exists; CI uses the same script.

Build matrix:

| Runner                 | Target                   | Required assets            |
| ---------------------- | ------------------------ | -------------------------- |
| Ubuntu 22.04           | x86_64-unknown-linux-gnu | DEB, RPM, AppImage         |
| macOS 15 Apple Silicon | aarch64-apple-darwin     | DMG, with app bundle built |
| macOS 15 Intel         | x86_64-apple-darwin      | DMG, with app bundle built |
| Windows Server 2022    | x86_64-pc-windows-msvc   | NSIS installer             |

These are build runners; Windows Server compilation does not qualify Windows 11 runtime behavior, and macOS 15 does not prove the macOS 13.3 minimum ([0010](decisions/0010-macos-minimum-webview.md)). A separate release-only [Tauri configuration](../.github/tauri.release.conf.json) enables bundling. macOS previews are ad-hoc signed and not notarized; Windows previews are not publisher-signed. Production signing credentials and updater artifacts are not simulated.

The desktop QA and release asset jobs install Go **1.27.3** from `helper/go.mod`
with `actions/setup-go` **v6.5.0**, pinned to commit
`924ae3a1cded613372ab5595356fb5720e22ba16`. The Tauri build hook cross-compiles
the Go helper for the selected Rust target triple with cgo disabled, embeds the
exact source revision as its build identity, and places it in the app's bundled
resource directory. Go format, vet, tests, race tests, module verification,
and build run in the desktop QA matrix before native compilation. Local
`pnpm desktop:dev` and `pnpm desktop:build` use the same helper build hook.

The `Native tests` workflow runs `pnpm test:native` on each declared runner. It
builds a separate `native-test` feature/configuration and uses the embedded
WebDriver service. Linux runs under Xvfb when the runner has no display. The
native flow invokes the real helper status command from the main window,
checks denial from a second window without that capability, and verifies the
helper process count returns to baseline after the application exits. The
default production build does not enable the feature or include its injected
frontend plugin.

Immediately after the default `pnpm desktop:build`, CI runs
`pnpm production:check`. It checks the compiled Cargo graph, Tauri config and
capabilities, production renderer assets, and native executable for test-only
WDIO surfaces, then launches the default app with `TAURI_WEBDRIVER_PORT` set to
a free loopback port and verifies that no WebDriver listener appears. It closes
the app and waits for its process exit. On Linux it uses Xvfb when no display is
available.

Each matrix job must produce exactly one installer of each declared package type in its expected Tauri output directory. Nested application executables cannot satisfy the installer requirement. Artifact names include the target triple to prevent cross-platform collisions. The packaging steps live in the reusable [`build-assets.yml`](../.github/workflows/build-assets.yml) workflow, which only `release.yml` and the tag-free qualification wrapper call; there is no second copy of the recipe. Each job then collects its installers into `release-assets/` with `pnpm release:assets`, which writes a target `SHA256SUMS.txt` and a `provenance.json` sidecar naming the mode, resolved commit and package version, workflow run, release-configuration digests, and the packaged application and helper digests. The collector clears its output directory before writing, so a stale file from an earlier run cannot be uploaded, and it rejects a version that differs from the checkout. The final job downloads all four artifact sets, verifies their SHA-256 hashes, generates notes with git-cliff, prepends the [preview scope statement](release-preview.md), and creates a draft prerelease with packages, changelog, and hashes. Only this final job receives `contents:write`; build jobs have read-only repository access. A failed QA/gate/build prevents the draft job from running.

`pnpm release:assets` validates the same source identity the build embedded: `RELEASE_REVISION` must be a full commit SHA, `RELEASE_VERSION` must match `package.json`, and release mode additionally requires a tag naming that version. Qualification mode rejects a tag instead of inventing one. The Go helper and the Rust binary read `TALOS_PILOT_BUILD_ID`, which the shared workflow sets to the resolved commit rather than the controller's `GITHUB_SHA`.

Downloaded artifacts are checked again with `pnpm release:verify --directory <dir> --mode <release|qualification> --revision <sha> --version <version> --targets <list>`. It independently enforces the target's declared formats, so it fails on a missing, duplicated or foreign-format installer from the provenance even when the checksums agree; it also fails on a missing target, checksum or installer, a duplicated or unexpected file, a size or digest mismatch, and a provenance revision/version/target/build identity that does not match the requested source. Matching hashes and build identities prove which source produced the bytes; they do not prove who built them.

The shared build invokes the pinned Tauri Node CLI directly under `bash` on every runner, preserving the `-- --locked` Cargo argument separator without pnpm/PowerShell re-parsing. Hosted Linux release prerequisites include `libarchive-tools`; [`scripts/extract-rpm.sh`](../scripts/extract-rpm.sh) extracts the built RPM with a bounded `bsdtar` call, without restoring archive owners or installing anything. Ubuntu 22.04's `rpm2cpio` 4.17 silently fails on Tauri RPMs missing the optional `LONGARCHIVESIZE` tag, even after copying the complete payload. Libarchive handles that format; extraction errors and timeouts still fail the job. `scripts/package-workflow.test.ts` exercises actual build-command argument forwarding and the extractor's failure propagation.

The maintainer DTO generator `export_ipc_types` is a Cargo example, not a `src/bin` target, so Tauri's bundler cannot install it in a package. `pnpm payload:check` additionally enforces a per-format program allowlist on the extracted DEB, RPM and AppImage payloads and on the macOS app bundle, and rejects the exporter and other maintainer/test tools anywhere in a payload or in a target's ordinary release output. Required platform programs such as `AppRun`, its `AppRun.wrapped` executable and the WebKit helper processes are declared explicitly; this is not a two-executable limit. The GTK launcher generated by linuxdeploy sources its hook and executes `AppRun.wrapped`, so both top-level launchers are required.

For AppImage data copied with execute bits, a path or text-like header alone never grants an exception. `scripts/lib/appimage-system-data.ts` recognizes only distro `usr/share/doc/<package>/copyright` and GLib XML/DTD/override paths, requires byte-for-byte equality with the corresponding **regular non-executable build-OS original**, rejects binary/shebang/non-UTF-8 contents and escaping symlinks, and logs each proven copy's SHA-256. Inspection is bounded to 256 data files, 1 MiB/file and 32 MiB total; originals or payloads that change size while reading fail. Other executable paths, changed data and missing originals still fail, as do maintainer/test tools. No installer bytes or permissions are rewritten. The Ubuntu runner image already gives some copyright/schema originals mode 0777 **before** Tauri runs, so neither live-tree comparison nor a pre-bundle copy can establish their intended modes. Instead, `scripts/prepare-appimage-reference.ts` resolves each actual executable-mode data candidate's canonical OS path, unique dpkg owner and installed package/version/architecture. The shared isolated Ubuntu APT helper authenticates/downloads the available **data candidate of the same package name and architecture** using signed metadata/package hashes and the existing bounded official-mirror retry policy. Installed patch versions can be retired from mirrors; the copyright/schema bytes may still be identical. Both installed and archive versions plus the archive SHA-256 are logged. This attests **only identical data**, not the installed binary version, advisory status or full OS image. No package is installed and no build library is upgraded/substituted. Package families, architectures and counts are rechecked; `scripts/extract-deb-data.sh` extracts only the declared data member into a new private directory, preserving **archive permissions**, not ownership/ACLs/xattrs. The original must still be regular non-executable UTF-8/nonbinary data. Only then is an independent read-only reference written, checked against the actual payload and supplied through `--appimage-system-root`. Runner OS and installer modes/bytes are never rewritten. A missing/ambiguous owner, unavailable candidate, failed authentication/extraction, changed bytes, wrong package/architecture or executable archive original fails, with no fallback to the live tree. The disproved pre-bundle capture implementation is removed.

Reference discovery is limited to 10,000 payload entries and 256 candidates; data retains the 1 MiB/file and 32 MiB total limits. Downloads are capped at 64 MiB per archive, with at most 256 requested packages; before inspection the set must also fit 512 MiB total. Metadata/download phases retain 90/180-second timeouts and one official-mirror retry, while extraction is bounded to 60 seconds and 1 MiB output. Owned temporary archives/extractions and partial reference output are removed on failure; existing destinations are never overwritten/deleted. For offline inspection elsewhere, `--appimage-system-root <trusted-build-OS-data-root>` supplies an exact trusted copy of that OS's data; a different OS or an arbitrary untrusted directory must not be substituted. Root trust is the operator's responsibility; this comparison does not authenticate an OS image or publisher. The override is accepted only with `--platform linux-appimage`. Regression coverage includes CLI verification, disguised scripts, binary content, missing/changed/executable sources, symlink escapes, FIFO rejection and bounds in `scripts/lib/{payload,appimage-system-data}.test.ts`.

On Linux payload-check failure only, the shared workflow may retain exactly one failed AppImage of at most **256 MiB**, logging its SHA-256 and uploading it under `diagnostic-appimage-<revision>` for **one day**. Missing, duplicate and oversized diagnostic inputs fail instead of being uploaded. This artifact has no qualified provenance, is never named `release-*`, and cannot enter the release collector/draft. The original job stays failed; diagnostic retention is not permission to accept or distribute its bytes. `scripts/package-workflow.test.ts` exercises the actual diagnostic shell bounds as well as reference-before-validation ordering; `scripts/lib/appimage-package-reference.test.ts` covers the injected package-manager/extractor boundary separately from actual hosted authentication.

Linux packaging prefetches the latest versioned [AppImage runtime, 20251108](https://github.com/AppImage/type2-runtime/releases/tag/20251108), and verifies its published SHA-256 before setting `LDAI_RUNTIME_FILE`. The newer `continuous` download is mutable, so it is unsuitable for the foundation's exact pins. Supplying the runtime through the upstream [linuxdeploy plugin's supported option](https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/blob/master/src/main.cpp) also avoids an observed deadlock in appimagetool's internal OpenSSL runtime downloader. The Tauri-managed linuxdeploy tool and plugins remain upstream downloads; this runtime pin alone does not establish byte-reproducible installers.

The workflow creates a draft for review and never publishes a stable v1 release. Production publication remains subject to the complete feature, native, real-cluster, dependency, and signing gates in [quality.md](quality.md). SHA-256 checks establish byte integrity, not publisher authentication.

`pnpm release:check-linux` checks the generated AppDir for executable WebKit network/web helper processes before Linux assets can be uploaded. A local openSUSE-built AppImage compiled and bundled but failed this check and runtime smoke because its WebKit helper layout was not collected by the upstream bundler. Ubuntu-built artifacts and clean-target runtime qualification remain unexecuted; building an installer is not proof that it runs. See [automation verification](verification/automation.md).

## Tag-free package qualification

The [`Package qualification`](../.github/workflows/qualification.yml) workflow produces the same installers for one immutable commit without creating a tag or a release. It is manual-dispatch only, and GitHub only dispatches a workflow that exists on the default branch; a 404 is a publication blocker, not evidence.

The dispatch input is a full 40-character commit SHA. The workflow rejects any other shape before the value reaches a checkout or a Git argument, fetches the repository's full history and branch refs, checks that commit out by SHA, and then `scripts/release-metadata.ts` in qualification mode requires: the checked-out `HEAD` is exactly that commit; the commit is reachable from a branch of this repository; `package.json`, `src-tauri/tauri.conf.json` and the resolved Cargo package version agree; and no tag is supplied. Release mode keeps every existing guard (real tag, tag-commit checkout, `main` ancestry, tag/version equality), so qualification cannot weaken the publishing path.

Qualification runs the same four-target matrix and uploads the same `release-<target>` artifact shapes with fourteen-day retention, but has read-only permissions and no draft or publication job. It cannot publish even if every job passes. Its evidence class is a hosted build of that commit plus the downloaded bytes; it is not an installed-package, vault, clean-guest or rendering result. `F9-01` uses the downloaded Linux artifact, its checksums and its provenance; the installed runtime rows stay with the clean-guest checkpoints.

The Windows NSIS payload cannot be extracted in this build step, so the shared workflow checks that target's ordinary release output contains only the application program and no maintainer/test tool. The actual NSIS payload belongs to the final-artifact checkpoint, and an unexecuted row stays unexecuted rather than being inferred from the build.

## Changelog and workflow tools

Angular commits (`feat`, `fix`, `perf`, `docs`, `ci`, `build`, `test`, `refactor`, and maintenance entries) drive [cliff.toml](../cliff.toml). Breaking changes are retained. Nonconventional historical commits are not silently discarded. `CHANGELOG.md` is generated documentation; its source is Git history and this configuration.

With git-cliff **2.14.2** installed:

```sh
git-cliff --config cliff.toml --output CHANGELOG.md
```

Release notes use the same configuration for the requested tag range. The action is pinned to git-cliff-action **4.9.1** by commit and explicitly selects binary version **2.14.2**. The existing checkout/setup-node pins remain current; upload-artifact **7.0.2** and download-artifact **8.0.2** were researched from their release APIs and pinned by commit. Workflow syntax is checked locally and in CI with actionlint **1.7.12**; CI verifies the pinned Linux archive's SHA-256 before executing it.

Sources: [CodeQL action](https://github.com/github/codeql-action/releases/tag/v4.38.1), [Trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [git-cliff releases](https://github.com/orhun/git-cliff/releases/tag/v2.14.2), [git-cliff action](https://github.com/orhun/git-cliff-action/releases/tag/v4.9.1), [actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12), [upload action](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [download action](https://github.com/actions/download-artifact/releases/tag/v8.0.2), [Tauri distribution](https://v2.tauri.app/distribute/pipelines/github/), and [CodeQL advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning).

## Failure recovery

A failed security scan is a finding to fix, not permission to bypass the gate. The CodeQL job log lists each result's rule, file, and line; Trivy prints the total count and up to 50 rule/location summaries; it never prints secret-result messages or matched snippets. Inspect uploaded code-scanning results or rerun the pinned scanner locally for detailed investigation, without copying matched values into logs or the ledger. Fix the code or dependency. If a finding cannot be fixed yet, an exception needs its tracked task, a statement, and an expiry date in `.trivyignore.yaml`. CodeQL has no exception file. Rerun the workflow for the same commit after the fix.

Failed matrix jobs can be rerun in GitHub Actions; successful platform artifacts are retained for fourteen days. A failure while creating/uploading the final draft can leave an incomplete draft. Inspect and remove that incomplete draft without deleting the existing source tag, then rerun the workflow for the same tag. Existing published releases are never overwritten by this pipeline; GitHub rejects creating an already existing release. Rebuild all assets if the original run's artifacts have expired.
