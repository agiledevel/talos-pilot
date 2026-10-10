import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const maxConfigBytes = 64 * 1024;
const allowedFixtureId = "talos-pilot-c4-20261009";
const helperPath = resolve(root, "src-tauri", "binaries", "talos-pilot-helper");

/** Reads one `--flag <path>` reference; the harness never accepts inline material. */
function reference(flag: string): string {
  const index = process.argv.indexOf(flag);
  if (index === -1) {
    throw new Error(`${flag} is required and must reference a file.`);
  }
  const value = process.argv[index + 1];
  if (value === undefined || value.startsWith("--")) {
    throw new Error(`${flag} needs a file path.`);
  }
  const path = resolve(root, value);
  if (!existsSync(path)) {
    throw new Error(`${flag} references ${path}, which does not exist.`);
  }
  const info = statSync(path);
  if (!info.isFile()) {
    throw new Error(`${flag} must reference a regular file.`);
  }
  return path;
}

const manifestPath = reference("--manifest");
const configPath = reference("--talosconfig");

if (!relative(root, configPath).startsWith("..")) {
  throw new Error(
    "--talosconfig must live outside the repository so credentials cannot be committed.",
  );
}
const configInfo = statSync(configPath);
if (configInfo.size === 0 || configInfo.size > maxConfigBytes) {
  throw new Error(
    `--talosconfig must be between 1 and ${String(maxConfigBytes)} bytes, found ${String(configInfo.size)}.`,
  );
}

let manifest: Record<string, unknown>;
try {
  const parsed: unknown = JSON.parse(readFileSync(manifestPath, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("object");
  }
  manifest = parsed as Record<string, unknown>;
} catch {
  throw new Error(`the fixture manifest ${manifestPath} is not a JSON object.`);
}

if (manifest.fixtureId !== allowedFixtureId) {
  throw new Error(
    `manifest fixtureId ${String(manifest.fixtureId)} is not the allowlisted fixture ${allowedFixtureId}.`,
  );
}
for (const field of ["contextName", "talosVersion", "kubernetesVersion", "negativeEndpoint"]) {
  if (typeof manifest[field] !== "string" || (manifest[field] as string).length === 0) {
    throw new Error(`fixture manifest field ${field} is missing or empty.`);
  }
}
for (const field of ["allowedEndpoints", "allowedNodes"]) {
  const list: unknown = manifest[field];
  if (!Array.isArray(list) || list.length === 0) {
    throw new Error(`fixture manifest ${field} must be a non-empty array.`);
  }
  for (const entry of list) {
    if (
      typeof entry !== "string" ||
      entry.length === 0 ||
      entry.includes("*") ||
      entry.includes("/")
    ) {
      throw new Error(`fixture manifest ${field} must contain explicit literal addresses only.`);
    }
  }
}
if (manifest.schemaVersion !== 1) {
  throw new Error("fixture manifest schemaVersion must be 1.");
}

console.info(
  `Fixture ${allowedFixtureId}: Talos ${String(manifest.talosVersion)}, Kubernetes ${String(manifest.kubernetesVersion)}, ${String(manifest.contextName)}.`,
);
execFileSync("pnpm", ["helper:build"], { cwd: root, stdio: "inherit" });

execFileSync(
  "cargo",
  [
    "test",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--locked",
    "--test",
    "talos_fixture",
    "--",
    "--ignored",
    "--nocapture",
  ],
  {
    cwd: root,
    stdio: "inherit",
    env: {
      ...process.env,
      TALOS_PILOT_FIXTURE_MANIFEST: manifestPath,
      TALOS_PILOT_FIXTURE_TALOSCONFIG: configPath,
      TALOS_PILOT_FIXTURE_HELPER: helperPath,
    },
  },
);

console.info(
  "C4 fixture harness completed: authenticated read, bounded stream, cancellation, and failure classes.",
);
