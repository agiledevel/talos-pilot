# TypeScript

Source: the TypeScript page of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt).

## Setup

Add `lang="ts"` to the `<script>` tags. Svelte itself strips *type-only* syntax: annotations, interfaces, type imports, generics. Syntax that needs code generation is not supported without a preprocessor: enums, constructor parameter properties with access modifiers, and proposals not yet in the ECMAScript standard. Enabling those requires `vitePreprocess({ script: true })`; prefer writing type-only TypeScript instead.

`tsconfig.json` must set `target` to at least `ES2015`, `verbatimModuleSyntax: true`, and `isolatedModules: true`. Import types with `import type`.

Template expressions accept type annotations and `as` casts. Types are checked by `svelte-check` and the editor extension, not by the Vite build.

## Props

```svelte
<script lang="ts">
  import type { Snippet } from "svelte";

  interface Props {
    id: string;
    selected?: boolean;
    onselect: (id: string) => void;
    row: Snippet<[item: Item]>;
    children?: Snippet;
  }

  let { id, selected = false, onselect, row, children }: Props = $props();
</script>
```

Callback props replace events, so type them as functions. Use an index signature only when arbitrary extra props are really accepted.

### Generic components

```svelte
<script lang="ts" generics="Item extends { id: string }">
  interface Props {
    items: readonly Item[];
    onselect: (item: Item) => void;
  }
  let { items, onselect }: Props = $props();
</script>
```

The `generics` attribute holds what would go between `<...>` on a generic function: several parameters, `extends` constraints, and defaults.

### Wrapper components

Extend an element's attribute type from `svelte/elements` and forward the remainder, so callers can pass `id`, `aria-*`, event handlers, and attachments.

```svelte
<script lang="ts">
  import type { HTMLButtonAttributes } from "svelte/elements";

  interface Props extends HTMLButtonAttributes {
    tone?: "primary" | "neutral";
  }
  let { tone = "neutral", children, class: className, ...rest }: Props = $props();
</script>

<button {...rest} class={["btn", tone, className]}>{@render children?.()}</button>
```

Use `SvelteHTMLElements["div"]` for elements without a dedicated interface.

## State

```ts
let count = $state(0); // number
let selected = $state<Item | null>(null);
let pending = $state<Item>(); // Item | undefined
```

For a class field assigned in the constructor, `value = $state() as number` avoids a spurious `undefined`. Use that assertion only where the constructor demonstrably assigns the field.

## Component types

| Type | Meaning |
| --- | --- |
| `Component<Props>` | A component, for a prop that takes a component: `Icon: Component<{ size: number }>`. |
| `ComponentProps<typeof X>` | The props of component `X`. |
| `Snippet<[A, B]>` | A snippet taking parameters `A` and `B`. |
| `typeof X` / `X` | The component function and, for `bind:this`, its instance exports. |

`SvelteComponent` and `ComponentType` are Svelte 4 types.

## Extending DOM typings

Declare an experimental attribute or a custom element by augmenting `svelte/elements` in a `.d.ts` file that is included by `tsconfig.json` and contains `export {}`.
