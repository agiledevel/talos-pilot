# 0008: Replace the React/Ant Design renderer with Svelte, Skeleton, and Bits UI

Date: 2026-10-11. Status: accepted for the owner-directed stack change; the
implementation choices listed under "Proposed for owner confirmation" are in
effect on this branch and await confirmation.

## Context

The locked baseline selected React, Ant Design, React Router, and Zustand for
the renderer. On 2026-10-11 the owner directed a change of renderer framework,
with these constraints:

- use Svelte instead of React;
- use Skeleton v5 for components, and Bits UI for custom components that
  Skeleton does not provide;
- keep the existing Oxc tooling (Oxlint, `oxlint-tsgolint`, Oxfmt);
- update the tests and the build system;
- replace the React development skill with skills extracted from the official
  Svelte documentation.

At the time of the change the renderer consisted of the application shell, the
appearance controls, the credential storage view, and the Talos read probe
(milestone 1, C1–C4). The typed IPC adapter, runtime validation, generated
DTOs, Rust backend, Go helper, capabilities, and CSP are independent of the
renderer framework and were not changed.

## Decision

### Owner-directed

| Concern                   | Before                           | Now                                                                                      |
| ------------------------- | -------------------------------- | ---------------------------------------------------------------------------------------- |
| Renderer framework        | React 19                         | Svelte 5 in runes mode                                                                   |
| Component framework       | Ant Design 6                     | Skeleton 5: Tailwind components and `@skeletonlabs/skeleton-svelte`                      |
| Custom components         | Ant Design components            | Headless Bits UI primitives styled with Skeleton tokens, wrapped in `src/components/ui/` |
| Styling                   | CSS-in-JS tokens, CSS Modules    | Tailwind CSS 4 utilities with Skeleton theme tokens in one stylesheet                    |
| Lint, type engine, format | Oxlint, `oxlint-tsgolint`, Oxfmt | Unchanged, plus `svelte-check` for what Oxlint cannot see                                |
| Component tests           | React Testing Library            | Testing Library for Svelte                                                               |

### Proposed for owner confirmation

1. **Plain Vite with `@sveltejs/vite-plugin-svelte`, not SvelteKit.** The
   renderer stays one client-only bundle mounted from `src/main.ts`, loaded by
   Tauri from `index.html`. This keeps the bundled-content CSP
   (`script-src 'self'`), the `transformIndexHtml` injection of the native-test
   entry, the dev-server contract with Tauri and Playwright, and the
   production-exclusion check exactly as they were. SvelteKit would add a
   filesystem router at the cost of an inline bootstrap script that the CSP must
   then hash, a generated HTML pipeline that bypasses the native-test injection,
   and server concepts a desktop renderer cannot use.
2. **Type diagnostics for Svelte through `svelte-check --tsgo`.** Oxlint's
   type-aware rules and type check do not reach `.svelte` files. `svelte-check`
   loads `typescript` through its JavaScript API, which exists only in
   TypeScript 5 and 6; with TypeScript 7 it requires `--tsgo` and both
   packages. The `typescript` dependency is therefore 6.0.3 (compiler API for
   `svelte2tsx`), and TypeScript 7.0.2 is installed under upstream's documented
   alias `@typescript/native` and remains the engine that type-checks the
   project in both linters. Oxlint bundles its own engine and is unaffected.
3. **A separate `tsconfig.svelte.json` with `skipLibCheck: true`.**
   `svelte-check` reports diagnostics for every file in the program, including
   third-party declaration files, 160 of which conflict with each other
   (WebdriverIO/Mocha against Vitest globals, `csstype`). Oxlint reports only
   the files it lints, so those conflicts were already invisible to the
   existing gate. The Svelte program skips declaration files only; every strict
   option still applies to project sources, and `tsconfig.json` is unchanged
   for Oxlint.
4. **Async and IPC logic in `.svelte.ts` state modules.** Because type-aware
   lint rules such as `no-floating-promises` do not run inside `.svelte` files,
   view logic moved from the components into `src/lib/state/*.svelte.ts`
   classes, which receive the full rule set. Components keep markup and wiring.
5. **The stock Cerberus theme with application tokens.** Cerberus already uses a
   system font stack, neutral surfaces, one blue primary, and 8-pixel radii.
   `src/styles.css` adds 14-pixel body text, a compact density that tightens
   Skeleton's `--spacing` and type scale, and a primary-action fill that meets
   WCAG AA.
6. **Dark mode from one root attribute.** `data-mode` on the root element fixes
   light or dark; without it the stylesheet follows `prefers-color-scheme`. The
   "system" theme therefore needs no script and does not flash on start.
7. **Build target raised to Tailwind 4's floor,** `chrome111` and `safari16.4`
   (previously `chrome110`, `safari16`).
8. **Replacements for the remaining React-specific baseline entries,** none of
   which was installed yet: TanStack Query's Svelte adapter for backend
   projections; rune-based `.svelte.ts` modules and context instead of Zustand
   for UI state; Lucide (`@lucide/svelte`) instead of `@ant-design/icons`. The
   client router is **not** chosen here: no routed view exists, and the choice
   between a small hash router and adopting SvelteKit should be made with the
   first routed view.

## Alternatives considered

- **SvelteKit with the static adapter and hash router.** Rejected for now for
  the reasons in item 1. It remains the main alternative for routing and is
  documented in the `sveltekit` skill so the evaluation can be made later.
- **Skeleton's own components only.** Skeleton 5 has no styled select; a native
  `<select>` popup is drawn by the system WebView outside the application
  theme. A Bits UI `Select` wrapped as `SelectField` covers it and establishes
  the pattern the owner asked for.
- **Downgrading the type engine to TypeScript 6.** Rejected: Oxlint's type-aware
  engine and the design require TypeScript 7 semantics.
- **Relying on Oxlint alone.** Rejected after a mutation check: a wrong prop
  type passed to a component from `main.ts`, a type error in a template, and a
  missing `alt` attribute all passed Oxlint and failed `svelte-check`.
- **Keeping logic in components and accepting the lint gap.** Rejected: it would
  have silently dropped promise-handling enforcement for all view logic.

## Consequences

- **WebView baseline.** Tailwind 4 needs `@property` and `color-mix()`:
  Chromium 111, Safari/WebKit 16.4. Skeleton uses `light-dark()`, which the
  production build lowers for older engines. On macOS the design's "macOS 13+"
  baseline now effectively means the WebKit shipped with macOS 13.3 or a later
  Safari update. This has not been exercised on macOS or Windows.
- **CSP unchanged.** `style-src 'self' 'unsafe-inline'` stays. Ant Design
  needed it for injected style elements; Skeleton's Zag machines and Bits UI
  apply inline style attributes for positioning. Whether the allowance can now
  be narrowed has not been assessed and stays with the packaged-CSP packet of
  the milestone plan.
- **Bundle.** The production JavaScript bundle fell from 683.66 kB (221.18 kB
  gzip) to 198.53 kB (64.37 kB gzip). The stylesheet grew from 1.01 kB to
  163.83 kB (17.61 kB gzip) because styles are now static CSS instead of
  runtime-generated.
- **Lint coverage is split.** Oxlint: all rules on `.ts` and `.svelte.ts`,
  syntactic rules on `.svelte` script blocks. `svelte-check`: types in scripts,
  templates, and component props; unused locals; Svelte compiler warnings,
  including accessibility, as errors. Template expressions are not linted by
  Oxlint.
- **Accessibility linting moved.** The `jsx-a11y` Oxlint rules applied to JSX
  only and were removed with it. Their role is taken by the Svelte compiler's
  `a11y_*` warnings (errors under `--fail-on-warnings`) and by axe in the
  Playwright flows.
- **Two findings fixed during the migration.** The stock
  `preset-filled-primary-500` fill has 3.6:1 contrast against its label at body
  size; primary actions use a 700/300 pairing. A rejected appearance save left
  the native radio inputs on the rejected option while the visual indicator
  reverted; the shell state now shows the request while it is saved and
  restores the previous value on rejection.
- **Reduced motion.** The stylesheet removes CSS transitions under
  `prefers-reduced-motion`, as the design requires. Svelte `transition:`
  directives are unaffected by that rule and must consult
  `prefersReducedMotion`; none is used yet.
- **New build-time dependencies:** Tailwind CSS 4 with its Vite plugin,
  `svelte-check`, and a second TypeScript package. The pnpm lockfile and the
  generated dependency inventory changed accordingly.

## Verification

Executed on 2026-10-11 on Linux x86_64 only, with Node 26.11.1, pnpm 12.10.1,
Rust 1.99.0, Go 1.27.2, and the pinned `protoc` 36.2:

| Check                                                                                                                                        | Result                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check` (Oxfmt, Oxlint with type diagnostics, `svelte-check`, Vitest, production build)                                                 | Passed; 89 tests in 11 files, 96.6% statement coverage of the measured renderer sources                                                                                                                                         |
| Component tests carried over from the React renderer                                                                                         | All 18 pass against the Svelte components with their assertions unchanged                                                                                                                                                       |
| State modules                                                                                                                                | 19 direct tests of `src/lib/state/` cover load-failure mapping, rejected saves, import outcomes, probe failure classification, and ownership on dispose                                                                         |
| Mutation check of the two linters                                                                                                            | Injected template and script type errors, a wrong component prop, an unused local, a missing `alt`, an explicit `any`, and a floating promise in a `.svelte.ts` module were each reported by the tool documented as responsible |
| `pnpm test:e2e` (Chromium, Playwright 1.64, axe)                                                                                             | Passed; 4 tests, repeated 6 times without a failure. Covers system/light/dark, compact density, status messages, and the node picker by pointer and keyboard                                                                    |
| `pnpm test:native` (WebKitGTK through the embedded WebDriver)                                                                                | Passed; 11 tests, including the shell rendering storage state through real IPC under the packaged CSP                                                                                                                           |
| Native render inspection                                                                                                                     | The native-test build under Xvfb showed the themed shell in dark mode with the production stylesheet                                                                                                                            |
| `pnpm desktop:build`, `pnpm production:check`, `pnpm advisories:check`, `pnpm contracts:check`, `pnpm icons:check`, `pnpm format:rust:check` | Passed                                                                                                                                                                                                                          |

Not executed: macOS and Windows builds and WebViews; a real desktop session; a
screen reader; the live Talos fixture (the probe's backend path is unchanged,
and its renderer path is covered by the component tests with a fake channel).
The Playwright flows script Tauri's IPC entry point in Chromium, so they do not
establish command registration, capability enforcement, or CSP behaviour. The
node picker has been rendered in Chromium only: importing a Talos context
requires a native file dialog that the native suite does not drive.
