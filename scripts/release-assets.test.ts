import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/release-assets.ts");
const verifier = resolve("scripts/verify-artifacts.ts");
const resourceScript = resolve("scripts/appimage-resources.ts");
const target = "x86_64-pc-windows-msvc";
const revision = "0123456789abcdef0123456789abcdef01234567";
const version = "0.1.0";
const workflowIdentity = {
  RELEASE_SOURCE_REPOSITORY: "agiledevel/talos-pilot",
  RELEASE_SOURCE_REF: "refs/heads/qualification",
  RELEASE_SOURCE_EVENT: "workflow_dispatch",
  RELEASE_WORKFLOW_NAME: "Package qualification",
  RELEASE_WORKFLOW_PATH:
    "agiledevel/talos-pilot/.github/workflows/qualification.yml@refs/heads/main",
  RELEASE_WORKFLOW_RUN_ID: "123456789",
  RELEASE_WORKFLOW_RUN_ATTEMPT: "1",
  RELEASE_SERVER_URL: "https://github.com",
};
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "talos-pilot-release-assets-"));
  writeFileSync(join(fixture, "package.json"), JSON.stringify({ version }));
  mkdirSync(join(fixture, "src-tauri"), { recursive: true });
  writeFileSync(join(fixture, "src-tauri", "tauri.conf.json"), JSON.stringify({ version }));
  mkdirSync(join(fixture, ".github"), { recursive: true });
  writeFileSync(join(fixture, ".github", "tauri.release.conf.json"), "{}");
  const release = join(fixture, "src-tauri", "target", target, "release");
  mkdirSync(release, { recursive: true });
  writeFileSync(join(release, "talos-pilot.exe"), "synthetic application");
  mkdirSync(join(fixture, "src-tauri", "binaries"), { recursive: true });
  writeFileSync(
    join(fixture, "src-tauri", "binaries", "talos-pilot-helper.exe"),
    "synthetic helper",
  );
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function writePackageFile(name: string, contents: string): void {
  const directory = join(fixture, "src-tauri", "target", target, "release", "bundle", "nsis");
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, name), contents);
}

function collect(overrides: Readonly<Record<string, string>> = {}): string {
  return execFileSync(process.execPath, [script], {
    cwd: fixture,
    env: {
      ...process.env,
      RELEASE_MODE: "qualification",
      RELEASE_TARGET: target,
      RELEASE_REVISION: revision,
      RELEASE_VERSION: version,
      ...workflowIdentity,
      ...overrides,
    },
    encoding: "utf8",
    stdio: "pipe",
  });
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

describe("release asset collection", () => {
  it("copies the installer bytes and writes checksums plus provenance for the source", () => {
    const contents = "synthetic installer bytes";
    writePackageFile("pilot-setup.exe", contents);
    expect(collect()).toContain("Collected 1 packages");
    const output = join(fixture, "release-assets");
    const filename = `${target}-pilot-setup.exe`;
    expect(readFileSync(join(output, filename), "utf8")).toBe(contents);
    const hash = createHash("sha256").update(contents).digest("hex");
    expect(readFileSync(join(output, `${target}-SHA256SUMS.txt`), "utf8")).toBe(
      `${hash}  ${filename}\n`,
    );
    const provenance: unknown = JSON.parse(
      readFileSync(join(output, `${target}-provenance.json`), "utf8"),
    );
    expect(provenance).toMatchObject({
      schemaVersion: 1,
      mode: "qualification",
      target,
      source: { revision, version },
      build: { buildIdentity: revision },
      installers: [{ file: filename, sha256: hash, bytes: contents.length }],
    });
  });

  it("round-trips through the downloaded-artifact verifier", () => {
    writePackageFile("pilot-setup.exe", "synthetic installer bytes");
    collect();
    const output = join(fixture, "release-assets");
    const result = execFileSync(
      process.execPath,
      [
        verifier,
        "--directory",
        output,
        "--mode",
        "qualification",
        "--revision",
        revision,
        "--version",
        version,
        "--targets",
        target,
      ],
      { cwd: fixture, encoding: "utf8", stdio: "pipe" },
    );
    expect(result).toContain("Verified 1 targets and 1 installers");
  });

  it("removes a stale installer and checksum from an earlier run", () => {
    writePackageFile("pilot-setup.exe", "current installer");
    const output = join(fixture, "release-assets");
    mkdirSync(output, { recursive: true });
    writeFileSync(join(output, "stale-installer.exe"), "old");
    writeFileSync(join(output, `${target}-SHA256SUMS.txt`), "stale");
    collect();
    expect(existsSync(join(output, "stale-installer.exe"))).toBe(false);
    expect(readFileSync(join(output, `${target}-SHA256SUMS.txt`), "utf8")).not.toContain("stale");
  });

  it("rejects a package version that does not match the checked-out source", () => {
    writePackageFile("pilot-setup.exe", "one");
    expect(() => collect({ RELEASE_VERSION: "0.2.0" })).toThrow("package.json version");
  });

  it("rejects a fabricated tag in qualification mode and a missing tag in release mode", () => {
    writePackageFile("pilot-setup.exe", "one");
    expect(() => collect({ RELEASE_TAG: "v0.1.0" })).toThrow("not accepted in qualification mode");
    expect(() => collect({ RELEASE_MODE: "release" })).toThrow("RELEASE_TAG is required");
  });

  it("rejects tags that do not name the packaged version", () => {
    writePackageFile("pilot-setup.exe", "one");
    expect(() => collect({ RELEASE_MODE: "release", RELEASE_TAG: "v0.2.0" })).toThrow(
      "must name the version",
    );
  });

  it("rejects an undeclared or path-shaped verification target", () => {
    writePackageFile("pilot-setup.exe", "synthetic installer bytes");
    collect();
    const verify = (listed: string) =>
      execFileSync(
        process.execPath,
        [
          verifier,
          "--directory",
          join(fixture, "release-assets"),
          "--mode",
          "qualification",
          "--revision",
          revision,
          "--version",
          version,
          "--targets",
          listed,
        ],
        { cwd: fixture, encoding: "utf8", stdio: "pipe" },
      );
    expect(() => verify("../escape")).toThrow("Unsupported release target");
    expect(() => verify(`${target},${target}`)).toThrow("exactly once");
  });

  it("rejects malformed and ref-shaped source revisions before writing anything", () => {
    writePackageFile("pilot-setup.exe", "one");
    for (const value of ["abc1234", `${revision}^`, "main", `${revision}\necho unsafe`]) {
      expect(() => collect({ RELEASE_REVISION: value })).toThrow("40-character commit SHA");
    }
    expect(existsSync(join(fixture, "release-assets"))).toBe(false);
  });

  it("rejects a missing bundle directory with an actionable message", () => {
    expect(() => collect()).toThrow("No .exe bundle directory");
  });

  it("rejects a partial Linux artifact set before writing anything", () => {
    const linux = "x86_64-unknown-linux-gnu";
    const release = join(fixture, "src-tauri", "target", linux, "release");
    mkdirSync(release, { recursive: true });
    writeFileSync(join(release, "talos-pilot"), "application");
    writeFileSync(join(fixture, "src-tauri", "binaries", "talos-pilot-helper"), "helper");
    const deb = join(release, "bundle", "deb");
    mkdirSync(deb, { recursive: true });
    writeFileSync(join(deb, "Talos Pilot_0.1.0_amd64.deb"), "deb bytes");
    expect(() => collect({ RELEASE_TARGET: linux })).toThrow("No .rpm bundle directory");
    expect(existsSync(join(fixture, "release-assets"))).toBe(false);
  });

  it("rejects an undeclared target instead of collecting an arbitrary package", () => {
    writePackageFile("pilot-setup.exe", "one");
    expect(() => collect({ RELEASE_TARGET: "aarch64-unknown-linux-gnu" })).toThrow("Unsupported");
  });

  it("rejects an application executable in a nested bundle instead of accepting it as an installer", () => {
    writePackageFile("README.txt", "no installer");
    const nested = join(fixture, "src-tauri", "target", target, "release", "bundle", "nsis", "app");
    mkdirSync(nested);
    writeFileSync(join(nested, "talos-pilot.exe"), "application, not installer");
    expect(() => collect()).toThrow("Expected exactly one .exe installer");
  });

  it("rejects ambiguous duplicate installers", () => {
    writePackageFile("first.exe", "one");
    writePackageFile("second.exe", "two");
    expect(() => collect()).toThrow("Expected exactly one .exe installer");
  });

  it("rejects tampered or swapped downloaded artifacts", () => {
    writePackageFile("pilot-setup.exe", "synthetic installer bytes");
    collect();
    const output = join(fixture, "release-assets");
    const installer = join(output, `${target}-pilot-setup.exe`);
    const digestBefore = sha256File(installer);
    writeFileSync(installer, "Synthetic installer bytes");
    expect(digestBefore).not.toBe(sha256File(installer));
    const verify = () =>
      execFileSync(
        process.execPath,
        [
          verifier,
          "--directory",
          output,
          "--mode",
          "qualification",
          "--revision",
          revision,
          "--version",
          version,
          "--targets",
          target,
        ],
        { cwd: fixture, encoding: "utf8", stdio: "pipe" },
      );
    expect(verify).toThrow("does not match its recorded SHA-256");

    writeFileSync(join(output, `${target}-provenance.json`), "{}");
    expect(verify).toThrow("must contain exactly");
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
