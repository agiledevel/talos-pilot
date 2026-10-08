import { execFileSync } from "node:child_process";
import { copyFileSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Regenerate through the pinned CLI; compare bytes rather than trusting a stored checksum.
const temporary = mkdtempSync(join(tmpdir(), "talos-pilot-icons-"));
try {
  execFileSync(process.execPath, [
    "node_modules/@tauri-apps/cli/tauri.js",
    "icon",
    "assets/app-icon.svg",
    "--output",
    temporary,
  ]);
  for (const filename of ["icon.png", "icon.ico"]) {
    const generated = join(temporary, filename);
    const committed = join("src-tauri", "icons", filename);
    if (process.argv.includes("--write")) {
      copyFileSync(generated, committed);
    } else if (!readFileSync(generated).equals(readFileSync(committed))) {
      throw new Error(`Generated icon differs: ${committed}. Run pnpm icons:generate.`);
    }
  }
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
