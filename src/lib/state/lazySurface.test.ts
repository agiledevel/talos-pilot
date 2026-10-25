import { describe, expect, it } from "vitest";

import { LazySurface } from "./lazySurface.svelte";

const FAILURE = "The synthetic surface could not be loaded. Try again.";

function deferredSurface(): {
  readonly promise: Promise<string>;
  readonly resolve: (value: string) => void;
  readonly reject: (reason: unknown) => void;
} {
  let resolve: (value: string) => void = () => undefined;
  let reject: (reason: unknown) => void = () => undefined;
  const promise = new Promise<string>((next, fail) => {
    resolve = next;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function lazy(load: () => Promise<string>): LazySurface<string> {
  return new LazySurface<string>({ load, failureMessage: FAILURE });
}

describe("lazy surface boundary", () => {
  it("loads once and exposes the imported surface", async () => {
    const surface = lazy(async () => "editor");
    await surface.open();
    expect(surface.status).toBe("ready");
    expect(surface.surface).toBe("editor");
    expect(surface.error).toBeNull();
  });

  it("discards an import that resolves after a close", async () => {
    const wait = deferredSurface();
    const surface = lazy(() => wait.promise);
    const pending = surface.open();
    expect(surface.status).toBe("loading");
    surface.close();
    wait.resolve("late-editor");
    await pending;
    expect(surface.status).toBe("closed");
    expect(surface.surface).toBeNull();
    expect(surface.error).toBeNull();
  });

  it("ignores a stale rejection after a close", async () => {
    const wait = deferredSurface();
    const surface = lazy(() => wait.promise);
    const pending = surface.open();
    surface.close();
    wait.reject(new Error("late failure"));
    await pending;
    expect(surface.status).toBe("closed");
    expect(surface.error).toBeNull();
  });

  it("keeps the newest open attempt when an earlier import resolves late", async () => {
    const first = deferredSurface();
    const second = deferredSurface();
    let call = 0;
    const surface = lazy(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const firstOpen = surface.open();
    const secondOpen = surface.open();
    second.resolve("new-surface");
    await secondOpen;
    expect(surface.surface).toBe("new-surface");
    first.resolve("old-surface");
    await firstOpen;
    expect(surface.surface).toBe("new-surface");
    expect(surface.status).toBe("ready");
  });

  it("lets the newest attempt win even when the earlier one fails later", async () => {
    const first = deferredSurface();
    const second = deferredSurface();
    let call = 0;
    const surface = lazy(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const firstOpen = surface.open();
    const secondOpen = surface.open();
    second.resolve("new-surface");
    await secondOpen;
    first.reject(new Error("stale failure"));
    await firstOpen;
    expect(surface.status).toBe("ready");
    expect(surface.error).toBeNull();
  });

  it("reports a safe failure and allows another attempt", async () => {
    let shouldFail = true;
    const surface = lazy(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("secret-bearing import failure");
      }
      return "editor";
    });
    await surface.open();
    expect(surface.status).toBe("failed");
    expect(surface.surface).toBeNull();
    expect(surface.error).toBe(FAILURE);
    expect(surface.error).not.toMatch(/secret-bearing/u);

    await surface.open();
    expect(surface.status).toBe("ready");
    expect(surface.surface).toBe("editor");
  });

  it("cancels a load that is closed while still pending", async () => {
    const wait = deferredSurface();
    const surface = lazy(() => wait.promise);
    const pending = surface.open();
    surface.close();
    expect(surface.status).toBe("closed");
    expect(surface.surface).toBeNull();
    wait.resolve("late");
    await pending;
    expect(surface.status).toBe("closed");
  });
});
