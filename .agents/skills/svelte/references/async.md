# Asynchronous Svelte (experimental)

Source: the `await` and `<svelte:boundary>` pages and the hydratable-data page of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt).

Since Svelte 5.36 the `await` keyword may appear at the top level of a component `<script>`, inside `$derived(...)`, and in markup. The feature is **experimental**: it requires `compilerOptions.experimental.async: true`, and its behaviour may change outside a major release. Do not enable it in a project without an explicit decision; the stable alternative is to load data in a `.svelte.ts` module or event handler and render from state, or to use `{#await}`.

```svelte
<script>
  let { id } = $props();
  const item = $derived(await loadItem(id));
</script>

<svelte:boundary>
  <h1>{item.name}</h1>
  <p>{await loadSummary(id)}</p>

  {#snippet pending()}
    <p>Loading</p>
  {/snippet}
</svelte:boundary>
```

## Behaviour

- **Synchronised updates.** When an `await` expression depends on state, the UI does not show the new state until the asynchronous work completes, so the screen never mixes old and new values. A later fast update may overtake an earlier slow one.
- **Concurrency.** Independent `await` expressions in markup run in parallel. Sequential `await`s in a script run in order like any JavaScript. Independent `$derived(await ...)` declarations are created in order but update independently afterwards; Svelte warns with `await_waterfall` when work was serialised needlessly.
- **Loading states.** A boundary's `pending` snippet shows only while the boundary first resolves. For later updates read `$effect.pending()`, the number of pending promises in the current boundary, or await `settled()`.
- **Immediate feedback.** `$state.eager(value)` reads a value without waiting for synchronised updates.
- **Errors** in `await` expressions go to the nearest boundary with `failed` or `onerror`.
- **Cancellation.** `getAbortSignal()` inside a derived or effect returns a signal that aborts when it re-runs or is destroyed.
- **Dependencies.** State read after an `await` inside the `$derived` expression itself is tracked; state read inside a function the expression calls is not.

## Related APIs

- `fork(fn)` (5.42+) starts work speculatively, for example on hover; call `commit()` to apply it or `discard()` to drop it.
- `hydratable(key, fn)` reuses a value computed during server rendering when the client hydrates. It emits an inline script, so under a Content Security Policy `render` needs a `csp.nonce`. It is irrelevant to a client-only application.
- With the flag enabled, block effects such as `{#if}` and `{#each}` run before `$effect.pre` in the same component.
