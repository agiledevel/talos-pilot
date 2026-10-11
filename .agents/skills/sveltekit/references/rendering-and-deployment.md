# Rendering modes and deployment

Source: the page options, building, adapters, single-page apps, static site generation, and project types pages of the [SvelteKit docs](https://svelte.dev/docs/kit/llms.txt).

## Page options

Export these from `+page.ts`, `+page.server.ts`, `+layout.ts`, or `+layout.server.ts`. A layout's value applies to its children unless they override it.

| Option | Effect |
| --- | --- |
| `prerender = true \| false \| "auto"` | Generate static HTML at build time. Dynamic routes need `entries()` or links the crawler can follow. Pages with form actions cannot be prerendered. |
| `ssr = false` | Skip server rendering and send an empty shell that renders in the browser. |
| `csr = false` | Ship no JavaScript: no hydration, no client router, no interactivity. |
| `trailingSlash` | `"never"`, `"always"`, or `"ignore"`. |

Setting both `ssr` and `csr` to `false` renders nothing.

## Build and adapters

`vite build` compiles the application and prerenders, then the configured adapter produces output for the target. Code that must not run during the build is guarded with `building` from `$app/env`. Official adapters cover Node, Bun, static hosting, Cloudflare, Netlify, and Vercel; `adapter-auto` picks one from the environment.

## Single-page application

An application becomes a client-rendered SPA by disabling server rendering at the root and emitting a fallback page.

```ts
// src/routes/+layout.ts
export const ssr = false;
```

```ts
// vite.config.ts (SvelteKit 3: configuration lives in the Vite plugin)
import adapter from "@sveltejs/adapter-static";
import { sveltekit } from "@sveltejs/kit/vite";
import { defineConfig } from "vite";

export default defineConfig({
  plugins: [sveltekit({ adapter: adapter({ fallback: "200.html" }) })],
});
```

- `adapter-static` works only when no route needs a server: no `+page.server.ts`, `+layout.server.ts`, or `+server.ts`, and therefore no form actions or remote functions.
- The fallback page always uses absolute asset paths.
- SPA mode costs startup time on the open web. It suits an application served locally, such as one wrapped in a desktop or mobile shell. Individual pages can still be prerendered by setting `prerender = true` and `ssr = true` on them.

## Hash routing

`router: { type: "hash" }` makes the route come from `location.hash`. Server rendering and prerendering are disabled, and links must be written as `#/path`. The documentation recommends it only when pathname routing is impossible, for example when the host cannot rewrite unknown paths to the fallback page.

## Desktop and mobile shells

The documentation lists Tauri, Wails, and Electron for turning a SvelteKit SPA into a desktop application, and Tauri or Capacitor for mobile. In all of them the web layer is a static SPA: server `load` functions, form actions, endpoints, and remote functions are unavailable, and data comes from the shell's own bridge.

Points to settle before adopting SvelteKit in such a shell:

- SvelteKit injects an inline bootstrap script into its HTML. A Content Security Policy without `'unsafe-inline'` for scripts needs SvelteKit's `csp` configuration (hashes for prerendered or fallback pages) or the shell's own hashing of bundled assets.
- Build-time entry injection that relies on Vite's `index.html` pipeline does not apply, because SvelteKit generates its HTML from `src/app.html`.
- SvelteKit 3 requires Node 22.17+, TypeScript 6, Svelte 5.57.1+, Vite 8.0.12+, and `@sveltejs/vite-plugin-svelte` 7.
