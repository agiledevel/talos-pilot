import { describe, expect, it } from "vitest";

import {
  assertNpmAdvisoryScope,
  assertNoExceptedRuntimeModules,
  decodeNpmCommand,
  NPM_EXCEPTION_INPUTS,
  requireNpmExceptionCurrent,
} from "./npm-advisory";

const current = new Date("2026-10-28T12:00:00Z");
function fixture() {
  const finding = {
    version: "4.3.1",
    paths: [".>@sveltejs/vite-plugin-svelte>deepmerge"],
    dev: true,
    optional: false,
    bundled: false,
  };
  const advisory = {
    github_advisory_id: "GHSA-gcqx-w48m-w2h4",
    module_name: "deepmerge",
    severity: "low",
    vulnerable_versions: ">=4.2.0 <=4.3.1",
    patched_versions: null,
    patched_versions_unpublished: true,
    findings: [finding],
  };
  const counts = { info: 0, low: 1, moderate: 0, high: 0, critical: 0 };
  const report = { advisories: { one: advisory }, metadata: { vulnerabilities: counts } };
  const parent = { name: "talos-pilot", version: "0.1.0", depField: "devDependencies" };
  const plugin = { name: "@sveltejs/vite-plugin-svelte", version: "7.3.1", dependents: [parent] };
  const dependency = { name: "deepmerge", version: "4.3.1", dependents: [plugin] };
  const productionRoot = { name: "talos-pilot", version: "0.1.0", path: "/fixture", private: true };
  return {
    finding,
    advisory,
    counts,
    report,
    parent,
    plugin,
    dependency,
    productionRoot,
    why: [dependency],
    production: [productionRoot],
    hashes: { ...NPM_EXCEPTION_INPUTS },
  };
}
function validate(f = fixture(), now = current) {
  assertNpmAdvisoryScope(f.report, f.why, f.production, f.hashes, now);
}

describe("decision 0021 npm scope", () => {
  it("accepts only the complete reviewed live shape", () => {
    expect(() => validate()).not.toThrow();
  });
  it.each(["2026-11-11T00:00:00Z", "2026-12-01T00:00:00Z", "invalid"])(
    "fails at expiry or invalid clocks: %s",
    (date) => {
      expect(() => validate(fixture(), new Date(date))).toThrow("expired or invalid clock");
    },
  );
  it("permits the last instant before UTC expiry", () => {
    expect(() => requireNpmExceptionCurrent(new Date("2026-11-10T23:59:59.999Z"))).not.toThrow();
  });
  it.each([
    (f: ReturnType<typeof fixture>) => {
      f.advisory.github_advisory_id = "GHSA-other-advisory";
    },
    (f: ReturnType<typeof fixture>) => {
      f.advisory.severity = "high";
    },
    (f: ReturnType<typeof fixture>) => {
      f.advisory.module_name = "another-package";
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.advisory, { patched_versions: ">=4.3.2" });
    },
    (f: ReturnType<typeof fixture>) => {
      f.finding.version = "4.3.0";
    },
    (f: ReturnType<typeof fixture>) => {
      f.finding.paths.push(".>other>deepmerge");
    },
    (f: ReturnType<typeof fixture>) => {
      f.finding.dev = false;
    },
    (f: ReturnType<typeof fixture>) => {
      f.finding.optional = true;
    },
    (f: ReturnType<typeof fixture>) => {
      f.finding.bundled = true;
    },
    (f: ReturnType<typeof fixture>) => {
      f.advisory.findings.push({ ...f.finding });
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.report.advisories, { another: f.advisory });
    },
    (f: ReturnType<typeof fixture>) => {
      delete f.hashes[".npmrc"];
    },
    (f: ReturnType<typeof fixture>) => {
      f.hashes["vite.config.ts"] = "changed";
    },
    (f: ReturnType<typeof fixture>) => {
      f.hashes.extra = "extra";
    },
    (f: ReturnType<typeof fixture>) => {
      f.counts.low = 2;
    },
    (f: ReturnType<typeof fixture>) => {
      f.counts.critical = 1;
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.counts, { unknown: 1 });
    },
    (f: ReturnType<typeof fixture>) => {
      f.plugin.version = "7.3.2";
    },
    (f: ReturnType<typeof fixture>) => {
      f.parent.depField = "dependencies";
    },
    (f: ReturnType<typeof fixture>) => {
      f.dependency.dependents.push({ ...f.plugin });
    },
    (f: ReturnType<typeof fixture>) => {
      f.why.push({ ...f.dependency });
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.productionRoot, { dependencies: { deepmerge: {} } });
    },
    (f: ReturnType<typeof fixture>) => {
      Object.assign(f.report, { error: { code: "registry failed" } });
    },
  ])("rejects changed scope rather than silently reusing approval (%#)", (change) => {
    const f = fixture();
    change(f);
    expect(() => validate(f)).toThrow("exception refused");
  });
  it.each([null, [], { advisories: {}, metadata: {} }, { error: { code: "network" } }])(
    "rejects malformed/missing or disappearing findings (%#)",
    (report) => {
      const f = fixture();
      expect(() => assertNpmAdvisoryScope(report, f.why, f.production, f.hashes, current)).toThrow(
        "exception refused",
      );
    },
  );
});

describe("audit process outcomes and module IDs", () => {
  it("allows exit 1 only for an actual audit report, never other commands", () => {
    expect(decodeNpmCommand("audit", "{}", 1, false, true)).toEqual({});
    expect(() => decodeNpmCommand("why", "{}", 1)).toThrow("command failed");
    expect(() => decodeNpmCommand("audit", "{}", 0, false, true)).toThrow("command failed");
  });
  it.each([2, null])("fails scanner errors even with plausible JSON: %s", (status) => {
    expect(() => decodeNpmCommand("audit", "{}", status, false, true)).toThrow("command failed");
  });
  it("does not hide spawn failures or echo credential-bearing malformed output", () => {
    expect(() => decodeNpmCommand("audit", "{}", 0, true, true)).toThrow("command failed");
    expect(() =>
      decodeNpmCommand("audit", "SYNTHETIC_REGISTRY_CREDENTIAL", 1, false, true),
    ).toThrow(/^npm applicability exception refused: audit returned malformed JSON\.$/u);
  });
  it.each([
    "/repo/node_modules/deepmerge/index.js",
    "\0/repo/node_modules/deepmerge/index.js?commonjs-proxy",
    "C:\\repo\\node_modules\\deepmerge\\dist\\cjs.js",
  ])("rejects actual runtime package ID %s", (id) => {
    expect(() => assertNoExceptedRuntimeModules([id])).toThrow("must not enter renderer or worker");
  });
  it("does not confuse other packages or application filenames", () => {
    expect(() =>
      assertNoExceptedRuntimeModules([
        "/repo/node_modules/deepmerge-ts/index.js",
        "/repo/src/deepmerge.ts",
      ]),
    ).not.toThrow();
  });
});
