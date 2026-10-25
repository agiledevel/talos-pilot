/**
 * Byte bounds shared by the synthetic YAML editor, the read-only diff and the
 * dedicated analysis worker.
 *
 * The ceiling is a UTF-8 **byte** limit, not a JavaScript string-length limit:
 * one 4-byte code point costs four bytes, and a lone surrogate encodes as a
 * three-byte replacement character, matching `TextEncoder`. The check runs
 * before a model is created or programmatically replaced and before text crosses
 * the YAML worker boundary. A user edit is admitted from Monaco's content event
 * and synchronously reverted if oversized; the rejected text is not retained in
 * the model after that event, the worker queue or the owner's accepted state.
 * Model admission also checks the size after Monaco's newline normalization,
 * which can expand mixed or standalone-CR line endings to CRLF.
 */

/** Largest UTF-8 document accepted by the editor, the diff and the worker, in bytes. */
export const YAML_DOCUMENT_LIMIT_BYTES = 64 * 1024;

/** Result of admitting a document against the UTF-8 byte ceiling. */
export type DocumentAdmission =
  | {
      /** The text fits the ceiling and may be used as a model or worker message. */
      readonly accepted: true;
      /** The admitted text, unchanged. */
      readonly text: string;
      /** Source UTF-8 byte length; source and normalized model both fit the ceiling. */
      readonly bytes: number;
    }
  | {
      /** The text exceeds the ceiling and must not reach a model or the worker. */
      readonly accepted: false;
      /** Safe, user-visible explanation that names the ceiling. */
      readonly message: string;
    };

/**
 * Returns the UTF-8 byte length of `text` when it is at most `limit`, or `null`
 * when it exceeds the limit.
 *
 * The scan is allocation-conscious: `TextEncoder.encode` would allocate a new
 * byte array for the whole document, including a rejected paste. Instead the
 * function rejects by string length first (UTF-8 bytes are never fewer than
 * UTF-16 code units), then counts code units and stops at the first byte above
 * the limit. Surrogate pairs count as four bytes; an unpaired surrogate counts
 * as the three bytes of the replacement character that `TextEncoder` emits.
 *
 * @param text Document text to measure. It is not retained.
 * @param limit Maximum accepted UTF-8 byte length; must be a positive integer.
 * @returns The exact byte length, or `null` when `text` exceeds `limit`.
 */
export function utf8ByteLengthAtMost(
  text: string,
  limit: number = YAML_DOCUMENT_LIMIT_BYTES,
): number | null {
  if (text.length > limit) {
    return null;
  }
  let bytes = 0;
  for (let index = 0; index < text.length; index += 1) {
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
    if (bytes > limit) {
      return null;
    }
  }
  return bytes;
}

/**
 * Reports whether a document fits the UTF-8 byte ceiling.
 *
 * This raw-byte predicate bounds the validation queue and worker request
 * boundary. Model and diff admission use {@link admitDocument} to additionally
 * account for Monaco's newline normalization.
 *
 * @param text Document text, such as a user paste, controlled replacement or worker message.
 * @param limit Maximum accepted UTF-8 byte length.
 * @returns True only when the text fits the ceiling.
 */
export function isWithinDocumentLimit(
  text: string,
  limit: number = YAML_DOCUMENT_LIMIT_BYTES,
): boolean {
  return utf8ByteLengthAtMost(text, limit) !== null;
}

/**
 * Builds the safe message shown when a document is rejected.
 *
 * The message names the byte ceiling and states that nothing changed. It is
 * constant text, so it cannot echo untrusted document content; it also covers
 * a rejected initial document, which has no previous text to keep.
 *
 * @param limit Rejected ceiling, in UTF-8 bytes.
 * @returns A user-visible rejection message.
 */
export function documentLimitMessage(limit: number = YAML_DOCUMENT_LIMIT_BYTES): string {
  return `The document exceeds the ${String(limit)}-byte UTF-8 editor limit. Nothing was changed.`;
}

/**
 * Projects the stored model size without allocating a normalized string.
 *
 * Monaco 0.57's PieceTreeTextBufferBuilder selects CRLF when CR-containing line
 * endings (CR and CRLF) form a strict majority; ties select LF. It then rewrites
 * every CR/LF/CRLF ending and strips a leading BOM. With no line endings the
 * platform default EOL cannot affect the stored size. Keep this projection
 * covered against real Monaco models when upgrading the editor dependency.
 */
function normalizedModelBytes(text: string, sourceBytes: number): number {
  let cr = 0;
  let lf = 0;
  let crlf = 0;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    if (code === 13) {
      if (text.charCodeAt(index + 1) === 10) {
        crlf += 1;
        index += 1;
      } else {
        cr += 1;
      }
    } else if (code === 10) {
      lf += 1;
    }
  }
  const bomBytes = text.charCodeAt(0) === 0xfeff ? 3 : 0;
  const newlineDelta = cr + crlf > (cr + lf + crlf) / 2 ? cr + lf : -crlf;
  return sourceBytes - bomBytes + newlineDelta;
}

/**
 * Admits or rejects one complete document before an owned model update or worker transfer.
 *
 * Both the source and Monaco's normalized model representation must fit the
 * ceiling. The returned text is unchanged: admission does not normalize or
 * truncate it. The caller keeps its previous accepted document on rejection
 * and shows {@link DocumentAdmission.message}. Callers must apply this check
 * before `createModel`, `setValue`, a diff-side replacement and
 * `Worker.postMessage`. Worker-only raw-byte checks use {@link isWithinDocumentLimit}.
 *
 * @param text Proposed document text.
 * @param limit Maximum accepted UTF-8 byte length.
 * @returns An accepted admission with its byte length, or a rejection message.
 */
export function admitDocument(
  text: string,
  limit: number = YAML_DOCUMENT_LIMIT_BYTES,
): DocumentAdmission {
  const bytes = utf8ByteLengthAtMost(text, limit);
  if (bytes === null || normalizedModelBytes(text, bytes) > limit) {
    return { accepted: false, message: documentLimitMessage(limit) };
  }
  return { accepted: true, text, bytes };
}

/** Result of admitting a diff's original and modified documents as one pair. */
export type DocumentPairAdmission =
  | {
      /** Both sides fit the ceiling and may replace the diff models together. */
      readonly accepted: true;
      /** Admitted original text, unchanged. */
      readonly original: string;
      /** Admitted modified text, unchanged. */
      readonly modified: string;
    }
  | {
      /** At least one side exceeds the ceiling; neither side may be applied. */
      readonly accepted: false;
      /** Safe, user-visible explanation that names the rejected side. */
      readonly message: string;
    };

/**
 * Admits both documents of a read-only diff as one atomic pair.
 *
 * The pair is the unit of replacement: if either side is oversized, the pair is
 * rejected and the caller keeps both previous documents. This prevents a
 * partially updated comparison from showing an unreviewed before/after mix.
 *
 * @param original Original document text.
 * @param modified Modified document text.
 * @param limit Maximum accepted UTF-8 byte length for each side.
 * @returns Both admitted texts, or one rejection message naming the side.
 */
export function admitDocumentPair(
  original: string,
  modified: string,
  limit: number = YAML_DOCUMENT_LIMIT_BYTES,
): DocumentPairAdmission {
  const before = admitDocument(original, limit);
  if (!before.accepted) {
    return { accepted: false, message: `The original document was rejected. ${before.message}` };
  }
  const after = admitDocument(modified, limit);
  if (!after.accepted) {
    return { accepted: false, message: `The modified document was rejected. ${after.message}` };
  }
  return { accepted: true, original: before.text, modified: after.text };
}
