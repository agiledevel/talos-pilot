import { createHash } from "node:crypto";
import { readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve, sep } from "node:path";

import { NOTICE_LIMITS, type NoticeText, type TextOrigin } from "./types.ts";

/** Directories that never hold redistributed licence text for a package or module. */
const SKIPPED_DIRECTORIES: ReadonlySet<string> = new Set([".git", "node_modules", "target"]);

/**
 * File names that carry licence, copyright or notice obligations: the usual
 * `LICENSE`/`LICENCE`/`COPYING`/`COPYRIGHT`/`NOTICE`/`UNLICENSE` shapes with an
 * optional suffix (`LICENSE-MIT`, `LICENSE.md`, `CopyrightNotice.txt`), plus
 * third-party notice files such as Monaco's `ThirdPartyNotices.txt`.
 */
const LICENCE_NAME_PATTERN = /^(?:licen[cs]e|copying|copyright|notice|unlicense)[a-z0-9._-]*$/iu;
const THIRD_PARTY_NAME_PATTERN = /^third[-_. ]?party[a-z0-9._-]*$/iu;
/**
 * Source files that merely start with a licence word are code, not attribution:
 * `objc2-foundation` ships `src/copying.rs`, which must not be read as a licence.
 */
const SOURCE_EXTENSION_PATTERN =
  /\.(?:[cm]?[jt]sx?|rs|go|py|rb|php|cs|swift|kt|java|c|h|cc|cpp|hpp|sh|bash|zsh|toml|ya?ml|json)$/iu;

/** Reports whether a file name carries licence, copyright or notice text. */
export function isLicenceFileName(name: string): boolean {
  if (SOURCE_EXTENSION_PATTERN.test(name)) {
    return false;
  }
  return LICENCE_NAME_PATTERN.test(name) || THIRD_PARTY_NAME_PATTERN.test(name);
}

/** A licence-like file found below a package root. */
export interface ScannedTextFile {
  /** Absolute path, already verified to resolve inside the package root. */
  readonly path: string;
  /** Path relative to the package root, using `/` separators. */
  readonly relativePath: string;
}

/** SHA-256 of the given bytes as lowercase hexadecimal. */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Reads one file after checking its declared size against a byte limit. */
export function readBoundedFile(path: string, maxBytes: number, label: string): Buffer {
  let size: number;
  try {
    size = statSync(path).size;
  } catch (error) {
    throw new Error(`${label} is unreadable: ${describe(error)}.`, { cause: error });
  }
  if (size > maxBytes) {
    throw new Error(
      `${label} declares ${String(size)} bytes, above the ${String(maxBytes)}-byte limit.`,
    );
  }
  const bytes = readFileSync(path);
  if (bytes.byteLength > maxBytes) {
    throw new Error(
      `${label} is ${String(bytes.byteLength)} bytes, above the ${String(maxBytes)}-byte limit.`,
    );
  }
  return bytes;
}

/** Decodes strict UTF-8; a non-text file is an error rather than lost attribution. */
export function decodeUtf8(bytes: Uint8Array, label: string): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch (error) {
    throw new Error(`${label} is not valid UTF-8 text.`, { cause: error });
  }
}

/** Builds a notice text entry from bytes that were already read and validated. */
export function noticeTextFromBytes(options: {
  readonly bytes: Uint8Array;
  readonly path: string;
  readonly provenance: string;
  readonly origin: TextOrigin;
  readonly source?: string;
}): NoticeText {
  const body = decodeUtf8(options.bytes, options.provenance);
  const base = {
    body,
    bytes: options.bytes.byteLength,
    origin: options.origin,
    path: options.path,
    provenance: options.provenance,
    sha256: sha256Hex(options.bytes),
  };
  return options.source === undefined ? base : { ...base, source: options.source };
}

/**
 * Resolves a path that must stay inside `root`.
 *
 * Symlinks are resolved before the containment test, so a file that escapes its
 * package root through a link is rejected instead of read. The returned path is
 * the resolved real path.
 *
 * @throws When the path does not exist or resolves outside the root.
 */
export function resolveInside(root: string, candidate: string, label: string): string {
  let realRoot: string;
  try {
    realRoot = realpathSync(root);
  } catch (error) {
    throw new Error(`${label}: root ${root} is unreadable: ${describe(error)}.`, { cause: error });
  }
  const absolute = isAbsolute(candidate) ? candidate : resolve(realRoot, candidate);
  let real: string;
  try {
    real = realpathSync(absolute);
  } catch (error) {
    throw new Error(`${label} is unreadable: ${describe(error)}.`, { cause: error });
  }
  if (real !== realRoot && !real.startsWith(`${realRoot}${sep}`)) {
    throw new Error(`${label} resolves outside ${realRoot}.`);
  }
  return real;
}

/**
 * Finds licence, copyright and notice files below a package or module root.
 *
 * The walk is deterministic (entries are sorted), bounded in depth and in the
 * number of entries read from one directory, skips directories that never hold
 * package obligations, and refuses symlinks that escape the root. The caller
 * applies the per-component file-count limit so curated texts count too.
 */
export function findLicenceFiles(root: string, limits = NOTICE_LIMITS): ScannedTextFile[] {
  const found: ScannedTextFile[] = [];
  const visited = new Set<string>();
  const walk = (directory: string, depth: number): void => {
    let entries;
    try {
      entries = readdirSync(directory, { withFileTypes: true });
    } catch (error) {
      throw new Error(`Cannot list ${directory}: ${describe(error)}.`, { cause: error });
    }
    if (entries.length > limits.directoryEntries) {
      throw new Error(
        `${directory} holds ${String(entries.length)} entries, above the ${String(
          limits.directoryEntries,
        )}-entry limit.`,
      );
    }
    for (const entry of [...entries].sort((left, right) =>
      compareCodeUnits(left.name, right.name),
    )) {
      // Skip by name before touching the entry: a dependency's own
      // `node_modules` link can resolve far outside its package root, and
      // following it would either read unrelated files or trip the escape
      // check on a directory that can never hold this package's obligations.
      if (SKIPPED_DIRECTORIES.has(entry.name)) {
        continue;
      }
      const candidate = join(directory, entry.name);
      let isFile = entry.isFile();
      let isDirectory = entry.isDirectory();
      if (entry.isSymbolicLink()) {
        let real: string;
        try {
          real = resolveInside(root, candidate, `licence link ${candidate}`);
        } catch (error) {
          throw new Error(`Refusing symlink below a package root: ${describe(error)}.`, {
            cause: error,
          });
        }
        const stat = statSync(real);
        isFile = stat.isFile();
        isDirectory = stat.isDirectory();
      }
      if (isDirectory) {
        if (depth >= limits.scanDepth) {
          continue;
        }
        let real: string;
        try {
          real = realpathSync(candidate);
        } catch (error) {
          throw new Error(`Cannot resolve ${candidate}: ${describe(error)}.`, { cause: error });
        }
        if (visited.has(real)) {
          continue;
        }
        visited.add(real);
        walk(candidate, depth + 1);
        continue;
      }
      if (!isFile || !isLicenceFileName(entry.name)) {
        continue;
      }
      found.push({
        path: candidate,
        relativePath: relative(root, candidate).split(sep).join("/"),
      });
    }
  };
  walk(root, 0);
  return found.sort((left, right) => compareCodeUnits(left.relativePath, right.relativePath));
}

/** Compares two strings by code unit so ordering never depends on the host locale. */
export function compareCodeUnits(left: string, right: string): number {
  if (left === right) {
    return 0;
  }
  return left < right ? -1 : 1;
}

/** Formats an unknown thrown value without leaking a stack or a full object dump. */
export function describe(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
