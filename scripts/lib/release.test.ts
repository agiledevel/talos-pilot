import { describe, expect, it } from "vitest";
import {
  releaseModeFrom,
  requiredAssetExtensions,
  validatePackageVersions,
  validateQualificationRevision,
  validateReleaseVersions,
  validateSourceRevision,
  versionFromTag,
} from "./release";

describe("release source validation", () => {
  const cargo = { packages: [{ name: "talos-pilot", version: "0.1.0" }] };
  it("rejects mismatched app versions and missing Cargo packages", () => {
    expect(
      validateReleaseVersions("v0.1.0", { version: "0.1.0" }, { version: "0.1.0" }, cargo),
    ).toBe("0.1.0");
    expect(() =>
      validateReleaseVersions("v0.1.0", { version: "0.2.0" }, { version: "0.1.0" }, cargo),
    ).toThrow("must match");
    expect(() =>
      validateReleaseVersions(
        "v0.1.0",
        { version: "0.1.0" },
        { version: "0.1.0" },
        { packages: [] },
      ),
    ).toThrow("resolved");
  });
  it("rejects shell/ref syntax and versions with leading zeros", () => {
    for (const tag of [
      "v1.2.3; echo unsafe",
      "--help",
      "main",
      "v01.2.3",
      "v1.2",
      "v1.2.3/other",
    ]) {
      expect(() => versionFromTag(tag)).toThrow("Release tags");
    }
    expect(versionFromTag("v1.2.3-rc.1")).toBe("1.2.3-rc.1");
  });
  it("does not allow undeclared platform targets to silently build partial packages", () => {
    expect(requiredAssetExtensions("x86_64-unknown-linux-gnu")).toContain(".AppImage");
    expect(() => requiredAssetExtensions("aarch64-unknown-linux-gnu")).toThrow("Unsupported");
  });
});

describe("tag-free qualification validation", () => {
  const revision = "0123456789abcdef0123456789abcdef01234567";
  const cargo = { packages: [{ name: "talos-pilot", version: "0.1.0" }] };

  it("accepts matching package versions without a tag", () => {
    expect(validatePackageVersions({ version: "0.1.0" }, { version: "0.1.0" }, cargo)).toBe(
      "0.1.0",
    );
  });

  it("rejects npm/Tauri/Cargo version disagreement", () => {
    expect(() =>
      validatePackageVersions({ version: "0.1.0" }, { version: "0.2.0" }, cargo),
    ).toThrow("npm and Tauri");
    expect(() =>
      validatePackageVersions({ version: "0.2.0" }, { version: "0.2.0" }, cargo),
    ).toThrow("Cargo package version");
    expect(() =>
      validatePackageVersions({ version: "01.0.0" }, { version: "01.0.0" }, cargo),
    ).toThrow("MAJOR.MINOR.PATCH");
  });

  it("accepts only a full immutable commit SHA", () => {
    expect(validateSourceRevision(revision)).toBe(revision);
    for (const value of [
      undefined,
      "",
      "0123456",
      `${revision} `,
      `${revision}^`,
      revision.toUpperCase(),
      "refs/heads/main",
    ]) {
      expect(() => validateSourceRevision(value)).toThrow("40-character commit SHA");
    }
  });

  it("requires the requested revision to be checked out and reachable from a branch", () => {
    expect(
      validateQualificationRevision({
        requested: revision,
        resolved: revision,
        head: revision,
        containingRefs: ["refs/remotes/origin/qualification"],
      }),
    ).toBe(revision);
    expect(() =>
      validateQualificationRevision({
        requested: revision,
        resolved: revision,
        head: "fedcba9876543210fedcba9876543210fedcba98",
        containingRefs: ["refs/remotes/origin/qualification"],
      }),
    ).toThrow("checked-out source");
    expect(() =>
      validateQualificationRevision({
        requested: revision,
        resolved: revision,
        head: revision,
        containingRefs: [],
      }),
    ).toThrow("not reachable from a branch");
    expect(() =>
      validateQualificationRevision({
        requested: revision,
        resolved: "fedcba9876543210fedcba9876543210fedcba98",
        head: revision,
        containingRefs: ["refs/remotes/origin/qualification"],
      }),
    ).toThrow("did not resolve to itself");
  });

  it("accepts only the two declared artifact modes", () => {
    expect(releaseModeFrom("release")).toBe("release");
    expect(releaseModeFrom("qualification")).toBe("qualification");
    for (const value of [undefined, "", "Release", "publish"]) {
      expect(() => releaseModeFrom(value)).toThrow("RELEASE_MODE");
    }
  });
});
