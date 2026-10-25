import { isWithinDocumentLimit, YAML_DOCUMENT_LIMIT_BYTES } from "./documentBounds";
import {
  isYamlWorkerResponse,
  YAML_DIAGNOSTIC_MESSAGE_LIMIT,
  type YamlDiagnostic,
  type YamlWorkerRequest,
} from "./yamlAnalysis";

/** Default delay between the last accepted edit and the worker request, in milliseconds. */
export const YAML_VALIDATION_DEBOUNCE_MS = 120;

/**
 * Longest time one worker request may stay in flight.
 *
 * A stalled worker is a failure, not a reason to queue more requests. The
 * timeout is deliberately generous compared with the 64 KiB parser workload so
 * a slow but healthy first request is not reported as a stall.
 */
export const YAML_VALIDATION_TIMEOUT_MS = 5_000;

/** Observable state of one document's validation. */
export type YamlValidationPhase = "idle" | "pending" | "ready" | "failed";

/** One published validation state change. */
export interface YamlValidationSnapshot {
  /** Current phase; `pending` intentionally carries no diagnostics. */
  readonly phase: YamlValidationPhase;
  /** Diagnostics that belong to the currently accepted document, bounded by the parser. */
  readonly diagnostics: readonly YamlDiagnostic[];
}

/** Failure reasons with distinct, safe user-visible messages. */
export type YamlValidationFailure = "error" | "timeout";

/** Callbacks and timing supplied by the owning editor session. */
export interface YamlValidationQueueOptions {
  /** Sends one bounded request; returns false when no live worker accepted it. */
  readonly dispatch: (request: YamlWorkerRequest) => boolean;
  /** Publishes every state change, including the immediate stale-result reset. */
  readonly publish: (snapshot: YamlValidationSnapshot) => void;
  /** Releases the failed or timed-out worker before the next document is queued. */
  readonly onWorkerFailure?: (() => void) | undefined;
  /** Delay before the first request for a document, in milliseconds. */
  readonly debounceMs?: number | undefined;
  /** Maximum lifetime of one in-flight request, in milliseconds. */
  readonly timeoutMs?: number | undefined;
}

interface QueuedDocument {
  readonly text: string;
  /** Monotonic document identity; a response for an older version is stale. */
  readonly version: number;
}

interface InFlightRequest {
  readonly requestId: number;
  readonly version: number;
  readonly timer: ReturnType<typeof setTimeout>;
}

function failureDiagnostic(message: string): YamlDiagnostic {
  return {
    message: message.slice(0, YAML_DIAGNOSTIC_MESSAGE_LIMIT),
    line: 1,
    column: 1,
    endLine: 1,
    endColumn: 2,
  };
}

/**
 * Runs bounded YAML analysis for one editor model.
 *
 * The queue owns exactly one debounce timer, at most one in-flight request and
 * at most one queued document. Rapid edits replace the queued document instead
 * of adding tasks, and no second request is sent while one is in flight. Each
 * request carries a monotonic id and the document version it analyses; a reply
 * for an older version, a duplicate id or an unknown id is ignored and can
 * never publish diagnostics for newer text.
 *
 * Failure is terminal for the current request, not an automatic retry loop. A
 * timeout or worker error publishes one safe diagnostic, drops the queued
 * document, invokes {@link YamlValidationQueueOptions.onWorkerFailure} so the
 * session can terminate the stalled worker, and waits for the next document
 * change. Disposal clears both timers, drops queued work and ignores every late
 * response. The `dispatchedCount`, `hasInFlight` and `hasQueuedDocument`
 * observations let tests prove those bounds instead of inferring them from
 * callback counts.
 */
export class YamlValidationQueue {
  readonly #dispatch: (request: YamlWorkerRequest) => boolean;
  readonly #publish: (snapshot: YamlValidationSnapshot) => void;
  readonly #onWorkerFailure: (() => void) | undefined;
  readonly #debounceMs: number;
  readonly #timeoutMs: number;

  #disposed = false;
  #latestVersion = 0;
  #nextRequestId = 0;
  #dispatchedCount = 0;
  #pending: QueuedDocument | null = null;
  #inFlight: InFlightRequest | null = null;
  #debounce: ReturnType<typeof setTimeout> | null = null;

  /** @param options Dispatch, publication and failure ownership for one editor session. */
  constructor(options: YamlValidationQueueOptions) {
    this.#dispatch = options.dispatch;
    this.#publish = options.publish;
    this.#onWorkerFailure = options.onWorkerFailure;
    this.#debounceMs = options.debounceMs ?? YAML_VALIDATION_DEBOUNCE_MS;
    this.#timeoutMs = options.timeoutMs ?? YAML_VALIDATION_TIMEOUT_MS;
  }

  /** Number of requests handed to the dispatch callback, including a rejected hand-off. */
  get dispatchedCount(): number {
    return this.#dispatchedCount;
  }

  /** True while one request is waiting for a worker response or timeout. */
  get hasInFlight(): boolean {
    return this.#inFlight !== null;
  }

  /** True while one coalesced document waits for the debounce or the active request. */
  get hasQueuedDocument(): boolean {
    return this.#pending !== null;
  }

  /** True after disposal; no timer, request or publication remains. */
  get isDisposed(): boolean {
    return this.#disposed;
  }

  /**
   * Queues the latest accepted document and invalidates the previous result.
   *
   * The immediate `pending` publication is the stale-result guard for the
   * window between an edit and the debounced dispatch: old diagnostics and
   * markers disappear at once instead of looking current for new text.
   *
   * @param text Complete document that already passed {@link admitDocument}.
   * @returns False when the queue is disposed or the document exceeds the byte limit.
   */
  submit(text: string): boolean {
    if (this.#disposed || !isWithinDocumentLimit(text, YAML_DOCUMENT_LIMIT_BYTES)) {
      return false;
    }
    this.#latestVersion += 1;
    this.#pending = { text, version: this.#latestVersion };
    this.#clearDebounce();
    this.#publish({ phase: "pending", diagnostics: [] });
    this.#debounce = setTimeout(() => {
      this.#debounce = null;
      this.#flush();
    }, this.#debounceMs);
    return true;
  }

  /**
   * Accepts one runtime-validated worker reply.
   *
   * Malformed, duplicate, unknown and superseded replies are ignored. A reply
   * for the newest version publishes its diagnostics; a reply for an older
   * version only releases the worker slot for the queued latest document.
   *
   * @param payload Untrusted `MessageEvent.data` from the dedicated worker.
   */
  receive(payload: unknown): void {
    if (this.#disposed || !isYamlWorkerResponse(payload)) {
      return;
    }
    const active = this.#inFlight;
    if (active === null || payload.requestId !== active.requestId) {
      return;
    }
    clearTimeout(active.timer);
    this.#inFlight = null;
    if (active.version === this.#latestVersion) {
      this.#publish({ phase: "ready", diagnostics: payload.diagnostics });
    }
    // A document queued while this request ran keeps its own debounce period;
    // only an already-elapsed pending document dispatches immediately.
    if (this.#debounce === null) {
      this.#flush();
    }
  }

  /**
   * Ends the active request after a worker error or timeout.
   *
   * The queued document is deliberately dropped: retrying it without a new
   * user/document change could loop against a broken worker. The next accepted
   * edit starts a new bounded request on a fresh worker.
   *
   * @param reason Distinguishes a worker error from a stalled worker.
   */
  fail(reason: YamlValidationFailure): void {
    if (this.#disposed) {
      return;
    }
    this.#clearDebounce();
    const active = this.#inFlight;
    if (active !== null) {
      clearTimeout(active.timer);
      this.#inFlight = null;
    }
    this.#pending = null;
    this.#onWorkerFailure?.();
    this.#publish({
      phase: "failed",
      diagnostics: [
        failureDiagnostic(
          reason === "timeout"
            ? "The YAML worker did not respond within the 5-second limit. Edit the document to try again."
            : "The YAML worker stopped unexpectedly. Edit the document to try again.",
        ),
      ],
    });
  }

  /** Cancels timers, drops queued work and prevents every later publication. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#clearDebounce();
    const active = this.#inFlight;
    if (active !== null) {
      clearTimeout(active.timer);
      this.#inFlight = null;
    }
    this.#pending = null;
  }

  #flush(): void {
    if (this.#disposed || this.#inFlight !== null) {
      return;
    }
    const next = this.#pending;
    if (next === null) {
      return;
    }
    this.#clearDebounce();
    this.#pending = null;
    const requestId = this.#nextRequestId + 1;
    this.#nextRequestId = requestId;
    this.#dispatchedCount += 1;
    this.#inFlight = {
      requestId,
      version: next.version,
      timer: setTimeout(() => {
        if (this.#inFlight?.requestId === requestId) {
          this.fail("timeout");
        }
      }, this.#timeoutMs),
    };
    const request: YamlWorkerRequest = { requestId, text: next.text };
    if (!this.#dispatch(request)) {
      this.fail("error");
    }
  }

  #clearDebounce(): void {
    if (this.#debounce !== null) {
      clearTimeout(this.#debounce);
      this.#debounce = null;
    }
  }
}
