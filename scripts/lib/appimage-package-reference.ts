import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, relative, resolve, sep } from "node:path";

import {
  APPIMAGE_DATA_LIMITS,
  isAppImageSystemDataPath,
  readAppImageDataFile,
  verifyAppImageSystemData,
} from "./appimage-system-data.ts";

/** Narrow injectable subprocess boundary; never exposed through application IPC. */
export type ReferenceCommand = (command: string, args: readonly string[], cwd?: string) => string;

/** Trusted OS/process inputs; tests replace network/package queries with labelled fixtures. */
export interface ReferenceOptions {
  readonly systemRoot?: string;
  readonly run?: ReferenceCommand;
  readonly log?: (message: string) => void;
}

/** Hard bounds for downloaded Debian references, separate from payload-data limits. */
export const REFERENCE_ARCHIVE_LIMITS = {
  fileBytes: 64 * 1024 * 1024,
  totalBytes: 512 * 1024 * 1024,
} as const;

interface PackageIdentity {
  readonly name: string;
  readonly arch: string;
  readonly version: string;
  readonly identity: string;
  readonly spec: string;
}
interface Request {
  readonly path: string;
  readonly source: string;
  readonly pkg: PackageIdentity;
}

function identity(text: string): PackageIdentity {
  const match = /^([a-z0-9][a-z0-9+.-]*):(amd64|all)=([0-9][A-Za-z0-9.+:~_-]*)$/u.exec(text.trim());
  const name = match?.[1];
  const arch = match?.[2];
  const version = match?.[3];
  if (name === undefined || arch === undefined || version === undefined || version.length > 256)
    throw new Error("Invalid Ubuntu reference package identity.");
  return {
    name,
    arch,
    version,
    identity: `${name}:${arch}=${version}`,
    spec: `${name}${arch === "all" ? "" : `:${arch}`}=${version}`,
  };
}

function dataPaths(root: string): string[] {
  const paths: string[] = [];
  let entries = 0;
  const walk = (directory: string): void => {
    for (const entry of readdirSync(join(root, directory), { withFileTypes: true })) {
      entries += 1;
      if (entries > 10_000)
        throw new Error("AppImage reference discovery exceeded its entry bound.");
      const path = directory === "" ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) walk(path);
      else if (
        entry.isFile() &&
        isAppImageSystemDataPath(path) &&
        (lstatSync(join(root, path)).mode & 0o111) !== 0
      )
        paths.push(path);
    }
  };
  walk("");
  if (paths.length > APPIMAGE_DATA_LIMITS.files)
    throw new Error("AppImage reference data file count exceeds its bound.");
  return paths.sort();
}

const execute: ReferenceCommand = (command, args, cwd) =>
  execFileSync(command, [...args], {
    cwd: cwd ?? process.cwd(),
    encoding: "utf8",
    timeout: command === "bash" ? 610_000 : 10_000,
    maxBuffer: 4 * 1024 * 1024,
  });

/**
 * Builds a private data reference from authenticated exact-installed-version
 * Ubuntu archives, not the runner image's potentially altered file modes.
 *
 * Dpkg supplies ownership/version only; the shared isolated APT helper must
 * authenticate downloads. Extract just each declared canonical data member,
 * preserve its archive mode, reject nonregular/executable/binary originals,
 * then copy independent read-only bytes and verify against the actual payload.
 * No package is installed and neither OS nor installer bytes/modes are changed.
 * Existing destinations are rejected; owned partial output and all downloaded/
 * extracted temporary data are cleaned on failure. Subprocesses are serial,
 * bounded and awaited; the hosting job additionally has a finite timeout.
 *
 * @throws On ambiguous/missing ownership or versions, authentication/download/
 * extraction failures, unexpected archives, escapes, changed data or bounds.
 */
export function prepareAppImagePackageReference(
  payloadRoot: string,
  destination: string,
  options: ReferenceOptions = {},
): { readonly files: number; readonly bytes: number; readonly packages: number } {
  const run = options.run ?? execute;
  const log = options.log ?? ((message: string) => console.info(message));
  const systemRoot = realpathSync(options.systemRoot ?? "/");
  const paths = dataPaths(payloadRoot);
  const requests: Request[] = paths.map((path) => {
    const source = relative(systemRoot, realpathSync(join(systemRoot, path)))
      .split(sep)
      .join("/");
    const subtree = path.startsWith("usr/share/doc/")
      ? "usr/share/doc/"
      : "usr/share/glib-2.0/schemas/";
    if (!source.startsWith(subtree) || !isAppImageSystemDataPath(source))
      throw new Error(`Ubuntu source escapes its declared data subtree: ${path}`);
    const suffix = `: /${source}`;
    const ownership = run("dpkg-query", ["--search", `/${source}`]).trim();
    const owner = ownership.endsWith(suffix) ? ownership.slice(0, -suffix.length) : "";
    if (!/^[a-z0-9][a-z0-9+.-]*(?::amd64)?$/u.test(owner))
      throw new Error(`Missing or ambiguous Ubuntu data owner: ${path}`);
    const pkg = identity(
      run("dpkg-query", ["--show", "--showformat=${Package}:${Architecture}=${Version}", owner]),
    );
    if (owner !== pkg.name && owner !== `${pkg.name}:${pkg.arch}`)
      throw new Error(`Ubuntu owner/identity mismatch: ${path}`);
    return { path, source, pkg };
  });
  const packages = new Map(requests.map((request) => [request.pkg.identity, request.pkg]));
  mkdirSync(destination, { mode: 0o700 });
  let work: string | undefined;
  try {
    work = mkdtempSync(join(tmpdir(), "talos-appimage-reference-"));
    const archives = join(work, "archives");
    if (packages.size > 0) {
      const output = run("bash", [
        resolve("scripts/ci-linux-prerequisites.sh"),
        "appimage-reference",
        archives,
        ...[...packages.values()].map((pkg) => pkg.spec).sort(),
      ]);
      log(output);
    } else mkdirSync(archives);
    const archiveFiles = readdirSync(archives, { withFileTypes: true });
    if (archiveFiles.length !== packages.size)
      throw new Error("Ubuntu reference archive count mismatch.");
    let archiveBytes = 0;
    const byPackage = new Map<string, string>();
    for (const entry of archiveFiles) {
      if (!entry.isFile() || !entry.name.endsWith(".deb"))
        throw new Error("Unexpected Ubuntu reference archive.");
      const file = join(archives, entry.name);
      const size = lstatSync(file).size;
      archiveBytes += size;
      if (
        size > REFERENCE_ARCHIVE_LIMITS.fileBytes ||
        archiveBytes > REFERENCE_ARCHIVE_LIMITS.totalBytes
      )
        throw new Error("Ubuntu reference archive byte bound exceeded.");
      const pkg = identity(
        run("dpkg-deb", ["--show", "--showformat=${Package}:${Architecture}=${Version}", file]),
      );
      if (!packages.has(pkg.identity) || byPackage.has(pkg.identity))
        throw new Error("Unexpected or duplicate Ubuntu reference package identity.");
      byPackage.set(pkg.identity, file);
      // Downloads are complete and private: no concurrent writer owns these files.
      log(
        `Ubuntu data reference ${pkg.identity}: ${createHash("sha256").update(readFileSync(file)).digest("hex")}`,
      );
    }
    let bytes = 0;
    for (const [index, request] of requests.entries()) {
      try {
        const archive = byPackage.get(request.pkg.identity);
        if (archive === undefined)
          throw new Error(`Missing Ubuntu reference archive: ${request.pkg.identity}`);
        const extracted = join(work, `member-${index}`);
        run("bash", [
          resolve("scripts/extract-deb-data.sh"),
          archive,
          `./${request.source}`,
          extracted,
        ]);
        const canonicalRoot = realpathSync(extracted);
        const source = realpathSync(join(extracted, request.source));
        if (!source.startsWith(`${canonicalRoot}${sep}`))
          throw new Error(`Ubuntu archive data symlink escapes its root: ${request.path}`);
        const data = readAppImageDataFile(source, true);
        bytes += data.length;
        if (bytes > APPIMAGE_DATA_LIMITS.totalBytes)
          throw new Error("AppImage reference data bytes exceed their total bound.");
        const file = join(destination, request.path);
        mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
        writeFileSync(file, data, { flag: "wx", mode: 0o444 });
        const proof = verifyAppImageSystemData(payloadRoot, request.path, destination);
        log(`Archive-proven AppImage data ${request.path}: ${proof.sha256}`);
        rmSync(extracted, { recursive: true });
      } catch (error) {
        const cause = error instanceof Error ? error.message : String(error);
        throw new Error(
          `Cannot prepare Ubuntu reference ${request.path} from ${request.pkg.identity}: ${cause}`,
          { cause: error },
        );
      }
    }
    return { files: requests.length, bytes, packages: packages.size };
  } catch (error) {
    rmSync(destination, { recursive: true, force: true });
    throw error;
  } finally {
    if (work !== undefined) rmSync(work, { recursive: true, force: true });
  }
}
