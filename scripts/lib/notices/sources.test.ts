import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { loadNoticeRegistry, readCuratedText } from "./sources";

const temporaryRoots: string[] = [];

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

/** Writes a curated-source tree and returns its root. */
function fixture(registry: unknown, files: Readonly<Record<string, string>> = {}): string {
  const root = mkdtempSync(join(tmpdir(), "talos-pilot-notices-sources-"));
  temporaryRoots.push(root);
  const directory = join(root, "legal", "sources");
  mkdirSync(directory, { recursive: true });
  for (const [path, body] of Object.entries(files)) {
    const absolute = join(directory, path);
    mkdirSync(dirname(absolute), { recursive: true });
    writeFileSync(absolute, body, "utf8");
  }
  writeFileSync(join(directory, "registry.json"), JSON.stringify(registry), "utf8");
  return root;
}

function validRegistry(body: string): unknown {
  return {
    overrides: [
      {
        ecosystem: "cargo",
        name: "dep",
        reason: "the published crate ships no licence file",
        selectedLicense: "MIT",
        texts: [{ path: "canonical/MIT.txt", source: "https://example.invalid/mit" }],
        version: "1.0.0",
      },
    ],
    schemaVersion: 1,
    texts: [
      {
        kind: "canonical",
        path: "canonical/MIT.txt",
        sha256: sha256(body),
        source: "https://example.invalid/mit",
      },
    ],
  };
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("curated notice registry", () => {
  const body = "MIT License\n";

  it("loads a valid registry and reads a digest-checked text", () => {
    const root = fixture(validRegistry(body), { "canonical/MIT.txt": body });
    const registry = loadNoticeRegistry(root);
    expect(registry.overrides.size).toBe(1);
    const text = readCuratedText(
      registry,
      "canonical/MIT.txt",
      "curated:canonical/MIT.txt",
      "canonical",
      undefined,
    );
    expect(text.body).toBe(body);
    expect(text.sha256).toBe(sha256(body));
    expect(text.origin).toBe("canonical");
  });

  it("fails when a curated text drifts from its recorded digest", () => {
    const root = fixture(validRegistry(body), { "canonical/MIT.txt": `${body}changed` });
    const registry = loadNoticeRegistry(root);
    expect(() =>
      readCuratedText(
        registry,
        "canonical/MIT.txt",
        "curated:canonical/MIT.txt",
        "canonical",
        undefined,
      ),
    ).toThrow("but the registry records");
  });

  it("rejects an unreferenced curated text", () => {
    const registry = validRegistry(body) as { texts: unknown[] };
    registry.texts.push({
      kind: "upstream",
      path: "upstream/unused.txt",
      sha256: sha256("unused"),
      source: "https://example.invalid/unused",
    });
    const root = fixture(registry, { "canonical/MIT.txt": body, "upstream/unused.txt": "unused" });
    expect(() => loadNoticeRegistry(root)).toThrow("not referenced");
  });

  it("rejects traversal, absolute paths and undeclared override texts", () => {
    const traversal = validRegistry(body) as { texts: { path: string }[] };
    traversal.texts[0] = { ...traversal.texts[0], path: "../escape.txt" } as { path: string };
    expect(() => loadNoticeRegistry(fixture(traversal, { "canonical/MIT.txt": body }))).toThrow(
      "without traversal",
    );

    const absolute = validRegistry(body) as { texts: { path: string }[] };
    absolute.texts[0] = { ...absolute.texts[0], path: "/etc/passwd" } as { path: string };
    expect(() => loadNoticeRegistry(fixture(absolute, { "canonical/MIT.txt": body }))).toThrow(
      "without traversal",
    );

    const undeclared = validRegistry(body) as {
      overrides: { texts: { path: string; source: string }[] }[];
    };
    const first = undeclared.overrides[0];
    if (first === undefined) {
      throw new Error("fixture is missing its override");
    }
    first.texts = [{ path: "canonical/OTHER.txt", source: "https://example.invalid/other" }];
    expect(() => loadNoticeRegistry(fixture(undeclared, { "canonical/MIT.txt": body }))).toThrow(
      "is not declared in registry.texts",
    );
  });

  it("rejects duplicate identities, insecure sources and a wrong schema version", () => {
    const duplicated = validRegistry(body) as { overrides: unknown[] };
    duplicated.overrides.push(duplicated.overrides[0]);
    expect(() => loadNoticeRegistry(fixture(duplicated, { "canonical/MIT.txt": body }))).toThrow(
      "duplicates",
    );

    const insecure = validRegistry(body) as {
      texts: { path: string; sha256: string; source: string }[];
    };
    const firstText = insecure.texts[0];
    if (firstText === undefined) {
      throw new Error("fixture is missing its text");
    }
    firstText.source = "http://example.invalid/mit";
    expect(() => loadNoticeRegistry(fixture(insecure, { "canonical/MIT.txt": body }))).toThrow(
      "must be an https URL",
    );

    const wrongVersion = validRegistry(body) as { schemaVersion: number };
    wrongVersion.schemaVersion = 2;
    expect(() => loadNoticeRegistry(fixture(wrongVersion, { "canonical/MIT.txt": body }))).toThrow(
      "schemaVersion 1",
    );
  });

  it("reports a missing registry instead of treating it as empty", () => {
    const root = mkdtempSync(join(tmpdir(), "talos-pilot-notices-sources-"));
    temporaryRoots.push(root);
    expect(() => loadNoticeRegistry(root)).toThrow("Missing curated notice registry");
  });
});
