# S0: owner-directed native keyboard acceptance

Date: 2026-10-25. Application source: `d5cf15c5cb5fc3d79928ca254cd5484ea07c5039`.
This checkpoint adds a test, not a menu fix.

## Decision and remaining risk

The owner selected `approve-bounded-acceptance`: perform one bounded real native
keyboard checkpoint; accept S0 with an explicit unresolved B11 residual risk only
if it passes. A genuine native keyboard failure blocks acceptance. Do not replace
this with another passing browser stress campaign.

**Native keyboard checkpoint passed. S0 is accepted with the owner-directed
exception. B11 remains unresolved/not fixed.** Historical browser menu-focus
failures without reload and an additional unattributed development reload remain
unexplained. Neither the dependency-optimizer fix nor the production lazy-loading
fix is claimed to explain them. Retain the existing browser assertions, lifecycle
and keyboard evidence, and hosted failure-artifact capture. Reopen investigation
on an actionable recurrence; green runs do not establish its cause or absence.

This changes only S0's strict historical-cause acceptance requirement. It does not
weaken a test, CSP, capability, security boundary, platform target or another
foundation gate. Document 05 remains **in progress**, with S1 editor/model/worker
bounds next. F7, Linux foundation acceptance, the mandatory owner review and M2.0
remain gated; this is not the later Linux foundation owner acceptance.

## Test contract and evidence

`tests/native-x11/menu-keyboard.spec.ts` runs against the actual native-test
release executable with the application's restrictive CSP. Its explicit Linux
host input is deliberately separate from the portable native suite's test glob.
No dependency, production command, application behavior or CSP changed.

Pinned `tauri-plugin-wdio-webdriver` 1.5.0 implements its keyboard actions by
script-dispatching `KeyboardEvent`. Those actions would not prove real keyboard
input. This test instead uses host `xdotool` XTEST input on a dedicated Xvfb
server. It never calls DOM `.focus()`, script-dispatches keyboard/pointer events,
or uses xdotool's `--window` SendEvent path. OS window focus is established once
for the exact main window before any menu interaction, not repaired between keys.

The test passed all of the following in one corrected execution:

1. Tab reaches View; Enter opens the menu and focuses System.
2. ArrowDown reaches Light, then Dark, with each intermediate focus observed.
3. Enter selects Dark, closes the menu and returns focus to View; native backend
   appearance settings report Dark and the rendered mode is dark.
4. ArrowDown reopens the menu on System. Escape closes it and returns focus to
   View without changing the native Dark preference.
5. Enter reopens the menu; Enter restores System through the keyboard. The
   native settings and rendered mode return to System; final focus is View.
6. The bounded capture contains exactly nine `keydown` events, all with
   `isTrusted: true`: Tab, Enter, ArrowDown, ArrowDown, Enter, ArrowDown, Escape,
   Enter, Enter. Final menu is absent. The observer is removed in `finally`.

Each host subprocess has a 5-second timeout and 16 KiB output cap. Focus waits
have a 5-second bound; event retention is 32 entries. Display opt-in and exact
visible main-window identity are checked before sending input. Missing tools,
ambiguous windows, unexpected keys or untrusted input fail instead of falling
back to synthetic input. The private display and isolated XDG directories are
owned by the host invocation below, not by application IPC.

### Executed host and artifacts

- Linux x86_64, kernel `7.2.8-1-default`; WebKitGTK `2.54.1` from pkg-config.
  The embedded driver's reporter labels its engine `WebKitGTK 605.1.15`.
- Node 26.12.1, pnpm 12.15.0, Rust 1.99.1, Go 1.27.3;
  `xdotool 4.20260303.1` and Xvfb from the host. Only the Linux development
  WebView was exercised; no macOS, Windows or installed-package claim.
- Native-test executable SHA-256:
  `be75d3bf89cade1ae69ce6fcb1bf35293f1fce51ce9d9f536e67cd87b1de3c29`.
- Existing `pnpm test:native`: **23/23 passed** across three spec files, with no
  helper process or synthetic endpoint left by its cleanup check.
- Explicit X11 spec: **1/1 passed**, nine trusted keys, System restored.
- Local diagnostic artifacts: `/tmp/tp-s0-native-keyboard/`, including
  `native-suite.log`, `native-keyboard.log`, `native-build-identity.log` and the
  first harness-attempt log. This temporary directory is not a shipped artifact.

The first harness attempt failed before traversal because it compared checked
System's raw `textContent` (including the `aria-hidden` visual checkmark) with
`System`. That predicate cannot recognize a checked item. The corrected observer
excludes `aria-hidden` content in a detached clone; it neither alters the live DOM
nor changes focus. The original failed log is retained as
`native-keyboard-harness-label-failure.log`; it is not counted as a native pass
or attributed to B11. The subsequent corrected execution is the acceptance
result above, not a stress batch. No timeout or assertion was weakened.

The pinned service also logs that optional `plugin:wdio|list_windows` is denied;
its documented direct switch to the known `main` window succeeds. No capability
was added to silence that warning.

## Reproduction

Requires the pinned repository tools on `PATH`, Linux native prerequisites,
`xvfb-run` and `xdotool`. Run from the repository root with no concurrent native
test/build. The first command builds the native-test executable and exercises the
ordinary suite with its synthetic Kubernetes endpoint; the second exercises only
the explicit X11 spec. Do not point it at an owner's active desktop.

```sh
scratch=$(mktemp -d)
trap 'rm -rf -- "$scratch"' EXIT
mkdir -p "$scratch/data" "$scratch/config" "$scratch/cache"
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' \
  env GDK_BACKEND=x11 \
  XDG_DATA_HOME="$scratch/data" XDG_CONFIG_HOME="$scratch/config" \
  XDG_CACHE_HOME="$scratch/cache" sh -c '
    set -eu
    pnpm test:native
    TALOS_PILOT_NATIVE_X11_DISPLAY="$DISPLAY" \
      pnpm exec wdio run wdio.native.conf.ts \
      --spec ./tests/native-x11/menu-keyboard.spec.ts
  '
```

As with the ordinary native suite, restore the ordinary production executable
before production-exclusion or linked-binary advisory checks:

```sh
pnpm desktop:build
pnpm production:check
pnpm advisories:check
```

## Final gate record

Final renderer/static, production rebuild/exclusion, advisory, documentation and
review outcomes are recorded in the [session ledger](../plans/foundation-finish/ledger.md).
The hosted Foundation `40211034434` and Security `40211034162` results passed at
`d5cf15c`, including hosted Chromium 16/16. They are earlier exact-revision
hosted evidence, not execution of this new native X11 spec. Browser, real-cluster,
installer and other-platform campaigns were not repeated for this test-only
checkpoint.
