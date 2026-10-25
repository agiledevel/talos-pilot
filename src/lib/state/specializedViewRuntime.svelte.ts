/**
 * Renderer-owned diagnostics and resource ownership for the F7 specialized views.
 *
 * The terminal and chart surfaces each get their own counters, so a test or a
 * user can see that a closed surface actually released its library instance,
 * observers, listeners, scheduled frame, and replay deadline. Decrements follow
 * the real teardown and never reset a counter to zero wholesale; an unmatched
 * teardown is ignored so a count cannot go negative.
 */

/** One counter set per specialized surface. */
export class SpecializedViewDiagnostics {
  /** Library instances currently created by this surface. */
  instances = $state(0);
  /** DOM, media-query, and library listeners currently registered. */
  listeners = $state(0);
  /** ResizeObserver and MutationObserver instances currently connected. */
  observers = $state(0);
  /** A coalesced animation frame is scheduled. */
  framePending = $state(false);
  /** A replay write deadline is armed. */
  deadlinePending = $state(false);
  /** UTF-8 bytes of the admitted snapshot the session retains. */
  retainedBytes = $state(0);
  /** UTF-8 bytes of the at most one newer replacement awaiting replay. */
  pendingBytes = $state(0);
  /** Encoded bytes of the one library write awaiting its callback. */
  inFlightBytes = $state(0);
  /** Replacements coalesced into the single pending slot. */
  queueDepth = $state(0);

  #instanceCount = 0;
  #listenerCount = 0;
  #observerCount = 0;

  /** Records one created library instance. */
  instanceOpened(): void {
    this.#instanceCount += 1;
    this.instances = this.#instanceCount;
  }

  /** Records one actually disposed library instance; ignores an unmatched call. */
  instanceClosed(): void {
    if (this.#instanceCount === 0) return;
    this.#instanceCount -= 1;
    this.instances = this.#instanceCount;
  }

  /** Records one registered listener. */
  listenerAdded(): void {
    this.#listenerCount += 1;
    this.listeners = this.#listenerCount;
  }

  /** Records one removed listener; ignores an unmatched call. */
  listenerRemoved(): void {
    if (this.#listenerCount === 0) return;
    this.#listenerCount -= 1;
    this.listeners = this.#listenerCount;
  }

  /** Records one connected observer. */
  observerAdded(): void {
    this.#observerCount += 1;
    this.observers = this.#observerCount;
  }

  /** Records one disconnected observer; ignores an unmatched call. */
  observerRemoved(): void {
    if (this.#observerCount === 0) return;
    this.#observerCount -= 1;
    this.observers = this.#observerCount;
  }
}

/** Process-wide terminal counters; the terminal surface is the only writer. */
export const terminalRuntime = new SpecializedViewDiagnostics();

/** Process-wide chart counters; the chart surface is the only writer. */
export const chartRuntime = new SpecializedViewDiagnostics();

/** A listener target accepted by {@link OwnedSpecializedResources}. */
interface ListenerTarget {
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
  removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void;
}

/**
 * Owns every external resource of one specialized-view instance.
 *
 * Registrations are counted in the surface's diagnostics, and `dispose()` is
 * idempotent, so a partial mount failure and a repeated cleanup are both safe.
 * A pending animation frame and replay deadline are cancelled on disposal, and
 * late callbacks become inert.
 */
export class OwnedSpecializedResources {
  readonly #entries = new Set<() => void>();
  readonly #diagnostics: SpecializedViewDiagnostics;
  #frame: number | null = null;
  #deadline: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;

  /** @param diagnostics Counters that observe each registration. */
  constructor(diagnostics: SpecializedViewDiagnostics) {
    this.#diagnostics = diagnostics;
  }

  /** True once disposal has started; later registrations are immediately released. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /**
   * Adds one DOM or media-query listener and returns its idempotent remover.
   *
   * @param target Event target, such as `window`, `document`, or a MediaQueryList.
   * @param type Event name.
   * @param listener Listener invoked by the target.
   * @returns A function that removes this listener once.
   */
  listen(target: ListenerTarget, type: string, listener: EventListener): () => void {
    if (this.#disposed) {
      return () => undefined;
    }
    let active = true;
    target.addEventListener(type, listener);
    this.#diagnostics.listenerAdded();
    const remove = (): void => {
      if (!active) return;
      active = false;
      target.removeEventListener(type, listener);
      this.#diagnostics.listenerRemoved();
      this.#entries.delete(remove);
    };
    this.#entries.add(remove);
    return remove;
  }

  /**
   * Registers a disconnected observer teardown.
   *
   * @param disconnect Stops the observer; called at most once.
   */
  addObserver(disconnect: () => void): void {
    if (this.#disposed) {
      disconnect();
      return;
    }
    let active = true;
    const remove = (): void => {
      if (!active) return;
      active = false;
      disconnect();
      this.#diagnostics.observerRemoved();
      this.#entries.delete(remove);
    };
    this.#entries.add(remove);
    this.#diagnostics.observerAdded();
  }

  /**
   * Registers an existing disposable, such as a library addon or instance.
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
      if (!active) return;
      active = false;
      dispose();
      this.#entries.delete(remove);
    };
    this.#entries.add(remove);
  }

  /**
   * Schedules one animation frame, coalescing repeated requests.
   *
   * The callback runs only while this owner is live, so a frame request that
   * was already queued when the surface closed cannot touch a disposed library.
   *
   * @param callback Work to run once in the next frame.
   */
  scheduleFrame(callback: () => void): void {
    if (this.#disposed || this.#frame !== null) {
      return;
    }
    this.#diagnostics.framePending = true;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = null;
      this.#diagnostics.framePending = false;
      if (this.#disposed) return;
      callback();
    });
  }

  /**
   * Replaces the single owned deadline.
   *
   * @param delayMs Delay in milliseconds.
   * @param callback Work to run if the deadline is still armed.
   */
  setDeadline(delayMs: number, callback: () => void): void {
    if (this.#disposed) {
      return;
    }
    this.clearDeadline();
    this.#diagnostics.deadlinePending = true;
    this.#deadline = setTimeout(() => {
      this.#deadline = null;
      this.#diagnostics.deadlinePending = false;
      if (this.#disposed) return;
      callback();
    }, delayMs);
  }

  /** Clears the owned deadline, if any. */
  clearDeadline(): void {
    if (this.#deadline === null) {
      return;
    }
    clearTimeout(this.#deadline);
    this.#deadline = null;
    this.#diagnostics.deadlinePending = false;
  }

  /** Removes every listener and disposable, cancels the frame, and clears the deadline. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.clearDeadline();
    if (this.#frame !== null) {
      cancelAnimationFrame(this.#frame);
      this.#frame = null;
      this.#diagnostics.framePending = false;
    }
    for (const remove of [...this.#entries]) {
      remove();
    }
    this.#entries.clear();
  }
}
