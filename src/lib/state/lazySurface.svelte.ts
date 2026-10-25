/**
 * One lazily imported renderer surface with generation-based cancellation.
 *
 * `import()` cannot be aborted, so the generation counter is the cancellation
 * contract: `close()` and every new `open()` advance it, and a result that
 * arrives for an older generation is ignored. A stale success therefore cannot
 * overwrite a newer open, and a stale rejection cannot report a failure for a
 * surface the user already reopened. This module deliberately knows nothing
 * about the imported component, its library, or the errors of a specific view;
 * each owner supplies its own bounded failure message.
 */

/** Lifecycle of a lazily imported surface. */
export type LazySurfaceStatus = "closed" | "loading" | "ready" | "failed";

/** Construction options for {@link LazySurface}. */
export interface LazySurfaceOptions<Surface> {
  /** Importer invoked for each open attempt. */
  load: () => Promise<Surface>;
  /** Safe, bounded message shown when the import fails. */
  failureMessage: string;
}

/**
 * Owns one lazily imported value and invalidates imports the owner cancelled.
 *
 * The class holds no library instance and registers no global resource. A
 * loaded module may stay cached in the JavaScript engine after `close()`; what
 * `close()` guarantees is that this owner retains no surface reference and that
 * later results are inert.
 */
export class LazySurface<Surface> {
  /** Current load state; `failed` retains a safe error. */
  status = $state<LazySurfaceStatus>("closed");
  /** Loaded surface, or `null` while closed/loading/failed. */
  surface = $state.raw<Surface | null>(null);
  /** Safe message for a failed import. */
  error = $state<string | null>(null);

  readonly #load: () => Promise<Surface>;
  readonly #failureMessage: string;
  #generation = 0;

  /** @param options Importer and the bounded failure message for this surface. */
  constructor(options: LazySurfaceOptions<Surface>) {
    this.#load = options.load;
    this.#failureMessage = options.failureMessage;
  }

  /**
   * Starts an import. A close during the import wins over its eventual result,
   * and a repeated open supersedes the earlier attempt instead of mounting twice.
   */
  async open(): Promise<void> {
    const generation = ++this.#generation;
    this.status = "loading";
    this.error = null;
    this.surface = null;
    try {
      const surface = await this.#load();
      if (generation !== this.#generation) {
        return;
      }
      this.surface = surface;
      this.status = "ready";
    } catch {
      if (generation !== this.#generation) {
        return;
      }
      this.status = "failed";
      this.error = this.#failureMessage;
    }
  }

  /** Cancels a pending import and releases the loaded surface reference. */
  close(): void {
    this.#generation += 1;
    this.surface = null;
    this.status = "closed";
    this.error = null;
  }
}
