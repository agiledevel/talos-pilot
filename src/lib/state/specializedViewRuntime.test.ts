import { afterEach, describe, expect, it, vi } from "vitest";

import {
  SpecializedViewDiagnostics,
  OwnedSpecializedResources,
  terminalRuntime,
} from "./specializedViewRuntime.svelte";

afterEach(() => {
  vi.useRealTimers();
});

class FakeTarget {
  readonly added: string[] = [];
  readonly removed: string[] = [];

  addEventListener(type: string): void {
    this.added.push(type);
  }

  removeEventListener(type: string): void {
    this.removed.push(type);
  }
}

describe("specialized view diagnostics", () => {
  it("tracks instances, listeners and observers up and down without going negative", () => {
    const diagnostics = new SpecializedViewDiagnostics();
    diagnostics.instanceOpened();
    diagnostics.instanceOpened();
    diagnostics.instanceClosed();
    expect(diagnostics.instances).toBe(1);
    diagnostics.instanceClosed();
    diagnostics.instanceClosed();
    expect(diagnostics.instances).toBe(0);

    diagnostics.listenerAdded();
    diagnostics.listenerRemoved();
    diagnostics.listenerRemoved();
    expect(diagnostics.listeners).toBe(0);

    diagnostics.observerAdded();
    expect(diagnostics.observers).toBe(1);
    diagnostics.observerRemoved();
    diagnostics.observerRemoved();
    expect(diagnostics.observers).toBe(0);
  });
});

describe("owned specialized resources", () => {
  it("counts and removes each listener and observer exactly once", () => {
    const diagnostics = new SpecializedViewDiagnostics();
    const resources = new OwnedSpecializedResources(diagnostics);
    const target = new FakeTarget();
    resources.listen(target, "change", () => undefined);
    expect(target.added).toEqual(["change"]);
    expect(diagnostics.listeners).toBe(1);

    const disconnect = vi.fn<() => void>();
    resources.addObserver(disconnect);
    expect(diagnostics.observers).toBe(1);

    resources.dispose();
    resources.dispose();
    expect(target.removed).toEqual(["change"]);
    expect(diagnostics.listeners).toBe(0);
    expect(disconnect).toHaveBeenCalledTimes(1);
    expect(diagnostics.observers).toBe(0);
  });

  it("releases a registration made after disposal immediately", () => {
    const diagnostics = new SpecializedViewDiagnostics();
    const resources = new OwnedSpecializedResources(diagnostics);
    resources.dispose();
    const dispose = vi.fn<() => void>();
    resources.addDisposable(dispose);
    resources.addObserver(dispose);
    expect(dispose).toHaveBeenCalledTimes(2);
    expect(diagnostics.observers).toBe(0);
  });

  it("coalesces frame requests and cancels a pending frame on disposal", () => {
    vi.useFakeTimers();
    const diagnostics = new SpecializedViewDiagnostics();
    const resources = new OwnedSpecializedResources(diagnostics);
    const callback = vi.fn<() => void>();
    resources.scheduleFrame(callback);
    resources.scheduleFrame(callback);
    expect(diagnostics.framePending).toBe(true);
    resources.dispose();
    expect(diagnostics.framePending).toBe(false);
    vi.runAllTimers();
    expect(callback).not.toHaveBeenCalled();
  });

  it("clears the single deadline on replacement and disposal", () => {
    vi.useFakeTimers();
    const diagnostics = new SpecializedViewDiagnostics();
    const resources = new OwnedSpecializedResources(diagnostics);
    const first = vi.fn<() => void>();
    const second = vi.fn<() => void>();
    resources.setDeadline(5_000, first);
    expect(diagnostics.deadlinePending).toBe(true);
    resources.setDeadline(5_000, second);
    expect(first).not.toHaveBeenCalled();
    vi.advanceTimersByTime(5_000);
    expect(second).toHaveBeenCalledTimes(1);
    expect(diagnostics.deadlinePending).toBe(false);

    resources.setDeadline(5_000, first);
    resources.clearDeadline();
    vi.advanceTimersByTime(5_000);
    expect(first).not.toHaveBeenCalled();
    expect(diagnostics.deadlinePending).toBe(false);
  });

  it("exposes one process-wide terminal counter set", () => {
    expect(terminalRuntime.instances).toBe(0);
    expect(terminalRuntime.listeners).toBe(0);
  });
});
