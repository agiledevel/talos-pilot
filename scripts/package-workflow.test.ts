import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
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
  it("constructs an archive-proven reference before payload validation, not from live OS modes", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const prepare = workflow.indexOf(
      'node scripts/prepare-appimage-reference.ts --root "$work/appimage/squashfs-root"',
    );
    const check = workflow.indexOf("node scripts/check-payload.ts --platform linux-appimage");
    expect(prepare).toBeGreaterThan(0);
    expect(prepare).toBeLessThan(check);
    expect(workflow.slice(prepare)).toContain('--appimage-system-root "$work/appimage/reference"');
    expect(workflow).not.toContain("snapshot-appimage-system-data");
    expect(workflow).not.toContain("continue-on-error");
  });

  it("retains failed AppImages only under a short-lived non-release diagnostic name", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const block =
      /      - name: Preserve failed Linux AppImage for diagnosis\n([\s\S]*?)\n      - /u.exec(
        workflow,
      )?.[1];
    if (block === undefined) throw new Error("The failed-payload diagnostic step is missing.");
    expect(workflow).toContain(
      "if: failure() && runner.os == 'Linux' && steps.linux_payload.outcome == 'failure'",
    );
    expect(workflow).toContain('test "${#images[@]}" -eq 1');
    expect(workflow).toContain('test "$(stat -c \'%s\' "${images[0]}")" -le 268435456');
    expect(block).toContain(
      "if: failure() && runner.os == 'Linux' && steps.linux_diagnostic.outcome == 'success'",
    );
    expect(block).toContain("name: diagnostic-appimage-${{ inputs.revision }}");
    expect(block).toContain("retention-days: 1");
    expect(block).toContain("if-no-files-found: error");
    expect(block).not.toContain("name: release-");
    expect(readFileSync(".github/workflows/release.yml", "utf8")).toContain("pattern: release-*");
  });

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

describe.skipIf(process.platform === "win32")("failed AppImage diagnostic bounds", () => {
  function inspect(sizes: readonly number[]) {
    const workflow = readFileSync(workflowPath, "utf8");
    const block =
      /      - name: Bound failed Linux AppImage diagnostic\n([\s\S]*?)\n      - /u.exec(
        workflow,
      )?.[1];
    const body = block?.split("        run: |\n")[1];
    if (body === undefined) throw new Error("The actual diagnostic guard command is missing.");
    const command = body
      .split("\n")
      .map((line) => line.slice(10))
      .join("\n")
      .replace("${{ matrix.target }}", "x86_64-unknown-linux-gnu");
    const directory = join(
      fixture,
      "src-tauri/target/x86_64-unknown-linux-gnu/release/bundle/appimage",
    );
    mkdirSync(directory, { recursive: true });
    sizes.forEach((bytes, index) => {
      const file = join(directory, `Talos Pilot ${index}.AppImage`);
      writeFileSync(file, "");
      truncateSync(file, bytes);
    });
    return spawnSync("bash", ["-c", command], { cwd: fixture, encoding: "utf8", timeout: 5_000 });
  }

  it("accepts exactly one image at the inclusive 256 MiB diagnostic limit", () => {
    const result = inspect([268435456]);
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(result.stdout).toMatch(/^[0-9a-f]{64} {2}/u);
  });

  it.each([{ sizes: [] }, { sizes: [1, 1] }, { sizes: [268435457] }])(
    "refuses absent, multiple or oversized diagnostic inputs: $sizes",
    ({ sizes }) => {
      const result = inspect(sizes);
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stdout).toBe("");
    },
  );
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
