import { createHash } from "node:crypto";
import { copyFileSync, createReadStream, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { pipeline } from "node:stream/promises";
import { basename, join } from "node:path";
import { requiredAssetExtensions, versionFromTag } from "./lib/release.ts";

const target = process.env.RELEASE_TARGET;
const tag = process.env.RELEASE_TAG;
if (target === undefined || tag === undefined)
  throw new Error("RELEASE_TARGET and RELEASE_TAG are required.");
versionFromTag(tag);
const required = requiredAssetExtensions(target);
const directory = join("src-tauri", "target", target, "release", "bundle");
const output = "release-assets";
mkdirSync(output, { recursive: true });

// Only top-level installer outputs qualify; executables inside app bundles are not installers.
const packageDirectories: Readonly<Record<string, string>> = {
  ".deb": "deb",
  ".rpm": "rpm",
  ".AppImage": "appimage",
  ".dmg": "dmg",
  ".exe": "nsis",
};
const assets = required
  .flatMap((extension) => {
    const folder = packageDirectories[extension];
    if (folder === undefined) throw new Error(`Unknown package type: ${extension}.`);
    const packageDirectory = join(directory, folder);
    const packages = readdirSync(packageDirectory, { withFileTypes: true })
      .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
      .map((entry) => join(packageDirectory, entry.name));
    if (packages.length !== 1)
      throw new Error(`Expected exactly one ${extension} installer for ${target}.`);
    return packages;
  })
  .sort();
const checksums: string[] = [];
for (const source of assets) {
  const filename = `${target}-${basename(source)}`;
  copyFileSync(source, join(output, filename));
  const hash = createHash("sha256");
  await pipeline(createReadStream(source), hash);
  checksums.push(`${hash.digest("hex")}  ${filename}`);
}
writeFileSync(join(output, `${target}-SHA256SUMS.txt`), `${checksums.join("\n")}\n`);
console.info(`Collected ${assets.length} packages for ${tag} (${target}).`);
