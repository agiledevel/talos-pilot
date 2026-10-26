import { createHash } from "node:crypto";
import {
  closeSync,
  constants,
  fstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, sep } from "node:path";

/** Bounds on the few distro data files linuxdeploy can copy with execute bits. */
export const APPIMAGE_DATA_LIMITS = {
  files: 256,
  fileBytes: 1024 * 1024,
  totalBytes: 32 * 1024 * 1024,
} as const;

/**
 * The only system data paths eligible for byte-for-byte source verification.
 * This is not a path allowlist: a matching name alone never exempts a file.
 */
export function isAppImageSystemDataPath(path: string): boolean {
  return (
    /^usr\/share\/doc\/[a-z0-9][a-z0-9+.-]*\/copyright$/u.test(path) ||
    /^usr\/share\/glib-2\.0\/schemas\/(?:gschema\.dtd|[A-Za-z0-9][A-Za-z0-9_.-]*\.gschema\.(?:xml|override))$/u.test(
      path,
    )
  );
}

function readData(path: string, requireNonExecutable: boolean): Buffer {
  // Nonblocking open lets fstat reject a FIFO/device without waiting on it.
  const fd = openSync(path, constants.O_RDONLY | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || (requireNonExecutable && (info.mode & 0o111) !== 0)) {
      throw new Error(
        `the source must be a regular non-executable system file (regular=${info.isFile()}, mode=0${info.mode.toString(8)})`,
      );
    }
    if (info.size > APPIMAGE_DATA_LIMITS.fileBytes)
      throw new Error("data file exceeds its byte limit");
    // Bound allocation/read to the observed size plus one byte. Growth or
    // truncation after fstat is an error, never a truncated equality proof.
    const bytes = Buffer.alloc(info.size + 1);
    let length = 0;
    while (length < bytes.length) {
      const count = readSync(fd, bytes, length, bytes.length - length, null);
      if (count === 0) break;
      length += count;
    }
    if (length !== info.size) throw new Error("data file changed size during inspection");
    const data = bytes.subarray(0, length);
    if (data.includes(0) || (data[0] === 0x23 && data[1] === 0x21)) {
      throw new Error("data must not contain binary or shebang-script content");
    }
    new TextDecoder("utf-8", { fatal: true }).decode(data);
    return data;
  } finally {
    closeSync(fd);
  }
}

/** A verified data copy, suitable for audit logging alongside the payload check. */
export interface VerifiedAppImageData {
  readonly bytes: number;
  readonly sha256: string;
}

/** Bounds for the pre-bundle OS reference, which includes data not ultimately bundled. */
export const APPIMAGE_REFERENCE_LIMITS = { entries: 10_000, bytes: 256 * 1024 * 1024 } as const;

/** The number and size of reference files preserved, and explicitly rejected candidates. */
export interface AppImageReferenceSummary {
  readonly files: number;
  readonly bytes: number;
  readonly skipped: number;
}

/**
 * Copies eligible OS data before any bundler can change its modes or contents.
 *
 * Creates a new private destination and independent read-only files, never hard
 * links. Unsupported candidates are reported and omitted; verification of a
 * bundled omitted file still fails because no reference exists. Bounds or I/O
 * failures while writing abort and remove only this function's new directory.
 * Existing destinations are never reused, overwritten or removed.
 *
 * @throws When roots are unreadable, the destination exists, a reference bound
 * is exceeded, or the snapshot cannot be written/reported completely.
 */
export function snapshotAppImageSystemData(
  systemRoot: string,
  destination: string,
  reportSkip: (message: string) => void = (message) => console.warn(message),
): AppImageReferenceSummary {
  const doc = "usr/share/doc";
  const schemas = "usr/share/glib-2.0/schemas";
  const docs = readdirSync(join(systemRoot, doc), { withFileTypes: true });
  const schemaFiles = readdirSync(join(systemRoot, schemas), { withFileTypes: true });
  if (docs.length + schemaFiles.length > APPIMAGE_REFERENCE_LIMITS.entries)
    throw new Error("AppImage reference entry bound exceeded.");
  const candidates = [
    ...docs
      .filter((entry) => entry.isDirectory() || entry.isSymbolicLink())
      .map((entry) => `${doc}/${entry.name}/copyright`),
    ...schemaFiles.map((entry) => `${schemas}/${entry.name}`),
  ]
    .filter(isAppImageSystemDataPath)
    .sort();
  mkdirSync(destination, { mode: 0o700 });
  let files = 0;
  let bytes = 0;
  let skipped = 0;
  try {
    for (const path of candidates) {
      let data: Buffer;
      try {
        const subtree = path.startsWith(`${doc}/`) ? doc : schemas;
        const root = realpathSync(join(systemRoot, subtree));
        const source = realpathSync(join(systemRoot, path));
        if (!source.startsWith(`${root}${sep}`))
          throw new Error("source symlink escapes its data subtree");
        data = readData(source, true);
      } catch (error) {
        skipped += 1;
        const cause = error instanceof Error ? error.message : String(error);
        reportSkip(`Omitted AppImage reference ${path}: ${cause}`);
        continue;
      }
      bytes += data.length;
      if (bytes > APPIMAGE_REFERENCE_LIMITS.bytes)
        throw new Error("AppImage reference byte bound exceeded.");
      const file = join(destination, path);
      mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
      writeFileSync(file, data, { flag: "wx", mode: 0o444 });
      files += 1;
    }
    return { files, bytes, skipped };
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  }
}

/**
 * Proves that a candidate is unchanged non-executable data from the build OS.
 *
 * Both roots are caller-owned/trusted inspection inputs, never renderer inputs.
 * `systemRoot` defaults to the build OS. Hosted packaging must instead pass
 * the private reference captured before bundling; the live tree after a build
 * is not a pristine reference. Tests inject a synthetic OS tree.
 * Symlinks must resolve within the matching doc/schema subtree. No file is
 * modified, installed or executed. Unknown paths and any missing, changed,
 * executable, binary, oversized or unreadable source fail closed.
 *
 * @throws When the candidate cannot be proven to be an unchanged data copy.
 */
export function verifyAppImageSystemData(
  payloadRoot: string,
  path: string,
  systemRoot = "/",
): VerifiedAppImageData {
  try {
    if (!isAppImageSystemDataPath(path)) throw new Error("not a declared system data path");
    const subtree = path.startsWith("usr/share/doc/")
      ? "usr/share/doc"
      : "usr/share/glib-2.0/schemas";
    const sourceRoot = realpathSync(join(systemRoot, subtree));
    const sourcePath = realpathSync(join(systemRoot, path));
    if (!sourcePath.startsWith(`${sourceRoot}${sep}`))
      throw new Error("source symlink escapes its data subtree");
    const realPayloadRoot = realpathSync(payloadRoot);
    const payloadPath = realpathSync(join(payloadRoot, path));
    if (!payloadPath.startsWith(`${realPayloadRoot}${sep}`))
      throw new Error("payload symlink escapes its root");
    const source = readData(sourcePath, true);
    const payload = readData(payloadPath, false);
    if (!source.equals(payload)) throw new Error("payload bytes differ from the build OS data");
    return { bytes: payload.length, sha256: createHash("sha256").update(payload).digest("hex") };
  } catch (error) {
    const cause = error instanceof Error ? error.message : String(error);
    throw new Error(`Cannot verify AppImage system data ${path}: ${cause}.`, { cause: error });
  }
}
