import { describe, expect, it } from "vitest";

import {
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
} from "./dev-toolchain";

describe("developer toolchain bootstrap", () => {
  it("records the reviewed pins and published digests", () => {
    expect(TOOLCHAIN_PINS).toEqual({
      node: "26.12.1",
      pnpm: "12.15.0",
      rust: "1.99.1",
      go: "1.27.3",
      protoc: "36.2",
      talosctl: "v1.14.2",
    });
    expect(Object.keys(PROTOC_SHA256).sort()).toEqual([
      "linux-x86_64",
      "osx-aarch_64",
      "osx-x86_64",
      "win64",
    ]);
    for (const digest of [...Object.values(PROTOC_SHA256), ...Object.values(TALOSCTL_SHA256)]) {
      expect(digest).toMatch(/^[0-9a-f]{64}$/u);
    }
    expect(TALOSCTL_SHA256["linux-amd64"]).toBe(
      "c6c9552b0e5f767352c595fa1c0af4f186f697488646872955057d23990a66c4",
    );
  });

  it("maps supported hosts to the archive names upstream publishes", () => {
    expect(resolveToolPlatform("linux", "x64")).toEqual({
      node: "linux-x64",
      protoc: "linux-x86_64",
      talosctl: "linux-amd64",
    });
    expect(resolveToolPlatform("darwin", "arm64")).toEqual({
      node: "darwin-arm64",
      protoc: "osx-aarch_64",
      talosctl: "darwin-arm64",
    });
    expect(resolveToolPlatform("darwin", "x64")).toEqual({
      node: "darwin-x64",
      protoc: "osx-x86_64",
      talosctl: "darwin-amd64",
    });
    expect(resolveToolPlatform("linux", "arm64")).toBeUndefined();
    expect(resolveToolPlatform("win32", "x64")).toBeUndefined();
    expect(resolveToolPlatform("freebsd", "x64")).toBeUndefined();
  });

  it("builds the published archive names and URLs", () => {
    const linux = resolveToolPlatform("linux", "x64");
    const mac = resolveToolPlatform("darwin", "arm64");
    if (linux === undefined || mac === undefined) {
      throw new Error("the test expects the recorded Linux and macOS mappings");
    }
    expect(nodeArchiveName("26.12.1", linux)).toBe("node-v26.12.1-linux-x64.tar.xz");
    expect(nodeArchiveName("26.12.1", mac)).toBe("node-v26.12.1-darwin-arm64.tar.gz");
    expect(protocArchiveName("36.2", linux)).toBe("protoc-36.2-linux-x86_64.zip");
    expect(protocArchiveName("36.2", mac)).toBe("protoc-36.2-osx-aarch_64.zip");
    expect(nodeShasumsUrl("26.12.1")).toBe("https://nodejs.org/dist/v26.12.1/SHASUMS256.txt");
    expect(nodeArchiveUrl("26.12.1", "node-v26.12.1-linux-x64.tar.xz")).toBe(
      "https://nodejs.org/dist/v26.12.1/node-v26.12.1-linux-x64.tar.xz",
    );
    expect(protocArchiveUrl("36.2", "protoc-36.2-linux-x86_64.zip")).toBe(
      "https://github.com/protocolbuffers/protobuf/releases/download/v36.2/protoc-36.2-linux-x86_64.zip",
    );
    expect(talosctlUrl("v1.14.2", "talosctl-linux-amd64")).toBe(
      "https://github.com/siderolabs/talos/releases/download/v1.14.2/talosctl-linux-amd64",
    );
    expect(talosctlChecksumsUrl("v1.14.2")).toBe(
      "https://github.com/siderolabs/talos/releases/download/v1.14.2/sha256sum.txt",
    );
  });

  it("parses the recorded tool version output", () => {
    expect(parseGoVersion("go version go1.27.3 linux/amd64")).toBe("1.27.3");
    expect(parseRustcVersion("rustc 1.99.1 (58cf8f9c3 2026-10-13)")).toBe("1.99.1");
    expect(parseNodeVersion("v26.12.1\n")).toBe("26.12.1");
    expect(parsePnpmVersion("12.15.0\n")).toBe("12.15.0");
    expect(parseProtocVersion("libprotoc 36.2\n")).toBe("36.2");
    expect(parseTalosctlVersion("Client:\n\tTag:         v1.14.2\n\tSHA: f513c735\n")).toBe(
      "v1.14.2",
    );
  });

  it("rejects output that does not carry a pinned version", () => {
    expect(parseGoVersion("go version devel go1.28-abc linux/amd64")).toBeUndefined();
    expect(parseGoVersion("")).toBeUndefined();
    expect(parseRustcVersion("cargo 1.99.1")).toBeUndefined();
    expect(parseNodeVersion("26.12.1")).toBeUndefined();
    expect(parsePnpmVersion("v12.15.0")).toBeUndefined();
    expect(parseProtocVersion("protoc 36.2")).toBeUndefined();
  });

  it("parses checksum files and fails closed on any mismatch", () => {
    const digest = "a".repeat(64);
    const other = "b".repeat(64);
    const text = `${digest}  node-v26.12.1-linux-x64.tar.xz\r\n${other}  protoc-36.2-linux-x86_64.zip\n`;
    const sums = parseSha256Sums(text);
    expect(sums.get("node-v26.12.1-linux-x64.tar.xz")).toBe(digest);
    expect(sums.get("protoc-36.2-linux-x86_64.zip")).toBe(other);
    expect(sums.get("missing")).toBeUndefined();
    expect(parseSha256Sums("not a checksum file")).toEqual(new Map());
    expect(verifyDigest(digest, digest, "archive.zip")).toBeUndefined();
    expect(verifyDigest(digest, other, "archive.zip")).toBe(
      `archive.zip has SHA-256 ${other}, expected ${digest}.`,
    );
    expect(verifyVersion("Go", "1.27.3", "1.27.3")).toBeUndefined();
    expect(verifyVersion("Go", "1.27.3", "1.27.2")).toBe("Go is 1.27.2, expected 1.27.3.");
    expect(verifyVersion("Go", "1.27.3", undefined)).toBe(
      "Go is not installed or unrecognized, expected 1.27.3.",
    );
  });
});
