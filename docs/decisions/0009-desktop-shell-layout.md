# 0009: Desktop shell layout with a menu bar, navigation bar, and status bar

Date: 2026-10-11. Status: accepted. The owner directed the layout and, on the
same day, confirmed implementation choices 1, 2, and 5 and directed the load
error change in item 10. The remaining choices under "Implementation choices"
are in effect on this branch and were not put to the owner one by one.

## Context

The foundation shell was one scrolling page: a header with the application
title and two segmented controls for theme and density, three centred sections
stacked below it (the empty cluster view, the Talos read probe, and
credentials), and a footer line. It adapted down to phone width. The design
already named a navigation sidebar and a context header but did not define the
regions of the window or what each holds.

On 2026-10-11 the owner directed a revision of the layouts and arrangements to
fit desktop usage:

- use menus instead of buttons along the top for UI adjustments;
- feature a navigation bar;
- add a status bar along the bottom with context for the user;
- keep the result minimalistic and ergonomic;
- implement no new functionality in this round.

## Decision

### Owner-directed

The window is one fixed shell of four regions, defined normatively in the
[design](../design.md#desktop-shell-layout):

| Region         | Before                                     | Now                                                                            |
| -------------- | ------------------------------------------ | ------------------------------------------------------------------------------ |
| Top edge       | Title and two segmented controls           | A menu bar. The View menu holds theme and density as radio items               |
| Left edge      | Nothing                                    | A navigation bar that selects one view                                         |
| Centre         | Three sections stacked on a scrolling page | The active view only; this area alone scrolls                                  |
| Bottom edge    | A centred footer line                      | A status bar naming the cluster, Talos context, and credential storage         |
| Window scaling | Reflowed down to phone width               | 1280×800 comfortable, adapts to 1024×700, usable at the 720×480 minimum window |

### Implementation choices

1. **An in-window menu bar, not the operating system's native menu**
   (confirmed by the owner, for all three platforms). The bar
   is a Bits UI `Menubar` wrapped as `src/components/ui/MenuBar.svelte`.
   Skeleton has a single popup `Menu` but no menu bar with roving focus between
   menus, which is the case the design assigns to Bits UI. A native menu would
   be built in Rust and would need an event path into the renderer or a second
   owner of the appearance settings: new IPC surface, which this round
   excludes. It also cannot be themed, scanned by axe, or driven by the
   Playwright and WebDriver suites, and it differs per platform (a global menu
   bar on macOS, an in-window bar elsewhere).
2. **A menu lists implemented commands only** (confirmed by the owner: View
   is the only menu in this round). Today that is one menu, View,
   with two single-choice groups. File, Edit, and Help menus arrive with the
   commands they hold. A view's own actions, such as the kubeconfig import,
   stay in the view beside their status and errors.
3. **Appearance leaves the Settings navigation group.** The design listed
   appearance under Settings; it is now in the View menu only, so there is one
   place to change it.
4. **Navigation entries exist only for groups with an implemented view:** Home
   (clusters), Talos (the read probe), and Settings (credentials), in the order
   and with the names of the design's navigation groups. Unimplemented groups
   are not shown as disabled entries.
5. **The active view is UI state, not a route** (confirmed by the owner). The
   shell holds it in memory
   and always starts on Home. The router remains unselected, as
   [0008](0008-svelte-skeleton-renderer.md) left it. It is chosen when the
   first view takes an addressable parameter, such as a cluster or a resource,
   so the choice between a small hash router and SvelteKit is made against a
   real requirement.
6. **The shell owns the Talos probe state.** The probe panel used to create and
   release it. It was mounted for the application's whole life, so the session
   lasted as long as the window. With one view at a time, a panel-owned session
   would close whenever the user opened another view. The shell now owns the
   state and releases it on unmount, which keeps the previous lifetime; the
   status bar names the context from every view, so a session-only credential
   held in memory is never out of sight.
7. **Status bar contents.** Three labelled items and a trailing note, all text:
   - `Cluster`: "none connected" until cluster profiles exist;
   - `Talos`: "no context", or the context name marked session-only, joined by
     the target node and probe state while a stream is open. A finished
     stream's last projection is not repeated as current;
   - `Credentials`: the storage mode in words, "status not loaded" until the
     backend reports one, or "desktop application only" in a browser;
   - the note "Foundation preview", previously the footer line.

   The wording comes from pure functions in `src/lib/format/status.ts`. The bar
   is not a live region: the views already announce their changes, and a second
   announcement of the same change would be noise.

8. **Views live under `src/features/`,** as the design's source layout
   specifies: `clusters`, `talos`, and a new `settings` area. The unused
   `SegmentedChoice` wrapper and the jsdom `ResizeObserver` stand-in that only
   it needed are removed.
9. **No title in the shell.** Native window decorations already show "Talos
   Pilot". The first-level heading of the page is the title of the active view.
10. **A failed settings load is reported by the shell** (directed by the
    owner). On the single page the message sat in the credentials section. With
    one view at a time it would have been visible only under Settings, so the
    shell state now keeps a load error apart from the error of the last
    credential action, and the shell shows it under the menu bar from every
    view. This is the one state change of the round; it adds no command and no
    retry.

## Acceptance criteria

1. No appearance control is a button or segmented control along the top edge.
   Theme and density are radio items of the View menu, saved through the
   existing `set_appearance_settings` command. A rejected save restores the
   previous choice and its message is associated with the menu.
2. The menu follows the ARIA menubar pattern from the keyboard: open, move,
   choose, dismiss with Escape, and focus returns to the trigger. Without a
   native transport the menu opens and every item is disabled.
3. The navigation bar lists Home, Talos, and Settings. Exactly one view is
   shown and its entry carries `aria-current="page"`.
4. The status bar spans the bottom edge and names the cluster, Talos, and
   credential context from every view.
5. An imported Talos context and a running probe survive a change of view and
   are cancelled and closed when the shell unmounts.
6. At 1280×800, 1024×700, and 720×480 the window does not scroll in either
   direction and the bars stay on their edges.
7. axe reports no violation in any view, in both colour modes, at every size,
   and with the menu open.
8. No IPC command, capability, Tauri configuration, or dependency changes.
9. A failed settings load is announced from whichever view is open, the status
   bar reads "status not loaded", and Settings shows no second copy of the
   message.

## Alternatives considered

- **A native operating-system menu.** Rejected for this round for the reasons
  in item 1. It remains the main alternative, in particular for macOS, where
  users expect application commands in the system menu bar.
- **Skeleton's `Menu` behind a single "View" button.** It satisfies "a menu
  instead of buttons" but is a toolbar button with a popup, not a menu bar: it
  has no arrow-key traversal between menus and no place for the next menu.
- **A settings page for theme and density.** Rejected: the owner asked for
  menus, and a page costs a navigation step for a one-click adjustment.
- **All eleven navigation groups, disabled until implemented.** Rejected: it
  presents placeholders as structure and works against a minimal bar.
- **Keeping every section on one page and using the bar as in-page anchors.**
  Rejected: it keeps the scrolling page the revision is meant to replace.
- **A hash router now.** Offered to the owner and declined for this round: no
  view has a parameter to address yet.
- **A File menu for the import actions,** beside or instead of their buttons.
  Offered to the owner and declined: the actions stay next to their status and
  errors, with one way to start each.

## Consequences

- **macOS convention.** The system menu bar keeps Tauri's default application
  menu and does not contain the View menu. Whether to mirror the in-window
  menus natively on macOS is open and belongs to cross-platform qualification.
- **The session-only Talos credential lives as long as the window,** as before,
  and no longer only while its view is visible. The status bar is what keeps
  that visible, so its Talos item must not be removed without replacing that
  indication.
- **No narrow layout.** Styles for phone-width viewports are gone. Below 720
  pixels the shell is unsupported; the window cannot be made that narrow.
- **Test boundaries.** jsdom performs no layout, so component tests find menu
  items by text and cannot establish that the menu is visible. Playwright
  covers visibility, the keyboard path, and focus in Chromium. The native test
  drives the menu inside the main window through the service's `execute`. The
  embedded driver synthesises a click without pointer events, so the test
  dispatches the `pointerdown` that opens the menu, and it accepts an item only
  when that item is the topmost element at its own centre. Raw WebDriver
  element commands are avoided: the native-test application has two windows,
  and a version of the test that used them passed once and failed once against
  the same build. The window the driver held was not inspected, so that cause
  is the likely one, not an established one.
- **Unchanged:** IPC commands and DTOs, capabilities, the CSP, the Tauri
  configuration, the Rust backend, the Go helper, and the dependency set.

## Verification

Executed on 2026-10-11 on Linux x86_64 only, with Node 26.11.1, pnpm 12.10.1,
Rust 1.99.0, Go 1.27.2, and the pinned `protoc` 36.2:

| Check                                                                                        | Result                                                                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (Oxfmt, Oxlint with type diagnostics, `svelte-check`, Vitest, production build) | Passed; 102 tests in 13 files. Production bundle 215.94 kB JavaScript (65.35 kB gzip) and 165.10 kB CSS (17.75 kB gzip)                                                                                                                                                                                                                                                             |
| `pnpm test:coverage`                                                                         | Passed; 96.98% statements and 91.43% branches of the measured renderer sources, which now include `src/features/` and `src/lib/format/`                                                                                                                                                                                                                                             |
| Shell component tests                                                                        | Cover criteria 1 to 5 and 9 against a fake transport: saves from the menu, the rejected save, the disabled browser state, one view at a time, the status bar text, the session surviving navigation, release on unmount, and the load failure reported once from every view                                                                                                         |
| `pnpm test:e2e` (Chromium, Playwright 1.64, axe)                                             | Passed; 7 tests. Covers criteria 1 to 4, 6, 7, and 9: the menu by pointer and keyboard with focus return, every view at the three window sizes with no window scroll and the bars on their edges, the load failure alert in every view, and axe scans in both colour modes and with the menu open. The six flows written before the load error change had passed 5 consecutive runs |
| `pnpm test:native` (WebKitGTK through the embedded WebDriver)                                | Passed; 12 tests on the final renderer. The status bar names the storage mode loaded through real IPC, and a theme chosen from the View menu is saved through the Rust command and applied, under the packaged CSP. Before the load error change the same suite had passed 5 consecutive runs against one build                                                                     |
| Earlier versions of the native menu test                                                     | Two versions failed. With the driver's own click the menu never opened; a diagnostic run showed the menu opening and positioned correctly once it received `pointerdown`. With `pointerdown` and WebDriver element commands the test passed once and failed once. Both were test defects; the application was not changed                                                           |
| Rendered inspection                                                                          | Chromium screenshots of the three views and the open menu, light and dark, comfortable at 1280×800 and compact at 720×480                                                                                                                                                                                                                                                           |
| `pnpm desktop:build`, `pnpm production:check`, `pnpm contracts:check`                        | Passed                                                                                                                                                                                                                                                                                                                                                                              |
| Criterion 8                                                                                  | The diff touches no file under `src-tauri/`, `helper/`, or `proto/`, and neither `package.json` nor a lockfile                                                                                                                                                                                                                                                                      |

Not executed: macOS and Windows builds and WebViews; a real desktop session; a
screen reader; high-DPI and fractional scaling; the live Talos fixture (the
probe's backend path is unchanged). The Playwright flows script Tauri's IPC
entry point in Chromium, so they do not establish command registration,
capability enforcement, or CSP behaviour. The native suite opens only the View
menu; the navigation bar and the Talos and Settings views have been rendered in
Chromium only.
