# Template syntax

Source: the Template syntax section of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt) — basic markup, logic blocks, snippets, and tags.

## Markup

- A lowercase tag is an HTML element. A capitalised tag or dot notation (`<Tabs.Panel>`) is a component.
- Attributes take expressions: `disabled={!ready}`, `class="card {tone}"`. `{name}` is shorthand for `name={name}`. Boolean attributes are omitted when falsy; other attributes are omitted when `null` or `undefined`.
- `{...props}` spreads attributes or props. Later entries win, so order matters.
- Text expressions are escaped. `null` and `undefined` render nothing.
- An HTML comment starting with `svelte-ignore` suppresses the next compiler warning; prefer fixing the cause. A comment starting with `@component` documents the component for editor hover.

## Events

```svelte
<button onclick={save}>Save</button>
<button {onclick}>Shorthand</button>
<input onkeydown={(event) => event.key === "Enter" && submit()} />
```

- Event attributes are case sensitive and are ordinary props: they can be spread and passed through components.
- Handlers fire after bindings have updated. There are no event modifiers; call `event.preventDefault()` in the handler. Add `capture` to the name for the capture phase: `onclickcapture`.
- Common events (`click`, `input`, `change`, `keydown`, `focusin`, pointer and touch events, and others) are delegated to the application root. Dispatch synthetic events with `{ bubbles: true }`, and avoid `stopPropagation` in listeners added with `addEventListener`; use `on` from `svelte/events` so ordering stays correct.
- `ontouchstart` and `ontouchmove` are passive.

## Logic blocks

```svelte
{#if answer === 42}
  <p>yes</p>
{:else if answer > 42}
  <p>too high</p>
{:else}
  <p>too low</p>
{/if}

{#each items as item, index (item.id)}
  <Row {item} {index} />
{:else}
  <p>No items.</p>
{/each}

{#key value}
  <Panel />
{/key}

{#await promise}
  <p>Loading</p>
{:then value}
  <p>{value}</p>
{:catch error}
  <p>{error.message}</p>
{/await}
```

- **`{#each}`** iterates arrays, array-likes, and iterables such as `Map` and `Set`. Supply a key in parentheses that uniquely identifies the item; without one Svelte patches items in place, which breaks component state and transitions. Destructuring works (`as { id, name }`) but do not destructure an item you need to mutate or bind to. `{#each { length: 8 }, i}` repeats without an item.
- **`{#key}`** destroys and recreates its content when the expression changes. It is costly; use it for replaying transitions, not to force a child to recompute something `$derived` could express.
- **`{#await}`** may omit branches: `{#await p then value}` or `{#await p catch error}`. Experimental `await` expressions ([async.md](async.md)) are the newer alternative.

## Snippets

A snippet is a reusable piece of markup declared in the template. It can take parameters with defaults and destructuring, but not rest parameters.

```svelte
{#snippet row(item: Item, selected = false)}
  <tr class={{ selected }}><td>{item.name}</td></tr>
{/snippet}

{#each items as item (item.id)}
  {@render row(item, item.id === current)}
{/each}
```

- A snippet sees everything in its lexical scope and is visible to its siblings and their children. It may reference itself and other snippets.
- Snippets are values. Pass one explicitly as a prop (`<Table {header} {row} />`), or declare it inside the component tag, where it becomes a prop of that name.
- Content inside a component tag that is not a snippet declaration becomes the `children` snippet. A component therefore must not also declare a prop named `children` for another purpose.
- Render with `{@render name(args)}`. For an optional snippet use `{@render children?.()}`, or an `{#if children}` block to provide fallback content.
- Type snippet props with `Snippet<[ParamTypes]>` from `svelte`.
- A top-level snippet that references nothing from the instance `<script>` can be exported from `<script module>`.

## Tags

| Tag | Use |
| --- | --- |
| `{@render snippet(args)}` | Render a snippet. The expression may be any snippet-valued expression. |
| `{@html string}` | Insert raw HTML. Never pass unsanitised input: it is an XSS vector. The content must be valid standalone HTML, and scoped styles do not reach it; style it through `:global`. |
| `{@attach fn}` | Attach behaviour to an element; see [bindings-and-directives.md](bindings-and-directives.md). |
| `{const x = expr}` / `{let x = $state(v)}` | Declaration tags (Svelte 5.56+). Declare a local variable anywhere in markup; visible to siblings and their children. Use `$derived` or `$state` in the initialiser when it must be reactive. |
| `{@const x = expr}` | Older form, allowed only as an immediate child of a block, component, or boundary. Prefer declaration tags. |
| `{@debug a, b}` | Log variables and pause when devtools is open. Accepts variable names only. |
