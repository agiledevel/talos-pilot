import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  parseCargoPackages,
  parseGoModules,
  parseNpmLicenses,
  renderInventory,
  splitJsonObjects,
  type DependencyInventory,
} from "./lib/inventory.ts";
import { isRecord } from "./lib/validation.ts";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const inventoryPath = join(root, "docs", "verification", "dependency-inventory.json");
const maxLicenseBytes = 64 * 1024;
const licensePattern = /^(license|licence|copying|copyright)/iu;
const noticePattern = /^notice(\.|$)/iu;

function run(command: string, args: readonly string[], cwd: string): string {
  return execFileSync(command, [...args], { cwd, encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
}

function sha256(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

function containsNamedFile(directory: string, pattern: RegExp): boolean {
  if (!existsSync(directory)) {
    return false;
  }
  try {
    return readdirSync(directory, { withFileTypes: true }).some(
      (entry) => entry.isFile() && pattern.test(entry.name),
    );
  } catch {
    return false;
  }
}

function readLicenseTexts(directory: string): { files: string[]; texts: string[] } {
  if (directory.length === 0 || !existsSync(directory)) {
    return { files: [], texts: [] };
  }
  const files: string[] = [];
  const texts: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !licensePattern.test(entry.name)) {
      continue;
    }
    files.push(entry.name);
    try {
      const path = join(directory, entry.name);
      if (statSync(path).size > maxLicenseBytes) {
        continue;
      }
      texts.push(readFileSync(path, "utf8"));
    } catch {
      texts.push("");
    }
  }
  return { files, texts };
}

function pinned(file: string, pattern: RegExp): string {
  const text = readFileSync(join(root, file), "utf8");
  const match = pattern.exec(text);
  if (match === null || match[1] === undefined) {
    throw new Error(`${file} does not record the expected pin.`);
  }
  return match[1].trim();
}

const npmLicenses = JSON.parse(run("pnpm", ["licenses", "list", "--json"], root)) as unknown;
const cargoMetadata = JSON.parse(
  run("cargo", ["metadata", "--locked", "--format-version", "1"], join(root, "src-tauri")),
) as unknown;
const goList = run("go", ["list", "-m", "-json", "all"], join(root, "helper"));
const goModules: unknown[] = splitJsonObjects(goList).map((chunk) => JSON.parse(chunk) as unknown);
// Modules that actually contribute packages to the helper binary. Their sources
// are present in the module cache, so their license files are always observable.
const goDeps = run("go", ["list", "-deps", "-json", "./..."], join(root, "helper"));
const linkedModules = new Set<string>();
for (const chunk of splitJsonObjects(goDeps)) {
  const pkg = JSON.parse(chunk) as unknown;
  if (isRecord(pkg) && isRecord(pkg.Module) && typeof pkg.Module.Path === "string") {
    linkedModules.add(pkg.Module.Path);
  }
}

const inventory: DependencyInventory = {
  schemaVersion: 2,
  generatedFrom:
    "pnpm licenses list --json, cargo metadata --locked --format-version 1, and go list -m -json all; regenerate with pnpm inventory:generate",
  sources: {
    node: pinned(".node-version", /^(\S+)/u),
    pnpm: pinned("package.json", /"packageManager":\s*"pnpm@([^"]+)"/u),
    rustc: pinned("rust-toolchain.toml", /channel\s*=\s*"([^"]+)"/u),
    go: pinned("helper/go.mod", /^go\s+(\S+)/mu),
    lockfiles: {
      pnpmLock: sha256(join(root, "pnpm-lock.yaml")),
      cargoLock: sha256(join(root, "src-tauri", "Cargo.lock")),
      goSum: sha256(join(root, "helper", "go.sum")),
    },
  },
  npm: parseNpmLicenses(npmLicenses, (directory) => containsNamedFile(directory, noticePattern)),
  cargo: parseCargoPackages(cargoMetadata, (directory) => {
    const manifestDirectory = existsSync(join(directory, "Cargo.toml")) ? directory : "";
    return manifestDirectory.length > 0 && containsNamedFile(manifestDirectory, noticePattern);
  }),
  go: parseGoModules(goModules, linkedModules, ({ dir }) => {
    const { files, texts } = readLicenseTexts(dir);
    const observed = dir.length > 0 && existsSync(dir);
    return { files, texts, notice: containsNamedFile(dir, noticePattern), observed };
  }),
};

const rendered = renderInventory(inventory);
const onDisk = existsSync(inventoryPath) ? readFileSync(inventoryPath, "utf8") : "";

if (process.argv.includes("--check")) {
  if (rendered === onDisk) {
    console.info(
      `Dependency inventory is current: ${String(inventory.npm.length)} npm, ${String(
        inventory.cargo.length,
      )} cargo, and ${String(inventory.go.length)} Go modules.`,
    );
  } else {
    process.stderr.write(
      `Dependency inventory is stale. Run pnpm inventory:generate. Generated ${String(
        rendered.length,
      )} bytes against ${String(onDisk.length)} committed bytes.\n`,
    );
    process.exitCode = 1;
  }
} else {
  writeFileSync(inventoryPath, rendered, "utf8");
  console.info(
    `Wrote ${basename(inventoryPath)}: ${String(inventory.npm.length)} npm, ${String(
      inventory.cargo.length,
    )} cargo, ${String(inventory.go.length)} Go modules with the toolchain pins ${String(
      inventory.sources.node,
    )}/${String(inventory.sources.rustc)}/${String(inventory.sources.go)}.`,
  );
}
