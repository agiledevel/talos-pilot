import { describe, expect, it } from "vitest";

import { isLicenceFileName, compareCodeUnits } from "./files";
import { selectLicense } from "./collect";
import {
  MANIFEST_PATH,
  NOTICES_PATH,
  assertArtifactPair,
  compareArtifacts,
  renderNotices,
} from "./render";
import { NOTICE_LIMITS, type CollectedNotices, type NoticeComponent } from "./types";

const sha = "a".repeat(64);

function component(overrides: Partial<NoticeComponent> = {}): NoticeComponent {
  return {
    declaredLicense: "MIT",
    ecosystem: "npm",
    name: "example",
    notes: [],
    selectedLicense: "MIT",
    source: "https://registry.npmjs.org/example/1.0.0",
    targets: [],
    texts: [
      {
        body: "MIT text\n",
        bytes: 9,
        origin: "upstream",
        path: "/cache/example/LICENSE",
        provenance: "npm:example@1.0.0/LICENSE",
        sha256: sha,
      },
    ],
    version: "1.0.0",
    ...overrides,
  };
}

function graph(components: readonly NoticeComponent[]): CollectedNotices {
  return {
    components,
    inputs: {
      cargoLockSha256: sha,
      goSumSha256: sha,
      pnpmLockSha256: sha,
      registrySha256: sha,
    },
  };
}

describe("licence file detection", () => {
  it("accepts licence and notice shapes and rejects source files", () => {
    for (const name of [
      "LICENSE",
      "LICENCE",
      "LICENSE-MIT",
      "LICENSE.md",
      "license.txt",
      "COPYING",
      "COPYRIGHT",
      "CopyrightNotice.txt",
      "NOTICE",
      "UNLICENSE",
      "ThirdPartyNotices.txt",
      "LICENSE.spdx",
    ]) {
      expect(isLicenceFileName(name), `${name} should be a licence file`).toBe(true);
    }
    for (const name of [
      "copying.rs",
      "license.go",
      "COPYING.ts",
      "README.md",
      "LICENSE_helpers.py",
    ]) {
      expect(isLicenceFileName(name), `${name} should not be a licence file`).toBe(false);
    }
  });

  it("orders strings by code unit rather than host locale", () => {
    expect(["b", "A", "a", "B"].sort(compareCodeUnits)).toEqual(["A", "B", "a", "b"]);
  });
});

describe("licence alternative selection", () => {
  it("keeps AND obligations and picks the first OR alternative", () => {
    expect(selectLicense("MIT")).toBe("MIT");
    expect(selectLicense("(MPL-2.0 OR Apache-2.0)")).toBe("MPL-2.0");
    expect(selectLicense("Apache-2.0 OR MIT")).toBe("Apache-2.0");
    expect(selectLicense("(MIT OR Apache-2.0) AND Unicode-3.0")).toBe(
      "(MIT OR Apache-2.0) AND Unicode-3.0",
    );
    expect(selectLicense("MIT/Apache-2.0")).toBe("MIT");
    expect(selectLicense("   ")).toBe("unknown");
  });
});

describe("notice rendering", () => {
  it("is deterministic and records only relative provenance", () => {
    const collected = graph([
      component({ ecosystem: "go", name: "z.example/mod", version: "2.0.0" }),
      component(),
      component({ name: "aaa", version: "0.1.0" }),
    ]);
    const first = renderNotices(collected);
    const second = renderNotices(graph([...collected.components].reverse()));
    expect(first.notices).toBe(second.notices);
    expect(first.manifestJson).toBe(second.manifestJson);
    expect(first.notices).not.toContain("/cache/");
    expect(first.notices).toContain("npm:example@1.0.0/LICENSE");
    // Ecosystem order is fixed, then name and version.
    const indexOf = (needle: string): number => first.notices.indexOf(needle);
    expect(indexOf("[npm] aaa 0.1.0")).toBeLessThan(indexOf("[npm] example 1.0.0"));
    expect(indexOf("[npm] example 1.0.0")).toBeLessThan(indexOf("[go] z.example/mod 2.0.0"));
    expect(first.manifest.notices.path).toBe(NOTICES_PATH);
    expect(first.manifest.notices.sha256).toHaveLength(64);
    expect(first.manifestJson.endsWith("\n")).toBe(true);
  });

  it("reproduces text verbatim and separates blocks", () => {
    const body = "line one\r\nline two without trailing newline";
    const rendered = renderNotices(
      graph([
        component({
          texts: [
            {
              body,
              bytes: Buffer.byteLength(body),
              origin: "upstream",
              path: "/cache/example/LICENSE",
              provenance: "npm:example@1.0.0/LICENSE",
              sha256: sha,
            },
          ],
        }),
      ]),
    );
    expect(rendered.notices).toContain(`${body}\n\n`);
  });

  it("refuses output above the notices byte limit", () => {
    const collected = graph([component()]);
    expect(() => renderNotices(collected, { ...NOTICE_LIMITS, noticesBytes: 10 })).toThrow(
      "above the",
    );
  });

  it("reports missing and stale artifacts separately", () => {
    const rendered = renderNotices(graph([component()]));
    expect(compareArtifacts(rendered, { manifest: undefined, notices: undefined })).toEqual([
      { detail: "the committed notices file is missing", kind: "missing", path: NOTICES_PATH },
      { detail: "the committed manifest is missing", kind: "missing", path: MANIFEST_PATH },
    ]);
    expect(
      compareArtifacts(rendered, { manifest: rendered.manifestJson, notices: rendered.notices }),
    ).toEqual([]);
    const stale = compareArtifacts(rendered, {
      manifest: rendered.manifestJson,
      notices: `${rendered.notices}extra`,
    });
    expect(stale).toHaveLength(1);
    expect(stale[0]?.kind).toBe("stale");
    expect(stale[0]?.path).toBe(NOTICES_PATH);
  });

  it("detects a hand-edited notices file and a malformed manifest", () => {
    const rendered = renderNotices(graph([component()]));
    expect(() => assertArtifactPair(`${rendered.notices}edited`, rendered.manifestJson)).toThrow(
      "does not match the manifest",
    );
    expect(() => assertArtifactPair(rendered.notices, "not json")).toThrow("not valid JSON");
    expect(() => assertArtifactPair(rendered.notices, '{"schemaVersion":2}')).toThrow(
      "schemaVersion",
    );
    const forged = JSON.parse(rendered.manifestJson) as Record<string, unknown>;
    forged.components = [
      { name: "x", texts: [{ provenance: "../escape", sha256: sha }], version: "1" },
    ];
    expect(() => assertArtifactPair(rendered.notices, `${JSON.stringify(forged)}\n`)).toThrow(
      "unsafe text provenance",
    );
  });
});
