# SvelteKit 3 changes

Source: the "Migrating to SvelteKit v3" page of the [SvelteKit docs](https://svelte.dev/docs/kit/llms.txt). Many examples elsewhere still show SvelteKit 2; translate them with this table. `npx sv migrate sveltekit-3` automates the changes it can identify safely and leaves `@migration-task` comments for the rest.

## Requirements

Node 22.17+, TypeScript 6, Svelte 5.57.1+, Vite 8.0.12+, `@sveltejs/vite-plugin-svelte` 7.

## Renames and removals

| SvelteKit 2 | SvelteKit 3 |
| --- | --- |
| `svelte.config.js` with `kit: { ... }` | Options passed to `sveltekit({ ... })` in `vite.config.js`; `kit.*` options are top-level, next to `compilerOptions`. |
| `$lib/foo` | `#lib/foo.js`, declared under `imports` in `package.json`; file extensions are required. |
| `$app/environment` | `$app/env` |
| `$env/static/*`, `$env/dynamic/*` | `$app/env/private`, `$app/env/public` (the old modules are deprecated) |
| `$app/stores` (`$page`, `$navigating`, `$updated`) | `$app/state` (`page`, `navigating`, `updated`), read without the `$` prefix |
| `$service-worker` | `$app/env`, `$app/manifest`, `$app/paths`, and `$app/service-worker` |
| `pushState(url, state)`, `replaceState(url, state)` | `goto(url, { shallow: true, state })`, adding `replace: true` |
| `invalidateAll()` | `refreshAll()`, which keeps `page.state` |
| `goto` options `replaceState`, `keepFocus`, `noScroll`, `invalidateAll` | `replace`, `reset: false`, `refreshAll` |
| `base`, `assets`, `resolveRoute` from `$app/paths` | `resolve(...)`, `asset(...)`; paths no longer start with `/` |
| `src/params/<name>.js` matcher files | One `src/params.ts` using `defineParams` from `@sveltejs/kit/params` |
| `json(...)`, `text(...)` | `Response.json(...)`, `new Response(text)` |
| `csrf.checkOrigin`, `prerender.origin` | `csrf.trustedOrigins`, `paths.origin` |
| `Handle` and other hook types from `@sveltejs/kit` | `@sveltejs/kit/hooks` |

## Behaviour changes

- `goto` rejects for a URL that does not resolve to a route in the application. Assign `window.location.href` for an external URL.
- `page.url` is read-only. Copy it with `new URL(page.url.href)` before changing it.
- Shallow routing triggers the navigation hooks; check the `shallow` property to filter.
- `preloadData` can return `{ type: "error", status, error }`.
- `error(status, message, extra?)` takes a string message; additional properties are the third argument. `App.Error` always includes `status`.
- `handleError` receives every error, including expected ones, and may set the response status. `handleValidationError` is removed; validation failures arrive with `kind: "validation"`.
- Rendering errors are handled by error boundaries without an experimental flag.
- `updated.current` becomes `true` automatically when a new deployment is detected; `version.pollInterval` defaults to one hour.
- A form using `use:enhance` with an `action` on another page navigates to that page.
- Cross-origin form submissions need a `Content-Type` header. Cookie paths default to `/`.
- Server instrumentation loads automatically from `src/instrumentation.server.js`.
