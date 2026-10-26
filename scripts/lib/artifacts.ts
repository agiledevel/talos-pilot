import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import {
  releaseModeFrom,
  requiredAssetExtensions,
  validatePackageVersion,
  validateSourceRevision,
} from "./release.ts";
import { isCommitSha, isRecord } from "./validation.ts";

/** One installer copied out of a target's bundle directory. */
export interface ArtifactInstaller {
  /** Target-prefixed file name as uploaded, for example `x86_64-unknown-linux-gnu-pilot.deb`. */
  readonly file: string;
  readonly sha256: string;
  readonly bytes: number;
}

/** The immutable source a build was started from. */
export interface ArtifactSource {
  readonly repository: string;
  readonly revision: string;
  readonly version: string;
  readonly ref: string;
  readonly event: string;
}

/** The workflow run that produced the artifact, for audit rather than trust. */
export interface ArtifactWorkflow {
  readonly name: string;
  readonly path: string;
  readonly runId: string;
  readonly runAttempt: string;
  readonly serverUrl: string;
}

/** Digests that bind the installers to their packaged programs and configuration. */
export interface ArtifactBuild {
  readonly buildIdentity: string;
  readonly releaseConfig: string;
  readonly releaseConfigSha256: string;
  readonly tauriConfigSha256: string;
  readonly applicationSha256: string;
  readonly helperSha256: string;
}

/**
 * The provenance sidecar uploaded next to one target's installers.
 *
 * It records what was built from which commit, which programs were packaged,
 * and which unauthenticated files were produced. It is not a publisher
 * signature: matching hashes and build identities do not prove authorship.
 */
export interface ArtifactProvenance {
  readonly schemaVersion: 1;
  readonly mode: "release" | "qualification";
  readonly source: ArtifactSource;
  readonly workflow: ArtifactWorkflow;
  readonly target: string;
  readonly build: ArtifactBuild;
  readonly installers: readonly ArtifactInstaller[];
}

/** A line of a target's `SHA256SUMS.txt` file. */
export interface ChecksumEntry {
  readonly file: string;
  readonly sha256: string;
}

const SHA256 = /^[0-9a-f]{64}$/u;
const SAFE_FILENAME = /^[A-Za-z0-9][A-Za-z0-9 ._+()-]*$/u;

/** Hashes a file with SHA-256 without loading it into memory. */
export async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(path), hash);
  return hash.digest("hex");
}

function expectKeys(
  value: unknown,
  keys: readonly string[],
  label: string,
): Record<string, unknown> {
  if (!isRecord(value)) throw new Error(`${label} must be an object.`);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.join("\n") !== expected.join("\n")) {
    throw new Error(`${label} must contain exactly: ${expected.join(", ")}.`);
  }
  return value;
}

function expectString(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${label}.${key} must be a non-empty string.`);
  }
  return value;
}

function expectDigest(record: Record<string, unknown>, key: string, label: string): string {
  const value = record[key];
  if (typeof value !== "string" || !SHA256.test(value)) {
    throw new Error(`${label}.${key} must be a lowercase SHA-256 digest.`);
  }
  return value;
}

function expectFilename(value: string, label: string): string {
  if (!SAFE_FILENAME.test(value)) {
    throw new Error(`${label} must be a plain file name without a path separator.`);
  }
  return value;
}

/**
 * Validates a parsed provenance document at an artifact boundary.
 *
 * Unknown fields, non-canonical paths, malformed digests and inconsistent
 * source/version identities are rejected rather than tolerated, so a swapped
 * or hand-edited sidecar cannot pass as build provenance.
 */
export function parseProvenance(value: unknown): ArtifactProvenance {
  const document = expectKeys(
    value,
    ["schemaVersion", "mode", "source", "workflow", "target", "build", "installers"],
    "provenance",
  );
  if (document.schemaVersion !== 1) throw new Error("Unsupported provenance schema version.");
  const mode = releaseModeFrom(document.mode);
  const source = expectKeys(
    document.source,
    ["repository", "revision", "version", "ref", "event"],
    "provenance.source",
  );
  const revision = expectString(source, "revision", "provenance.source");
  if (!isCommitSha(revision))
    throw new Error("provenance.source.revision must be a full commit SHA.");
  const version = validatePackageVersion(source.version);
  const target = expectString(document, "target", "provenance");
  const workflow = expectKeys(
    document.workflow,
    ["name", "path", "runId", "runAttempt", "serverUrl"],
    "provenance.workflow",
  );
  const build = expectKeys(
    document.build,
    [
      "buildIdentity",
      "releaseConfig",
      "releaseConfigSha256",
      "tauriConfigSha256",
      "applicationSha256",
      "helperSha256",
    ],
    "provenance.build",
  );
  const buildIdentity = expectString(build, "buildIdentity", "provenance.build");
  if (buildIdentity !== revision) {
    throw new Error("provenance.build.buildIdentity must be the source revision.");
  }
  const releaseConfig = expectString(build, "releaseConfig", "provenance.build");
  if (!/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[A-Za-z0-9./_-]+$/u.test(releaseConfig)) {
    throw new Error("provenance.build.releaseConfig must be a repository-relative path.");
  }
  if (!Array.isArray(document.installers) || document.installers.length === 0) {
    throw new Error("provenance.installers must list at least one installer.");
  }
  const installers: ArtifactInstaller[] = document.installers.map((entry, index) => {
    const installer = expectKeys(
      entry,
      ["file", "sha256", "bytes"],
      `provenance.installers[${index}]`,
    );
    const file = expectFilename(
      expectString(installer, "file", `provenance.installers[${index}]`),
      `provenance.installers[${index}].file`,
    );
    const bytes = installer.bytes;
    if (typeof bytes !== "number" || !Number.isSafeInteger(bytes) || bytes <= 0) {
      throw new Error(`provenance.installers[${index}].bytes must be a positive integer.`);
    }
    return {
      file,
      sha256: expectDigest(installer, "sha256", `provenance.installers[${index}]`),
      bytes,
    };
  });
  const names = new Set<string>();
  for (const installer of installers) {
    if (names.has(installer.file)) {
      throw new Error(`provenance.installers repeats ${installer.file}.`);
    }
    names.add(installer.file);
  }
  const parsed: ArtifactProvenance = {
    schemaVersion: 1,
    mode,
    source: {
      repository: expectString(source, "repository", "provenance.source"),
      revision,
      version,
      ref: expectString(source, "ref", "provenance.source"),
      event: expectString(source, "event", "provenance.source"),
    },
    workflow: {
      name: expectString(workflow, "name", "provenance.workflow"),
      path: expectString(workflow, "path", "provenance.workflow"),
      runId: expectString(workflow, "runId", "provenance.workflow"),
      runAttempt: expectString(workflow, "runAttempt", "provenance.workflow"),
      serverUrl: expectString(workflow, "serverUrl", "provenance.workflow"),
    },
    target,
    build: {
      buildIdentity,
      releaseConfig,
      releaseConfigSha256: expectDigest(build, "releaseConfigSha256", "provenance.build"),
      tauriConfigSha256: expectDigest(build, "tauriConfigSha256", "provenance.build"),
      applicationSha256: expectDigest(build, "applicationSha256", "provenance.build"),
      helperSha256: expectDigest(build, "helperSha256", "provenance.build"),
    },
    installers,
  };
  return parsed;
}

/** Requires a provenance document to describe the expected artifact set. */
export function validateProvenanceFor(
  provenance: ArtifactProvenance,
  expected: {
    readonly mode: ArtifactProvenance["mode"];
    readonly revision: string;
    readonly version: string;
    readonly target: string;
  },
): void {
  if (provenance.mode !== expected.mode) {
    throw new Error(`Provenance mode ${provenance.mode} is not ${expected.mode}.`);
  }
  if (provenance.source.revision !== validateSourceRevision(expected.revision)) {
    throw new Error("Provenance source revision does not match the requested revision.");
  }
  if (provenance.source.version !== validatePackageVersion(expected.version)) {
    throw new Error("Provenance source version does not match the requested version.");
  }
  if (provenance.target !== expected.target) {
    throw new Error(`Provenance target ${provenance.target} is not ${expected.target}.`);
  }
}

/**
 * Requires one installer per declared format for the target, with target-prefixed
 * names.
 *
 * Provenance alone cannot establish a complete artifact set: a build, upload or
 * hand-edit can drop a format while keeping a self-consistent document. The
 * declared target's required extensions are therefore enforced independently,
 * so an incomplete or foreign artifact set fails verification even when its
 * checksums and digests agree.
 */
export function requireInstallerFormats(
  target: string,
  installers: readonly ArtifactInstaller[],
): void {
  const required = requiredAssetExtensions(target);
  const prefix = `${target}-`;
  const counts = new Map<string, number>(required.map((extension) => [extension, 0]));
  for (const installer of installers) {
    if (!installer.file.startsWith(prefix) || installer.file.length === prefix.length) {
      throw new Error(`The ${target} provenance lists ${installer.file} for another target.`);
    }
    const extension = required.find((candidate) => installer.file.endsWith(candidate));
    if (extension === undefined) {
      throw new Error(
        `The ${target} provenance lists ${installer.file}, which is not a declared installer format.`,
      );
    }
    counts.set(extension, (counts.get(extension) ?? 0) + 1);
  }
  for (const extension of required) {
    const count = counts.get(extension) ?? 0;
    if (count !== 1) {
      throw new Error(
        `The ${target} artifact set must contain exactly one ${extension} installer; found ${count}.`,
      );
    }
  }
}

/**
 * Parses a `SHA256SUMS.txt` file.
 *
 * Duplicate entries, absolute paths and malformed digests fail: the release
 * draft concatenates these files and verifies them with `sha256sum --check`, so
 * an ambiguous line must never reach it.
 */
export function parseChecksums(text: string, label: string): ChecksumEntry[] {
  const lines = text.split("\n").filter((line) => line.trim().length > 0);
  if (lines.length === 0) throw new Error(`${label} is empty.`);
  const entries: ChecksumEntry[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/u.exec(line);
    if (match === null) throw new Error(`${label} has a malformed line.`);
    const sha256 = match[1];
    const file = match[2];
    if (sha256 === undefined || file === undefined || !SAFE_FILENAME.test(file)) {
      throw new Error(`${label} has a malformed line.`);
    }
    if (seen.has(file)) throw new Error(`${label} repeats ${file}.`);
    seen.add(file);
    entries.push({ file, sha256 });
  }
  return entries;
}

/** Builds the checksum file a target's installers are published with. */
export function renderChecksums(installers: readonly ArtifactInstaller[]): string {
  return `${installers.map((installer) => `${installer.sha256}  ${installer.file}`).join("\n")}\n`;
}
