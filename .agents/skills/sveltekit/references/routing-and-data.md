# Routing and data

Source: the Getting started and Core concepts sections of the [SvelteKit docs](https://svelte.dev/docs/kit/llms.txt) — project structure, routing, loading data, state management, and advanced routing.

## Project layout

| Path | Purpose |
| --- | --- |
| `src/routes/` | Routes. |
| `src/lib/` | Shared code, imported through the `#lib` subpath import declared in `package.json` (SvelteKit 3; `$lib` in version 2). `src/lib/server/` is server-only. |
| `src/params.ts` | Route parameter matchers, declared with `defineParams` (SvelteKit 3). |
| `src/app.html` | Page template with `%sveltekit.head%` and `%sveltekit.body%`. |
| `src/hooks.server.ts`, `src/hooks.client.ts`, `src/hooks.ts` | Hooks. |
| `static/` | Files served as-is. |
| `.svelte-kit/` | Generated; never commit it. |

Scaffold with `npx sv create`. `@sveltejs/kit`, `svelte`, `vite`, and the adapter are `devDependencies`.

## Route files

| File | Role |
| --- | --- |
| `+page.svelte` | The page. Receives `data` (and `form`) props; type them with `PageProps` from `./$types`. |
| `+page.ts` | Universal `load`: runs on the server for the first render and in the browser afterwards. May export `prerender`, `ssr`, `csr`. |
| `+page.server.ts` | Server-only `load` and form `actions`. Return values must be serialisable. |
| `+layout.svelte` | Wraps child routes; must render `{@render children()}`. Layouts nest. |
| `+layout.ts`, `+layout.server.ts` | `load` for a layout; its data is available to every child. |
| `+error.svelte` | Error boundary for the route subtree; reads `page.status` and `page.error`. |
| `+server.ts` | An endpoint exporting `GET`, `POST`, and other method handlers, plus an optional `fallback`. |

Route syntax: `[slug]` is a parameter, `[...rest]` a rest parameter, `[[optional]]` an optional parameter, `[id=matcher]` a matched parameter, `(group)` a layout group that does not affect the URL, and `+page@segment.svelte` resets the layout chain.

## Loading data

```ts
// src/routes/items/[id]/+page.ts
import type { PageLoad } from "./$types";

export const load: PageLoad = async ({ params, fetch, parent, depends }) => {
  const response = await fetch(`/api/items/${params.id}`);
  return { item: await response.json() };
};
```

- `load` receives `params`, `url`, `route`, `fetch`, `setHeaders`, `parent`, `depends`, and `untrack`. Server `load` additionally receives `cookies`, `locals`, `request`, and `platform`.
- Use the provided `fetch`: it resolves relative URLs on the server, forwards credentials, and inlines responses into the HTML to avoid a second request.
- A universal `load` may return any value, including classes and components. A server `load` returns data serialisable by devalue, and may return unawaited promises to stream them.
- `await parent()` reads data from parent layouts; call it after independent work to avoid a waterfall.
- `load` reruns when a `params` or `url` property it read changes, when a parent reran and it called `parent()`, or when a dependency is invalidated with `invalidate(url)` or a `depends("app:key")` key.
- Throw `error(status, message)` for expected failures and `redirect(status, location)` to redirect. Both are imported from `@sveltejs/kit`.
- Keep `load` pure. Do not write to shared state from it.
- A layout `load` does not rerun on every client navigation, so it is not a reliable place for authorisation. Check access in the `handle` hook or in each server `load`.

## Navigation and state

| API | Use |
| --- | --- |
| `page` from `$app/state` | Reactive `url`, `params`, `route`, `data`, `form`, `state`, `status`, `error`. |
| `navigating`, `updated` from `$app/state` | In-flight navigation and new-deployment detection. |
| `goto(url, options)` | Programmatic navigation. In SvelteKit 3 it also performs shallow routing with `{ shallow: true, state }`. |
| `invalidate`, `refreshAll` | Rerun `load` functions. |
| `beforeNavigate`, `onNavigate`, `afterNavigate` | Navigation lifecycle. |
| `preloadData`, `preloadCode` | Warm a route before navigating. |
| `resolve`, `asset` from `$app/paths` | Build internal paths that respect the configured base. |

Link behaviour is tuned with attributes: `data-sveltekit-preload-data="hover|tap"`, `data-sveltekit-preload-code`, `data-sveltekit-reload`, `data-sveltekit-replacestate`, `data-sveltekit-keepfocus`, and `data-sveltekit-noscroll`.

State guidance: keep state that should survive a reload or be shareable in the URL; keep per-tree state in context set by a layout; use snapshots for ephemeral form state across history navigation. Components are reused across navigations, so derive from `data` with `$derived` instead of copying it once.
