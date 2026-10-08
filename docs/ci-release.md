# GitHub quality gate and preview releases

## Security scans: CodeQL and Trivy

The `Security scans` workflow ([security.yml](../.github/workflows/security.yml)) runs on pushes to `main`, pull requests targeting `main`, a weekly schedule, manual dispatch, and as a reusable workflow for an exact release revision. It replaced the SonarCloud gate on 2026-10-08. SonarCloud never produced an analysis for this repository: the app-check gate in run 37811900492 and the CI-scanner gate in run 37815070833 both failed, and the owner directed its removal.

**CodeQL** analyzes `actions`, `javascript-typescript`, and `rust` with `build-mode: none`, using `github/codeql-action` **v4.38.1**, pinned by commit. The Rust job installs the pinned toolchain and the GTK/WebKit headers so that build scripts and proc macros resolve. Each language job fails unless its SARIF output contains zero results. On push, pull request, and schedule runs, results are also uploaded to GitHub code scanning. Release runs do not upload: a manually dispatched release can analyze a tag revision that differs from the triggering ref, so those runs gate only on the local SARIF.

**Trivy** **v0.74.0** scans the checked-out tree for dependency vulnerabilities (`pnpm-lock.yaml`, `src-tauri/Cargo.lock`), committed secrets, and misconfigurations, and fails on any finding at any severity. CI downloads the release archive and verifies its SHA-256 before running it, the same pattern as actionlint. `aquasecurity/trivy-action` is deliberately not used, because its tags were republished in March 2026. Outside release runs, a separate SARIF pass uploads Trivy findings to code scanning under the `trivy` category.

[`.trivyignore.yaml`](../.trivyignore.yaml) holds the only accepted exception. GHSA-wrw7-89jp-8q8g (RUSTSEC-2024-0429, glib 0.18.5 from Tauri's GTK3 stack) is scoped to `src-tauri/Cargo.lock` and expires on **2026-11-30**. After that date Trivy reports the finding again and the gate fails. Resolution is owned by FND-007 ([initialization](verification/initialization.md)). The exception is not a reachability claim, and `cargo audit` still reports the advisory. Any new exception needs one finding ID, a path, a statement, and an expiry date.

Repository setup:

1. Leave GitHub's code scanning **default setup** disabled. Code scanning rejects uploads from an advanced workflow while default setup is enabled.
2. Protect `main` with required checks for the three **CodeQL** jobs, **Trivy filesystem scan**, **renderer**, and all four **desktop** matrix jobs. The workflow files create these checks; they do not change branch-protection settings.

No repository secret is required. Fork pull requests get a read-only token; their scans still run and gate, but their code-scanning upload can be refused.

For a local Trivy check matching CI, install Trivy 0.74.0 and run this from a clean checkout. In a working tree, skip local build directories such as `node_modules` and `src-tauri/target` with `--skip-dirs`.

```sh
trivy fs --scanners vuln,secret,misconfig --ignorefile .trivyignore.yaml --exit-code 1 .
```

## Preview release contract

The release workflow supports `push` of `v*` tags and manual selection of an existing tag. Tags must be `vMAJOR.MINOR.PATCH`, optionally with `-alpha.N`, `-beta.N`, or `-rc.N`. It validates the tag's resolved commit, requires main-branch ancestry, and checks the npm, Tauri, and Cargo versions against the tag. QA and security scans operate on that exact source revision, not a newer main build.

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

These are build runners; Windows Server compilation does not qualify Windows 11 runtime behavior, and macOS 15 does not prove the macOS 13 minimum. A separate release-only [Tauri configuration](../.github/tauri.release.conf.json) enables bundling. macOS previews are ad-hoc signed and not notarized; Windows previews are not publisher-signed. Production signing credentials and updater artifacts are not simulated.

The desktop QA and release asset jobs install Go **1.27.1** from `helper/go.mod`
with `actions/setup-go` **v6.5.0**, pinned to commit
`924ae3a1cded613372ab5595356fb5720e22ba16`. The Tauri build hook cross-compiles
the Go helper for the selected Rust target triple with cgo disabled, embeds the
exact source revision as its build identity, and places it in the app's bundled
resource directory. Go format, vet, tests, race tests, module verification,
and build run in the desktop QA matrix before native compilation. Local
`pnpm desktop:dev` and `pnpm desktop:build` use the same helper build hook.

The desktop QA matrix also runs `pnpm test:native` on each declared runner. It
builds a separate `native-test` feature/configuration and uses the embedded
WebDriver service. Linux runs under Xvfb when the runner has no display. The
native flow invokes the real helper status command from the main window,
checks denial from a second window without that capability, and verifies the
helper process count returns to baseline after the application exits. The
default production build does not enable the feature or include its injected
frontend plugin.

Each matrix job must produce exactly one installer of each declared package type in its expected Tauri output directory. Nested application executables cannot satisfy the installer requirement. Artifact names include the target triple to prevent cross-platform collisions. The final job downloads all four artifacts, verifies their SHA-256 hashes, generates notes with git-cliff, prepends the [preview scope statement](release-preview.md), and creates a draft prerelease with packages, changelog, and hashes. Only this final job receives `contents:write`; build jobs have read-only repository access. A failed QA/gate/build prevents the draft job from running.

Linux packaging prefetches the latest versioned [AppImage runtime, 20251108](https://github.com/AppImage/type2-runtime/releases/tag/20251108), and verifies its published SHA-256 before setting `LDAI_RUNTIME_FILE`. The newer `continuous` download is mutable, so it is unsuitable for the foundation's exact pins. Supplying the runtime through the upstream [linuxdeploy plugin's supported option](https://github.com/linuxdeploy/linuxdeploy-plugin-appimage/blob/master/src/main.cpp) also avoids an observed deadlock in appimagetool's internal OpenSSL runtime downloader. The Tauri-managed linuxdeploy tool and plugins remain upstream downloads; this runtime pin alone does not establish byte-reproducible installers.

The workflow creates a draft for review and never publishes a stable v1 release. Production publication remains subject to the complete feature, native, real-cluster, dependency, and signing gates in [quality.md](quality.md). SHA-256 checks establish byte integrity, not publisher authentication.

`pnpm release:check-linux` checks the generated AppDir for executable WebKit network/web helper processes before Linux assets can be uploaded. A local openSUSE-built AppImage compiled and bundled but failed this check and runtime smoke because its WebKit helper layout was not collected by the upstream bundler. Ubuntu-built artifacts and clean-target runtime qualification remain unexecuted; building an installer is not proof that it runs. See [automation verification](verification/automation.md).

## Changelog and workflow tools

Angular commits (`feat`, `fix`, `perf`, `docs`, `ci`, `build`, `test`, `refactor`, and maintenance entries) drive [cliff.toml](../cliff.toml). Breaking changes are retained. Nonconventional historical commits are not silently discarded. `CHANGELOG.md` is generated documentation; its source is Git history and this configuration.

With git-cliff **2.14.2** installed:

```sh
git-cliff --config cliff.toml --output CHANGELOG.md
```

Release notes use the same configuration for the requested tag range. The action is pinned to git-cliff-action **4.9.1** by commit and explicitly selects binary version **2.14.2**. The existing checkout/setup-node pins remain current; upload-artifact **7.0.2** and download-artifact **8.0.2** were researched from their release APIs and pinned by commit. Workflow syntax is checked locally and in CI with actionlint **1.7.12**; CI verifies the pinned Linux archive's SHA-256 before executing it.

Sources: [CodeQL action](https://github.com/github/codeql-action/releases/tag/v4.38.1), [Trivy](https://github.com/aquasecurity/trivy/releases/tag/v0.74.0), [git-cliff releases](https://github.com/orhun/git-cliff/releases/tag/v2.14.2), [git-cliff action](https://github.com/orhun/git-cliff-action/releases/tag/v4.9.1), [actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12), [upload action](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [download action](https://github.com/actions/download-artifact/releases/tag/v8.0.2), [Tauri distribution](https://v2.tauri.app/distribute/pipelines/github/), and [CodeQL advanced setup](https://docs.github.com/en/code-security/code-scanning/creating-an-advanced-setup-for-code-scanning).

## Failure recovery

A failed security scan is a finding to fix, not permission to bypass the gate. The CodeQL job log lists each result's rule, file, and line; Trivy prints a findings table. Fix the code or dependency. If a finding cannot be fixed yet, an exception needs its tracked task, a statement, and an expiry date in `.trivyignore.yaml`. CodeQL has no exception file. Rerun the workflow for the same commit after the fix.

Failed matrix jobs can be rerun in GitHub Actions; successful platform artifacts are retained for fourteen days. A failure while creating/uploading the final draft can leave an incomplete draft. Inspect and remove that incomplete draft without deleting the existing source tag, then rerun the workflow for the same tag. Existing published releases are never overwritten by this pipeline; GitHub rejects creating an already existing release. Rebuild all assets if the original run's artifacts have expired.
