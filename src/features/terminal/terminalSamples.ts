import { TERMINAL_BYTE_LIMIT, TERMINAL_LINE_LIMIT } from "./terminalSnapshot";

/**
 * Synthetic terminal snapshots generated on demand by the Home surface.
 *
 * This owner stores only the requested kind and a small sequence number. Each
 * snapshot is materialized synchronously when the surface asks for it, so an
 * oversized proposal never lives in reactive state, a component prop, or a
 * session option between renders.
 */

/** Kinds of synthetic replacement offered by the feasibility surface. */
export type TerminalSampleKind =
  | "sample"
  | "byte-over"
  | "line-over"
  | "burst"
  | "long-line"
  | "empty"
  | "control";

/** Lines in the ordinary sample snapshot. */
export const TERMINAL_SAMPLE_LINE_COUNT = 24;

/** Lines in the burst snapshot, comfortably beyond the line ceiling. */
export const TERMINAL_BURST_LINE_COUNT = 12_000;

/** Bytes of the single-line snapshot before its marker tail. */
const LONG_LINE_BYTES = 1_500_000;

/**
 * Builds one synthetic snapshot.
 *
 * The text is benign, offline, and contains no credential or cluster data. It
 * exists to exercise retention, eviction, replay, and rejection visibly.
 *
 * @param kind Requested snapshot kind.
 * @param sequence Small sequence number shown in the ordinary sample.
 * @returns A newly generated proposal string.
 */
export function syntheticTerminalText(kind: TerminalSampleKind, sequence: number): string {
  switch (kind) {
    case "sample":
      return sampleSnapshot(sequence);
    case "byte-over":
      // Exactly one byte beyond the UTF-8 ceiling in a single line.
      return "a".repeat(TERMINAL_BYTE_LIMIT + 1);
    case "line-over":
      // Short lines so the line ceiling, not the byte ceiling, evicts exactly one line.
      return lineSnapshot(TERMINAL_LINE_LIMIT + 1, "synthetic");
    case "burst":
      return lineSnapshot(TERMINAL_BURST_LINE_COUNT, "synthetic terminal output ".repeat(4).trim());
    case "long-line":
      return `BEGIN-OF-LONG-LINE ${"x".repeat(LONG_LINE_BYTES)} NEWEST-TAIL`;
    case "empty":
      return "";
    case "control":
      // An escape sequence must be rejected without changing accepted output.
      return `${sampleSnapshot(sequence)}\u001b[31msynthetic red\u001b[0m\n`;
  }
}

function sampleSnapshot(sequence: number): string {
  const header = `$ synthetic-preview --offline --no-cluster (run ${String(sequence)})\n`;
  const lines = Array.from({ length: TERMINAL_SAMPLE_LINE_COUNT }, (_unused, index) => {
    const number = String(index + 1).padStart(2, "0");
    return `2026-10-25T12:00:${number}Z  INFO  batch-${number}  prepared=1  target=synthetic-preview\n`;
  });
  return `${header}${lines.join("")}synthetic-preview completed ${String(TERMINAL_SAMPLE_LINE_COUNT)} steps\n`;
}

function lineSnapshot(count: number, label: string): string {
  const lines = Array.from(
    { length: count },
    (_unused, index) => `line ${String(index + 1).padStart(6, "0")} ${label}\n`,
  );
  return lines.join("");
}
