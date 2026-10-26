import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join } from "node:path";

import {
  parseProvenance,
  renderChecksums,
  sha256File,
  type ArtifactInstaller,
  type ArtifactProvenance,
} from "./lib/artifacts.ts";
import {
  releaseModeFrom,
  requiredAssetExtensions,
  validatePackageVersion,
  validateSourceRevision,
  versionFromTag,
} from "./lib/release.ts";

/**
 * Collects one target's installers into the uploaded artifact set.
 *
 * Release and qualification builds run this same collector. Release mode
 * additionally requires a real tag that names the built version; qualification
 * mode rejects a tag so no publication identity is fabricated. Both modes
 * require the resolved commit, the validated package version and the workflow
 * run identity, write a fresh output directory (a stale file from an earlier
 * run cannot be uploaded), and bind the installers to their provenance.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") throw new Error(`${name} is required.`);
  return value;
}

function requireUnset(name: string): void {
  const value = process.env[name];
  if (value !== undefined && value !== "") {
    throw new Error(`${name} is not accepted in qualification mode.`);
  }
}

const mode = releaseModeFrom(requireEnv("RELEASE_MODE"));
const target = requireEnv("RELEASE_TARGET");
const revision = validateSourceRevision(requireEnv("RELEASE_REVISION"));
const version = validatePackageVersion(requireEnv("RELEASE_VERSION"));

const packageJson: unknown = JSON.parse(readFileSync("package.json", "utf8"));
if (
  typeof packageJson !== "object" ||
  packageJson === null ||
  !("version" in packageJson) ||
  packageJson.version !== version
) {
  throw new Error("RELEASE_VERSION must match the checked-out package.json version.");
}

let tag = "";
if (mode === "release") {
  tag = requireEnv("RELEASE_TAG");
  if (versionFromTag(tag) !== version) {
    throw new Error("RELEASE_TAG must name the version being packaged.");
  }
} else {
  requireUnset("RELEASE_TAG");
}

const workflow: ArtifactProvenance["workflow"] = {
  name: requireEnv("RELEASE_WORKFLOW_NAME"),
  path: requireEnv("RELEASE_WORKFLOW_PATH"),
  runId: requireEnv("RELEASE_WORKFLOW_RUN_ID"),
  runAttempt: requireEnv("RELEASE_WORKFLOW_RUN_ATTEMPT"),
  serverUrl: requireEnv("RELEASE_SERVER_URL"),
};

const required = requiredAssetExtensions(target);
const directory = join("src-tauri", "target", target, "release", "bundle");
const output = "release-assets";

const packageDirectories: Readonly<Record<string, string>> = {
  ".deb": "deb",
  ".rpm": "rpm",
  ".AppImage": "appimage",
  ".dmg": "dmg",
  ".exe": "nsis",
};
const sources = required.flatMap((extension) => {
  const folder = packageDirectories[extension];
  if (folder === undefined) throw new Error(`Unknown package type: ${extension}.`);
  const packageDirectory = join(directory, folder);
  if (!existsSync(packageDirectory)) {
    throw new Error(`No ${extension} bundle directory at ${packageDirectory}.`);
  }
  const packages = readdirSync(packageDirectory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(extension))
    .map((entry) => join(packageDirectory, entry.name));
  if (packages.length !== 1)
    throw new Error(`Expected exactly one ${extension} installer for ${target}.`);
  return packages;
});
// Keep the published order deterministic across runners and file systems.
sources.sort();

const windows = target.endsWith("windows-msvc");
const application = join(
  "src-tauri",
  "target",
  target,
  "release",
  windows ? "talos-pilot.exe" : "talos-pilot",
);
const helper = join(
  "src-tauri",
  "binaries",
  windows ? "talos-pilot-helper.exe" : "talos-pilot-helper",
);
const releaseConfig = ".github/tauri.release.conf.json";

const installers: ArtifactInstaller[] = [];
for (const source of sources) {
  const file = `${target}-${basename(source)}`;
  const size = statSync(source).size;
  if (size <= 0) throw new Error(`The installer ${source} is empty.`);
  installers.push({ file, sha256: await sha256File(source), bytes: size });
}

const provenance: ArtifactProvenance = parseProvenance({
  schemaVersion: 1,
  mode,
  source: {
    repository: requireEnv("RELEASE_SOURCE_REPOSITORY"),
    revision,
    version,
    ref: requireEnv("RELEASE_SOURCE_REF"),
    event: requireEnv("RELEASE_SOURCE_EVENT"),
  },
  workflow,
  target,
  build: {
    buildIdentity: revision,
    releaseConfig,
    releaseConfigSha256: await sha256File(releaseConfig),
    tauriConfigSha256: await sha256File(join("src-tauri", "tauri.conf.json")),
    applicationSha256: await sha256File(application),
    helperSha256: await sha256File(helper),
  },
  installers,
});
if (provenance.installers.length !== sources.length) {
  throw new Error("The collected provenance does not describe every bundled installer.");
}

// Rebuild the directory from scratch so a partial earlier run cannot upload a
// stale installer or checksum file next to this run's bytes. Nothing is written
// until every expected installer and digest above has been validated.
rmSync(output, { recursive: true, force: true });
mkdirSync(output, { recursive: true });
for (const [index, source] of sources.entries()) {
  const installer = provenance.installers[index];
  if (installer === undefined) throw new Error("The installer list and provenance diverged.");
  const destination = join(output, installer.file);
  copyFileSync(source, destination);
  if (
    statSync(destination).size !== installer.bytes ||
    (await sha256File(destination)) !== installer.sha256
  ) {
    throw new Error(`The copied installer ${installer.file} does not match its recorded digest.`);
  }
}
writeFileSync(join(output, `${target}-SHA256SUMS.txt`), renderChecksums(provenance.installers));
writeFileSync(
  join(output, `${target}-provenance.json`),
  `${JSON.stringify(provenance, null, 2)}\n`,
);

const produced = readdirSync(output).sort();
const expected = [
  `${target}-SHA256SUMS.txt`,
  `${target}-provenance.json`,
  ...provenance.installers.map((installer) => installer.file),
].sort();
if (produced.join("\n") !== expected.join("\n")) {
  throw new Error(`The artifact directory contains unexpected files for ${target}.`);
}
console.info(
  `Collected ${provenance.installers.length} packages for version ${version} (${target}, ${mode}${tag === "" ? "" : `, ${tag}`}).`,
);
