---
name: sveltekit
description: "Reference for SvelteKit: filesystem routing, load functions, form actions, remote functions, page options, adapters, SPA and static output, hooks, and the SvelteKit 3 changes. Extracted from the official SvelteKit documentation. Talos Pilot does not use SvelteKit; use this only when evaluating or adopting it, or when reading SvelteKit-specific examples."
---

# SvelteKit

Framework reference distilled from the SvelteKit documentation linked from [svelte.dev/llms.txt](https://svelte.dev/llms.txt) (read at SvelteKit 3.0).

**Talos Pilot is not a SvelteKit application.** The renderer is a client-only Svelte bundle built by Vite and loaded by Tauri; see [0008](../../../docs/decisions/0008-svelte-skeleton-renderer.md). Nothing here applies to current project code. `$app/*`, `#lib`, `+page.svelte`, `load`, and form actions do not exist in this repository, and examples that use them must be translated to plain Svelte before use. Adopting SvelteKit is a stack change that needs an owner decision.

## What SvelteKit adds to Svelte

A filesystem router, data loading tied to routes, server rendering and prerendering, form handling that works without JavaScript, server endpoints, and deployment adapters.

| Topic | Reference |
| --- | --- |
| Project layout, routes, layouts, `load`, navigation, state | [routing-and-data.md](references/routing-and-data.md) |
| Form actions, remote functions, hooks, errors, server-only code | [server-features.md](references/server-features.md) |
| Page options, SPA mode, static output, hash routing, adapters, desktop packaging | [rendering-and-deployment.md](references/rendering-and-deployment.md) |
| What changed in SvelteKit 3 | [v3-changes.md](references/v3-changes.md) |

## Core rules

- A directory under `src/routes` is a URL path. Files prefixed with `+` are route files; anything else in the directory is ignored by the router and may hold colocated components.
- Load data in `load` functions, not in components. Return it and read it through the `data` prop.
- Code in `+page.server.js`, `+layout.server.js`, `+server.js`, `*.server.js`, and `src/lib/server/` runs only on the server. Never import it from client code; the build fails if a client import chain reaches it.
- Do not keep per-user data in module-level variables on the server: the process is shared between requests. Use `event.locals`, cookies, or context.
- Read page state from `$app/state` (`page`, `navigating`, `updated`). `$app/stores` is removed in SvelteKit 3.
- Use `<a href>` for navigation and `goto` only for programmatic navigation.
