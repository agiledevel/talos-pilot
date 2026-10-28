import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  APPIMAGE_DATA_LIMITS,
  isAppImageSystemDataPath,
  verifyAppImageSystemData,
} from "./appimage-system-data";

let fixture: string;
const copyright = "usr/share/doc/libglib2.0-0/copyright";
const schema = "usr/share/glib-2.0/schemas/org.example.gschema.xml";
const text =
  "Format: https://www.debian.org/doc/packaging-manuals/copyright-format/1.0/\nCopyright: synthetic fixture\n";

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "talos-appimage-data-"));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function write(root: string, path: string, bytes: string | Buffer, mode: number): string {
  const file = join(fixture, root, path);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, bytes);
  chmodSync(file, mode);
  return file;
}
function verify(path = copyright) {
  return verifyAppImageSystemData(join(fixture, "payload"), path, join(fixture, "system"));
}

describe("AppImage system-data proof", () => {
  it.each([
    copyright,
    schema,
    "usr/share/glib-2.0/schemas/gschema.dtd",
    "usr/share/glib-2.0/schemas/org.gnome.desktop.enums.xml",
    "usr/share/glib-2.0/schemas/10_gsettings-desktop-schemas.gschema.override",
  ])("proves unchanged data despite copied execute bits: %s", (path) => {
    write("system", path, text, 0o644);
    const payload = write("payload", path, text, 0o755);
    const proof = verify(path);
    expect(proof.bytes).toBe(Buffer.byteLength(text));
    expect(proof.sha256).toMatch(/^[0-9a-f]{64}$/u);
    // The gate reads the installer, never repairs or rewrites its permissions.
    expect(statSync(payload).mode & 0o777).toBe(0o755);
  });

  it.each([
    "usr/share/doc/libglib2.0-0/extra-tool",
    "usr/share/glib-2.0/schemas/evil.sh",
    "usr/share/glib-2.0/schemas/org.example.enums.xml",
    "usr/share/glib-2.0/schemas/arbitrary.xml",
    "usr/bin/copyright",
    "usr/share/doc/../copyright",
    "AppRun.wrapped",
  ])("does not exempt arbitrary names or directories: %s", (path) => {
    expect(isAppImageSystemDataPath(path)).toBe(false);
    expect(() => verify(path)).toThrow("not a declared system data path");
  });

  it("rejects changed text, including shell text without a shebang", () => {
    write("system", copyright, text, 0o644);
    write("payload", copyright, "printf 'not a copyright file'\n", 0o755);
    expect(() => verify()).toThrow("payload bytes differ");
  });

  it("rejects an executable source instead of declaring it data", () => {
    write("system", copyright, text, 0o755);
    write("payload", copyright, text, 0o755);
    expect(() => verify()).toThrow("regular non-executable system file");
  });

  it.each([
    Buffer.from("#!/bin/sh\nprintf bad\n"),
    Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]),
    Buffer.from([0xff]),
  ])("rejects binary/script/non-UTF8 contents even with matching sources", (bytes) => {
    write("system", copyright, bytes, 0o644);
    write("payload", copyright, bytes, 0o755);
    expect(() => verify()).toThrow("Cannot verify AppImage system data");
  });

  it("rejects missing OS originals rather than trusting the data path", () => {
    mkdirSync(join(fixture, "system/usr/share/doc"), { recursive: true });
    write("payload", copyright, text, 0o755);
    expect(() => verify()).toThrow("Cannot verify AppImage system data");
  });

  it("rejects an oversized source before reading it as data", () => {
    const bytes = Buffer.alloc(APPIMAGE_DATA_LIMITS.fileBytes + 1, 0x61);
    write("system", copyright, bytes, 0o644);
    write("payload", copyright, bytes, 0o755);
    expect(() => verify()).toThrow("exceeds its byte limit");
  });

  it("rejects an oversized payload independently of the source limit", () => {
    write("system", copyright, text, 0o644);
    write("payload", copyright, Buffer.alloc(APPIMAGE_DATA_LIMITS.fileBytes + 1, 0x61), 0o755);
    expect(() => verify()).toThrow("exceeds its byte limit");
  });

  it.skipIf(process.platform === "win32")("rejects a FIFO source without blocking", () => {
    const source = join(fixture, "system", copyright);
    mkdirSync(dirname(source), { recursive: true });
    execFileSync("mkfifo", [source]);
    write("payload", copyright, text, 0o755);
    const module = JSON.stringify(resolve("scripts/lib/appimage-system-data.ts"));
    const result = spawnSync(
      process.execPath,
      [
        "--input-type=module",
        "-e",
        `import { verifyAppImageSystemData } from ${module}; verifyAppImageSystemData(process.argv[1], ${JSON.stringify(copyright)}, process.argv[2]);`,
        join(fixture, "payload"),
        join(fixture, "system"),
      ],
      { encoding: "utf8", timeout: 5_000 },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("regular non-executable system file");
  });

  it.skipIf(process.platform === "win32")("rejects an escaping source symlink", () => {
    const outside = write("system", "outside", text, 0o644);
    mkdirSync(dirname(join(fixture, "system", copyright)), { recursive: true });
    symlinkSync(outside, join(fixture, "system", copyright));
    write("payload", copyright, text, 0o755);
    expect(() => verify()).toThrow("source symlink escapes");
  });

  it.skipIf(process.platform === "win32")("rejects an escaping payload symlink", () => {
    write("system", copyright, text, 0o644);
    const outside = write("elsewhere", "copyright", text, 0o644);
    mkdirSync(dirname(join(fixture, "payload", copyright)), { recursive: true });
    symlinkSync(outside, join(fixture, "payload", copyright));
    expect(() => verify()).toThrow("payload symlink escapes");
  });
});
