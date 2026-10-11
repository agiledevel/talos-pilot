---
name: talos-pilot-svelte
description: "Build and review Talos Pilot Svelte 5 components, rune state modules, Skeleton and Bits UI components, Tailwind styling, guided operations, accessibility, and renderer tests. Use for frontend behavior and layout; pair with svelte for framework syntax, talos-pilot-typescript for TypeScript, and talos-pilot-tauri when changing native IPC."
---

# Talos Pilot Svelte

## Establish the interaction

Read [AGENTS.md](../../../AGENTS.md), the frontend/design guidelines in [design.md](../../../docs/design.md), the frontend/change gates in [quality.md](../../../docs/quality.md), and the renderer decision in [0008](../../../docs/decisions/0008-svelte-skeleton-renderer.md). Apply the [svelte](../svelte/SKILL.md) skill for framework syntax and the TypeScript skill for every `.ts`, `.svelte.ts`, and `<script lang="ts">`. Identify the user's action, target context, expected result, and all reachable view states.

Use the shared resource-list, resource-detail, and guided-operation page patterns. Preserve the clean native-feeling shell and visible cluster/namespace identity. An open work tab keeps its original cluster when the global selection changes.

The renderer is a client-only Svelte 5 application built by Vite and mounted from [src/main.ts](../../../src/main.ts). It is not a SvelteKit application: there are no routes, `load` functions, `$app/*` modules, or server code. Translate SvelteKit examples to plain Svelte before using them.

## Put logic where it is checked

Oxlint's type-aware rules, including `no-floating-promises` and the `no-unsafe-*` family, do not run inside `.svelte` files; there it applies only syntactic rules to the `<script>` block. `svelte-check` type-checks scripts and templates but is not a linter.

- Keep asynchronous flows, IPC calls, state transitions, and error mapping in `.svelte.ts` modules under [src/lib/state/](../../../src/lib/state/), normally a class with `$state` fields and methods that never reject. Those files receive the full lint rule set and can be tested without a component.
- Keep components to props, derived view values, markup, and wiring: `onclick={() => void model.save()}`.
- Create a state object from a prop with `$derived(new Model(prop))`, and release anything it owns from an effect cleanup, so a replaced prop cannot leave a stream or session behind.
- Write runes mode only. Use `$effect` solely to synchronise with something outside Svelte, such as document attributes or a model's lifetime, and always return its cleanup.

## Build with Skeleton and Bits UI

- **Skeleton first.** Use Skeleton's Tailwind components (`btn`, `card`, `badge`, `label-text`, presets, typography classes) and its Svelte components from `@skeletonlabs/skeleton-svelte` wherever one exists. Consult the [Skeleton Svelte documentation](https://www.skeleton.dev/docs/svelte/get-started/introduction).
- **Bits UI for what Skeleton lacks.** Build a custom component on a headless [Bits UI](https://www.bits-ui.com/docs/getting-started) primitive and style it with Skeleton tokens and presets through its `class` props, following the [integration guide](https://www.skeleton.dev/docs/svelte/integrations/bits-ui). Put it in [src/components/ui/](../../../src/components/ui/) with a narrow, documented prop contract; views never import `bits-ui` directly. Do not add another component or styling library.
- **Controlled components.** Skeleton components take a value prop and report changes through a callback such as `onValueChange`; they do not use `bind:`. A native input the user clicked has already changed, and the component resynchronises only when its value prop changes. An owner that can reject a change must therefore show the request in the value while it decides and restore the previous value on rejection; see `selectedAppearance` in [shell.svelte.ts](../../../src/lib/state/shell.svelte.ts). Drive Bits UI primitives with a function binding: `bind:value={() => value, onChange}`.
- **Tokens, not literals.** The theme is stock Cerberus with the application tokens in [src/styles.css](../../../src/styles.css). Use colour pairings such as `bg-surface-50-950` and `text-surface-700-300`, which follow the colour mode by themselves. Dark mode comes from `data-mode` on the root element, or from the operating system when it is absent; density comes from `data-density`. Never hard-code a colour, and never add a second dark-mode mechanism.
- **Class names must be complete strings.** Tailwind finds classes by scanning source text, so select between whole class names from a map; never assemble one from fragments. Compose with Svelte's `class={[...]}` arrays and let Oxfmt sort them.
- **Contrast is yours to verify.** Library defaults are not proof: the stock `preset-filled-primary-500` fails WCAG AA for body-size text, which is why primary actions use `preset-primary-action`. Check new colour combinations with axe in both colour modes.
- **Popups.** Render popup content next to its trigger unless clipping forces a portal; body-portalled content sits outside every landmark and fails the axe `region` rule. Give a custom control the matching ARIA pattern explicitly, as [SelectField.svelte](../../../src/components/ui/SelectField.svelte) does with the select-only combobox pattern.
- **Motion.** The stylesheet removes CSS transitions under `prefers-reduced-motion`. Svelte `transition:` directives use the Web Animations API and ignore that rule, so consult `prefersReducedMotion` from `svelte/motion` before adding one.
- Keep reusable components cohesive with explicit props. Use semantic elements and accessible names, visible focus, keyboard actions, and focus restoration for dialogs. Colour alone must not communicate status; [StatusMessage.svelte](../../../src/components/ui/StatusMessage.svelte) states its tone in words.
- Use backend pagination and virtualized large lists. Lazy-load Monaco, terminal, and chart integrations with dynamic `import()`, attach them with `{@attach}`, and dispose their instances in the attachment cleanup.
- The packaged CSP still allows inline *styles*: Skeleton's Zag machines and Bits UI apply inline style attributes for positioning, and removing the allowance has not been assessed in the native WebViews. Scripts stay restricted to bundled files; never add inline scripts, remote assets, or `{@html}` with unsanitised content.

## Keep state and effects honest

- Use TanStack Query's Svelte adapter for backend projections once a view needs caching or subscriptions, and rune-based `.svelte.ts` modules or context for UI-only state. Avoid copying the same server state into several places.
- Include cluster/session identity and relevant namespace, resource type, selectors, and pagination in cache/subscription identity. Prevent responses from an old context populating a new one.
- Prefer context over module-level state for anything scoped to a cluster, tab, or operation, so two open tabs cannot share it by accident.
- Hold wire DTOs in `$state.raw`; they are replaced, not mutated. Treat every prop as changeable and derive from it.
- Model loading, stale, unauthorized, unsupported, empty, partial, and failure states explicitly where reachable. Distinguish absent optional APIs/metrics from a failed cluster connection.
- Keep cluster credentials out of renderer state. Secret reveal/editor flows are explicit, temporary, redacted by default, and excluded from persisted stores and payload logging.

## Preserve mutation review

Render the backend's plan, target identities, validation, diff, disruption, progress, and per-target results. Keep the reviewed scope immutable during execution. Disable duplicate submissions and prevent context changes from retargeting a pending action.

The backend remains authoritative for permissions, stale-plan rejection, operation locks, and execution. Show typed-identity confirmation for destructive workflows from the design. Do not optimistically report a lifecycle operation as successful before backend verification, and distinguish interrupted/uncertain outcomes from a safe retry.

## Verify and document

Run `pnpm check`: Oxfmt, Oxlint with type diagnostics, `svelte-check` with warnings as errors, Vitest, and the production build. A Svelte compiler warning, including every `a11y_*` code, fails the gate; fix its cause instead of adding `svelte-ignore`.

Add user-interaction tests with Testing Library for Svelte for target preservation, permission/error states, validation, confirmation, and changed failure behavior. Prefer accessible queries over internal selectors. jsdom performs no layout: positioned popups stay hidden there and have no computed accessible name, so cover their visibility, keyboard paths, and focus in Playwright. Extend [src/test-setup.ts](../../../src/test-setup.ts) only with an inert stand-in for a browser API that jsdom lacks, and say what it does not prove.

Exercise the affected flow with Playwright, including an axe scan of each new state in both colour modes after the page has settled; [appearance.spec.ts](../../../tests/e2e/appearance.spec.ts) shows how to script native responses at Tauri's IPC entry point. Use actual native Tauri checks for IPC/desktop behavior. Review light/dark themes, keyboard/focus behavior, resize/density, and the packaged CSP as relevant. Cosmetic edits need a rendered check, not artificial tests of exact wording or CSS internals.

Document each reusable component with an `@component` comment and each exported state class with TSDoc: behavioral contract, context and resource ownership, cleanup, and sensitive fields. Update user-flow documentation alongside behavior, review the final diff, and report executed evidence without treating mock transport as native verification.
