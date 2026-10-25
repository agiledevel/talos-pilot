import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  YAML_VALIDATION_DEBOUNCE_MS,
  YAML_VALIDATION_TIMEOUT_MS,
  YamlValidationQueue,
  type YamlValidationSnapshot,
} from "./yamlValidationQueue";
import { YAML_DOCUMENT_LIMIT_BYTES } from "./documentBounds";
import type { YamlDiagnostic, YamlWorkerRequest } from "./yamlAnalysis";

const DIAGNOSTIC: YamlDiagnostic = {
  message: "bad",
  line: 1,
  column: 1,
  endLine: 1,
  endColumn: 2,
};

function response(requestId: number, message = "bad"): unknown {
  return { requestId, diagnostics: [{ ...DIAGNOSTIC, message }] };
}

function createQueue(): {
  readonly queue: YamlValidationQueue;
  readonly requests: YamlWorkerRequest[];
  readonly published: YamlValidationSnapshot[];
  readonly failures: () => number;
} {
  const requests: YamlWorkerRequest[] = [];
  const published: YamlValidationSnapshot[] = [];
  let failures = 0;
  const queue = new YamlValidationQueue({
    dispatch: (request) => {
      requests.push(request);
      return true;
    },
    publish: (snapshot) => {
      published.push(snapshot);
    },
    onWorkerFailure: () => {
      failures += 1;
    },
  });
  return { queue, requests, published, failures: () => failures };
}

describe("bounded YAML validation queue", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("invalidates diagnostics immediately and dispatches only after the debounce", () => {
    const { queue, requests, published } = createQueue();
    expect(queue.submit("a: 1\n")).toBe(true);

    expect(published).toEqual([{ phase: "pending", diagnostics: [] }]);
    expect(requests).toHaveLength(0);
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS - 1);
    expect(requests).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(requests).toEqual([{ requestId: 1, text: "a: 1\n" }]);
    expect(queue.hasInFlight).toBe(true);
    expect(queue.hasQueuedDocument).toBe(false);
    expect(queue.dispatchedCount).toBe(1);
  });

  it("coalesces rapid edits into one request carrying the latest text", () => {
    const { queue, requests, published } = createQueue();
    queue.submit("a: 1\n");
    queue.submit("a: 2\n");
    queue.submit("a: 3\n");
    expect(queue.hasQueuedDocument).toBe(true);
    expect(published.at(-1)).toEqual({ phase: "pending", diagnostics: [] });

    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toEqual([{ requestId: 1, text: "a: 3\n" }]);
    expect(queue.dispatchedCount).toBe(1);
    expect(queue.hasQueuedDocument).toBe(false);
  });

  it("holds one in-flight request plus one latest document and ignores the stale reply", () => {
    const { queue, requests, published } = createQueue();
    queue.submit("first\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toHaveLength(1);

    queue.submit("second\n");
    queue.submit("third\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toHaveLength(1);
    expect(queue.hasInFlight).toBe(true);
    expect(queue.hasQueuedDocument).toBe(true);

    queue.receive(response(1, "stale result"));
    expect(published.some((snapshot) => snapshot.phase === "ready")).toBe(false);
    expect(requests).toEqual([
      { requestId: 1, text: "first\n" },
      { requestId: 2, text: "third\n" },
    ]);
    expect(queue.dispatchedCount).toBe(2);
    expect(queue.hasQueuedDocument).toBe(false);
    expect(queue.hasInFlight).toBe(true);

    queue.receive(response(2, "latest result"));
    expect(published.at(-1)).toEqual({
      phase: "ready",
      diagnostics: [{ ...DIAGNOSTIC, message: "latest result" }],
    });
    expect(queue.hasInFlight).toBe(false);
  });

  it("lets a document queued during an in-flight request keep its own debounce", () => {
    const { queue, requests, published } = createQueue();
    queue.submit("first\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    queue.submit("second\n");
    expect(queue.hasQueuedDocument).toBe(true);

    queue.receive(response(1));
    expect(requests).toHaveLength(1);
    expect(queue.hasQueuedDocument).toBe(true);
    expect(published.some((snapshot) => snapshot.phase === "ready")).toBe(false);

    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toEqual([
      { requestId: 1, text: "first\n" },
      { requestId: 2, text: "second\n" },
    ]);
    queue.receive(response(2));
    expect(published.at(-1)?.phase).toBe("ready");
  });

  it("ignores duplicate, unknown and out-of-order responses", () => {
    const { queue, requests, published } = createQueue();
    queue.submit("first\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);

    queue.receive(response(99));
    expect(published).toHaveLength(1);
    queue.receive(response(1));
    expect(published.at(-1)?.phase).toBe("ready");
    const readyCount = published.filter((snapshot) => snapshot.phase === "ready").length;
    queue.receive(response(1));
    expect(published.filter((snapshot) => snapshot.phase === "ready")).toHaveLength(readyCount);
    expect(published).toHaveLength(2);

    queue.submit("second\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toHaveLength(2);
    queue.receive(response(1, "old"));
    expect(published.filter((snapshot) => snapshot.phase === "ready")).toHaveLength(readyCount);
    expect(queue.hasInFlight).toBe(true);
    queue.receive(response(2, "new"));
    expect(published.at(-1)?.diagnostics[0]?.message).toBe("new");
  });

  it("times out a stalled request, fails once, drops queued work and does not retry", () => {
    const { queue, requests, published, failures } = createQueue();
    queue.submit("first\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    queue.submit("second\n");

    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS);
    expect(failures()).toBe(1);
    expect(queue.hasInFlight).toBe(false);
    expect(queue.hasQueuedDocument).toBe(false);
    expect(requests).toHaveLength(1);
    expect(queue.dispatchedCount).toBe(1);
    const failure = published.at(-1);
    expect(failure?.phase).toBe("failed");
    expect(failure?.diagnostics[0]?.message).toContain("5-second limit");

    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS * 4);
    expect(requests).toHaveLength(1);
    expect(failures()).toBe(1);
    queue.receive(response(1));
    expect(published.at(-1)?.phase).toBe("failed");
  });

  it("handles a worker error by clearing queued work without an automatic retry", () => {
    const { queue, requests, published, failures } = createQueue();
    queue.submit("first\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    queue.submit("second\n");

    queue.fail("error");
    expect(failures()).toBe(1);
    expect(queue.hasInFlight).toBe(false);
    expect(queue.hasQueuedDocument).toBe(false);
    expect(requests).toHaveLength(1);
    expect(published.at(-1)?.phase).toBe("failed");
    expect(published.at(-1)?.diagnostics[0]?.message).toContain("stopped unexpectedly");

    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS);
    expect(requests).toHaveLength(1);
    expect(failures()).toBe(1);
  });

  it("fails once when dispatch cannot reach a worker", () => {
    let attempts = 0;
    const published: YamlValidationSnapshot[] = [];
    let failures = 0;
    const queue = new YamlValidationQueue({
      dispatch: () => {
        attempts += 1;
        return false;
      },
      publish: (snapshot) => {
        published.push(snapshot);
      },
      onWorkerFailure: () => {
        failures += 1;
      },
    });
    queue.submit("a: 1\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(attempts).toBe(1);
    expect(failures).toBe(1);
    expect(queue.hasInFlight).toBe(false);
    expect(published.at(-1)?.phase).toBe("failed");
    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS * 2);
    expect(attempts).toBe(1);
  });

  it("cancels pending and in-flight timers on disposal without publishing again", () => {
    const { queue, requests, published, failures } = createQueue();
    queue.submit("pending\n");
    queue.dispose();
    expect(queue.isDisposed).toBe(true);
    const publishedBefore = published.length;
    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS * 4);
    expect(requests).toHaveLength(0);
    expect(published).toHaveLength(publishedBefore);
    expect(failures()).toBe(0);
    queue.receive(response(1));
    expect(published).toHaveLength(publishedBefore);
    expect(queue.submit("after\n")).toBe(false);

    const second = createQueue();
    second.queue.submit("in flight\n");
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(second.requests).toHaveLength(1);
    const inFlightPublished = second.published.length;
    second.queue.dispose();
    vi.advanceTimersByTime(YAML_VALIDATION_TIMEOUT_MS * 4);
    expect(second.failures()).toBe(0);
    expect(second.published).toHaveLength(inFlightPublished);
    second.queue.receive(response(1));
    expect(second.published).toHaveLength(inFlightPublished);
  });

  it("rejects oversized submissions and malformed responses without dispatch", () => {
    const { queue, requests, published } = createQueue();
    expect(queue.submit("a".repeat(YAML_DOCUMENT_LIMIT_BYTES + 1))).toBe(false);
    expect(published).toHaveLength(0);
    expect(requests).toHaveLength(0);
    expect(queue.submit("a".repeat(YAML_DOCUMENT_LIMIT_BYTES))).toBe(true);
    vi.advanceTimersByTime(YAML_VALIDATION_DEBOUNCE_MS);
    expect(requests).toHaveLength(1);

    queue.receive({ requestId: 1, diagnostics: "bad" });
    queue.receive({ requestId: 1, diagnostics: [{ ...DIAGNOSTIC, message: "" }] });
    expect(published.at(-1)?.phase).toBe("pending");
    expect(queue.hasInFlight).toBe(true);
  });
});
