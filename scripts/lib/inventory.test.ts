import { describe, expect, it } from "vitest";
import {
  classifyGoLicense,
  parseCargoPackages,
  parseGoModules,
  parseNpmLicenses,
  renderInventory,
  splitJsonObjects,
  type DependencyInventory,
} from "./inventory";

const apache = "Apache License\nVersion 2.0, January 2004";
const mit = "Permission is hereby granted, free of charge, to any person";
const bsd3 =
  "Redistributions in binary form must reproduce the above copyright\nNeither the name of the holder";
const bsd2 = "Redistributions in binary form must reproduce the above copyright notice";

describe("dependency inventory generation", () => {
  it("names a license only when one marker set matches", () => {
    expect(classifyGoLicense([apache])).toBe("Apache-2.0");
    expect(classifyGoLicense([mit])).toBe("MIT");
    expect(classifyGoLicense([bsd3])).toBe("BSD-3-Clause");
    expect(classifyGoLicense([bsd2])).toBe("BSD-2-Clause");
    expect(classifyGoLicense([])).toBe("unknown");
    expect(classifyGoLicense(["see the attached terms"])).toBe("unknown");
    // Ambiguity is reported as unknown instead of guessing an SPDX identifier.
    expect(classifyGoLicense([mit, apache])).toBe("unknown");
  });

  it("splits concatenated JSON objects including braces inside strings", () => {
    const stream = `{\n\t"Path": "a",\n\t"Note": "brace } inside"\n}{ "Path": "b" }`;
    expect(splitJsonObjects(stream)).toEqual([
      `{\n\t"Path": "a",\n\t"Note": "brace } inside"\n}`,
      '{ "Path": "b" }',
    ]);
    expect(() => splitJsonObjects('{ "Path": "unterminated"')).toThrow("unterminated");
  });

  it("orders npm entries and keeps the license section as a fallback", () => {
    const parsed = parseNpmLicenses(
      {
        MIT: [
          { name: "z", versions: ["2.0.0", "1.0.0"], paths: ["/pkg/z"] },
          { name: "a", versions: ["1.0.0"], paths: ["/pkg/a"] },
        ],
        "MPL-2.0": [{ name: "m", versions: ["1.0.0"], paths: ["/pkg/m"], license: "MPL-2.0" }],
      },
      (directory) => directory === "/pkg/a",
    );
    expect(parsed.map((entry) => entry.name)).toEqual(["a", "m", "z"]);
    expect(parsed[0]?.license).toBe("MIT");
    expect(parsed[0]?.hasNotice).toBe(true);
    expect(parsed[1]?.license).toBe("MPL-2.0");
    expect(parsed[2]?.versions).toEqual(["1.0.0", "2.0.0"]);
  });

  it("rejects malformed npm and cargo scanner output", () => {
    expect(() => parseNpmLicenses(null, () => false)).toThrow("must be an object");
    expect(() => parseNpmLicenses({ MIT: "not-a-list" }, () => false)).toThrow("must be a list");
    expect(() => parseNpmLicenses({ MIT: [{ version: 1 }] }, () => false)).toThrow(
      "missing a name",
    );
    expect(() => parseCargoPackages({ packages: {} }, () => false)).toThrow("packages array");
    expect(() => parseCargoPackages({ packages: [{ name: "x" }] }, () => false)).toThrow(
      "identity fields",
    );
  });

  it("records cargo registry packages with their license expression only", () => {
    const parsed = parseCargoPackages(
      {
        packages: [
          {
            name: "workspace-member",
            version: "0.1.0",
            source: null,
            license: "MIT",
            manifest_path: "/repo/src-tauri/Cargo.toml",
          },
          {
            name: "serde",
            version: "1.0.0",
            source: "registry+https://github.com/rust-lang/crates.io-index",
            license: "MIT OR Apache-2.0",
            manifest_path: "/cargo/registry/serde-1.0.0/Cargo.toml",
          },
          {
            name: "no-license",
            version: "2.0.0",
            source: "registry+https://github.com/rust-lang/crates.io-index",
            manifest_path: "/cargo/registry/no-license-2.0.0/Cargo.toml",
          },
        ],
      },
      (directory) => directory.includes("serde-1.0.0"),
    );
    expect(parsed.map((entry) => entry.name)).toEqual(["no-license", "serde"]);
    expect(parsed[1]).toEqual({
      name: "serde",
      version: "1.0.0",
      license: "MIT OR Apache-2.0",
      hasNotice: true,
    });
    expect(parsed[0]?.license).toBe("unknown");
  });

  it("drops the main Go module and sorts the rest by path", () => {
    const parsed = parseGoModules(
      [
        { Path: "github.com/talos-pilot/helper", Main: true, Dir: "/repo/helper" },
        { Path: "z.org/z", Version: "v1.2.3", Dir: "/cache/z", Indirect: true },
        { Path: "a.org/a", Version: "v0.1.0", Dir: "/cache/a" },
      ],
      new Set(["a.org/a"]),
      ({ dir }) =>
        dir === "/cache/a"
          ? { files: ["LICENSE"], texts: [mit], notice: false, observed: true }
          : { files: [], texts: [], notice: false, observed: false },
    );
    expect(parsed.map((entry) => entry.path)).toEqual(["a.org/a", "z.org/z"]);
    expect(parsed[0]).toEqual({
      path: "a.org/a",
      version: "v0.1.0",
      indirect: false,
      linked: true,
      license: "MIT",
      licenseFiles: ["LICENSE"],
      hasNotice: false,
    });
    // A graph module with no extracted source is reported as unobserved rather
    // than guessed.
    expect(parsed[1]?.license).toBe("unobserved");
    expect(parsed[1]?.linked).toBe(false);
    expect(parsed[1]?.indirect).toBe(true);
  });

  it("serializes a stable inventory document", () => {
    const inventory: DependencyInventory = {
      schemaVersion: 2,
      generatedFrom: "test",
      sources: {
        node: "26.11.1",
        pnpm: "12.10.1",
        rustc: "1.99.0",
        go: "1.27.1",
        lockfiles: { pnpmLock: "a", cargoLock: "b", goSum: "c" },
      },
      npm: [],
      cargo: [],
      go: [],
    };
    const rendered = renderInventory(inventory);
    expect(rendered.endsWith("\n")).toBe(true);
    expect(rendered).toBe(renderInventory(inventory));
    expect(rendered).toContain('"schemaVersion": 2');
  });
});
