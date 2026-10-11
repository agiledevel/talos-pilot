# Styling and special elements

Source: the Styling and Special elements sections of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt).

## Scoped styles

CSS in a component's `<style>` applies only to elements of that component. The compiler adds a hash class to matching elements, which raises specificity by one class (0-1-0), so a component style beats a global rule of otherwise equal specificity. `@keyframes` names are scoped as well. Unused selectors produce a `css_unused_selector` warning.

## Global styles

```svelte
<style>
  :global(body) {
    margin: 0;
  }
  div :global(strong) {
    color: var(--accent);
  }
  .content :global {
    p {
      margin-block: 1em;
    }
  }
</style>
```

`:global(selector)` exempts one selector; a `:global { ... }` block exempts everything inside it. Prefix a keyframe name with `-global-` to share it. Use `:global` to style markup the component does not own, such as `{@html}` output or a library child.

## Custom properties

Pass values to a child's styles with CSS custom properties.

```svelte
<Slider --track-color="black" --thumb-size="1rem" />
```

Svelte renders a wrapper with `display: contents` to carry the properties, which can affect direct-child selectors. The child reads `var(--track-color, fallback)`. To use a script value in CSS, set `style:--name={value}` on an element.

Only one top-level `<style>` per component is processed. A `<style>` nested inside an element or block is inserted into the DOM unscoped.

## Special elements

| Element | Purpose |
| --- | --- |
| `<svelte:boundary>` | Contains rendering and effect errors and shows pending UI; see below. |
| `<svelte:window>` | Window listeners (`onkeydown={...}`) and bindings: `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `scrollX`, `scrollY`, `online`, `devicePixelRatio`. Only the scroll values are writable. |
| `<svelte:document>` | Document listeners such as `onvisibilitychange`, attachments, and read-only bindings: `activeElement`, `fullscreenElement`, `pointerLockElement`, `visibilityState`. |
| `<svelte:body>` | Body listeners such as `onmouseenter`, and attachments. |
| `<svelte:head>` | Inserts into `document.head`, for example `<title>`. |
| `<svelte:element this={tag}>` | Renders an element whose tag is known only at runtime. Nothing renders when `tag` is nullish. `bind:this` is the only supported binding. |
| `<svelte:options>` | Per-component compiler options: `runes={true|false}`, `namespace="svg"`, `customElement={...}`, `css="injected"`. |

`<svelte:window>`, `<svelte:document>`, `<svelte:body>`, and `<svelte:head>` must be at the top level of a component, outside blocks and elements. Use them for global listeners instead of adding listeners in `onMount` or an effect.

A dynamic component needs no special element: render the component value directly, `<Selected {...props} />`.

## `<svelte:boundary>`

```svelte
<svelte:boundary onerror={(error, reset) => report(error)}>
  <FlakyComponent />

  {#snippet pending()}
    <p>Loading</p>
  {/snippet}

  {#snippet failed(error, reset)}
    <button onclick={reset}>Try again</button>
  {/snippet}
</svelte:boundary>
```

- A boundary does something only when it has at least one of `pending`, `failed`, or `onerror`.
- `failed` and `onerror` handle errors thrown while rendering or running effects inside the boundary. The boundary's content is removed; `reset` recreates it. An error thrown from `onerror` propagates to the parent boundary.
- **Not caught:** errors in event handlers, timers, and other asynchronous code outside rendering. Handle those where they occur.
- `pending` is shown until the `await` expressions inside first resolve; see [async.md](async.md).
- On the server a boundary has no effect unless `render` is called with `transformError` (Svelte 5.51+), which must return a serialisable, redacted object.
