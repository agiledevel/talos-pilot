import type { TerminalAdmission } from "../../features/terminal/terminalSnapshot";
import type { SpecializedViewDiagnostics } from "../../lib/state/specializedViewRuntime.svelte";

/**
 * Callback-paced replay for the synthetic terminal.
 *
 * xterm.js `write()` is asynchronous and queues data, so appending every
 * replacement would keep evicted output in the emulator and could grow an
 * unbounded queue. This session instead owns one admitted snapshot and replays
 * it, one bounded write at a time, resetting the emulator before a replacement.
 * A newer replacement supersedes the unfinished replay at the next real write
 * callback: at most one replay is active, at most one newer bounded snapshot
 * waits in a single coalescing slot, and at most one encoded write is awaiting
 * its callback.
 *
 * A missing callback for {@link TERMINAL_STALL_DEADLINE_MS} fails the session
 * visibly and drops all pending data. There is no automatic retry; an explicit
 * close and reopen creates a fresh session.
 */

/** Canonical UTF-8 bytes fed to one `write()` call before newline rendering. */
export const TERMINAL_WRITE_CANONICAL_LIMIT = 32_768;

/**
 * Encoded ceiling of one rendered write.
 *
 * Rendering expands each LF into CRLF, so a canonical chunk is at most twice its
 * byte length after expansion; the canonical limit above therefore bounds every
 * rendered write below this ceiling.
 */
export const TERMINAL_WRITE_ENCODED_LIMIT = 65_536;

/** A write callback that does not arrive within this deadline fails the session. */
export const TERMINAL_STALL_DEADLINE_MS = 5_000;

/** The part of xterm.js the replay session depends on. */
export interface TerminalReplayWriter {
  /** Queues rendered text and invokes `callback` once the emulator accepted it. */
  write(data: string, callback: () => void): void;
  /** Clears the emulator buffer before a replacement replay. */
  reset(): void;
}

/** One owned deadline; the attachment backs it with a timer, tests with a fake clock. */
export interface TerminalReplayScheduler {
  /** Arms the single deadline, replacing any previous one. */
  setDeadline(delayMs: number, callback: () => void): void;
  /** Clears the single deadline if armed. */
  clearDeadline(): void;
}

/** Result of one accepted replacement. */
export interface TerminalReplayState {
  /** True while admitted text is still being written. */
  readonly replaying: boolean;
  /** True while a write is awaiting its callback. */
  readonly writing: boolean;
}

const encoder = new TextEncoder();

/** Encoded UTF-8 bytes of one rendered write chunk. */
export function encodedWriteBytes(rendered: string): number {
  return encoder.encode(rendered).length;
}

/**
 * Returns the end of the next canonical chunk at or below the byte limit.
 *
 * The scan is forward, allocation-free, and stops at a code-point boundary, so
 * a surrogate pair is never split across two writes.
 *
 * @param text Admitted canonical text.
 * @param start Offset of the first unwritten UTF-16 code unit.
 * @returns Exclusive end offset and the canonical UTF-8 byte count.
 */
export function nextWriteChunk(text: string, start: number): { end: number; bytes: number } {
  let bytes = 0;
  let index = start;
  while (index < text.length) {
    const code = text.charCodeAt(index);
    let codePointBytes: number;
    let codePointUnits: number;
    if (code < 0x80) {
      codePointBytes = 1;
      codePointUnits = 1;
    } else if (code < 0x800) {
      codePointBytes = 2;
      codePointUnits = 1;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        codePointBytes = 4;
        codePointUnits = 2;
      } else {
        // Lone surrogates render as U+FFFD, which is three bytes.
        codePointBytes = 3;
        codePointUnits = 1;
      }
    } else {
      codePointBytes = 3;
      codePointUnits = 1;
    }
    if (bytes + codePointBytes > TERMINAL_WRITE_CANONICAL_LIMIT) {
      break;
    }
    bytes += codePointBytes;
    index += codePointUnits;
  }
  return { end: index, bytes };
}

/**
 * Renders one canonical chunk for xterm.js by expanding each LF into CRLF.
 *
 * The returned string is a transient, bounded copy. It is never retained by the
 * session, and its encoded length is at most
 * {@link TERMINAL_WRITE_ENCODED_LIMIT} for a chunk produced above.
 */
export function renderWriteChunk(canonical: string): string {
  return canonical.replaceAll("\n", "\r\n");
}

/**
 * Counts canonical UTF-8 bytes from `start` to the end without allocating.
 *
 * @param text Canonical admitted text.
 * @param start First unwritten offset.
 */
export function canonicalBytesFrom(text: string, start: number): number {
  let bytes = 0;
  for (let index = start; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (code >= 0xd800 && code <= 0xdbff) {
      const next = text.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else {
        bytes += 3;
      }
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/** Construction options for {@link TerminalReplaySession}. */
export interface TerminalReplaySessionOptions {
  readonly writer: TerminalReplayWriter;
  readonly scheduler: TerminalReplayScheduler;
  readonly diagnostics: SpecializedViewDiagnostics;
  /** Called after a stalled write has invalidated this session. */
  readonly onStall: (message: string) => void;
  /** Called after replay progress so an owner can publish replay state. */
  readonly onProgress?: (() => void) | undefined;
}

/**
 * Owns one terminal replay and its bounded replacement slot.
 *
 * The session never reads a prop: the attachment admits a proposal and hands the
 * admitted snapshot to {@link TerminalReplaySession.apply}. Rejected proposals
 * therefore never reach this class and cannot disturb the accepted transcript.
 */
export class TerminalReplaySession {
  readonly #writer: TerminalReplayWriter;
  readonly #scheduler: TerminalReplayScheduler;
  readonly #diagnostics: SpecializedViewDiagnostics;
  readonly #onStall: (message: string) => void;
  readonly #onProgress: (() => void) | undefined;

  #retained: TerminalAdmission | null = null;
  #pending: TerminalAdmission | null = null;
  #replayText = "";
  #replayOffset = 0;
  #writing = false;
  #writeToken = 0;
  #disposed = false;

  /** @param options Writer, clock, counters, and the stall report. */
  constructor(options: TerminalReplaySessionOptions) {
    this.#writer = options.writer;
    this.#scheduler = options.scheduler;
    this.#diagnostics = options.diagnostics;
    this.#onStall = options.onStall;
    this.#onProgress = options.onProgress;
  }

  /** True once the session was disposed or stalled; later work is inert. */
  get disposed(): boolean {
    return this.#disposed;
  }

  /** Current replay state for diagnostics and tests. */
  get state(): TerminalReplayState {
    return { replaying: this.#replayText.length > 0, writing: this.#writing };
  }

  /** Canonical bytes of the replay that remain unwritten. */
  get remainingCanonicalBytes(): number {
    return canonicalBytesFrom(this.#replayText, this.#replayOffset);
  }

  /** The admitted snapshot the session retains, or `null`. */
  get retained(): TerminalAdmission | null {
    return this.#retained;
  }

  /** The single newer replacement awaiting the next write callback, or `null`. */
  get pending(): TerminalAdmission | null {
    return this.#pending;
  }

  /**
   * Applies an already-admitted replacement snapshot.
   *
   * The first snapshot starts a reset-and-replay immediately. While a write is
   * in flight, only the newest snapshot is kept in the single pending slot; any
   * older pending replacement is dropped, never queued.
   *
   * @param admission Admitted canonical transcript. Rejections do not reach here.
   */
  apply(admission: TerminalAdmission): void {
    if (this.#disposed) {
      return;
    }
    this.#retained = admission;
    this.#diagnostics.retainedBytes = admission.bytes;
    if (this.#writing) {
      this.#pending = admission;
      this.#diagnostics.pendingBytes = admission.bytes;
      this.#diagnostics.queueDepth = 1;
      return;
    }
    this.#beginReplay(admission.text);
    this.#notify();
  }

  /**
   * Releases the retained and pending snapshots and cancels the deadline.
   *
   * A library write that is already queued cannot be recalled, so the owning
   * attachment disposes the emulator after calling this method. Its late
   * callback finds a disposed session and is ignored.
   */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#scheduler.clearDeadline();
    this.#retained = null;
    this.#pending = null;
    this.#replayText = "";
    this.#replayOffset = 0;
    this.#writing = false;
    this.#diagnostics.retainedBytes = 0;
    this.#diagnostics.pendingBytes = 0;
    this.#diagnostics.inFlightBytes = 0;
    this.#diagnostics.queueDepth = 0;
    this.#diagnostics.deadlinePending = false;
  }

  #beginReplay(text: string): void {
    this.#writer.reset();
    this.#replayText = text;
    this.#replayOffset = 0;
    this.#pending = null;
    this.#diagnostics.pendingBytes = 0;
    this.#diagnostics.queueDepth = 0;
    this.#pump();
  }

  #pump(): void {
    if (this.#disposed) {
      return;
    }
    if (this.#replayOffset >= this.#replayText.length) {
      this.#finishReplay();
      return;
    }
    const { end } = nextWriteChunk(this.#replayText, this.#replayOffset);
    if (end === this.#replayOffset) {
      // Defensive: an admitted snapshot always makes progress; fail closed
      // instead of looping if a future change broke that invariant.
      this.#stall("The synthetic terminal could not advance its replay.");
      return;
    }
    const canonical = this.#replayText.slice(this.#replayOffset, end);
    const rendered = renderWriteChunk(canonical);
    const encoded = encodedWriteBytes(rendered);
    if (encoded > TERMINAL_WRITE_ENCODED_LIMIT) {
      this.#stall("The synthetic terminal exceeded its single-write limit.");
      return;
    }
    this.#replayOffset = end;
    this.#writing = true;
    this.#diagnostics.inFlightBytes = encoded;
    const token = ++this.#writeToken;
    this.#scheduler.setDeadline(TERMINAL_STALL_DEADLINE_MS, () => {
      this.#stall(
        "The terminal stopped accepting output for five seconds. The surface was closed; reopen it to try again.",
      );
    });
    this.#writer.write(rendered, () => {
      this.#onWritten(token);
    });
  }

  #onWritten(token: number): void {
    // One callback per write: a duplicate or late callback from an earlier write
    // cannot advance the replay or clear the current write's deadline.
    if (this.#disposed || !this.#writing || token !== this.#writeToken) {
      return;
    }
    this.#scheduler.clearDeadline();
    this.#writing = false;
    this.#diagnostics.inFlightBytes = 0;
    const pending = this.#pending;
    if (pending !== null) {
      this.#beginReplay(pending.text);
      this.#notify();
      return;
    }
    this.#pump();
    this.#notify();
  }

  #finishReplay(): void {
    this.#replayText = "";
    this.#replayOffset = 0;
    this.#diagnostics.inFlightBytes = 0;
    this.#diagnostics.deadlinePending = false;
    this.#notify();
  }

  #notify(): void {
    if (this.#disposed) {
      return;
    }
    this.#onProgress?.();
  }

  #stall(message: string): void {
    if (this.#disposed) {
      return;
    }
    this.dispose();
    this.#onStall(message);
  }
}
