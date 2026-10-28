import { spawnSync } from "node:child_process";
import {
  chmodSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  statSync,
  symlinkSync,
  truncateSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  prepareAppImagePackageReference,
  REFERENCE_ARCHIVE_LIMITS,
  type ReferenceCommand,
} from "./appimage-package-reference";
import { APPIMAGE_DATA_LIMITS } from "./appimage-system-data";

// Dpkg/APT/libarchive are injected external process boundaries, not an Ubuntu
// authentication fixture. Actual signed-package extraction runs in qualification.
const copyright = "usr/share/doc/libfixture/copyright";
const schema = "usr/share/glib-2.0/schemas/org.example.gschema.xml";
const data = "Copyright: synthetic Debian package data\n";
const packageId = "libfixture:amd64=1:2.3-4ubuntu1";
let root: string;
let archiveIdentity: string;
let archiveSize: number;
let extraArchive: boolean;
let downloads: string;
let calls: { command: string; args: readonly string[] }[];
let messages: string[];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "talos archive reference-"));
  mkdirSync(join(root, "system"));
  archiveIdentity = packageId;
  archiveSize = 20;
  extraArchive = false;
  downloads = "";
  calls = [];
  messages = [];
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

function file(tree: string, path: string, bytes: string | Buffer, mode = 0o644) {
  const location = join(root, tree, path);
  mkdirSync(dirname(location), { recursive: true });
  writeFileSync(location, bytes, { mode });
  chmodSync(location, mode);
  return location;
}
function candidate(path = copyright, bytes: string | Buffer = data) {
  file("payload", path, bytes, 0o755);
  file("system", path, bytes, 0o777); // Actual Ubuntu runner pre-build metadata.
  file("archive", path, bytes);
}
const run: ReferenceCommand = (command, args) => {
  calls.push({ command, args });
  if (command === "dpkg-query" && args[0] === "--search") return `libfixture:amd64: ${args[1]}\n`;
  if (command === "dpkg-query" && args[0] === "--show") return packageId;
  if (command === "dpkg-deb") return archiveIdentity;
  if (command === "bash" && args[0]?.endsWith("ci-linux-prerequisites.sh")) {
    expect(args[1]).toBe("appimage-reference");
    expect(args.slice(3)).toEqual(["libfixture:amd64"]);
    downloads = args[2] ?? "";
    mkdirSync(downloads);
    writeFileSync(join(downloads, "fixture.deb"), "process-boundary fixture");
    truncateSync(join(downloads, "fixture.deb"), archiveSize);
    if (extraArchive) writeFileSync(join(downloads, "foreign.deb"), "unexpected");
    return "mock package download; no authentication claimed";
  }
  if (command === "bash" && args[0]?.endsWith("extract-deb-data.sh")) {
    const member = args[2]?.replace(/^\.\//u, "");
    const destination = args[3];
    if (member === undefined || destination === undefined)
      throw new Error("Missing fixture extraction args");
    mkdirSync(dirname(join(destination, member)), { recursive: true });
    cpSync(join(root, "archive", member), join(destination, member), {
      dereference: false,
      verbatimSymlinks: true,
    });
    return "";
  }
  throw new Error(`Unexpected fixture subprocess ${command}`);
};
function prepare(command: ReferenceCommand = run) {
  return prepareAppImagePackageReference(join(root, "payload"), join(root, "reference"), {
    systemRoot: join(root, "system"),
    run: command,
    log: (message) => messages.push(message),
  });
}

describe.skipIf(process.platform === "win32")("archive-proven Ubuntu data reference", () => {
  it("accepts archive-declared data despite runner mode 0777 without changing the OS or installer", () => {
    candidate();
    candidate(schema);
    expect(prepare()).toEqual({ files: 2, bytes: Buffer.byteLength(data) * 2, packages: 1 });
    expect(statSync(join(root, "reference", copyright)).mode & 0o777).toBe(0o444);
    expect(statSync(join(root, "system", copyright)).mode & 0o777).toBe(0o777);
    expect(statSync(join(root, "payload", copyright)).mode & 0o777).toBe(0o755);
    expect(existsSync(dirname(downloads))).toBe(false);
    expect(calls.filter((call) => call.command === "dpkg-deb")).toHaveLength(1);
  });

  it("accepts byte-identical data across package patch versions and logs both identities", () => {
    candidate();
    archiveIdentity = "libfixture:amd64=1:2.3-5ubuntu1";
    expect(prepare().files).toBe(1);
    expect(messages.join("\n")).toContain(`installed=${packageId}; archive=${archiveIdentity}`);
  });

  it("resolves distro copyright aliases without trusting outside files", () => {
    candidate();
    rmSync(join(root, "system", copyright));
    const canonical = "usr/share/doc/libcanonical/copyright";
    file("system", canonical, data, 0o777);
    file("archive", canonical, data);
    symlinkSync(join(root, "system", canonical), join(root, "system", copyright));
    expect(prepare().files).toBe(1);
    expect(calls.some((call) => call.args.includes(`./${canonical}`))).toBe(true);
  });

  it("rejects a source alias escaping its approved data subtree", () => {
    candidate();
    rmSync(join(root, "system", copyright));
    const outside = file("system", "outside", data);
    symlinkSync(outside, join(root, "system", copyright));
    expect(() => prepare()).toThrow("escapes its declared data subtree");
    expect(calls).toHaveLength(0);
  });

  it("rejects changed payload bytes even when they match the mutable live OS", () => {
    candidate(copyright, "printf 'tampered'\n");
    archiveIdentity = "libfixture:amd64=1:2.3-5ubuntu1";
    writeFileSync(join(root, "archive", copyright), data);
    expect(() => prepare()).toThrow("payload bytes differ");
    expect(existsSync(join(root, "reference"))).toBe(false);
    expect(existsSync(dirname(downloads))).toBe(false);
  });

  it.each([
    { bytes: "#!/bin/sh\necho bad\n", mode: 0o644 },
    { bytes: Buffer.from([0x7f, 0x45, 0x4c, 0x46, 0]), mode: 0o644 },
    { bytes: Buffer.from([0xff]), mode: 0o644 },
    { bytes: data, mode: 0o755 },
    { bytes: Buffer.alloc(APPIMAGE_DATA_LIMITS.fileBytes + 1, 0x61), mode: 0o644 },
  ])("rejects unsuitable archive originals: $mode", ({ bytes, mode }) => {
    candidate(copyright, bytes);
    rmSync(join(root, "archive", copyright));
    file("archive", copyright, bytes, mode);
    expect(() => prepare()).toThrow("Cannot prepare Ubuntu reference");
    expect(existsSync(join(root, "reference"))).toBe(false);
  });

  it("rejects an escaping archive symlink", () => {
    candidate();
    rmSync(join(root, "archive", copyright));
    const outside = file("elsewhere", "copyright", data);
    symlinkSync(outside, join(root, "archive", copyright));
    expect(() => prepare()).toThrow("archive data symlink escapes");
  });

  it.each(["foreign:amd64=1.0", "libfixture:i386=1:2.3-4ubuntu1", "malformed"])(
    "rejects mismatched or malformed archive identity %s",
    (value) => {
      candidate();
      archiveIdentity = value;
      expect(() => prepare()).toThrow(/Ubuntu reference package identity/u);
      expect(existsSync(join(root, "reference"))).toBe(false);
    },
  );

  it("rejects extra/oversized archives before extraction", () => {
    candidate();
    extraArchive = true;
    expect(() => prepare()).toThrow("archive count mismatch");
    extraArchive = false;
    archiveSize = REFERENCE_ARCHIVE_LIMITS.fileBytes + 1;
    expect(() => prepare()).toThrow("archive byte bound exceeded");
    expect(calls.some((call) => call.args[0]?.endsWith("extract-deb-data.sh"))).toBe(false);
  });

  it("rejects ambiguous ownership and command failures instead of falling back to live files", () => {
    candidate();
    expect(() =>
      prepare((command, args) =>
        command === "dpkg-query" ? "libfixture:amd64, other:amd64: /bad" : run(command, args),
      ),
    ).toThrow("ambiguous Ubuntu data owner");
    expect(() =>
      prepare((command, args) => {
        if (command === "bash") throw new Error("synthetic authentication failure");
        return run(command, args);
      }),
    ).toThrow("synthetic authentication failure");
    expect(existsSync(join(root, "reference"))).toBe(false);
  });

  it("never overwrites or deletes an existing reference", () => {
    candidate();
    file("reference", "marker", "owner data");
    expect(() => prepare()).toThrow("EEXIST");
    expect(existsSync(join(root, "reference/marker"))).toBe(true);
  });

  it("rejects cumulative data beyond 32 MiB and cleans partially copied references", () => {
    const bytes = Buffer.alloc(APPIMAGE_DATA_LIMITS.fileBytes, 0x61);
    for (let index = 0; index <= APPIMAGE_DATA_LIMITS.totalBytes / bytes.length; index += 1)
      candidate(`usr/share/doc/pkg${index}/copyright`, bytes);
    expect(() => prepare()).toThrow("data bytes exceed their total bound");
    expect(existsSync(join(root, "reference"))).toBe(false);
    expect(existsSync(dirname(downloads))).toBe(false);
  });

  it("rejects malformed CLI options before inspecting the OS or fetching packages", () => {
    for (const args of [
      [],
      ["--root"],
      ["--wrong", root, "--directory", join(root, "reference")],
    ]) {
      const result = spawnSync(
        process.execPath,
        ["scripts/prepare-appimage-reference.ts", ...args],
        { encoding: "utf8", timeout: 5_000 },
      );
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Usage:");
    }
  });

  it("enforces the data count bound before package queries", () => {
    for (let index = 0; index <= APPIMAGE_DATA_LIMITS.files; index += 1)
      file("payload", `usr/share/doc/pkg${index}/copyright`, data, 0o755);
    expect(() => prepare()).toThrow("file count exceeds");
    expect(calls).toHaveLength(0);
  });
});
