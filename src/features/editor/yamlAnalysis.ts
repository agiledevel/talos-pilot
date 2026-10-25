import { parseDocument } from "yaml";
import {
  documentLimitMessage,
  isWithinDocumentLimit,
  utf8ByteLengthAtMost,
  YAML_DOCUMENT_LIMIT_BYTES,
} from "./documentBounds";

export { YAML_DOCUMENT_LIMIT_BYTES } from "./documentBounds";
/** Largest number of diagnostics returned for one document. */
export const YAML_DIAGNOSTIC_LIMIT = 20;
/** Longest diagnostic message returned to the renderer. */
export const YAML_DIAGNOSTIC_MESSAGE_LIMIT = 240;

/** One problem reported by the YAML worker, using Monaco's one-based positions. */
export interface YamlDiagnostic {
  /** Safe, human-readable problem description. */
  readonly message: string;
  /** One-based line of the first character. */
  readonly line: number;
  /** One-based column of the first character. */
  readonly column: number;
  /** One-based line of the character after the problem. */
  readonly endLine: number;
  /** One-based column of the character after the problem. */
  readonly endColumn: number;
}

/** Result of analysing one document in the worker. */
export interface YamlAnalysis {
  /** Diagnostics in source order, bounded by {@link YAML_DIAGNOSTIC_LIMIT}. */
  readonly diagnostics: readonly YamlDiagnostic[];
}

/** Request sent from the editor state to the dedicated YAML worker. */
export interface YamlWorkerRequest {
  /** Monotonic identity used to ignore a superseded response. */
  readonly requestId: number;
  /** Document text; rejected when it exceeds {@link YAML_DOCUMENT_LIMIT_BYTES}. */
  readonly text: string;
}

/** Response sent by the dedicated YAML worker. */
export interface YamlWorkerResponse {
  /** Echo of {@link YamlWorkerRequest.requestId}. */
  readonly requestId: number;
  /** Bounded diagnostics produced by the upstream YAML parser. */
  readonly diagnostics: readonly YamlDiagnostic[];
}

function clampMessage(message: string): string {
  if (message.length <= YAML_DIAGNOSTIC_MESSAGE_LIMIT) {
    return message;
  }
  return `${message.slice(0, YAML_DIAGNOSTIC_MESSAGE_LIMIT - 1)}…`;
}

function toDiagnostic(
  message: string,
  line: number,
  column: number,
  endLine: number,
  endColumn: number,
): YamlDiagnostic {
  return {
    message: clampMessage(message),
    line: Math.max(1, line),
    column: Math.max(1, column),
    endLine: Math.max(1, endLine),
    endColumn: Math.max(1, endColumn),
  };
}

/**
 * Parses a YAML document with the pinned upstream parser and returns bounded
 * diagnostics for its syntactic and structural errors.
 *
 * The function is shared by the dedicated worker and its deterministic tests.
 * It never fetches schemas or remote documents: the parser receives only the
 * supplied text. A document above {@link YAML_DOCUMENT_LIMIT_BYTES} is rejected
 * without parsing so one oversized paste cannot occupy the worker or the
 * renderer.
 *
 * @param text Untrusted YAML source from the synthetic editor model.
 * @returns At most {@link YAML_DIAGNOSTIC_LIMIT} one-based diagnostics.
 */
export function analyzeYaml(text: string): YamlAnalysis {
  // The shared admission check counts UTF-8 bytes without allocating a second
  // copy of a large paste and stops as soon as the ceiling is crossed.
  if (utf8ByteLengthAtMost(text, YAML_DOCUMENT_LIMIT_BYTES) === null) {
    return {
      diagnostics: [toDiagnostic(documentLimitMessage(YAML_DOCUMENT_LIMIT_BYTES), 1, 1, 1, 2)],
    };
  }

  try {
    const document = parseDocument(text, {
      prettyErrors: true,
      strict: true,
      uniqueKeys: true,
    });
    const diagnostics = document.errors
      .slice(0, YAML_DIAGNOSTIC_LIMIT)
      .map((error): YamlDiagnostic => {
        const start = error.linePos?.[0];
        const end = error.linePos?.[1] ?? start;
        const line = start?.line ?? 1;
        const column = start?.col ?? 1;
        const endLine = end?.line ?? line;
        const endColumn = end?.col ?? column;
        return toDiagnostic(
          error.message,
          line,
          column,
          endLine,
          endColumn <= column && endLine === line ? column + 1 : endColumn,
        );
      });
    return { diagnostics };
  } catch {
    // The parser should report malformed input through `errors`; a thrown
    // exception can only mean an internal failure. Do not expose its detail.
    return {
      diagnostics: [toDiagnostic("The YAML worker could not analyze this document.", 1, 1, 1, 1)],
    };
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function isDiagnostic(value: unknown): value is YamlDiagnostic {
  return (
    isRecord(value) &&
    typeof value.message === "string" &&
    value.message.length > 0 &&
    value.message.length <= YAML_DIAGNOSTIC_MESSAGE_LIMIT &&
    isPositiveInteger(value.line) &&
    isPositiveInteger(value.column) &&
    isPositiveInteger(value.endLine) &&
    isPositiveInteger(value.endColumn)
  );
}

/**
 * Validates a worker response at the renderer boundary.
 *
 * Worker messages are untrusted runtime data even though this repository owns
 * the worker: a bundle, a stale worker, or a future change must not be able to
 * inject an unchecked object into the editor state.
 *
 * @param value Message payload received from the YAML worker.
 * @returns True only for a complete, bounded response.
 */
export function isYamlWorkerResponse(value: unknown): value is YamlWorkerResponse {
  return (
    isRecord(value) &&
    isPositiveInteger(value.requestId) &&
    Array.isArray(value.diagnostics) &&
    value.diagnostics.length <= YAML_DIAGNOSTIC_LIMIT &&
    value.diagnostics.every(isDiagnostic)
  );
}

/**
 * Validates a request before the worker parses it. Only the renderer sends
 * requests, but a malformed or oversized message must not reach the parser or
 * be echoed. This is defense in depth behind the renderer's pre-model check.
 *
 * @param value Message payload received by the worker.
 * @returns True only for a complete request whose text fits the UTF-8 byte ceiling.
 */
export function isYamlWorkerRequest(value: unknown): value is YamlWorkerRequest {
  return (
    isRecord(value) &&
    isPositiveInteger(value.requestId) &&
    typeof value.text === "string" &&
    isWithinDocumentLimit(value.text, YAML_DOCUMENT_LIMIT_BYTES)
  );
}
