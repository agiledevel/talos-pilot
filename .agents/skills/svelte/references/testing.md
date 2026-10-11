# Testing

Source: the Testing page of the [Svelte docs](https://svelte.dev/docs/svelte/llms.txt).

## Vitest configuration

Component tests need a DOM environment and the *browser* build of Svelte. Either set `resolve.conditions` to `["browser"]` when `process.env.VITEST` is set, or use the `svelteTesting()` plugin from `@testing-library/svelte/vite`, which does that and registers automatic cleanup.

```ts
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [svelte(), svelteTesting()],
  test: { environment: "jsdom" },
});
```

## Logic in rune modules

Test `.svelte.ts` logic directly; it needs no component. A test file may itself use runes when its name contains `.svelte`, for example `counter.svelte.test.ts`.

```ts
import { flushSync } from "svelte";
import { expect, test } from "vitest";
import { Counter } from "./counter.svelte";

test("doubles the count", () => {
  const counter = new Counter();
  counter.increment();
  expect(counter.doubled).toBe(2);
});

test("logs each change", () => {
  const cleanup = $effect.root(() => {
    let count = $state(0);
    const log = logger(() => count); // uses $effect internally
    flushSync();
    expect(log).toEqual([0]);
    count = 1;
    flushSync();
    expect(log).toEqual([0, 1]);
  });
  cleanup();
});
```

- State and derived values can be read synchronously.
- Effects run in a microtask. Code under test that creates effects outside a component must run inside `$effect.root`, and the test calls `flushSync()` to run pending effects before asserting.

Before writing a component test, check whether the behaviour is logic that could be extracted and tested this way.

## Components

The low-level API is `mount`, `flushSync`, and `unmount` from `svelte`. `@testing-library/svelte` is less brittle because it queries the way a user perceives the page.

```ts
import { render, screen } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import Picker from "./Picker.svelte";

test("reports the chosen option", async () => {
  const user = userEvent.setup();
  const onselect = vi.fn();
  const view = render(Picker, { props: { options: ["a", "b"], onselect } });

  await user.click(screen.getByRole("button", { name: "b" }));
  expect(onselect).toHaveBeenCalledWith("b");

  await view.rerender({ options: ["a"] });
  view.unmount();
});
```

- `render(Component, { props })` returns `rerender`, `unmount`, `container`, and bound queries.
- Await `user-event` calls and use `findBy*` or `waitFor` for results of asynchronous work; DOM updates are batched in a microtask.
- For two-way bindings, context, or snippet props, write a small wrapper component for the test and render that.
- jsdom performs no layout and lacks APIs such as `ResizeObserver` and pointer capture. Assertions about geometry, positioning, or focus trapping belong in a real browser.

## Browser and end-to-end tests

Playwright tests are unaware of Svelte: they drive the built or served application through the DOM. Storybook's Vitest integration runs component stories in a real browser when that is in use.
