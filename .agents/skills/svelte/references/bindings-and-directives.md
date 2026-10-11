# Bindings, attachments, and directives

Source: the Template syntax section of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt) — `bind:`, `{@attach}`, `use:`, `transition:`, `in:`/`out:`, `animate:`, `style:`, `class`.

## `bind:`

Data flows down by default; `bind:` lets a value flow back up from an element or a `$bindable` component prop. `bind:value` is shorthand for `bind:value={value}`.

| Target | Bindings |
| --- | --- |
| `<input>` | `bind:value` (a number for `type="number"`/`"range"`; empty or invalid input gives `undefined`), `bind:checked`, `bind:indeterminate`, `bind:group` for radio and checkbox sets, `bind:files` |
| `<select>` | `bind:value` (the selected option's `value`; an array with `multiple`) |
| `<textarea>` | `bind:value` |
| `<details>` | `bind:open` |
| Media elements | Two-way: `currentTime`, `playbackRate`, `paused`, `volume`, `muted`. Read-only: `duration`, `buffered`, `seekable`, `seeking`, `ended`, `readyState`, `played`; video adds `videoWidth`, `videoHeight` |
| `contenteditable` | `bind:innerHTML`, `bind:innerText`, `bind:textContent` |
| Any element (read-only) | `bind:clientWidth`, `bind:clientHeight`, `bind:offsetWidth`, `bind:offsetHeight`, `bind:contentRect`, `bind:contentBoxSize`, `bind:borderBoxSize`, `bind:devicePixelContentBoxSize` |
| Any element or component | `bind:this={ref}`; the reference is `undefined` until mount, so read it in an effect or handler |
| Component | `bind:prop={value}` for props the child declared with `$bindable` |

A form input with a `defaultValue` or `defaultChecked` attribute resets to that default instead of an empty value.

### Function bindings

`bind:property={get, set}` (Svelte 5.9+) validates or transforms on the way through and builds a controlled input without an effect. Use `null` as the getter for read-only bindings.

```svelte
<input bind:value={() => value, (next) => (value = next.toLowerCase())} />
<div bind:clientWidth={null, onresize}>...</div>
```

## `{@attach}`

An attachment is a function that receives the element when it mounts and may return a cleanup function. It runs inside an effect, so it re-runs when state it reads changes (Svelte 5.29+).

```svelte
<script lang="ts">
  import type { Attachment } from "svelte/attachments";

  function tooltip(content: string): Attachment {
    return (element) => {
      const instance = createTooltip(element, { content });
      return () => instance.destroy();
    };
  }
</script>

<button {@attach tooltip(label)}>Hover</button>
<div {@attach enabled && measure}>...</div>
```

- `{@attach factory(arg)}` is recreated when `arg` changes. If setup is expensive, pass a getter and read it in a nested `$effect` inside the attachment.
- Falsy values mean "no attachment".
- On a component, an attachment becomes a symbol-keyed prop. A wrapper that spreads its remaining props onto an element forwards it.
- `createAttachmentKey` adds an attachment to an object that will be spread; `fromAction` converts an action from a library.

## `use:` actions

Actions are the older mechanism: `use:action={param}` runs once at mount and does not re-run when the parameter changes. Use attachments in new code.

## Transitions and animations

```svelte
<script>
  import { fade, fly } from "svelte/transition";
  import { flip } from "svelte/animate";
</script>

{#if visible}
  <div transition:fade={{ duration: 150 }}>...</div>
  <div in:fly={{ y: 20 }} out:fade>...</div>
{/if}

{#each items as item (item.id)}
  <li animate:flip={{ duration: 200 }}>{item.name}</li>
{/each}
```

- `transition:` is bidirectional and reversible mid-flight; `in:` and `out:` are independent and do not reverse.
- Transitions are local: they play when their own block is created or destroyed, not a parent block. Add `|global` to play with any ancestor block.
- Built-ins are `fade`, `blur`, `fly`, `slide`, `scale`, `draw`, and `crossfade`. A custom transition is a function `(node, params, { direction })` returning `{ delay, duration, easing, css, tick }`; prefer `css` over `tick` because it runs off the main thread.
- Elements emit `introstart`, `introend`, `outrostart`, and `outroend`.
- `animate:` applies to an immediate child of a keyed `{#each}` and runs when items are reordered, not when they are added or removed.
- Transitions use the Web Animations API. A CSS `prefers-reduced-motion` rule does not affect them; read `prefersReducedMotion.current` from `svelte/motion` and shorten or skip the transition.

## `class` and `style:`

```svelte
<div class={["card", size, { selected, disabled: !enabled }, className]}>...</div>
<div style:color style:--columns={columns} style:width|important="100%">...</div>
```

- `class` accepts a string, or (Svelte 5.16+) an object or array resolved with clsx semantics: truthy keys and entries are included, arrays flatten. This is how a component merges a `class` prop with its own classes. Type such a prop as `ClassValue` from `svelte/elements`.
- The `class:name={condition}` directive still works; prefer the object and array forms.
- `style:property={value}` sets one declaration and takes precedence over a `style` attribute. `style:--name` sets a custom property that a scoped `<style>` can read with `var(--name)`.
