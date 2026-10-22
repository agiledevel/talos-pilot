/**
 * Pinned toolchain record and pure helpers for the developer bootstrap.
 *
 * The bootstrap script and the repository pins (`.node-version`,
 * `package.json#packageManager`, `rust-toolchain.toml`, `helper/go.mod`, the
 * protoc action, and the fixture manifests) must move together. This module is
 * the single place that knows the exact versions and published digests, so the
 * script and its tests cannot drift from each other.
 */

/** Toolchain versions the bootstrap provisions or verifies. */
export interface ToolchainPins {
  readonly node: string;
  readonly pnpm: string;
  readonly rust: string;
  readonly go: string;
  readonly protoc: string;
  readonly talosctl: string;
}

/** The recorded pins. Refresh them only with the evidence the ledger requires. */
export const TOOLCHAIN_PINS: ToolchainPins = {
  node: "26.12.1",
  pnpm: "12.15.0",
  rust: "1.99.1",
  go: "1.27.3",
  protoc: "36.2",
  talosctl: "v1.14.2",
};

/** A host the bootstrap can provision without a platform-specific installer. */
export interface ToolPlatform {
  /** Node archive suffix, for example `linux-x64`. */
  readonly node: string;
  /** protoc archive suffix, for example `linux-x86_64`. */
  readonly protoc: string;
  /** talosctl asset suffix, for example `linux-amd64`. */
  readonly talosctl: string;
}

/** protoc archive digests published for the pinned release. Mirrors the CI action. */
export const PROTOC_SHA256: Readonly<Record<string, string>> = {
  "linux-x86_64": "121f6c7afe1d4d0e3ea6aab9432038599250134cbf4474cb1167d2c7decd4278",
  "osx-aarch_64": "9cd98a532c5c5e0c4161314de0225de27e4c8a323917b6ea7b1b714d3ae23466",
  "osx-x86_64": "228cc7add4616cc14ca5e80dee83209d44449a7aee95a914ae748fa374efb078",
  win64: "f0c128dc0d8492eceece83bb459a4c0e316764b929ffbf1aa416357fd644edd3",
};

/**
 * talosctl digests already verified against the pinned release's published
 * `sha256sum.txt`. Platforms without an entry are verified against that file at
 * download time instead of trusting a remembered value.
 */
export const TALOSCTL_SHA256: Readonly<Record<string, string>> = {
  "linux-amd64": "c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4",
};

/** Bound on one tool download, so a stalled server cannot hang a session. */
export const DOWNLOAD_TIMEOUT_MS = 600_000;

/** Per-tool download ceiling, in bytes. */
export const DOWNLOAD_LIMITS: Readonly<Record<string, number>> = {
  node: 300 * 1024 * 1024,
  protoc: 100 * 1024 * 1024,
  talosctl: 100 * 1024 * 1024,
  shasums: 2 * 1024 * 1024,
};

/** Maps the running host to the archive names upstream publishes, if supported. */
export function resolveToolPlatform(
  platform: NodeJS.Platform,
  arch: string,
): ToolPlatform | undefined {
  if (platform === "linux" && arch === "x64") {
    return { node: "linux-x64", protoc: "linux-x86_64", talosctl: "linux-amd64" };
  }
  if (platform === "darwin" && arch === "arm64") {
    return { node: "darwin-arm64", protoc: "osx-aarch_64", talosctl: "darwin-arm64" };
  }
  if (platform === "darwin" && arch === "x64") {
    return { node: "darwin-x64", protoc: "osx-x86_64", talosctl: "darwin-amd64" };
  }
  return undefined;
}

/** Node archive name for the pinned release and host. */
export function nodeArchiveName(nodeVersion: string, platform: ToolPlatform): string {
  const extension = platform.node.startsWith("linux") ? "tar.xz" : "tar.gz";
  return `node-v${nodeVersion}-${platform.node}.${extension}`;
}

/** protoc archive name for the pinned release and host. */
export function protocArchiveName(protocVersion: string, platform: ToolPlatform): string {
  return `protoc-${protocVersion}-${platform.protoc}.zip`;
}

/** Node release checksum index URL for the pinned release. */
export function nodeShasumsUrl(nodeVersion: string): string {
  return `https://nodejs.org/dist/v${nodeVersion}/SHASUMS256.txt`;
}

/** Node release archive URL for one archive name. */
export function nodeArchiveUrl(nodeVersion: string, archive: string): string {
  return `https://nodejs.org/dist/v${nodeVersion}/${archive}`;
}

/** protoc release archive URL for one archive name. */
export function protocArchiveUrl(protocVersion: string, archive: string): string {
  return `https://github.com/protocolbuffers/protobuf/releases/download/v${protocVersion}/${archive}`;
}

/** talosctl release asset URL for the pinned tag and host asset. */
export function talosctlUrl(talosctlVersion: string, asset: string): string {
  return `https://github.com/siderolabs/talos/releases/download/${talosctlVersion}/${asset}`;
}

/** Published checksum index for the pinned talosctl release. */
export function talosctlChecksumsUrl(talosctlVersion: string): string {
  return `https://github.com/siderolabs/talos/releases/download/${talosctlVersion}/sha256sum.txt`;
}

/** Parses the `go version` output, for example `go version go1.27.3 linux/amd64`. */
export function parseGoVersion(output: string): string | undefined {
  return /^go version go(\d+\.\d+\.\d+) /mu.exec(output)?.[1];
}

/** Parses the `rustc --version` output, for example `rustc 1.99.1 (58cf8f9c3 2026-10-13)`. */
export function parseRustcVersion(output: string): string | undefined {
  return /^rustc (\d+\.\d+\.\d+) /mu.exec(output)?.[1];
}

/** Parses a Node `--version` output, for example `v26.12.1`. */
export function parseNodeVersion(output: string): string | undefined {
  return /^v(\d+\.\d+\.\d+)\s*$/mu.exec(output)?.[1];
}

/** Parses a `pnpm --version` output. */
export function parsePnpmVersion(output: string): string | undefined {
  return /^(\d+\.\d+\.\d+)\s*$/mu.exec(output)?.[1];
}

/** Parses a `protoc --version` output, for example `libprotoc 36.2`. */
export function parseProtocVersion(output: string): string | undefined {
  return /^libprotoc (\d+(?:\.\d+)+)\s*$/mu.exec(output)?.[1];
}

/** Parses the `Tag:` line of `talosctl version --client`. */
export function parseTalosctlVersion(output: string): string | undefined {
  return /^\s*Tag:\s+(v\d+\.\d+\.\d+)\s*$/mu.exec(output)?.[1];
}

/** Parses a `sha256sum`-format file into a filename-to-digest map. */
export function parseSha256Sums(text: string): ReadonlyMap<string, string> {
  const entries = new Map<string, string>();
  for (const line of text.split(/\r?\n/u)) {
    const match = /^([0-9a-f]{64}) {2}(.+)$/u.exec(line.trim());
    if (match !== null) {
      const digest = match[1];
      const filename = match[2];
      if (digest !== undefined && filename !== undefined) {
        entries.set(filename, digest);
      }
    }
  }
  return entries;
}

/** Compares an archive against a published digest, failing closed on any difference. */
export function verifyDigest(
  expected: string,
  actual: string,
  archive: string,
): string | undefined {
  if (actual === expected) {
    return undefined;
  }
  return `${archive} has SHA-256 ${actual}, expected ${expected}.`;
}

/** Verifies an observed tool version against the recorded pin. */
export function verifyVersion(
  tool: string,
  expected: string,
  actual: string | undefined,
): string | undefined {
  if (actual === expected) {
    return undefined;
  }
  return `${tool} is ${actual ?? "not installed or unrecognized"}, expected ${expected}.`;
}
