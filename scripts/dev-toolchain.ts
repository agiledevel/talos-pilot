import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, mkdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import { chmod, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  DOWNLOAD_LIMITS,
  DOWNLOAD_TIMEOUT_MS,
  PROTOC_SHA256,
  TALOSCTL_SHA256,
  TOOLCHAIN_PINS,
  nodeArchiveName,
  nodeArchiveUrl,
  nodeShasumsUrl,
  parseGoVersion,
  parseNodeVersion,
  parsePnpmVersion,
  parseProtocVersion,
  parseRustcVersion,
  parseSha256Sums,
  parseTalosctlVersion,
  protocArchiveName,
  protocArchiveUrl,
  resolveToolPlatform,
  talosctlChecksumsUrl,
  talosctlUrl,
  verifyDigest,
  verifyVersion,
} from "./lib/dev-toolchain.ts";
import type { ToolPlatform } from "./lib/dev-toolchain.ts";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const downloadsDirectory = "downloads";
const nodeDirectory = "node";
const protocDirectory = "protoc";
const binDirectory = "bin";

/** A failure with an actionable message; the CLI prints it and exits non-zero. */
class BootstrapError extends Error {}

function fail(message: string): never {
  throw new BootstrapError(message);
}

function commandVersion(
  binary: string,
  args: readonly string[],
  cwd = repoRoot,
): string | undefined {
  try {
    return execFileSync(binary, [...args], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

async function download(url: string, destination: string, maxBytes: number): Promise<void> {
  const response = await fetch(url, {
    redirect: "follow",
    signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS),
  });
  if (!response.ok) {
    fail(`GET ${url} returned HTTP ${String(response.status)}.`);
  }
  if (response.body === null) {
    fail(`GET ${url} returned no body.`);
  }
  const declared = response.headers.get("content-length");
  if (declared !== null && Number(declared) > maxBytes) {
    fail(`${url} declares ${declared} bytes, above the ${String(maxBytes)}-byte limit.`);
  }
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = response.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (value !== undefined) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        fail(`${url} is larger than the ${String(maxBytes)}-byte download limit.`);
      }
      chunks.push(value);
    }
  }
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.concat(chunks));
}

async function sha256File(path: string): Promise<string> {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) {
    hash.update(chunk);
  }
  return hash.digest("hex");
}

function extractNodeArchive(archive: string, destination: string): void {
  const flag = archive.endsWith(".tar.xz") ? "-xJf" : "-xzf";
  execFileSync("tar", [flag, archive, "-C", destination, "--strip-components=1"], {
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function extractProtocArchive(archive: string, destination: string): void {
  try {
    execFileSync("unzip", ["-q", "-o", archive, "-d", destination], {
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail("protoc extraction needs the 'unzip' command on PATH.");
  }
}

async function ensureNode(platform: ToolPlatform, toolsDirectory: string): Promise<string> {
  const directory = join(toolsDirectory, nodeDirectory);
  const binary = join(directory, "bin", "node");
  const current = parseNodeVersion(commandVersion(binary, ["--version"]) ?? "");
  if (current === TOOLCHAIN_PINS.node) {
    return binary;
  }

  const downloads = join(toolsDirectory, downloadsDirectory);
  await mkdir(downloads, { recursive: true });
  const shasumsPath = join(downloads, "SHASUMS256.txt");
  const archive = nodeArchiveName(TOOLCHAIN_PINS.node, platform);
  const archivePath = join(downloads, archive);
  try {
    await download(
      nodeShasumsUrl(TOOLCHAIN_PINS.node),
      shasumsPath,
      DOWNLOAD_LIMITS.shasums ?? 2 * 1024 * 1024,
    );
    const sums = parseSha256Sums(readFileSync(shasumsPath, "utf8"));
    const expected = sums.get(archive);
    if (expected === undefined) {
      fail(`The published SHASUMS256.txt has no line for ${archive}.`);
    }
    await download(
      nodeArchiveUrl(TOOLCHAIN_PINS.node, archive),
      archivePath,
      DOWNLOAD_LIMITS.node ?? 300 * 1024 * 1024,
    );
    const digestFailure = verifyDigest(expected, await sha256File(archivePath), archive);
    if (digestFailure !== undefined) {
      fail(digestFailure);
    }
    const extraction = join(toolsDirectory, ".node-extract");
    rmSync(extraction, { recursive: true, force: true });
    await mkdir(extraction, { recursive: true });
    try {
      extractNodeArchive(archivePath, extraction);
      const extractionFailure = verifyVersion(
        "Node",
        TOOLCHAIN_PINS.node,
        parseNodeVersion(commandVersion(join(extraction, "bin", "node"), ["--version"]) ?? ""),
      );
      if (extractionFailure !== undefined) {
        fail(extractionFailure);
      }
      rmSync(directory, { recursive: true, force: true });
      renameSync(extraction, directory);
    } finally {
      rmSync(extraction, { recursive: true, force: true });
    }
  } finally {
    await rm(shasumsPath, { force: true });
    await rm(archivePath, { force: true });
  }
  const installed = join(directory, "bin", "node");
  const failure = verifyVersion(
    "Node",
    TOOLCHAIN_PINS.node,
    parseNodeVersion(commandVersion(installed, ["--version"]) ?? ""),
  );
  if (failure !== undefined) {
    fail(failure);
  }
  return installed;
}

async function ensurePnpm(nodeBinary: string, toolsDirectory: string): Promise<string> {
  const nodeBin = dirname(nodeBinary);
  const prefix = join(toolsDirectory, nodeDirectory);
  const binary = join(nodeBin, "pnpm");
  const current = parsePnpmVersion(commandVersion(binary, ["--version"]) ?? "");
  if (current === TOOLCHAIN_PINS.pnpm) {
    return binary;
  }
  try {
    execFileSync(join(nodeBin, "npm"), ["install", "--global", `pnpm@${TOOLCHAIN_PINS.pnpm}`], {
      cwd: repoRoot,
      env: {
        ...process.env,
        PATH: `${nodeBin}${process.platform === "win32" ? ";" : ":"}${process.env.PATH ?? ""}`,
        npm_config_prefix: prefix,
        npm_config_update_notifier: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch {
    fail(`pnpm ${TOOLCHAIN_PINS.pnpm} installation failed; check the npm registry connection.`);
  }
  const failure = verifyVersion(
    "pnpm",
    TOOLCHAIN_PINS.pnpm,
    parsePnpmVersion(commandVersion(binary, ["--version"]) ?? ""),
  );
  if (failure !== undefined) {
    fail(failure);
  }
  return binary;
}

async function ensureProtoc(platform: ToolPlatform, toolsDirectory: string): Promise<string> {
  const directory = join(toolsDirectory, protocDirectory);
  const binary = join(directory, "bin", "protoc");
  const current = parseProtocVersion(commandVersion(binary, ["--version"]) ?? "");
  if (current === TOOLCHAIN_PINS.protoc) {
    return binary;
  }

  const expected = PROTOC_SHA256[platform.protoc];
  if (expected === undefined) {
    fail(`No published protoc archive digest is recorded for ${platform.protoc}.`);
  }
  const downloads = join(toolsDirectory, downloadsDirectory);
  await mkdir(downloads, { recursive: true });
  const archive = protocArchiveName(TOOLCHAIN_PINS.protoc, platform);
  const archivePath = join(downloads, archive);
  try {
    await download(
      protocArchiveUrl(TOOLCHAIN_PINS.protoc, archive),
      archivePath,
      DOWNLOAD_LIMITS.protoc ?? 100 * 1024 * 1024,
    );
    const digestFailure = verifyDigest(expected, await sha256File(archivePath), archive);
    if (digestFailure !== undefined) {
      fail(digestFailure);
    }
    const extraction = join(toolsDirectory, ".protoc-extract");
    rmSync(extraction, { recursive: true, force: true });
    await mkdir(extraction, { recursive: true });
    try {
      extractProtocArchive(archivePath, extraction);
      rmSync(directory, { recursive: true, force: true });
      renameSync(extraction, directory);
    } finally {
      rmSync(extraction, { recursive: true, force: true });
    }
  } finally {
    await rm(archivePath, { force: true });
  }
  const failure = verifyVersion(
    "protoc",
    TOOLCHAIN_PINS.protoc,
    parseProtocVersion(commandVersion(binary, ["--version"]) ?? ""),
  );
  if (failure !== undefined) {
    fail(failure);
  }
  return binary;
}

async function verifyTalosctlBinary(
  path: string,
  asset: string,
  toolsDirectory: string,
): Promise<void> {
  const expected = TALOSCTL_SHA256[asset] ?? (await publishedTalosctlDigest(asset, toolsDirectory));
  const digestFailure = verifyDigest(expected, await sha256File(path), asset);
  if (digestFailure !== undefined) {
    fail(`${digestFailure} Remove or refresh the recorded talosctl binary.`);
  }
  const versionFailure = verifyVersion(
    "talosctl",
    TOOLCHAIN_PINS.talosctl,
    parseTalosctlVersion(commandVersion(path, ["version", "--client"]) ?? ""),
  );
  if (versionFailure !== undefined) {
    fail(`${versionFailure} Remove or refresh the recorded talosctl binary.`);
  }
}

async function ensureTalosctl(platform: ToolPlatform, toolsDirectory: string): Promise<string> {
  const candidates = [
    join(repoRoot, "src-tauri", ".local-tools", "talosctl"),
    join(toolsDirectory, binDirectory, "talosctl"),
  ];
  for (const candidate of candidates) {
    if (commandVersion(candidate, ["version", "--client"]) !== undefined) {
      await verifyTalosctlBinary(candidate, platform.talosctl, toolsDirectory);
      return candidate;
    }
  }

  const directory = join(toolsDirectory, binDirectory);
  const downloads = join(toolsDirectory, downloadsDirectory);
  await mkdir(directory, { recursive: true });
  await mkdir(downloads, { recursive: true });
  const asset = platform.talosctl;
  const downloadPath = join(downloads, asset);
  try {
    await download(
      talosctlUrl(TOOLCHAIN_PINS.talosctl, asset),
      downloadPath,
      DOWNLOAD_LIMITS.talosctl ?? 100 * 1024 * 1024,
    );
    const expected =
      TALOSCTL_SHA256[asset] ?? (await publishedTalosctlDigest(asset, toolsDirectory));
    const failure = verifyDigest(expected, await sha256File(downloadPath), asset);
    if (failure !== undefined) {
      fail(failure);
    }
    const target = join(directory, "talosctl");
    rmSync(target, { force: true });
    renameSync(downloadPath, target);
    await chmod(target, 0o755);
    await verifyTalosctlBinary(target, asset, toolsDirectory);
    return target;
  } finally {
    await rm(downloadPath, { force: true });
  }
}

async function publishedTalosctlDigest(asset: string, toolsDirectory: string): Promise<string> {
  const checksumsPath = join(toolsDirectory, downloadsDirectory, "talosctl-sha256sum.txt");
  await mkdir(dirname(checksumsPath), { recursive: true });
  await download(
    talosctlChecksumsUrl(TOOLCHAIN_PINS.talosctl),
    checksumsPath,
    DOWNLOAD_LIMITS.shasums ?? 2 * 1024 * 1024,
  );
  try {
    const published = parseSha256Sums(await readFile(checksumsPath, "utf8")).get(asset);
    if (published === undefined) {
      fail(`The talosctl ${TOOLCHAIN_PINS.talosctl} checksum file has no line for ${asset}.`);
    }
    return published;
  } finally {
    await rm(checksumsPath, { force: true });
  }
}

function verifyHostTools(): readonly string[] {
  const failures: string[] = [];
  const goFailure = verifyVersion(
    "Go",
    TOOLCHAIN_PINS.go,
    parseGoVersion(commandVersion("go", ["version"]) ?? ""),
  );
  if (goFailure !== undefined) {
    failures.push(
      `${goFailure} Provision Go ${TOOLCHAIN_PINS.go} yourself; the bootstrap does not install it system-wide.`,
    );
  }
  const rustFailure = verifyVersion(
    "Rust",
    TOOLCHAIN_PINS.rust,
    parseRustcVersion(commandVersion("rustc", ["--version"]) ?? ""),
  );
  if (rustFailure !== undefined) {
    failures.push(
      `${rustFailure} Select the pinned toolchain from rust-toolchain.toml with rustup.`,
    );
  }
  return failures;
}

function parseArguments(argv: readonly string[]): string {
  let toolsDirectory = ".tools";
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--tools-dir") {
      const value = argv[index + 1];
      if (value === undefined || value === "") {
        fail("--tools-dir needs a directory path.");
      }
      toolsDirectory = value;
      index += 1;
      continue;
    }
    fail(
      `Unknown argument ${argument ?? ""}. Usage: node scripts/dev-toolchain.ts [--tools-dir PATH]`,
    );
  }
  return resolve(repoRoot, toolsDirectory);
}

async function main(): Promise<void> {
  const toolsDirectory = parseArguments(process.argv.slice(2));
  const platform = resolveToolPlatform(process.platform, process.arch);
  if (platform === undefined) {
    fail(
      `The bootstrap supports Linux x64, macOS arm64, and macOS x64 only; ${process.platform}/${process.arch} must use the manual procedure in the close-out plan.`,
    );
  }
  mkdirSync(toolsDirectory, { recursive: true });

  const node = await ensureNode(platform, toolsDirectory);
  const pnpm = await ensurePnpm(node, toolsDirectory);
  const protoc = await ensureProtoc(platform, toolsDirectory);
  const talosctl = await ensureTalosctl(platform, toolsDirectory);
  const failures = verifyHostTools();
  if (failures.length > 0) {
    fail(failures.join("\n"));
  }

  const binPath = join(toolsDirectory, binDirectory);
  const nodePath = join(toolsDirectory, nodeDirectory, "bin");
  const protocPath = join(toolsDirectory, protocDirectory, "bin");
  const pathSeparator = ":";
  process.stdout.write(
    [
      `Toolchain ready in ${toolsDirectory}`,
      `  Node      ${TOOLCHAIN_PINS.node}  ${node}`,
      `  pnpm      ${TOOLCHAIN_PINS.pnpm}  ${pnpm}`,
      `  protoc    ${TOOLCHAIN_PINS.protoc}  ${protoc}`,
      `  talosctl  ${TOOLCHAIN_PINS.talosctl}  ${talosctl}`,
      `  Go        ${TOOLCHAIN_PINS.go}  ${commandVersion("go", ["env", "GOROOT"]) ?? "on PATH"}`,
      `  Rust      ${TOOLCHAIN_PINS.rust}  ${commandVersion("rustc", ["--print", "sysroot"]) ?? "rustup"}`,
      "",
      `export PATH="${[nodePath, protocPath, binPath].join(pathSeparator)}${pathSeparator}$PATH"`,
      "",
    ].join("\n"),
  );
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Toolchain bootstrap failed: ${message}\n`);
  process.exitCode = 1;
});
