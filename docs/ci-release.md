# GitHub quality gate and preview releases

## SonarCloud through the GitHub App

The owner configured the SonarCloud GitHub App. This repository therefore uses the app's analysis and waits for its GitHub check instead of starting another scanner. SonarSource explicitly documents that [automatic and CI-based analysis must not run together](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis/).

The `SonarCloud quality gate` workflow checks the exact PR head commit or push commit through GitHub's read-only Checks API. It accepts only a completed `success` conclusion from the official `sonarqubecloud` app (or its historical `sonarcloud` identity), for the expected check name. The newest rerun controls the result. API errors fail immediately; missing/pending checks expire after ten minutes. A skip, neutral result, cancellation, or failure cannot satisfy the gate. The GitHub token has only content/check read permissions; no Sonar token, organization key, or guessed project key is needed.

Repository setup:

1. In SonarCloud, confirm this repository is imported and bound to its project, and that the intended analysis method is enabled. Installing the GitHub App alone does not establish that the project has been imported or analyzed. At implementation time, the public latest-commit check list did not yet contain a SonarCloud result.
2. Confirm the app reports `SonarCloud Code Analysis`. If the installation uses a different name, set the public repository Actions variable `SONAR_CHECK_NAME` to its exact check name. App identity and commit matching are still required.
3. Protect `main` with required checks for **SonarCloud quality gate**, **renderer**, and all four **desktop** matrix jobs. The workflow files establish these checks; they do not themselves modify branch-protection settings. Require checks from their expected GitHub Apps in the repository ruleset.

`.sonarcloud.properties` is the app's automatic-analysis configuration. The [current automatic-analysis documentation](https://docs.sonarsource.com/sonarqube-cloud/analyzing-source-code/automatic-analysis/) excludes Rust and does not import coverage reports. Renderer coverage remains a local/CI artifact, and Rust gates remain mandatory. A future migration to CI scanning must first disable automatic analysis and use confirmed organization/project/region values; no duplicate scanner is installed here.

For a local check, run the same script as CI with a GitHub token possessing `checks:read` and a repository/SHA supplied through your environment:

```sh
node scripts/sonar-gate.ts
```

The expected variables are `GITHUB_REPOSITORY`, `ANALYSIS_SHA`, and `GITHUB_TOKEN`; optionally `SONAR_CHECK_NAME`. Node is pinned in `.node-version`.

## Preview release contract

The release workflow supports `push` of `v*` tags and manual selection of an existing tag. Tags must be `vMAJOR.MINOR.PATCH`, optionally with `-alpha.N`, `-beta.N`, or `-rc.N`. It validates the tag's resolved commit, requires main-branch ancestry, and checks the npm, Tauri, and Cargo versions against the tag. QA and SonarCloud operate on that exact source revision, not a newer main build.

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

These are build runners; Windows Server compilation does not qualify Windows 11 runtime behavior, and macOS 15 does not prove the macOS 13 minimum. A separate release-only [Tauri configuration](../.github/tauri.release.conf.json) enables bundling. macOS previews are ad-hoc signed and not notarized; Windows previews are not publisher-signed. Production signing credentials, updater artifacts, and the future helper binary are not simulated.

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

Sources: [git-cliff releases](https://github.com/orhun/git-cliff/releases/tag/v2.14.2), [git-cliff action](https://github.com/orhun/git-cliff-action/releases/tag/v4.9.1), [actionlint](https://github.com/rhysd/actionlint/releases/tag/v1.7.12), [upload action](https://github.com/actions/upload-artifact/releases/tag/v7.0.2), [download action](https://github.com/actions/download-artifact/releases/tag/v8.0.2), [Tauri distribution](https://v2.tauri.app/distribute/pipelines/github/), [SonarCloud GitHub integration](https://docs.sonarsource.com/sonarqube-cloud/managing-your-projects/administering-your-projects/devops-platform-integration/github/), and the official [SonarQubeCloud GitHub App](https://github.com/apps/sonarqubecloud).

## Failure recovery

A missing SonarCloud result is an integration failure to investigate, not permission to bypass the gate. Check the project's repository binding and app check name, then rerun once the exact commit's analysis is available.

Failed matrix jobs can be rerun in GitHub Actions; successful platform artifacts are retained for fourteen days. A failure while creating/uploading the final draft can leave an incomplete draft. Inspect and remove that incomplete draft without deleting the existing source tag, then rerun the workflow for the same tag. Existing published releases are never overwritten by this pipeline; GitHub rejects creating an already existing release. Rebuild all assets if the original run's artifacts have expired.
