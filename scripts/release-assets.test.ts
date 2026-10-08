import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/release-assets.ts");
const resourceScript = resolve("scripts/appimage-resources.ts");
const target = "x86_64-pc-windows-msvc";
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "talos-pilot-release-assets-"));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function packageFile(name: string, contents: string): void {
  const directory = join(fixture, "src-tauri", "target", target, "release", "bundle", "nsis");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), contents);
}

function collect(): string {
  return execFileSync(process.execPath, [script], {
    cwd: fixture,
    env: { ...process.env, RELEASE_TARGET: target, RELEASE_TAG: "v0.1.0" },
    encoding: "utf8",
    stdio: "pipe",
  });
}

describe("release asset collection", () => {
  it("copies the installer bytes and emits a verifiable target-specific checksum", () => {
    const contents = "synthetic installer bytes";
    packageFile("pilot-setup.exe", contents);
    expect(collect()).toContain("Collected 1 packages");
    const output = join(fixture, "release-assets");
    const filename = `${target}-pilot-setup.exe`;
    expect(readFileSync(join(output, filename), "utf8")).toBe(contents);
    const hash = createHash("sha256").update(contents).digest("hex");
    expect(readFileSync(join(output, `${target}-SHA256SUMS.txt`), "utf8")).toBe(
      `${hash}  ${filename}\n`,
    );
  });

  it("rejects an application executable in a nested bundle instead of accepting it as an installer", () => {
    packageFile("README.txt", "no installer");
    const nested = join(fixture, "src-tauri", "target", target, "release", "bundle", "nsis", "app");
    mkdirSync(nested);
    writeFileSync(join(nested, "talos-pilot.exe"), "application, not installer");
    expect(collect).toThrow("Expected exactly one .exe installer");
  });

  it("rejects ambiguous duplicate installers", () => {
    packageFile("first.exe", "one");
    packageFile("second.exe", "two");
    expect(collect).toThrow("Expected exactly one .exe installer");
  });

  it("rejects incomplete WebKit packaging and accepts both executable helper resources", () => {
    const directory = join(
      fixture,
      "src-tauri",
      "target",
      "x86_64-unknown-linux-gnu",
      "release",
      "bundle",
      "appimage",
      "Talos Pilot.AppDir",
      "usr",
      "lib",
      "webkit2gtk-4.1",
    );
    mkdirSync(directory, { recursive: true });
    const inspect = () =>
      execFileSync(process.execPath, [resourceScript], {
        cwd: fixture,
        encoding: "utf8",
        stdio: "pipe",
      });
    expect(inspect).toThrow("missing executable WebKit resources");
    const network = join(directory, "WebKitNetworkProcess");
    writeFileSync(network, "synthetic network helper");
    chmodSync(network, 0o755);
    expect(inspect).toThrow("WebKitWebProcess");
    const web = join(directory, "WebKitWebProcess");
    writeFileSync(web, "synthetic web helper");
    chmodSync(web, 0o755);
    expect(inspect()).toContain("both executable WebKit helper processes");
  });
});
