/** A worker whose termination can be observed by the runtime counters. */
export interface TerminableWorker {
  /** Stops the worker. The tracked wrapper calls this exactly once. */
  terminate(): void;
}

/**
 * Renderer-owned resource counters for the lazy editor feasibility surface.
 *
 * The counters are intentionally visible in the application, so a native or
 * browser test can observe actual worker, model, and listener ownership rather
 * than trusting a cleanup callback. Every increment has one matching decrement;
 * repeated termination is ignored so a worker cannot drive a count below zero.
 */
export class EditorRuntimeDiagnostics {
  /** Workers currently created by the editor surface. */
  workers = $state(0);
  /** Monaco text models currently owned by the editor surface. */
  models = $state(0);
  /** Window, document, media-query, observer, model, and worker listeners. */
  listeners = $state(0);
  /** First-use state of the dynamically imported editor surface chunk. */
  lazyChunkStatus = $state<"not-loaded" | "loading" | "loaded" | "failed">("not-loaded");
  /** Same-origin URL of the evaluated editor surface chunk. */
  lazyChunkUrl = $state<string | null>(null);
  /** Logical name of the bundled YAML analysis worker emitted by Vite. */
  yamlWorkerAsset = $state<string | null>(null);
  /** Logical name of the bundled Monaco editor worker emitted by Vite. */
  monacoWorkerAsset = $state<string | null>(null);

  /** Marks the first editor import as pending; a loaded chunk stays loaded. */
  beginLazyImport(): void {
    if (this.lazyChunkStatus === "not-loaded") {
      this.lazyChunkStatus = "loading";
    }
  }

  /** Records that the lazy editor chunk evaluated and where it came from. */
  recordLazyChunk(url: string): void {
    this.lazyChunkUrl = url;
    this.lazyChunkStatus = "loaded";
  }

  /** Records a lazy import failure without overwriting a loaded chunk. */
  failLazyImport(): void {
    if (this.lazyChunkStatus !== "loaded") {
      this.lazyChunkStatus = "failed";
    }
  }

  /** Records that the bundled YAML worker asset was constructed. */
  recordYamlWorkerAsset(asset: string): void {
    this.yamlWorkerAsset = asset;
  }

  /** Records that the bundled Monaco worker asset was constructed. */
  recordMonacoWorkerAsset(asset: string): void {
    this.monacoWorkerAsset = asset;
  }

  readonly #activeWorkers = new WeakSet<TerminableWorker>();
  readonly #terminatedWorkers = new WeakSet<TerminableWorker>();
  #modelCount = 0;
  #listenerCount = 0;

  /**
   * Starts tracking a worker and wraps its `terminate` method so disposal is
   * observable. The original method stays the only code that stops the worker.
   *
   * @param worker Worker created from a bundled same-origin worker URL.
   * @returns The same worker, now counted until its first termination.
   */
  trackWorker<WorkerType extends TerminableWorker>(worker: WorkerType): WorkerType {
    if (this.#activeWorkers.has(worker) || this.#terminatedWorkers.has(worker)) {
      return worker;
    }
    this.#activeWorkers.add(worker);
    this.workers += 1;
    const terminate = worker.terminate.bind(worker);
    worker.terminate = (): void => {
      if (!this.#terminatedWorkers.has(worker)) {
        this.#terminatedWorkers.add(worker);
        this.#activeWorkers.delete(worker);
        this.workers = Math.max(0, this.workers - 1);
      }
      terminate();
    };
    return worker;
  }

  /** Records one owned Monaco model. */
  modelCreated(): void {
    this.#modelCount += 1;
    this.models = this.#modelCount;
  }

  /** Records one disposed model; ignores an unmatched call. */
  modelDisposed(): void {
    if (this.#modelCount === 0) {
      return;
    }
    this.#modelCount -= 1;
    this.models = this.#modelCount;
  }

  /** Records one owned listener. */
  listenerAdded(): void {
    this.#listenerCount += 1;
    this.listeners = this.#listenerCount;
  }

  /** Records one removed listener; ignores an unmatched call. */
  listenerRemoved(): void {
    if (this.#listenerCount === 0) {
      return;
    }
    this.#listenerCount -= 1;
    this.listeners = this.#listenerCount;
  }
}

/** Process-wide counters; the feasibility surface is the only writer. */
export const editorRuntime = new EditorRuntimeDiagnostics();

/** A listener target accepted by {@link OwnedListeners}. */
interface ListenerTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/**
 * Adds listeners and disposes every one of them exactly once.
 *
 * The class is the single owner of the editor surface's external listeners. It
 * counts each registration in {@link EditorRuntimeDiagnostics.listeners} and is
 * safe to dispose repeatedly, which matters when an attachment cleanup races a
 * failed mount.
 */
export class OwnedListeners {
  readonly #entries = new Set<() => void>();
  readonly #diagnostics: EditorRuntimeDiagnostics;
  #disposed = false;

  /** @param diagnostics Counters that should observe each registration. */
  constructor(diagnostics: EditorRuntimeDiagnostics) {
    this.#diagnostics = diagnostics;
  }

  /**
   * Adds one DOM/media-query listener and returns its idempotent remover.
   *
   * @param target Event target, such as `window`, `document`, or a MediaQueryList.
   * @param type Event name.
   * @param listener Listener invoked by the target.
   * @returns A function that removes this listener once.
   */
  add(target: ListenerTarget, type: string, listener: EventListener): () => void {
    if (this.#disposed) {
      return () => undefined;
    }
    let active = true;
    target.addEventListener(type, listener);
    this.#diagnostics.listenerAdded();
    const remove = (): void => {
      if (!active) {
        return;
      }
      active = false;
      target.removeEventListener(type, listener);
      this.#diagnostics.listenerRemoved();
      this.#entries.delete(remove);
    };
    this.#entries.add(remove);
    return remove;
  }

  /**
   * Registers an existing disposable, such as a Monaco model or editor event.
   *
   * @param dispose Teardown function called at most once.
   */
  addDisposable(dispose: () => void): void {
    if (this.#disposed) {
      dispose();
      return;
    }
    let active = true;
    const remove = (): void => {
      if (!active) {
        return;
      }
      active = false;
      dispose();
      this.#diagnostics.listenerRemoved();
      this.#entries.delete(remove);
    };
    this.#entries.add(remove);
    this.#diagnostics.listenerAdded();
  }

  /** Removes every listener and disposable registered with this owner. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    for (const remove of [...this.#entries]) {
      remove();
    }
    this.#entries.clear();
  }
}
