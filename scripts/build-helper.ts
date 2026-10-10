import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target =
  process.env.TAURI_ENV_TARGET_TRIPLE ??
  execFileSync("rustc", ["--print", "host-tuple"], { encoding: "utf8" }).trim();

const targetPlatforms: Readonly<Record<string, { goos: string; goarch: string }>> = {
  "x86_64-unknown-linux-gnu": { goos: "linux", goarch: "amd64" },
  "x86_64-apple-darwin": { goos: "darwin", goarch: "amd64" },
  "aarch64-apple-darwin": { goos: "darwin", goarch: "arm64" },
  "x86_64-pc-windows-msvc": { goos: "windows", goarch: "amd64" },
};
const platform = targetPlatforms[target];
if (platform === undefined) {
  throw new Error(`Unsupported helper target: ${target}`);
}

const buildIdentity =
  process.env.TALOS_PILOT_BUILD_ID ??
  process.env.GITHUB_SHA ??
  execFileSync("git", ["rev-parse", "--verify", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
const identityPath = resolve(root, "src-tauri/helper-build-id.txt");
const currentBuildIdentity = existsSync(identityPath)
  ? readFileSync(identityPath, "utf8").trim()
  : undefined;
if (currentBuildIdentity !== buildIdentity) {
  writeFileSync(identityPath, `${buildIdentity}\n`, "utf8");
}
const outputDirectory = resolve(root, "src-tauri/binaries");
const executable = platform.goos === "windows" ? "talos-pilot-helper.exe" : "talos-pilot-helper";
const output = resolve(outputDirectory, executable);

// This directory is a generated build resource. Keeping one target binary here
// prevents a later bundle from accidentally packaging stale cross-target output.
rmSync(outputDirectory, { recursive: true, force: true });
mkdirSync(outputDirectory, { recursive: true });
execFileSync(
  "go",
  [
    "build",
    "-trimpath",
    "-ldflags",
    `-X main.buildIdentity=${buildIdentity}`,
    "-o",
    output,
    "./cmd/talos-pilot-helper",
  ],
  {
    cwd: resolve(root, "helper"),
    env: {
      ...process.env,
      CGO_ENABLED: "0",
      GOARCH: platform.goarch,
      GOOS: platform.goos,
    },
    stdio: "inherit",
  },
);
console.info(`Built helper for ${target}: ${output}`);
