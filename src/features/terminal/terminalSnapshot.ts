/**
 * Admission for the synthetic terminal's replacement snapshots.
 *
 * The feasibility terminal shows read-only synthetic text: printable characters
 * and LF newlines. A proposal is admitted before it is retained, copied into an
 * independent string, or handed to xterm.js. Oversized proposals keep their
 * newest suffix under both a UTF-8 byte ceiling and a logical-line ceiling, so
 * the caller never needs to split, encode, or copy the whole source first.
 *
 * The limits are retained-data limits for this surface. They are not a
 * whole-process heap bound and not a claim about the emulator's cell memory.
 */

/** UTF-8 byte ceiling of one admitted transcript, counted after CRLF folding. */
export const TERMINAL_BYTE_LIMIT = 1_048_576;

/**
 * Logical-line ceiling of one admitted transcript.
 *
 * A logical line is an LF-terminated segment or a final non-empty partial
 * segment. Empty text has zero lines, and a trailing LF adds no empty line.
 */
export const TERMINAL_LINE_LIMIT = 10_000;

/** Why a proposal was rejected; the prior accepted transcript is preserved. */
export interface TerminalRejection {
  readonly accepted: false;
  /** Bounded, user-visible explanation that never echoes transcript content. */
  readonly message: string;
  /** Offending code unit, useful for diagnostics and tests. */
  readonly codeUnit: number;
}

/** An admitted transcript in canonical LF form. */
export interface TerminalAdmission {
  readonly accepted: true;
  /**
   * Admitted text in canonical LF form, materialised as an independent string
   * of at most {@link TERMINAL_BYTE_LIMIT} UTF-8 bytes.
   */
  readonly text: string;
  /** UTF-8 bytes of {@link TerminalAdmission.text}. */
  readonly bytes: number;
  /** Logical lines of {@link TerminalAdmission.text}. */
  readonly lines: number;
  /** Oldest logical lines dropped to satisfy the line ceiling. */
  readonly evictedLines: number;
  /** Normalized bytes of the proposal that were not retained. */
  readonly evictedBytes: number;
  /**
   * True when the newest line alone exceeded the byte ceiling and only its
   * newest code-point-safe suffix was retained.
   */
  readonly partialLine: boolean;
}

/** Result of admitting one proposal. */
export type TerminalSnapshotAdmission = TerminalAdmission | TerminalRejection;

interface Inspection {
  readonly bytes: number;
  readonly lines: number;
}

/**
 * Admits a proposed replacement snapshot.
 *
 * The proposal is inspected once without allocating for its size, then only the
 * retained newest suffix is copied. CRLF pairs count and render as one LF;
 * lone surrogates count as the three UTF-8 bytes of U+FFFD, matching
 * `TextEncoder`, and are retained rather than silently dropped. Every other C0
 * control, DEL, and the C1 range is rejected instead of being reinterpreted as
 * terminal or markup syntax.
 *
 * @param proposal Text proposed by the synthetic owner or a user-visible action.
 * @returns The admitted canonical transcript, or a bounded rejection.
 */
export function admitTerminalSnapshot(proposal: string): TerminalSnapshotAdmission {
  const inspection = inspect(proposal);
  if ("codeUnit" in inspection) {
    return inspection;
  }
  const { start, lines, bytes, partialLine } = selectNewestSuffix(
    proposal,
    inspection.lines,
    inspection.bytes,
  );
  const text = materialise(proposal, start);
  return {
    accepted: true,
    text,
    bytes,
    lines,
    evictedLines: inspection.lines - lines,
    evictedBytes: inspection.bytes - bytes,
    partialLine,
  };
}

function rejection(codeUnit: number, description: string): TerminalRejection {
  const hex = codeUnit.toString(16).toUpperCase().padStart(4, "0");
  return {
    accepted: false,
    codeUnit,
    message: `The synthetic terminal accepts printable text and LF newlines only; ${description} (U+${hex}) was rejected. Nothing was changed.`,
  };
}

/**
 * Validates the whole proposal and counts its normalized bytes and lines.
 *
 * The validation covers the entire proposal, not only the retained suffix, so a
 * hostile control character is rejected rather than being hidden by eviction.
 * The pass allocates nothing proportional to the proposal size.
 */
function inspect(text: string): Inspection | TerminalRejection {
  let bytes = 0;
  let lines = 0;
  const length = text.length;
  for (let index = 0; index < length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) !== 10) {
        return rejection(code, "a bare carriage return");
      }
      // A CRLF pair is one normalized newline and one byte.
      bytes += 1;
      lines += 1;
      index += 1;
      continue;
    }
    if (code === 10) {
      bytes += 1;
      lines += 1;
      continue;
    }
    if (code < 0x20 || (code >= 0x7f && code <= 0x9f)) {
      return rejection(
        code,
        code === 27
          ? "an escape sequence"
          : code === 8
            ? "a backspace control"
            : "an unsupported terminal control",
      );
    }
    if (code < 0x80) {
      bytes += 1;
      continue;
    }
    if (code < 0x800) {
      bytes += 2;
      continue;
    }
    if (isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index += 1;
      continue;
    }
    // BMP text and lone surrogates (U+FFFD under TextEncoder semantics).
    bytes += 3;
  }
  // A final non-empty segment that is not LF-terminated is one more logical line.
  if (length > 0 && text.charCodeAt(length - 1) !== 10) {
    lines += 1;
  }
  return { bytes, lines };
}

interface SuffixSelection {
  readonly start: number;
  readonly lines: number;
  readonly bytes: number;
  readonly partialLine: boolean;
}

/**
 * Finds the newest suffix that satisfies both ceilings.
 *
 * Complete old lines are dropped first. Only when the newest line alone exceeds
 * the byte ceiling is its newest code-point-safe suffix retained. Every scan is
 * backward and allocation-free, so an oversized proposal is never split into a
 * line array or encoded in full.
 */
function selectNewestSuffix(text: string, totalLines: number, totalBytes: number): SuffixSelection {
  if (totalBytes <= TERMINAL_BYTE_LIMIT && totalLines <= TERMINAL_LINE_LIMIT) {
    return { start: 0, lines: totalLines, bytes: totalBytes, partialLine: false };
  }

  let lineEnd = text.length;
  let lines = 0;
  let bytes = 0;
  let start = text.length;
  while (lineEnd > 0) {
    const lineStart = previousLineStart(text, lineEnd);
    const lineBytes = countBytes(text, lineStart, lineEnd);
    if (lines + 1 > TERMINAL_LINE_LIMIT) {
      break;
    }
    if (bytes + lineBytes > TERMINAL_BYTE_LIMIT) {
      if (lines === 0) {
        // One line is larger than the whole byte budget: keep its newest suffix.
        const cut = newestSuffixStart(text, lineStart, lineEnd);
        return {
          start: cut,
          lines: 1,
          bytes: countBytes(text, cut, lineEnd),
          partialLine: true,
        };
      }
      break;
    }
    lines += 1;
    bytes += lineBytes;
    start = lineStart;
    lineEnd = lineStart;
  }
  return { start, lines, bytes, partialLine: start > 0 && text.charCodeAt(start - 1) !== 10 };
}

/** Returns the start index of the logical line that ends at `lineEnd`. */
function previousLineStart(text: string, lineEnd: number): number {
  // A trailing LF terminates the line; the segment before it is the content.
  const contentEnd = text.charCodeAt(lineEnd - 1) === 10 ? lineEnd - 1 : lineEnd;
  let index = contentEnd;
  while (index > 0 && text.charCodeAt(index - 1) !== 10) {
    index -= 1;
  }
  return index;
}

/** Start index of the newest suffix of a single line that fits the byte ceiling. */
function newestSuffixStart(text: string, lineStart: number, lineEnd: number): number {
  let bytes = 0;
  let index = lineEnd;
  while (index > lineStart) {
    const last = text.charCodeAt(index - 1);
    let codePointStart = index - 1;
    let codePointBytes: number;
    if (last === 10 && index - 2 >= lineStart && text.charCodeAt(index - 2) === 13) {
      // Keep the CRLF pair together and count the normalized LF only.
      codePointStart = index - 2;
      codePointBytes = 1;
    } else if (last < 0x80) {
      codePointBytes = 1;
    } else if (last < 0x800) {
      codePointBytes = 2;
    } else if (isLowSurrogate(last) && index - 2 >= lineStart) {
      const previous = text.charCodeAt(index - 2);
      if (isHighSurrogate(previous)) {
        codePointStart = index - 2;
        codePointBytes = 4;
      } else {
        codePointBytes = 3;
      }
    } else {
      codePointBytes = 3;
    }
    if (bytes + codePointBytes > TERMINAL_BYTE_LIMIT) {
      break;
    }
    bytes += codePointBytes;
    index = codePointStart;
  }
  return index;
}

/** Counts normalized UTF-8 bytes of a range without allocating. */
function countBytes(text: string, from: number, to: number): number {
  let bytes = 0;
  for (let index = from; index < to; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      // A validated CR is always followed by LF; the pair counts as one byte.
      index += 1;
      bytes += 1;
    } else if (code < 0x80) {
      bytes += 1;
    } else if (code < 0x800) {
      bytes += 2;
    } else if (isHighSurrogate(code) && isLowSurrogate(text.charCodeAt(index + 1))) {
      bytes += 4;
      index += 1;
    } else {
      bytes += 3;
    }
  }
  return bytes;
}

/**
 * Materialises the retained range as an independent canonical string.
 *
 * Joining two slices returns a flat string instead of a view that would keep an
 * oversized proposal alive. The temporary parts are bounded by the admitted
 * ceiling, and CRLF folding is applied only to the retained range.
 */
function materialise(text: string, start: number): string {
  if (start >= text.length) {
    return "";
  }
  if (text.indexOf("\r", start) !== -1) {
    return text.slice(start).replaceAll("\r\n", "\n");
  }
  const middle = start + Math.floor((text.length - start) / 2);
  return [text.slice(start, middle), text.slice(middle)].join("");
}

function isHighSurrogate(code: number): boolean {
  return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
  return code >= 0xdc00 && code <= 0xdfff;
}
