import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { PACKAGED_FILE_NAMES, inspectPayload } from "./payload";
import { MANIFEST_PATH, NOTICES_PATH, renderNotices } from "./render";
import type { CollectedNotices } from "./types";

const digest = "b".repeat(64);

const collected: CollectedNotices = {
  components: [
    {
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
          sha256: digest,
        },
      ],
      version: "1.0.0",
    },
  ],
  inputs: {
    cargoLockSha256: digest,
    goSumSha256: digest,
    pnpmLockSha256: digest,
    registrySha256: digest,
  },
};

const rendered = renderNotices(collected);
const temporaryRoots: string[] = [];

function payload(files: Readonly<Record<string, string | undefined>>): string {
  const root = mkdtempSync(join(tmpdir(), "talos-pilot-notices-payload-"));
  temporaryRoots.push(root);
  mkdirSync(root, { recursive: true });
  for (const [name, body] of Object.entries(files)) {
    if (body !== undefined) {
      writeFileSync(join(root, name), body, "utf8");
    }
  }
  return root;
}

const expected = { manifest: rendered.manifestJson, notices: rendered.notices };

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("packaged legal payload inspection", () => {
  it("accepts a payload that matches the committed artifacts byte for byte", () => {
    const root = payload({
      [PACKAGED_FILE_NAMES[0] ?? ""]: rendered.notices,
      [PACKAGED_FILE_NAMES[1] ?? ""]: rendered.manifestJson,
    });
    const report = inspectPayload({ expected, payloadRoot: root });
    expect(report.problems).toEqual([]);
    expect(report.components).toBe(1);
    expect(report.texts).toBe(1);
    expect(report.verified.map((entry) => entry.path)).toEqual(PACKAGED_FILE_NAMES);
  });

  it("reports a missing packaged file", () => {
    const root = payload({ [PACKAGED_FILE_NAMES[0] ?? ""]: rendered.notices });
    const report = inspectPayload({ expected, payloadRoot: root });
    expect(report.problems).toEqual([
      {
        detail: "the packaged legal directory does not contain this file",
        kind: "missing",
        path: PACKAGED_FILE_NAMES[1],
      },
    ]);
  });

  it("reports a tampered packaged file", () => {
    const root = payload({
      [PACKAGED_FILE_NAMES[0] ?? ""]: `${rendered.notices}\ntampered`,
      [PACKAGED_FILE_NAMES[1] ?? ""]: rendered.manifestJson,
    });
    const report = inspectPayload({ expected, payloadRoot: root });
    expect(report.problems.map((problem) => problem.kind)).toContain("tampered");
  });

  it("reports an unexpected packaged file and a malformed pair", () => {
    const root = payload({
      [PACKAGED_FILE_NAMES[0] ?? ""]: rendered.notices,
      [PACKAGED_FILE_NAMES[1] ?? ""]: "{}",
      LICENSE: "extra",
    });
    const report = inspectPayload({ expected, payloadRoot: root });
    const kinds = report.problems.map((problem) => `${problem.path}:${problem.kind}`);
    expect(kinds).toContain("LICENSE:unexpected");
    expect(kinds).toContain(`${PACKAGED_FILE_NAMES[1] ?? ""}:malformed`);
    expect(kinds).toContain(`${PACKAGED_FILE_NAMES[1] ?? ""}:tampered`);
    expect(MANIFEST_PATH.endsWith(PACKAGED_FILE_NAMES[1] ?? "")).toBe(true);
    expect(NOTICES_PATH.endsWith(PACKAGED_FILE_NAMES[0] ?? "")).toBe(true);
  });

  it("fails when the payload root is not a directory", () => {
    expect(() => inspectPayload({ expected, payloadRoot: "/definitely/not/a/directory" })).toThrow(
      "Cannot list the payload root",
    );
  });
});
