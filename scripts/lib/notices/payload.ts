import { readdirSync, statSync } from "node:fs";
import { basename, join } from "node:path";

import { describe, readBoundedFile, sha256Hex } from "./files.ts";
import { MANIFEST_PATH, NOTICES_PATH, assertArtifactPair } from "./render.ts";
import { NOTICE_LIMITS } from "./types.ts";

/** One problem found while inspecting a packaged payload. */
export interface PayloadProblem {
  readonly kind: "missing" | "tampered" | "unexpected" | "malformed";
  readonly path: string;
  readonly detail: string;
}

/** Result of inspecting an installed legal-resource directory. */
export interface PayloadReport {
  readonly problems: readonly PayloadProblem[];
  readonly verified: readonly {
    readonly path: string;
    readonly bytes: number;
    readonly sha256: string;
  }[];
  readonly components: number;
  readonly texts: number;
}

/** Names this application installs into the legal resource directory. */
export const PACKAGED_FILE_NAMES: readonly string[] = [
  basename(NOTICES_PATH),
  basename(MANIFEST_PATH),
];

/**
 * Compares an extracted installed payload with the committed artifacts.
 *
 * The payload is treated as untrusted: it must contain exactly the two expected
 * regular files, each byte-identical to the committed artifact, and its own
 * manifest must agree with its own notices file. Every problem is reported
 * rather than thrown, so a caller sees missing, tampered and unexpected files
 * together; the CLI turns a non-empty list into a nonzero exit.
 *
 * @throws When the payload root itself cannot be listed.
 */
export function inspectPayload(options: {
  readonly payloadRoot: string;
  readonly expected: { readonly notices: string; readonly manifest: string };
  readonly limits?: typeof NOTICE_LIMITS;
}): PayloadReport {
  const limits = options.limits ?? NOTICE_LIMITS;
  const problems: PayloadProblem[] = [];
  let entries: { name: string; isFile: boolean }[];
  try {
    if (!statSync(options.payloadRoot).isDirectory()) {
      throw new Error("payload root is not a directory");
    }
    entries = readdirSync(options.payloadRoot, { withFileTypes: true }).map((entry) => ({
      isFile: entry.isFile(),
      name: entry.name,
    }));
  } catch (error) {
    throw new Error(`Cannot list the payload root ${options.payloadRoot}: ${describe(error)}.`, {
      cause: error,
    });
  }
  const present = new Map(entries.map((entry) => [entry.name, entry]));
  for (const name of PACKAGED_FILE_NAMES) {
    if (!present.has(name)) {
      problems.push({
        detail: "the packaged legal directory does not contain this file",
        kind: "missing",
        path: name,
      });
    }
  }
  for (const entry of entries) {
    if (!PACKAGED_FILE_NAMES.includes(entry.name)) {
      problems.push({
        detail: "the packaged legal directory contains a file the manifest does not describe",
        kind: "unexpected",
        path: entry.name,
      });
    } else if (!entry.isFile) {
      problems.push({
        detail: "the packaged legal entry is not a regular file",
        kind: "malformed",
        path: entry.name,
      });
    }
  }
  const verified: { path: string; bytes: number; sha256: string }[] = [];
  const contents = new Map<string, string>();
  for (const name of PACKAGED_FILE_NAMES) {
    const entry = present.get(name);
    if (entry === undefined || !entry.isFile) {
      continue;
    }
    const path = join(options.payloadRoot, name);
    let bytes: Buffer;
    try {
      bytes = readBoundedFile(path, limits.noticesBytes, `packaged ${name}`);
    } catch (error) {
      problems.push({ detail: describe(error), kind: "malformed", path: name });
      continue;
    }
    const expected =
      name === basename(NOTICES_PATH) ? options.expected.notices : options.expected.manifest;
    const digest = sha256Hex(bytes);
    contents.set(name, bytes.toString("utf8"));
    verified.push({ bytes: bytes.byteLength, path: name, sha256: digest });
    if (digest !== sha256Hex(Buffer.from(expected, "utf8"))) {
      problems.push({
        detail: `packaged ${String(bytes.byteLength)} bytes with sha256 ${digest}, which does not match the committed artifact`,
        kind: "tampered",
        path: name,
      });
    }
  }
  let components = 0;
  let texts = 0;
  const noticesBody = contents.get(basename(NOTICES_PATH));
  const manifestBody = contents.get(basename(MANIFEST_PATH));
  if (noticesBody !== undefined && manifestBody !== undefined) {
    try {
      const manifest = assertArtifactPair(noticesBody, manifestBody);
      components = manifest.components.length;
      texts = manifest.components.reduce((total, component) => total + component.texts.length, 0);
    } catch (error) {
      problems.push({ detail: describe(error), kind: "malformed", path: basename(MANIFEST_PATH) });
    }
  }
  return { components, problems, texts, verified };
}
