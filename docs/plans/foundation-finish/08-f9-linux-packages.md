# 08 — F9 on Linux: installer artifacts and clean-target runtime

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs no Talos fixture.

Plan packet: [F9](../foundation-completion-flash.md#f9--qualify-actual-packages-and-clean-target-runtimes), parts F9.0, F9.1, and the Linux part of F9.4. Maps to checkpoint C8 and tasks FND-002, FND-003, FND-005, FND-006, and FND-008. Prerequisite: document 07 is `done`.

The macOS part (F9.2) and the Windows part (F9.3) are deferred by the owner to [document 10](10-platform-revisit.md). Do not attempt them here.

## Outcome

Installers for a chosen revision can be built on the four CI runners without creating a tag or a release. The Linux installers are installed, launched, used, and removed on clean Ubuntu 22.04 and current Fedora virtual machines, with the helper, the vault, the offline assets, and shutdown cleanup observed. Checkpoint C8 then has its Linux rows; it stays open for the deferred platforms.

## Read before you start

| File                                                                                        | Why                                                               |
| ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| [docs/ci-release.md](../../ci-release.md)                                                   | The preview release contract and failure recovery                 |
| [docs/release-preview.md](../../release-preview.md)                                         | What a preview package is and is not                              |
| `.github/workflows/release.yml`, `.github/tauri.release.conf.json`                          | The existing packaging steps you must reuse                       |
| `.github/workflows/check.yml`                                                               | The four desktop runners                                          |
| `scripts/release-assets.ts`, `scripts/release-metadata.ts`, `scripts/appimage-resources.ts` | Asset collection, metadata checks, and the AppImage resource gate |
| `scripts/check-production-exclusion.ts`                                                     | The check that test support is absent from production artifacts   |
| `scripts/build-helper.ts`, `src-tauri/tauri.conf.json`                                      | How the helper is built and bundled as a resource                 |
| [Decision 0004](../../decisions/0004-native-vault-integration.md)                           | Vault behavior, including locked and unavailable states           |
| [Decision 0010](../../decisions/0010-macos-minimum-webview.md)                              | Context for the deferred macOS rows                               |

Apply the `talos-pilot-tauri` and `talos-pilot-typescript` skills.

## Context

### How installers are built today

Only the release workflow builds installers. It runs on a version tag, builds `deb`, `rpm`, and `appimage` on `ubuntu-22.04`, `app` and `dmg` on both macOS runners, and `nsis` on `windows-2022`, and then creates a draft prerelease. There is no way to get installers for an arbitrary revision without publishing something. `pnpm desktop:build` builds with `--no-bundle`, so it produces an executable and no installer.

### Facts about this host

- An AppImage built on this openSUSE host bundled correctly but failed to render, because WebKit helper processes were missing. `pnpm release:check-linux` exists to catch that. Fix a missing helper at its source; never patch an installer by hand.
- This host has no DEB tooling. The reference Linux build is the Ubuntu 22.04 CI runner.
- QEMU and KVM work with `sudo`.

### Networking for the virtual machines

Use QEMU user-mode networking for the clean virtual machines. It needs no bridge and no firewall change. The owner's permission for host firewall changes covers only the Talos fixture's recorded remediation; it does not cover these machines.

### What "clean" means

A freshly installed operating system image with no development tools, no global `talosctl`, `kubectl`, or `helm`, and no leftover application data. Record the image name, its source, and its digest.

## Do not

- Do not push a tag or create a release or prerelease to obtain installers.
- Do not copy the release job's steps into a new workflow. Reuse them, for example through a reusable workflow or shared composite steps.
- Do not count a hosted macOS 15 or Windows Server run as macOS 13.3 or Windows 11 qualification.
- Do not use the owner's `Win11 Jump` virtual machine.
- Do not claim that ad-hoc signing authenticates a publisher. Production signing and notarization need owner-supplied material and remain release gates.

## Work

### F9.0: installer artifacts for a chosen revision

1. Add a packaging path that builds the same release-configuration bundles for a chosen revision on the four runners and uploads them as workflow artifacts with their hashes. It creates no tag and no release.
2. Reuse the release job's steps.
3. Validate the workflow with the pinned workflow validator, push, and trigger it for the current revision.
4. Read the result and download the Linux artifacts. If hosted results cannot be read or artifacts cannot be downloaded from this host (blocker B2 in the ledger), record F9.0's hosted run as unexecuted, mark this document `blocked` on B2, and do only the preparation in F9.1 steps 1 and 2. Do not substitute a locally built installer and call it the reference build.

### F9.1: Linux

1. Obtain clean Ubuntu 22.04 and current Fedora images. Verify each against its published digest.
2. Write the smoke procedure as a script or a documented command sequence that can be repeated, with real exit codes.
3. On Ubuntu: run the AppImage (rendered launch and shutdown), and install, reinstall, and uninstall the DEB.
4. On Fedora: run the AppImage, and install, reinstall, and uninstall the RPM.
5. On both, with the installed application:
   - the window renders and the WebKit processes and resources are present;
   - the helper starts from its packaged path and completes its handshake, with no global command-line tool installed;
   - the Secret Service is exercised available, locked, and unavailable, and each produces the documented state;
   - a credential stored through the vault survives a restart of the application;
   - the offline editor, terminal, and chart from documents 05 and 06 load their assets from the installed package, with no network.
6. Failure cases: an install path with spaces and non-ASCII characters; a missing helper; a wrong helper; a helper with a mismatched build identity; a stalled startup; an application crash; a helper crash; quitting with an active stream.
7. For every case, observe that child processes, tasks, and listeners are gone afterwards, including after the parent exits abruptly.
8. Data retention: reinstalling keeps user data; uninstalling follows the documented behavior. Record what is left on disk.
9. If a Talos or Kubernetes fixture is reachable from a virtual machine without a host network change, exercise a safe read and stream. Otherwise record that combination as unexecuted.

### F9.4, Linux part: integrity and final exclusion

1. Record package hashes and the preview signing state.
2. Document helper signing and integrity feasibility: what would be signed, with what, and what the application would verify at startup. This is a feasibility record, not an implementation with real credentials.
3. Confirm the target-specific notices from document 07 are inside each Linux package.
4. Run the final-artifact scans from document 07 on the Linux packages.
5. Run `pnpm production:check` on the default production artifacts after any test-feature build, because the two builds share an executable path.

## Acceptance cases

1. Installer artifacts for a chosen revision are produced on the runners with no tag and no release, and their hashes are recorded.
2. The AppImage launches, renders, and shuts down on Ubuntu 22.04 and on current Fedora.
3. The DEB on Ubuntu and the RPM on Fedora each install, reinstall, and uninstall cleanly.
4. The packaged helper completes its handshake with no global tool present.
5. The vault's available, locked, and unavailable states each behave as documented, and an encrypted credential survives a restart.
6. Offline assets resolve from the installed package under the packaged CSP.
7. Each failure case in F9.1 step 6 ends in a clear state with nothing left running.
8. The production artifacts contain no test command, driver listener, mock transport, or bypass capability.
9. Package hashes, notices, and the signing state are recorded.

## Gates

- Workflow validation for the new packaging path.
- `pnpm release:check`, `pnpm release:check-linux` before any AppImage is used, and `pnpm release:assets`.
- The smoke procedure on both virtual machines, with its output recorded.
- `pnpm desktop:build` followed by `pnpm production:check`.
- TypeScript gates for changed scripts.

## Done means

- Every acceptance case has recorded evidence, or is recorded as unexecuted with the exact missing resource.
- The carried rows "Real OS-vault restart of a Kubernetes credential on Linux" and "Packaged-installer helper startup" in the ledger are executed and linked, or still listed with their reason.
- The milestone ledger's C8 row reads as complete on Linux with the macOS and Windows rows deferred to document 10. C8 is not complete, and this document does not claim it is.
- C1, C2, C3, and C6 rows that were waiting on packaged-runtime evidence are updated for Linux.
