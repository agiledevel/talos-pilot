import { describe, expect, it } from "vitest";

import {
  parseChecksums,
  parseProvenance,
  renderChecksums,
  requireInstallerFormats,
  validateProvenanceFor,
  type ArtifactInstaller,
  type ArtifactProvenance,
} from "./artifacts";

const revision = "0123456789abcdef0123456789abcdef01234567";
const digest = (character: string): string => character.repeat(64);

function document(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    mode: "qualification",
    source: {
      repository: "agiledevel/talos-pilot",
      revision,
      version: "0.1.0",
      ref: "refs/heads/main",
      event: "workflow_dispatch",
    },
    workflow: {
      name: "Package qualification",
      path: "agiledevel/talos-pilot/.github/workflows/qualification.yml@refs/heads/main",
      runId: "1",
      runAttempt: "1",
      serverUrl: "https://github.com",
    },
    target: "x86_64-unknown-linux-gnu",
    build: {
      buildIdentity: revision,
      releaseConfig: ".github/tauri.release.conf.json",
      releaseConfigSha256: digest("a"),
      tauriConfigSha256: digest("b"),
      applicationSha256: digest("c"),
      helperSha256: digest("d"),
    },
    installers: [
      {
        file: "x86_64-unknown-linux-gnu-Talos Pilot_0.1.0_amd64.deb",
        sha256: digest("e"),
        bytes: 42,
      },
    ],
  };
}

describe("artifact provenance", () => {
  it("accepts a complete qualification document", () => {
    const parsed = parseProvenance(document());
    expect(parsed.mode).toBe("qualification");
    expect(parsed.installers).toHaveLength(1);
    validateProvenanceFor(parsed, {
      mode: "qualification",
      revision,
      version: "0.1.0",
      target: "x86_64-unknown-linux-gnu",
    });
  });

  it("rejects a version, revision or target that is not the expected one", () => {
    const parsed = parseProvenance(document());
    expect(() =>
      validateProvenanceFor(parsed, {
        mode: "qualification",
        revision,
        version: "0.2.0",
        target: "x86_64-unknown-linux-gnu",
      }),
    ).toThrow("version");
    expect(() =>
      validateProvenanceFor(parsed, {
        mode: "qualification",
        revision: "fedcba9876543210fedcba9876543210fedcba98",
        version: "0.1.0",
        target: "x86_64-unknown-linux-gnu",
      }),
    ).toThrow("revision");
    expect(() =>
      validateProvenanceFor(parsed, {
        mode: "qualification",
        revision,
        version: "0.1.0",
        target: "aarch64-apple-darwin",
      }),
    ).toThrow("target");
    expect(() =>
      validateProvenanceFor(parsed, {
        mode: "release",
        revision,
        version: "0.1.0",
        target: "x86_64-unknown-linux-gnu",
      }),
    ).toThrow("mode");
  });

  it("rejects a build identity that is not the source revision", () => {
    const changed = document();
    const build = changed.build as Record<string, unknown>;
    build.buildIdentity = "fedcba9876543210fedcba9876543210fedcba98";
    expect(() => parseProvenance(changed)).toThrow("must be the source revision");
  });

  it("rejects unknown fields, path escapes and malformed digests", () => {
    const extra = document();
    extra.extra = true;
    expect(() => parseProvenance(extra)).toThrow("must contain exactly");

    const escaped = document();
    const source = escaped.source as Record<string, unknown>;
    source.revision = "../../etc/passwd";
    expect(() => parseProvenance(escaped)).toThrow("full commit SHA");

    const config = document();
    const build = config.build as Record<string, unknown>;
    build.releaseConfig = "../outside.json";
    expect(() => parseProvenance(config)).toThrow("repository-relative path");

    const badDigest = document();
    const badBuild = badDigest.build as Record<string, unknown>;
    badBuild.helperSha256 = "not-a-digest";
    expect(() => parseProvenance(badDigest)).toThrow("SHA-256");

    const noInstallers = document();
    noInstallers.installers = [];
    expect(() => parseProvenance(noInstallers)).toThrow("at least one installer");

    const pathInstaller = document();
    pathInstaller.installers = [{ file: "../../escape.deb", sha256: digest("e"), bytes: 1 }];
    expect(() => parseProvenance(pathInstaller)).toThrow("plain file name");
  });

  it("rejects duplicate installers in one provenance document", () => {
    const duplicate = document();
    const installers = duplicate.installers as unknown[];
    installers.push({ file: "a.deb", sha256: digest("e"), bytes: 1 });
    installers.push({ file: "a.deb", sha256: digest("f"), bytes: 1 });
    expect(() => parseProvenance(duplicate)).toThrow("repeats a.deb");
  });
});

describe("checksum files", () => {
  it("round-trips installers and keeps their target-prefixed names", () => {
    const provenance: ArtifactProvenance = parseProvenance(document());
    const text = renderChecksums(provenance.installers);
    expect(parseChecksums(text, "sums")).toEqual([
      { file: "x86_64-unknown-linux-gnu-Talos Pilot_0.1.0_amd64.deb", sha256: digest("e") },
    ]);
  });

  it("rejects malformed, duplicate and empty checksum files", () => {
    expect(() => parseChecksums("", "sums")).toThrow("empty");
    expect(() => parseChecksums("not a checksum\n", "sums")).toThrow("malformed");
    expect(() => parseChecksums(`${digest("a")} *file.deb\n`, "sums")).toThrow("malformed");
    expect(() =>
      parseChecksums(`${digest("a")}  file.deb\n${digest("b")}  file.deb\n`, "sums"),
    ).toThrow("repeats file.deb");
    expect(() => parseChecksums(`${digest("a")}  ../file.deb\n`, "sums")).toThrow("malformed");
  });
});

describe("required installer formats", () => {
  const installer = (file: string): ArtifactInstaller => ({
    file,
    sha256: digest("a"),
    bytes: 1,
  });

  it("accepts one installer per declared Linux format", () => {
    expect(() =>
      requireInstallerFormats("x86_64-unknown-linux-gnu", [
        installer("x86_64-unknown-linux-gnu-Talos Pilot_0.1.0_amd64.deb"),
        installer("x86_64-unknown-linux-gnu-Talos Pilot-0.1.0-1.x86_64.rpm"),
        installer("x86_64-unknown-linux-gnu-Talos Pilot_0.1.0_amd64.AppImage"),
      ]),
    ).not.toThrow();
    expect(() =>
      requireInstallerFormats("aarch64-apple-darwin", [
        installer("aarch64-apple-darwin-Talos Pilot_0.1.0_aarch64.dmg"),
      ]),
    ).not.toThrow();
    expect(() =>
      requireInstallerFormats("x86_64-pc-windows-msvc", [
        installer("x86_64-pc-windows-msvc-Talos Pilot_0.1.0_x64-setup.exe"),
      ]),
    ).not.toThrow();
  });

  it("rejects an incomplete or duplicated format set", () => {
    expect(() =>
      requireInstallerFormats("x86_64-unknown-linux-gnu", [
        installer("x86_64-unknown-linux-gnu-Talos Pilot_0.1.0_amd64.deb"),
      ]),
    ).toThrow("exactly one .rpm installer; found 0");
    expect(() =>
      requireInstallerFormats("x86_64-unknown-linux-gnu", [
        installer("x86_64-unknown-linux-gnu-first.deb"),
        installer("x86_64-unknown-linux-gnu-second.deb"),
        installer("x86_64-unknown-linux-gnu-package.rpm"),
        installer("x86_64-unknown-linux-gnu-package.AppImage"),
      ]),
    ).toThrow("exactly one .deb installer; found 2");
    expect(() => requireInstallerFormats("aarch64-apple-darwin", [])).toThrow("exactly one .dmg");
  });

  it("rejects names for another target or an undeclared format", () => {
    expect(() =>
      requireInstallerFormats("x86_64-unknown-linux-gnu", [
        installer("x86_64-pc-windows-msvc-Talos Pilot_0.1.0_x64-setup.exe"),
      ]),
    ).toThrow("lists x86_64-pc-windows-msvc-");
    expect(() =>
      requireInstallerFormats("x86_64-unknown-linux-gnu", [
        installer("x86_64-unknown-linux-gnu-package.deb"),
        installer("x86_64-unknown-linux-gnu-package.rpm"),
        installer("x86_64-unknown-linux-gnu-package.AppImage"),
        installer("x86_64-unknown-linux-gnu-package.dmg"),
      ]),
    ).toThrow("not a declared installer format");
    expect(() =>
      requireInstallerFormats("aarch64-apple-darwin", [
        installer("aarch64-apple-darwin-package.deb"),
      ]),
    ).toThrow("not a declared installer format");
  });

  it("rejects a bare target prefix with no package name", () => {
    expect(() =>
      requireInstallerFormats("aarch64-apple-darwin", [installer("aarch64-apple-darwin-.dmg")]),
    ).not.toThrow();
    expect(() =>
      requireInstallerFormats("aarch64-apple-darwin", [
        { file: "aarch64-apple-darwin-", sha256: digest("a"), bytes: 1 },
      ]),
    ).toThrow("for another target");
  });
});
