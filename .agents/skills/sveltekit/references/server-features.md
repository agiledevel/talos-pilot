# Server features

Source: the form actions, remote functions, hooks, errors, and server-only modules pages of the [SvelteKit docs](https://svelte.dev/docs/kit/llms.txt).

## Form actions

```ts
// src/routes/login/+page.server.ts
import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions: Actions = {
  default: async ({ request, cookies }) => {
    const data = await request.formData();
    const email = data.get("email");
    if (typeof email !== "string" || email === "") {
      return fail(400, { email, missing: true });
    }
    redirect(303, "/");
  },
};
```

- A `<form method="POST">` posts to the `default` action with no JavaScript. Named actions are addressed with `action="?/name"` or a button's `formaction`; a page cannot mix `default` with named actions.
- Return `fail(status, data)` for validation errors so the page re-renders with the `form` prop. Returned data must be serialisable.
- After an action the page's `load` functions rerun.
- `use:enhance` from `$app/forms` submits without a full page reload and applies the same result handling; pass a callback to customise it. Use `deserialize`, never `JSON.parse`, on a manually fetched action response.

## Remote functions (experimental)

Type-safe functions that are called from anywhere but always run on the server. They require `experimental.remoteFunctions` and Svelte's `experimental.async` and may change without notice. They are declared in `*.remote.ts` files with helpers from `$app/server`.

| Helper | Purpose |
| --- | --- |
| `query(schema?, fn)` | Read data. Results are cached per page while in use; call `.refresh()` to refetch. Use with `await` in a component, or read `.current`, `.loading`, `.error`. |
| `form(schema?, fn)` | A mutation spread onto a form: `<form {...createPost}>`. Works without JavaScript; exposes `.result`, field helpers, and `.enhance(...)`. |
| `command(schema?, fn)` | A mutation called from code, such as an event handler. Cannot be called during render. |
| `prerender(schema?, fn, { inputs })` | Data computed at build time. |

Validate arguments with a Standard Schema such as Valibot or Zod as the first argument; the endpoint is public, so never trust the input. After a mutation, refresh affected queries on the server (`getPosts().refresh()`) or from the client (`.updates(getPosts())`), optionally with `withOverride` for optimistic UI.

## Hooks

| Hook | File | Purpose |
| --- | --- | --- |
| `handle({ event, resolve })` | server | Runs for every request: populate `event.locals`, guard routes, transform the response. |
| `handleFetch` | server | Rewrite or authorise server-side `fetch` calls. |
| `init` | server and client | One-time asynchronous setup. |
| `handleError` | server and client | Log an error and return the safe object exposed as `page.error`. In SvelteKit 3 it receives expected errors too. |
| `reroute({ url })` | universal | Map a URL to a different route before routing. |
| `transport` | universal | Encode and decode custom types across the server/client boundary. |

## Errors

- `error(status, message)` produces an expected error: it sets the status and renders the nearest `+error.svelte`. In SvelteKit 3 the message is always a string and extra properties are a third argument.
- Anything else thrown is unexpected: the user sees a generic message and the detail goes to `handleError`. Never forward raw error messages or stacks to the client.
- Declare the error shape as `App.Error` in `src/app.d.ts`.

## Server-only code

Private environment variables (`$app/env/private` in SvelteKit 3), `$app/server`, `*.server.ts` modules, and `src/lib/server/` may be imported only by server code. SvelteKit fails the build when client code can reach them, including through a re-export.
