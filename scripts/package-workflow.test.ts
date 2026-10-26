import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const workflowPath = ".github/workflows/build-assets.yml";
const extractionScript = resolve("scripts/extract-rpm.sh");
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "talos-package workflow-"));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

/** Executes the actual shared workflow command against an argv-recording CLI. */
describe("shared package build invocation", () => {
  it("preserves the Cargo separator without a pnpm/PowerShell forwarding layer", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const block = /      - name: Build preview packages\n([\s\S]*?)\n      - /u.exec(workflow)?.[1];
    if (block === undefined) throw new Error("The shared package step is missing.");
    expect(block).toContain("shell: bash");
    const command = /        run: (.+)/u.exec(block)?.[1];
    if (command === undefined) throw new Error("The package step needs a command.");
    const directory = join(fixture, "node_modules/@tauri-apps/cli");
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, "tauri.js"),
      "console.log(JSON.stringify(process.argv.slice(2)));",
    );
    for (const [target, bundles] of [
      ["x86_64-pc-windows-msvc", "nsis"],
      ["x86_64-unknown-linux-gnu", "deb,rpm,appimage"],
      ["aarch64-apple-darwin", "app,dmg"],
      ["x86_64-apple-darwin", "app,dmg"],
    ] as const) {
      const output = execFileSync(
        "bash",
        [
          "-e",
          "-o",
          "pipefail",
          "-c",
          command.replace("${{ matrix.target }}", target).replace("${{ matrix.bundles }}", bundles),
        ],
        { cwd: fixture, encoding: "utf8", timeout: 5_000 },
      );
      const args: unknown = JSON.parse(output);
      expect(args).toEqual([
        "build",
        "--ci",
        "--config",
        ".github/tauri.release.conf.json",
        "--target",
        target,
        "--bundles",
        bundles,
        "--",
        "--locked",
      ]);
    }
  });
});

// This is a hosted Linux extraction procedure, not a Windows application API.
describe.skipIf(process.platform === "win32")("RPM extraction boundary", () => {
  function runExtractor(contents: string): ReturnType<typeof spawnSync> {
    const bin = join(fixture, "bin");
    mkdirSync(bin, { recursive: true });
    const tool = join(bin, "bsdtar");
    writeFileSync(tool, `#!/usr/bin/env bash\nset -euo pipefail\n${contents}\n`);
    chmodSync(tool, 0o755);
    const packagePath = join(fixture, "Talos Pilot.rpm");
    writeFileSync(packagePath, "synthetic RPM transport input");
    const destination = join(fixture, "payload");
    mkdirSync(destination, { recursive: true });
    return spawnSync("bash", [extractionScript, packagePath, destination], {
      env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ""}` },
      encoding: "utf8",
      timeout: 5_000,
    });
  }

  it("uses the checked-in extractor and provisions libarchive", () => {
    expect(readFileSync(workflowPath, "utf8")).toContain(
      'bash scripts/extract-rpm.sh "$package" "$work/rpm"',
    );
    expect(readFileSync("scripts/ci-linux-prerequisites.sh", "utf8")).toContain(
      "rpm libarchive-tools",
    );
  });

  it("passes paths with spaces as data, without restoring archive owners", () => {
    const result = runExtractor(`
      test "$#" -eq 5
      test "$1" = --no-same-owner
      test "$2" = -xf
      test -f "$3"
      test "$4" = -C
      test -d "$5"
      printf 'extracted' > "$5/observed"
    `);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(join(fixture, "payload/observed"), "utf8")).toBe("extracted");
  });

  it("does not swallow a malformed/truncated archive failure", () => {
    const result = runExtractor("echo 'synthetic corrupt archive' >&2; exit 9");
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(9);
    expect(String(result.stderr)).toContain("synthetic corrupt archive");
  });

  it("rejects missing inputs rather than treating them as empty packages", () => {
    const result = spawnSync("bash", [extractionScript, join(fixture, "missing.rpm"), fixture], {
      encoding: "utf8",
      timeout: 5_000,
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
  });
});
