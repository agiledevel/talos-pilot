import { describe, expect, it } from "vitest";
import { EditorRuntimeDiagnostics, OwnedListeners } from "./editorRuntimeDiagnostics.svelte";

function fakeWorker(): { terminate: () => void } {
  return { terminate: () => undefined };
}

describe("editor runtime counters", () => {
  it("counts a tracked worker until its first termination", () => {
    const runtime = new EditorRuntimeDiagnostics();
    const worker = fakeWorker();
    const tracked = runtime.trackWorker(worker);
    expect(tracked).toBe(worker);
    expect(runtime.workers).toBe(1);

    tracked.terminate();
    expect(runtime.workers).toBe(0);
    tracked.terminate();
    runtime.trackWorker(tracked);
    expect(runtime.workers).toBe(0);
  });

  it("ignores unmatched model and listener removals instead of going negative", () => {
    const runtime = new EditorRuntimeDiagnostics();
    runtime.modelDisposed();
    runtime.listenerRemoved();
    expect(runtime.models).toBe(0);
    expect(runtime.listeners).toBe(0);

    runtime.modelCreated();
    runtime.modelCreated();
    runtime.modelDisposed();
    expect(runtime.models).toBe(1);
  });
});

describe("owned editor listeners", () => {
  it("removes every DOM listener and disposable exactly once", () => {
    const runtime = new EditorRuntimeDiagnostics();
    const listeners = new OwnedListeners(runtime);
    const target = new EventTarget();
    let calls = 0;
    let disposed = 0;
    const handler = (): void => {
      calls += 1;
    };
    listeners.add(target, "ping", handler);
    listeners.addDisposable(() => {
      disposed += 1;
    });
    expect(runtime.listeners).toBe(2);

    target.dispatchEvent(new Event("ping"));
    expect(calls).toBe(1);
    listeners.dispose();
    expect(runtime.listeners).toBe(0);
    expect(disposed).toBe(1);

    target.dispatchEvent(new Event("ping"));
    expect(calls).toBe(1);
    listeners.dispose();
    expect(runtime.listeners).toBe(0);
    expect(disposed).toBe(1);
  });
});
