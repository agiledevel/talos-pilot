import { formatBytes, formatCount } from "../../lib/format/units";
import type { TerminalAdmission } from "./terminalSnapshot";

/**
 * Visible state of one synthetic terminal attachment.
 *
 * The attachment owns the replay session and writes this projection: the
 * component renders it and never inspects the emulator's buffer. Notices are
 * deliberately separate from the transcript, so an eviction or rejection is
 * visible without being mistaken for terminal output.
 */
export class TerminalSurfaceState {
  /** Attachment state: no admitted snapshot yet, showing data, or failed. */
  status = $state<"idle" | "ready" | "failed">("idle");
  /** Eviction summary of the last admitted replacement, or `null`. */
  notice = $state<string | null>(null);
  /** Visible rejection of an unsupported proposal; accepted output is preserved. */
  rejection = $state<string | null>(null);
  /** A stalled write or failed initialization; the surface needs a reopen. */
  failure = $state<string | null>(null);
  /** UTF-8 bytes of the admitted snapshot. */
  retainedBytes = $state(0);
  /** Logical lines of the admitted snapshot. */
  retainedLines = $state(0);
  /** True while admitted text is still being written to the emulator. */
  replaying = $state(false);
  /** Rows the emulator currently retains, including scrollback and wrapped rows. */
  emulatorRows = $state(0);
  /** Bounded text of the emulator's oldest retained row. */
  emulatorFirstLine = $state("");
  /** Bounded text of the emulator's newest retained row. */
  emulatorLastLine = $state("");
  /** First visible row index reported by the emulator's scroll event. */
  emulatorViewportRow = $state(0);
  /** Row index at the bottom of the emulator buffer. */
  emulatorBaseRow = $state(0);

  /** Returns the surface to its pre-attachment state for a fresh open. */
  reset(): void {
    this.status = "idle";
    this.notice = null;
    this.rejection = null;
    this.failure = null;
    this.retainedBytes = 0;
    this.retainedLines = 0;
    this.replaying = false;
    this.emulatorRows = 0;
    this.emulatorFirstLine = "";
    this.emulatorLastLine = "";
    this.emulatorViewportRow = 0;
    this.emulatorBaseRow = 0;
  }

  /**
   * Publishes an admitted replacement.
   *
   * @param admission Admitted canonical transcript.
   */
  accepted(admission: TerminalAdmission): void {
    this.status = "ready";
    this.rejection = null;
    this.failure = null;
    this.retainedBytes = admission.bytes;
    this.retainedLines = admission.lines;
    this.notice = evictionNotice(admission);
  }

  /**
   * Publishes a rejected proposal without touching accepted output.
   *
   * @param message Bounded rejection message from the admission boundary.
   */
  rejected(message: string): void {
    this.rejection = message;
  }

  /**
   * Publishes a terminal failure; the attachment disposes the instance.
   *
   * @param message Bounded failure message.
   */
  fail(message: string): void {
    this.status = "failed";
    this.failure = message;
    this.notice = null;
    this.replaying = false;
  }

  /**
   * Publishes replay progress.
   *
   * @param replaying Whether admitted text remains to be written.
   */
  progress(replaying: boolean): void {
    this.replaying = replaying;
  }

  /**
   * Publishes a bounded inspection of the real emulator buffer.
   *
   * Only the row count and the first/last row text cross this boundary, so
   * diagnostics can prove that replay happened and stayed inside the scrollback
   * bound without copying the transcript into renderer state.
   *
   * @param inspection Row count and bounded boundary text.
   */
  observeEmulator(inspection: {
    readonly rows: number;
    readonly firstLine: string;
    readonly lastLine: string;
    readonly viewportRow: number;
    readonly baseRow: number;
  }): void {
    this.emulatorRows = Math.max(0, Math.trunc(inspection.rows));
    this.emulatorFirstLine = inspection.firstLine.slice(0, 120);
    this.emulatorLastLine = inspection.lastLine.slice(0, 120);
    this.emulatorViewportRow = Math.max(0, Math.trunc(inspection.viewportRow));
    this.emulatorBaseRow = Math.max(0, Math.trunc(inspection.baseRow));
  }
}

function evictionNotice(admission: TerminalAdmission): string | null {
  if (admission.evictedLines === 0 && admission.evictedBytes === 0) {
    return null;
  }
  const lineCount = admission.evictedLines;
  const evicted =
    lineCount > 0
      ? `${formatCount(lineCount)} older ${lineCount === 1 ? "line" : "lines"} (${formatBytes(admission.evictedBytes)})`
      : formatBytes(admission.evictedBytes);
  const partial = admission.partialLine
    ? " The retained line starts mid-line because one line exceeded the byte ceiling."
    : "";
  return `Retained the newest ${formatCount(admission.lines)} ${admission.lines === 1 ? "line" : "lines"} (${formatBytes(admission.bytes)}) and evicted ${evicted}.${partial}`;
}
