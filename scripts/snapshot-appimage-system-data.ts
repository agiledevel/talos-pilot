import { snapshotAppImageSystemData } from "./lib/appimage-system-data.ts";

/**
 * Captures independent, non-executable OS data before Linux packaging. The
 * destination must not exist and is never a completed installer directory.
 * An optional trusted synthetic/source OS root supports offline reproduction.
 */
const args = process.argv.slice(2);
const directory = args[1];
const systemRoot = args[3] ?? "/";
if (
  args[0] !== "--directory" ||
  directory === undefined ||
  directory === "" ||
  directory.startsWith("--") ||
  ![2, 4].includes(args.length) ||
  (args.length === 4 &&
    (args[2] !== "--system-root" || systemRoot === "" || systemRoot.startsWith("--")))
)
  throw new Error(
    "Usage: node scripts/snapshot-appimage-system-data.ts --directory <new-directory> [--system-root <trusted-root>]",
  );
const summary = snapshotAppImageSystemData(systemRoot, directory);
console.info(
  `Captured pre-bundle AppImage reference: ${summary.files} files, ${summary.bytes} bytes, ${summary.skipped} omitted candidates.`,
);
