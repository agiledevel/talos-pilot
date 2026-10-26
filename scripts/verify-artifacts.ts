import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  parseChecksums,
  parseProvenance,
  requireInstallerFormats,
  sha256File,
  validateProvenanceFor,
  type ArtifactProvenance,
} from "./lib/artifacts.ts";
import {
  releaseModeFrom,
  requiredAssetExtensions,
  validatePackageVersion,
  validateSourceRevision,
} from "./lib/release.ts";

/**
 * Verifies downloaded release or qualification artifacts against their
 * provenance.
 *
 * A build job's console output is not evidence that the uploaded bytes match
 * the source: this command re-reads the downloaded directory, requires the
 * expected targets, and fails on missing, duplicated, stale, swapped or
 * mismatched installer bytes, checksum lines and provenance identities.
 */

const KNOWN_OPTIONS: ReadonlySet<string> = new Set([
  "--directory",
  "--mode",
  "--revision",
  "--version",
  "--targets",
]);

function valueOf(args: readonly string[], name: string): string {
  const index = args.indexOf(name);
  const value = index === -1 ? undefined : args[index + 1];
  if (value === undefined || value === "" || value.startsWith("--")) {
    throw new Error(`${name} requires a value.`);
  }
  return value;
}

const args = process.argv.slice(2);
for (const argument of args) {
  if (argument.startsWith("--") && !KNOWN_OPTIONS.has(argument)) {
    throw new Error(`Unknown option ${argument}.`);
  }
}
const directory = valueOf(args, "--directory");
const mode = releaseModeFrom(valueOf(args, "--mode"));
const revision = validateSourceRevision(valueOf(args, "--revision"));
const version = validatePackageVersion(valueOf(args, "--version"));
const targets = valueOf(args, "--targets")
  .split(",")
  .map((target) => target.trim())
  .filter((target) => target.length > 0);
if (targets.length === 0 || new Set(targets).size !== targets.length) {
  throw new Error("--targets must list each expected target exactly once.");
}
// Only the four declared triples are valid; this also keeps the value out of
// path construction for anything else.
for (const target of targets) requiredAssetExtensions(target);

const entries = readdirSync(directory, { withFileTypes: true });
for (const entry of entries) {
  if (!entry.isFile()) {
    throw new Error(`The artifact directory contains ${entry.name}, which is not a file.`);
  }
}
const present = new Set(entries.map((entry) => entry.name));
const expectedFiles = new Set<string>();
const provenances: ArtifactProvenance[] = [];

for (const target of targets) {
  const provenanceFile = `${target}-provenance.json`;
  const sumsFile = `${target}-SHA256SUMS.txt`;
  if (!present.has(provenanceFile)) {
    throw new Error(`Missing ${provenanceFile}; the artifact set is incomplete.`);
  }
  if (!present.has(sumsFile)) {
    throw new Error(`Missing ${sumsFile}; the artifact set is incomplete.`);
  }
  const parsed = parseProvenance(JSON.parse(readFileSync(join(directory, provenanceFile), "utf8")));
  validateProvenanceFor(parsed, { mode, revision, version, target });
  requireInstallerFormats(target, parsed.installers);
  const checksums = parseChecksums(readFileSync(join(directory, sumsFile), "utf8"), sumsFile);
  const recorded = new Map(checksums.map((entry) => [entry.file, entry.sha256]));
  if (recorded.size !== parsed.installers.length) {
    throw new Error(`${sumsFile} does not list every installer in the provenance.`);
  }
  for (const installer of parsed.installers) {
    if (recorded.get(installer.file) !== installer.sha256) {
      throw new Error(`${sumsFile} does not match the provenance digest for ${installer.file}.`);
    }
    if (!present.has(installer.file)) {
      throw new Error(`Missing installer ${installer.file}.`);
    }
    if (expectedFiles.has(installer.file)) {
      throw new Error(`Installer ${installer.file} is claimed by more than one target.`);
    }
    const path = join(directory, installer.file);
    if (statSync(path).size !== installer.bytes) {
      throw new Error(`Installer ${installer.file} has an unexpected size.`);
    }
    if ((await sha256File(path)) !== installer.sha256) {
      throw new Error(`Installer ${installer.file} does not match its recorded SHA-256.`);
    }
    expectedFiles.add(installer.file);
  }
  expectedFiles.add(provenanceFile);
  expectedFiles.add(sumsFile);
  provenances.push(parsed);
}

for (const file of present) {
  if (!expectedFiles.has(file)) {
    throw new Error(`The artifact directory contains unexpected file ${file}.`);
  }
}
for (const file of expectedFiles) {
  if (!present.has(file)) throw new Error(`The artifact directory is missing ${file}.`);
}

const installerCount = provenances.reduce(
  (total, provenance) => total + provenance.installers.length,
  0,
);
console.info(
  `Verified ${provenances.length} targets and ${installerCount} installers for ${mode} source ${revision} (version ${version}).`,
);
