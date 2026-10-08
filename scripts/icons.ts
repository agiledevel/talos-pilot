import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalIcns } from "./lib/icns.ts";

// Regenerate through the pinned CLI; compare bytes rather than trusting a stored checksum.
const temporary = mkdtempSync(join(tmpdir(), "talos-pilot-icons-"));
try {
  execFileSync(
    process.execPath,
    ["node_modules/@tauri-apps/cli/tauri.js", "icon", "assets/app-icon.png", "--output", temporary],
    { stdio: "pipe" },
  );
  for (const filename of [
    "icon.png",
    "icon.ico",
    "icon.icns",
    "32x32.png",
    "128x128.png",
    "128x128@2x.png",
  ]) {
    const generated = join(temporary, filename);
    const committed = join("src-tauri", "icons", filename);
    const bytes = filename.endsWith(".icns")
      ? canonicalIcns(readFileSync(generated))
      : readFileSync(generated);
    if (process.argv.includes("--write")) {
      writeFileSync(committed, bytes);
    } else if (!bytes.equals(readFileSync(committed))) {
      throw new Error(`Generated icon differs: ${committed}. Run pnpm icons:generate.`);
    }
  }
  console.info("Desktop icons match the source image and pinned conversion pipeline.");
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
