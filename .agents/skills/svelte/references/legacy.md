# Legacy syntax and migration

Source: the Legacy APIs section and the Svelte 5 migration guide of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt).

Svelte 5 still compiles Svelte 3/4 syntax in *legacy mode*, chosen per component when it uses no runes. A component cannot mix the two modes. New code is runes mode only; use this table to read old code or a library example and to migrate it.

| Legacy (Svelte 3/4) | Svelte 5 |
| --- | --- |
| `let count = 0` at the top level is reactive | `let count = $state(0)` |
| `$: doubled = count * 2` | `const doubled = $derived(count * 2)` |
| `$: { sideEffect(count) }` | `$effect(() => { sideEffect(count) })`, and only when no better tool fits |
| `export let name = "x"` | `let { name = "x" } = $props()` |
| `$$props`, `$$restProps` | `let { ...rest } = $props()` |
| `export let value` used with `bind:value` | `let { value = $bindable() } = $props()` |
| `on:click={handler}` | `onclick={handler}` |
| `on:click\|preventDefault={handler}` | Call `event.preventDefault()` in the handler |
| `on:click` with no value (forwarding) | Accept and pass an `onclick` prop, or spread `{...rest}` |
| `createEventDispatcher()` and `dispatch("save", data)` | A callback prop: `onsave(data)` |
| `<slot />` | `{@render children?.()}` |
| `<slot name="header" {item} />` | `{@render header?.(item)}` |
| `<div slot="header" let:item>` | `{#snippet header(item)}...{/snippet}` |
| `$$slots.header` | `header` (the snippet prop is `undefined` when absent) |
| `<svelte:fragment slot="x">` | A snippet |
| `<svelte:component this={C} />` | `<C />`; components are dynamic by default |
| `<svelte:self />` | Import the component into itself |
| `<script context="module">` | `<script module>` |
| `new Component({ target, props })` | `mount(Component, { target, props })` |
| `component.$destroy()`, `$set`, `$on` | `unmount(component)`, `$state` props, callback props |
| `beforeUpdate`, `afterUpdate` | `$effect.pre`, `$effect` |
| Stores for shared state | `$state` in `.svelte.ts` modules, or context |
| `use:action` | `{@attach attachment}` |
| `class:active={isActive}` | `class={{ active: isActive }}` |
| `{@const x = y}` | `{const x = y}` (5.56+) |
| `SvelteComponent`, `ComponentType` types | `Component`, `ComponentProps` |
| `tweened`, `spring` stores | `Tween`, `Spring` classes |

## Behaviour changes to remember

- Components are functions, not classes. `bind:this` on a component exposes only what it exports with `export`.
- `onMount`, effects, and attachments do not run synchronously during `mount`.
- Event attributes on the same element do not stack; one handler per event name. Combine handlers in a function.
- Whitespace between nodes collapses more aggressively, and elements must be valid HTML nesting.
- Scoped CSS uses `:where(.hash)` for additional selectors, so specificity differs slightly from Svelte 4.
- `npx sv migrate svelte-5` performs the mechanical part of a migration; review its output, since `$: ` statements become `$effect` or a `run` helper that should be rewritten properly.
