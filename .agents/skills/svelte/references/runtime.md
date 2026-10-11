# Runtime: context, lifecycle, mounting, and reactive utilities

Source: the Runtime and Reference sections of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt) — context, lifecycle hooks, the imperative component API, stores, and the `svelte/*` modules.

## Context

Context gives descendants access to a value owned by an ancestor without passing props through every layer. It is scoped to one mounted tree, so it does not leak between requests or tests the way module-level state can.

```ts
// context.ts
import { createContext } from "svelte";

export interface Session {
  readonly clusterId: string;
}
export const [getSession, setSession] = createContext<Session>();
```

```svelte
<!-- Parent.svelte -->
<script lang="ts">
  import { setSession } from "./context";
  let { children } = $props();
  setSession({ clusterId: "c1" });
</script>

{@render children()}
```

- `createContext` (Svelte 5.40+) returns typed `[get, set, has]` functions and needs no key. `setContext(key, value)`, `getContext(key)`, `hasContext`, and `getAllContexts` are the untyped alternative.
- Call the setter and getter during component initialisation, not in an event handler or effect.
- Store a `$state` object or a class instance to share reactive state, and mutate its properties. Reassigning the variable breaks the link to the context value. Pass a primitive as a getter function.
- To test a component that reads context, mount a wrapper that sets the context and returns the component (Svelte 5.49+).

## Lifecycle

A Svelte 5 component has only creation and destruction; updates belong to individual effects.

| Function | Behaviour |
| --- | --- |
| `onMount(fn)` | Runs after the component is in the DOM, in the browser only. A function returned *synchronously* is called on unmount; an `async` callback therefore cannot return a cleanup. |
| `onDestroy(fn)` | Runs immediately before unmount. The only hook that also runs during server rendering. |
| `tick()` | A promise that resolves after pending state changes have been applied to the DOM. |
| `settled()` | A promise that resolves when the current update, including async work, is complete. |
| `flushSync(fn?)` | Applies pending updates and runs pending effects synchronously. Mainly for tests. |
| `untrack(fn)` | Reads state inside a derived or effect without creating a dependency. |
| `getAbortSignal()` | An `AbortSignal` that aborts when the running derived or effect re-runs or is destroyed. Pass it to `fetch` to cancel superseded requests. |

`beforeUpdate` and `afterUpdate` are deprecated and unavailable in runes mode; use `$effect.pre` and `$effect`.

## Mounting

```ts
import { mount, unmount } from "svelte";
import App from "./App.svelte";

const app = mount(App, { target: document.body, props: { transport } });
await unmount(app, { outro: true });
```

- `mount` instantiates a component into a target. Effects and `onMount` callbacks do not run during the call; they run in a microtask, or immediately with `flushSync()`.
- `unmount` removes it; `{ outro: true }` plays exit transitions and resolves when they finish.
- `hydrate` attaches to HTML produced by `render` from `svelte/server`; `render` is the server-only counterpart that returns `{ head, body }`.
- `mount` accepts `context` (a `Map`), `intro`, and `events` options.

## Stores

`svelte/store` (`writable`, `readable`, `derived`, `readonly`, `get`) remains for complex asynchronous streams and for interoperating with libraries. For shared state and extracted logic, use runes in `.svelte.ts` modules. Inside a component, `$name` reads a store and subscribes for the component's lifetime. `fromStore` and `toStore` convert between stores and rune-based state.

## `svelte/reactivity`

| Export | Purpose |
| --- | --- |
| `SvelteMap`, `SvelteSet` | Reactive `Map` and `Set`. Their contents are not made deeply reactive. |
| `SvelteDate`, `SvelteURL`, `SvelteURLSearchParams` | Reactive counterparts of the built-ins. |
| `MediaQuery` | `new MediaQuery("min-width: 800px").current` updates as the query result changes. Prefer a CSS media query when CSS can express the same thing. |
| `createSubscriber(start)` | Connects an external event source to reactivity. `start(update)` runs when the first effect begins reading and may return a cleanup; calling `update` re-runs the readers. |

```ts
import { createSubscriber } from "svelte/reactivity";
import { on } from "svelte/events";

export class Visibility {
  #subscribe = createSubscriber((update) => on(document, "visibilitychange", update));

  get hidden(): boolean {
    this.#subscribe();
    return document.hidden;
  }
}
```

`svelte/reactivity/window` exports reactive `innerWidth`, `innerHeight`, `outerWidth`, `outerHeight`, `scrollX`, `scrollY`, `screenLeft`, `screenTop`, `online`, and `devicePixelRatio`, each read through `.current`.

## Other modules

| Module | Exports |
| --- | --- |
| `svelte/events` | `on(target, type, handler, options)` adds a listener that respects delegated event ordering and returns a function that removes it. |
| `svelte/attachments` | `Attachment` type, `createAttachmentKey`, `fromAction`. |
| `svelte/motion` | `Spring` and `Tween` classes with `target` and `current`, and `prefersReducedMotion.current`. |
| `svelte/transition`, `svelte/animate`, `svelte/easing` | Built-in transitions, `flip`, and easing functions. |
| `svelte/elements` | DOM attribute types such as `HTMLButtonAttributes`, `SvelteHTMLElements`, `ClassValue`. |
| `svelte/server` | `render` for server-side rendering. |
| `svelte/compiler` | `compile`, `compileModule`, `parse`, `preprocess`, `migrate`, `VERSION`. |
