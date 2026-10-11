---
name: svelte
description: "Write and review Svelte 5 components (.svelte) and rune modules (.svelte.ts): runes, template syntax, snippets, bindings, attachments, styling, context, async, TypeScript, and testing. Extracted from the official Svelte documentation. Use for any Svelte source; pair with talos-pilot-svelte for this project's conventions."
---

# Svelte 5

Framework reference distilled from the official documentation at [svelte.dev/llms.txt](https://svelte.dev/llms.txt) (Svelte package docs, read at Svelte 5.57). It describes the framework only. Project conventions, the component libraries, and the quality gates are in [talos-pilot-svelte](../talos-pilot-svelte/SKILL.md), which takes precedence where the two differ.

Write runes-mode Svelte 5. Do not write Svelte 4 syntax; [legacy.md](references/legacy.md) maps every old construct to its replacement.

## Load the reference you need

| Task | Reference |
| --- | --- |
| `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect`, sharing state between modules | [runes.md](references/runes.md) |
| Markup, `{#if}`/`{#each}`/`{#key}`/`{#await}`, snippets, `{@render}`, `{@html}`, declaration tags | [templates.md](references/templates.md) |
| `bind:`, `{@attach}`, `use:`, transitions, animations, `class`, `style:` | [bindings-and-directives.md](references/bindings-and-directives.md) |
| Scoped and global styles, custom properties, `<svelte:*>` elements, error boundaries | [styling-and-special-elements.md](references/styling-and-special-elements.md) |
| Context, lifecycle, `mount`/`unmount`, stores, `svelte/reactivity`, `svelte/events`, `svelte/motion` | [runtime.md](references/runtime.md) |
| `await` in components, `<svelte:boundary pending>`, `$effect.pending`, `settled`, `fork` (experimental) | [async.md](references/async.md) |
| `lang="ts"`, typing props and snippets, generics, wrapper components, `Component` types | [typescript.md](references/typescript.md) |
| Vitest unit and component tests, runes in tests, Playwright | [testing.md](references/testing.md) |
| Reading or migrating Svelte 4 code | [legacy.md](references/legacy.md) |

## Rules that prevent most defects

- **State.** Use `$state` only for values that must update a template, `$derived`, or `$effect`. Objects and arrays become deep proxies; use `$state.raw` for large values that are only ever reassigned, such as API responses. Do not destructure a reactive proxy: the destructured values stop updating.
- **Derive, do not synchronise.** Compute from state with `$derived` (`$derived.by` for a function body). A derived expression must be free of side effects. Never mirror state into other state from an `$effect`.
- **Effects are an escape hatch.** Use `$effect` to reach outside Svelte: the DOM, a third-party library, a subscription. Return a teardown function. Only values read *synchronously* are dependencies; anything read after an `await` or inside `setTimeout` is not tracked. Prefer an event handler for reactions to user input, `{@attach}` for element-bound libraries, and `createSubscriber` to observe an external source.
- **Props.** Declare with `let { a, b = fallback, ...rest } = $props()`. Treat every prop as changeable: compute dependent values with `$derived` instead of reading the prop once. Do not mutate props; report changes through callback props, or `$bindable` when two-way binding is really intended.
- **Events.** Listeners are attributes: `onclick={handler}`. Components take callback props; there is no event dispatcher. Use `<svelte:window>` and `<svelte:document>` for global listeners instead of `onMount` or `$effect`.
- **Content.** Pass markup with snippets and render it with `{@render children?.()}`. Slots are legacy.
- **Lists.** Key every `{#each}` block with a stable unique identifier, never the index.
- **Shared logic.** Put reusable reactive logic in `.svelte.ts` modules, typically classes with `$state` fields. Exported state must not be reassigned: export an object and mutate its properties, or export accessor functions. Prefer context over module-level state when the state belongs to one part of the tree.
- **Pass state as functions.** Arguments are passed by value. Give a function a getter (`() => count`) or an object with reactive properties when it must see later updates.
- **Classes.** `class={[...]}` and `class={{...}}` accept clsx-style arrays and objects; use them instead of the `class:` directive.
- **`{@html}`** renders unescaped markup. Use it only with content that is trusted or sanitised.
- **Motion.** Svelte transitions run on the Web Animations API, so a CSS `prefers-reduced-motion` rule does not stop them; consult `prefersReducedMotion` from `svelte/motion`.

## Files

- `.svelte` holds an optional `<script module>` (runs once per module, may `export` values but not a default), one `<script>` (runs per instance), markup, and a scoped `<style>`.
- `.svelte.js` and `.svelte.ts` are ordinary modules in which runes are available.
- Runes are compiler keywords: never import them, assign them, or pass them as values.

## Verify

Type errors in scripts and templates, unused CSS, and accessibility warnings are reported by `svelte-check`; see [svelte-tooling](../svelte-tooling/SKILL.md). Compiler warnings such as `state_referenced_locally` or an `a11y_*` code name a real defect: fix the cause instead of silencing it with `<!-- svelte-ignore -->`.
