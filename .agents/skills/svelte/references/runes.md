# Runes

Source: the Runes section of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt) — `$state`, `$derived`, `$effect`, `$props`, `$bindable`, `$inspect`, `$host`.

Runes are compiler keywords with a `$` prefix. They need no import, are not values, and are valid only in `.svelte`, `.svelte.js`, and `.svelte.ts` files.

## `$state`

```ts
let count = $state(0);
let todos = $state([{ done: false, text: "write docs" }]);
todos[0].done = true; // a deep proxy: this mutation updates the UI
todos.push({ done: false, text: "ship" }); // so does this
```

- Plain objects and arrays become deeply reactive proxies. Class instances, `Map`, `Set`, `Date`, and `URL` are not proxied; use the reactive classes from `svelte/reactivity` (see [runtime.md](runtime.md)).
- Destructuring a proxy copies the current values; the copies do not update.
- Class fields may be state. Methods lose `this` when detached, so call them through an arrow function (`onclick={() => todo.reset()}`) or define them as arrow-function fields.

```ts
class Todo {
  done = $state(false);
  text = $state("");
  constructor(text: string) {
    this.text = text;
  }
}
```

| Variant | Behaviour |
| --- | --- |
| `$state.raw(value)` | Not proxied. Only reassignment triggers updates; mutation does nothing. Use for large values that are replaced whole. |
| `$state.snapshot(proxy)` | A static, plain copy of a proxy for APIs that reject proxies, such as `structuredClone`. |
| `$state.eager(value)` | Reads a value immediately when an `await` expression would otherwise delay the UI update. Use sparingly, only for feedback to a user action. |

### Sharing state

Arguments are passed by value. To let a function observe later changes, pass a getter or an object whose properties are reactive.

```ts
function double(getCount: () => number) {
  return {
    get value() {
      return getCount() * 2;
    },
  };
}
```

A `.svelte.ts` module may not export state that it reassigns, because importers receive the signal object rather than its value. Export an object and mutate it, or export functions.

```ts
// Allowed: the binding is never reassigned.
export const counter = $state({ count: 0 });

// Allowed: the state stays private.
let total = $state(0);
export const getTotal = () => total;
export const add = (n: number) => (total += n);
```

## `$derived`

```ts
let doubled = $derived(count * 2);
let total = $derived.by(() => {
  let sum = 0;
  for (const n of numbers) sum += n;
  return sum;
});
```

- `$derived` takes an expression, `$derived.by` takes a function. Both must be free of side effects; assigning state inside them is an error.
- Dependencies are whatever is read synchronously while the expression runs. Use `untrack` from `svelte` to read a value without depending on it.
- Evaluation is lazy and memoised: a derived recalculates when read after a dependency changed, and downstream updates are skipped when the new value is identical to the old one.
- Derived values are not proxied. A derived that returns part of a `$state` proxy still refers to that proxy.
- A derived declared with `let` can be reassigned to override it temporarily, for optimistic UI; it reverts when a dependency changes (Svelte 5.25+).
- Destructuring a derived (`let { a, b } = $derived(source())`) makes each variable reactive.

## `$effect`

```ts
$effect(() => {
  const id = setInterval(tick, delay); // `delay` is a dependency
  return () => clearInterval(id); // runs before a re-run and on destroy
});
```

- Runs after the component mounts and again, in a microtask after the DOM updates, whenever a dependency changes. Effects never run during server rendering.
- Dependencies are values read synchronously in the function body, including through function calls. Values read after an `await`, in a timer, or in a callback are not tracked.
- An effect depends on the object it reads, not on changes inside it, unless it reads those properties.
- Conditional reads matter: only the branches that ran in the last execution are dependencies.

| Variant | Purpose |
| --- | --- |
| `$effect.pre(fn)` | Runs before the DOM update, for example to capture scroll position. |
| `$effect.tracking()` | `true` inside an effect or template; for building abstractions. |
| `$effect.pending()` | Number of unresolved promises in the current boundary; see [async.md](async.md). |
| `$effect.root(fn)` | A manually owned effect scope that returns its own cleanup function; needed outside component initialisation and in tests. |

### When not to use `$effect`

Do not update state inside an effect to keep two values in step. It causes extra renders and can loop.

| Need | Use |
| --- | --- |
| A value computed from other state | `$derived` |
| A reaction to user input | The event handler |
| Two controls that drive each other | Callbacks or a function binding (`bind:value={get, set}`) |
| A library bound to an element | `{@attach}` |
| Observing an external event source | `createSubscriber` from `svelte/reactivity` |
| Debug logging | `$inspect` |

Never guard an effect body with a "browser" check; effects do not run on the server.

## `$props`

```svelte
<script lang="ts">
  interface Props {
    title: string;
    count?: number;
    onselect?: (id: string) => void;
  }
  let { title, count = 0, onselect, ...rest }: Props = $props();
</script>
```

- Fallback values apply when the parent omits the prop or passes `undefined`. A fallback object is not made reactive.
- Rename with `let { class: className } = $props()`.
- A component may temporarily reassign a prop for ephemeral state, but must not mutate it unless it is `$bindable`. Mutating a plain-object prop has no effect; mutating a parent's proxy triggers an `ownership_invalid_mutation` warning.
- Reading a prop once at initialisation captures only its first value (`state_referenced_locally` warning). Wrap dependent values in `$derived`.
- `$props.id()` returns an identifier unique to the component instance and stable across server rendering and hydration. Use it for `id`/`for`/`aria-*` links.

## `$bindable`

```svelte
<script lang="ts">
  let { value = $bindable(""), ...rest }: { value?: string } = $props();
</script>

<input bind:value {...rest} />
```

A parent may then write `<FancyInput bind:value={message} />`, and the child may assign or mutate the prop. Data should normally flow down and events up; add `$bindable` only where two-way binding is the intended contract.

## `$inspect`

Development-only; removed from production builds.

- `$inspect(a, b)` logs whenever its arguments change, tracking deeply.
- `$inspect(value).with((type, value) => { ... })` replaces `console.log`; `type` is `"init"` or `"update"`.
- `$inspect.trace(label?)` as the first statement of an effect or derived body reports which dependency caused a re-run.

## `$host`

Available only in a component compiled as a custom element; returns the host element, for example to dispatch a `CustomEvent`.
