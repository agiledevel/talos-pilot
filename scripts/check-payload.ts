import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  APPIMAGE_DATA_LIMITS,
  isAppImageSystemDataPath,
  verifyAppImageSystemData,
} from "./lib/appimage-system-data.ts";
import {
  isPayloadPlatform,
  validatePayload,
  validateReleaseOutput,
  type PayloadEntry,
} from "./lib/payload.ts";

/**
 * Checks the programs an installer carries against the declared allowlist.
 *
 * The payload root is an extraction of a built DEB, RPM, AppImage AppDir or
 * macOS app bundle. Nothing is installed and no file is modified. The
 * `--release-output` mode covers targets whose installer cannot be extracted in
 * the build step (the Windows NSIS installer) by checking that the ordinary
 * output contains only the application program and no maintainer/test tool.
 */

const MAX_ENTRIES = 10_000;

function valueOf(args: readonly string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index === -1) return undefined;
  const value = args[index + 1];
  if (value === undefined || value === "" || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

function isExecutable(path: string, mode: number): boolean {
  if (process.platform === "win32") return /\.(?:exe|com|bat|cmd)$/iu.test(path);
  return (mode & 0o111) !== 0;
}

function collect(
  root: string,
  recursive: boolean,
  verifySystemData = false,
  systemRoot = "/",
): PayloadEntry[] {
  const entries: PayloadEntry[] = [];
  let dataFiles = 0;
  let dataBytes = 0;
  const walk = (relative: string): void => {
    const directory = relative === "" ? root : join(root, relative);
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = relative === "" ? entry.name : `${relative}/${entry.name}`;
      if (entries.length >= MAX_ENTRIES) {
        throw new Error(`The payload inspection exceeded its ${MAX_ENTRIES}-entry bound.`);
      }
      // Bundles use symlinks for runtime libraries; only regular files carry programs.
      if (entry.isSymbolicLink()) continue;
      if (entry.isDirectory()) {
        if (recursive) walk(path);
        continue;
      }
      if (!entry.isFile()) continue;
      const mode = statSync(join(root, path)).mode;
      const executable = isExecutable(path, mode);
      if (verifySystemData && executable && isAppImageSystemDataPath(path)) {
        if (dataFiles >= APPIMAGE_DATA_LIMITS.files)
          throw new Error("AppImage data file count exceeds its bound.");
        const proof = verifyAppImageSystemData(root, path, systemRoot);
        dataFiles += 1;
        dataBytes += proof.bytes;
        if (dataBytes > APPIMAGE_DATA_LIMITS.totalBytes)
          throw new Error("AppImage data bytes exceed their total bound.");
        console.info(`Verified unchanged AppImage system data ${path}: ${proof.sha256}`);
        entries.push({ path, executable, verifiedSystemData: true });
      } else {
        entries.push({ path, executable });
      }
    }
  };
  walk("");
  return entries.sort((left, right) => left.path.localeCompare(right.path));
}

const args = process.argv.slice(2);
for (const argument of args) {
  if (
    argument.startsWith("--") &&
    !["--platform", "--root", "--release-output", "--target", "--appimage-system-root"].includes(
      argument,
    )
  ) {
    throw new Error(`Unknown option ${argument}.`);
  }
}

const platform = valueOf(args, "--platform");
const root = valueOf(args, "--root");
const releaseOutput = valueOf(args, "--release-output");
const target = valueOf(args, "--target");
// Hosted checks use a private reference extracted from authenticated Ubuntu
// archives, not the runner image's altered modes. Offline callers also need a
// trusted reference; choosing a root alone is not OS/publisher authentication.
const appimageSystemRoot = valueOf(args, "--appimage-system-root");
if (
  appimageSystemRoot !== undefined &&
  (platform !== "linux-appimage" || releaseOutput !== undefined)
) {
  throw new Error("--appimage-system-root requires a linux-appimage payload root.");
}

if (releaseOutput !== undefined) {
  if (platform !== undefined || root !== undefined) {
    throw new Error("--release-output cannot be combined with a payload root.");
  }
  if (target === undefined) throw new Error("--release-output requires --target.");
  if (!existsSync(releaseOutput)) {
    throw new Error(`No release output directory at ${releaseOutput}.`);
  }
  const entries = collect(releaseOutput, false);
  const binaries = join(releaseOutput, "binaries");
  const helperEntries: PayloadEntry[] = existsSync(binaries)
    ? collect(binaries, false).map((entry) => ({ ...entry, path: `binaries/${entry.path}` }))
    : [];
  validateReleaseOutput(target, [...entries, ...helperEntries]);
  console.info(`Release output for ${target} contains only the application program.`);
} else {
  if (platform === undefined || root === undefined) {
    throw new Error("Provide --platform and --root, or --release-output and --target.");
  }
  if (!isPayloadPlatform(platform)) {
    throw new Error(`Unsupported payload platform ${platform}.`);
  }
  const entries = collect(root, true, platform === "linux-appimage", appimageSystemRoot);
  validatePayload(platform, entries);
  console.info(
    `The ${platform} payload contains only declared programs (${entries.length} entries).`,
  );
}
