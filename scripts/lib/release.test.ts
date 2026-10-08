import { describe, expect, it } from "vitest";
import { requiredAssetExtensions, validateReleaseVersions, versionFromTag } from "./release";

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
