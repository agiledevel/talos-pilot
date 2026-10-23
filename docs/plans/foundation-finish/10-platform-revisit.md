# 10 — Platform revisit: macOS and Windows (parked)

Read the series [README](README.md) and the [ledger](ledger.md) first.

Plan packet: [F9](../foundation-completion-flash.md#f9--qualify-actual-packages-and-clean-target-runtimes), parts F9.2 (macOS), F9.3 (Windows), and the remaining part of F9.4. Maps to checkpoint C8.

**Status: deferred by the owner on 2026-10-12.** The owner has no macOS or Windows machine. This document is not runnable until they do. It does not block documents 01 to 09 or milestone 2.

## When to pick this up

Only when the owner says the platforms are available and names them. Record in the ledger which machines exist, their operating system versions and architectures, and how a session reaches them. Until then, leave the status as `deferred` and change nothing here except to keep it accurate.

If only some platforms become available, do those rows and leave the rest deferred. Each target keeps its own status.

## Outcome

The installers are installed, launched, used, and removed on clean macOS and Windows targets, with the helper, the operating system's vault, the offline assets, and shutdown cleanup observed. With these rows, checkpoint C8 is complete and milestone 1 can be put to the owner for acceptance.

## What must be available

| Target         | Needed                                                                                                                      |
| -------------- | --------------------------------------------------------------------------------------------------------------------------- |
| macOS arm64    | Apple Silicon hardware or a permitted macOS runner, with macOS 13.3 (the declared minimum) and the declared current version |
| macOS Intel    | An Intel Mac or a permitted runner, with macOS 13.3 and the declared current version                                        |
| Windows x86_64 | A Windows 11 machine, or a clean Windows 11 virtual machine with a licensed image                                           |

A newer operating system does not prove the minimum. macOS 13.3 is the minimum because stock 13.0 ships WebKit 16.1 while the build targets Safari 16.4; see [decision 0010](../../decisions/0010-macos-minimum-webview.md). Test the actual minimum.

The owner's `Win11 Jump` virtual machine on the development host is not a test target unless the owner explicitly makes it one and the ledger records that.

## Read before you start

| File                                                                | Why                                                             |
| ------------------------------------------------------------------- | --------------------------------------------------------------- |
| [Document 08](08-f9-linux-packages.md) and its ledger entries       | The Linux procedure and smoke script you adapt                  |
| [Decision 0004](../../decisions/0004-native-vault-integration.md)   | Keychain and Credential Manager behavior                        |
| [Decision 0010](../../decisions/0010-macos-minimum-webview.md)      | The macOS minimum                                               |
| [docs/ci-release.md](../../ci-release.md)                           | The release contract, signing state, and failure recovery       |
| [docs/verification/automation.md](../../verification/automation.md) | What the hosted macOS and Windows runners have already executed |

## What hosted CI already covers, and what it does not

The CI desktop job builds and runs the native tests on `macos-15`, `macos-15-intel`, and `windows-2022`. That is real evidence that the code builds and its native tests pass on those runners. It is not evidence for the macOS 13.3 minimum, for Windows 11, for a clean install, or for an installed package. Keep the two kinds of evidence separate in every record.

## Work

Take the installers from document 08's F9.0 packaging path, built with the existing release configuration, for the revision under test.

### F9.2: macOS, on each architecture

1. Install from the DMG on macOS 13.3 and on the declared current version.
2. Confirm the helper's architecture and packaged path, and that it completes its handshake with no global command-line tool installed.
3. Exercise the Keychain: store, restart the application, read back; then the failure states.
4. Confirm the offline editor, terminal, and chart load from the installed application under the packaged CSP.
5. Close and uninstall. Record what remains on disk.
6. Decide, with native evidence, whether macOS should mirror the in-window View menu in its system menu. [Decision 0009](../../decisions/0009-desktop-shell-layout.md) keeps the owner-confirmed in-window menu. Offer a concrete change only if the native review warrants it, as a proposal for the owner.

### F9.3: Windows 11

1. Install with the NSIS installer, including the WebView2 handling, then reinstall and uninstall.
2. Exercise Credential Manager and the inherited access-control behavior: store, restart, read back; then the failure states.
3. Confirm the helper lifecycle and the packaged assets.
4. Confirm the offline editor, terminal, and chart load from the installed application.

### Both

5. Run the failure cases from document 08: paths with spaces and non-ASCII characters, a missing or wrong helper, a build identity mismatch, a stalled startup, an application or helper crash, and quitting with an active stream. Observe that nothing is left running.
6. Record package hashes, notices, and the signing state for each target. Production signing and notarization need owner-supplied material; do not invent credentials.
7. Run the final-artifact scans on each package.
8. Run the production exclusion check on each platform's default production artifact.

## Acceptance cases

For each target that is available:

1. Clean install, launch, shutdown, reinstall, and uninstall.
2. The packaged helper completes its handshake with no global tool present.
3. The operating system's vault stores a credential that survives a restart, and its failure states behave as documented.
4. Offline assets resolve from the installed package under the packaged CSP.
5. Each failure case ends in a clear state with nothing left running.
6. The production artifact contains no test support.
7. On macOS: the above on 13.3 and on the declared current version, for each architecture.

## Done means

- Every available target's acceptance cases have recorded evidence. An unavailable target stays deferred, with its missing resource named.
- When all targets are done: the milestone ledger's C8 row is complete, the deferred rows in the series ledger are closed with links, and the owner is asked to accept milestone 1. Acceptance is the owner's decision; do not record it yourself.
- Only after the owner accepts: update the repository README's stage to milestone 2.
