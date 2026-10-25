import { describe, expect, it } from "vitest";
import {
  CORRECTED_YAML_SAMPLE,
  EditorFeasibilityState,
  LazySurface,
  MALFORMED_YAML_SAMPLE,
  oversizeYamlSample,
} from "./editorFeasibility.svelte";
import { isWithinDocumentLimit } from "../../features/editor/documentBounds";

function deferredSurface(): {
  readonly promise: Promise<string>;
  readonly resolve: (value: string) => void;
} {
  let resolve: (value: string) => void = () => undefined;
  const promise = new Promise<string>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

describe("lazy editor surface", () => {
  it("loads once and exposes the imported surface", async () => {
    const lazy = new LazySurface<string>(async () => "editor");
    await lazy.open();
    expect(lazy.status).toBe("ready");
    expect(lazy.surface).toBe("editor");
    expect(lazy.error).toBeNull();
  });

  it("discards an import that resolves after a close", async () => {
    const wait = deferredSurface();
    const lazy = new LazySurface<string>(() => wait.promise);
    const pending = lazy.open();
    expect(lazy.status).toBe("loading");
    lazy.close();
    wait.resolve("late-editor");
    await pending;
    expect(lazy.status).toBe("closed");
    expect(lazy.surface).toBeNull();
  });

  it("keeps the newest open attempt when an earlier import resolves late", async () => {
    const first = deferredSurface();
    const second = deferredSurface();
    let call = 0;
    const lazy = new LazySurface<string>(() => {
      call += 1;
      return call === 1 ? first.promise : second.promise;
    });
    const firstOpen = lazy.open();
    const secondOpen = lazy.open();
    second.resolve("new-editor");
    await secondOpen;
    expect(lazy.surface).toBe("new-editor");
    first.resolve("old-editor");
    await firstOpen;
    expect(lazy.surface).toBe("new-editor");
    expect(lazy.status).toBe("ready");
  });

  it("reports a safe failure and allows another attempt", async () => {
    let shouldFail = true;
    const lazy = new LazySurface<string>(async () => {
      if (shouldFail) {
        shouldFail = false;
        throw new Error("secret-bearing import failure");
      }
      return "editor";
    });
    await lazy.open();
    expect(lazy.status).toBe("failed");
    expect(lazy.surface).toBeNull();
    expect(lazy.error).toMatch(/could not be loaded/u);
    expect(lazy.error).not.toMatch(/secret-bearing/u);

    await lazy.open();
    expect(lazy.status).toBe("ready");
    expect(lazy.surface).toBe("editor");
  });
});

describe("editor feasibility documents", () => {
  it("replaces and resets the synthetic document without holding secrets", () => {
    const feasibility = new EditorFeasibilityState();
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    feasibility.correct();
    expect(feasibility.value).toBe(CORRECTED_YAML_SAMPLE);
    feasibility.reset();
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    expect(MALFORMED_YAML_SAMPLE).not.toBe(CORRECTED_YAML_SAMPLE);
  });

  it("builds a benign oversized draft that the byte guard rejects", () => {
    const oversize = oversizeYamlSample();
    expect(oversize.length).toBeGreaterThan(64 * 1024);
    expect(isWithinDocumentLimit(oversize)).toBe(false);
    expect(oversize).toContain("release:");
    expect(oversize).not.toMatch(/password|token|secret/iu);
  });

  it("keeps an accepted edit across a rejected attempt and close", () => {
    const feasibility = new EditorFeasibilityState();
    const edited = `${CORRECTED_YAML_SAMPLE}# accepted user edit\n`;
    feasibility.acceptEdit(edited);
    feasibility.oversize();
    expect(isWithinDocumentLimit(feasibility.readValue())).toBe(false);
    expect(feasibility.value).toBe(edited);

    feasibility.close();
    expect(feasibility.value).toBe(edited);
    expect(feasibility.readValue()).toBe(edited);
  });

  it("clears an oversized intent when a bounded sample or user edit is accepted", () => {
    const feasibility = new EditorFeasibilityState();
    feasibility.oversize();
    feasibility.reset();
    expect(feasibility.readValue()).toBe(MALFORMED_YAML_SAMPLE);
    feasibility.oversize();
    feasibility.correct();
    expect(feasibility.readValue()).toBe(CORRECTED_YAML_SAMPLE);
    feasibility.oversize();
    feasibility.acceptEdit("# bounded user edit\n");
    expect(feasibility.readValue()).toBe("# bounded user edit\n");
  });

  it("does not admit an oversized edit into the owner's accepted draft", () => {
    const feasibility = new EditorFeasibilityState();
    feasibility.acceptEdit(oversizeYamlSample());
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    expect(feasibility.readValue()).toBe(MALFORMED_YAML_SAMPLE);
  });
});
