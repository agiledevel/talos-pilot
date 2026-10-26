import { existsSync } from "node:fs";
import { join, resolve } from "node:path";

import { compareCodeUnits, describe, readBoundedFile, sha256Hex } from "./files.ts";
import { NOTICE_LIMITS, type NoticeEcosystem, type NoticeText, type TextOrigin } from "./types.ts";
import { isRecord } from "../validation.ts";

/** One committed text file under `legal/sources/`. */
export interface CuratedText {
  /** Path relative to `legal/sources/`. */
  readonly path: string;
  readonly kind: "upstream" | "canonical" | "vendored-extract";
  /** Immutable upstream location of the bytes. */
  readonly source: string;
  readonly sha256: string;
}

/** A curated text plus the reason and provenance recorded for one component. */
export interface OverrideText {
  readonly path: string;
  readonly source: string;
}

/** A reviewed replacement for a package that publishes no licence text. */
export interface NoticeOverride {
  readonly ecosystem: NoticeEcosystem;
  readonly name: string;
  readonly version: string;
  readonly selectedLicense: string;
  readonly texts: readonly OverrideText[];
  readonly reason: string;
  readonly note?: string;
}

/** A licence-relevant file inside a redistributed package that the notices must describe. */
export interface VendoredText {
  readonly ecosystem: NoticeEcosystem;
  readonly name: string;
  readonly version: string;
  /** File path relative to the package root. */
  readonly file: string;
  readonly sha256: string;
  /** Curated extract reproduced verbatim, relative to `legal/sources/`. */
  readonly textPath: string;
  readonly source: string;
  readonly reason: string;
}

/** The validated contents of `legal/sources/registry.json`. */
export interface NoticeRegistry {
  readonly registryPath: string;
  readonly registrySha256: string;
  readonly directory: string;
  readonly texts: ReadonlyMap<string, CuratedText>;
  readonly overrides: ReadonlyMap<string, NoticeOverride>;
  readonly vendored: readonly VendoredText[];
}

/** Identity key used for overrides and duplicate detection. */
export function componentKey(ecosystem: NoticeEcosystem, name: string, version: string): string {
  return `${ecosystem}\u0000${name}\u0000${version}`;
}

const ECOSYSTEMS: ReadonlySet<string> = new Set(["npm", "cargo", "go"]);
const TEXT_KINDS: ReadonlySet<string> = new Set(["upstream", "canonical", "vendored-extract"]);
const MAX_SOURCE_URL = 2048;

function requireString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }
  return value;
}

function requireDigest(value: unknown, label: string): string {
  const digest = requireString(value, label);
  if (!/^[0-9a-f]{64}$/u.test(digest)) {
    throw new Error(`${label} must be a lowercase SHA-256 digest.`);
  }
  return digest;
}

function requireSource(value: unknown, label: string): string {
  const source = requireString(value, label);
  if (!/^https:\/\//u.test(source) || source.length > MAX_SOURCE_URL) {
    throw new Error(`${label} must be an https URL shorter than ${String(MAX_SOURCE_URL)} bytes.`);
  }
  return source;
}

function requireEcosystem(value: unknown, label: string): NoticeEcosystem {
  const ecosystem = requireString(value, label);
  if (!ECOSYSTEMS.has(ecosystem)) {
    throw new Error(`${label} must be one of npm, cargo or go.`);
  }
  return ecosystem as NoticeEcosystem;
}

/** Rejects an absolute path or one that climbs out of the curated directory. */
function requireRelativePath(value: unknown, label: string): string {
  const path = requireString(value, label);
  if (path.startsWith("/") || path.includes("\\") || path.split("/").includes("..")) {
    throw new Error(`${label} must be a relative path without traversal.`);
  }
  return path;
}

function parseTexts(value: unknown): Map<string, CuratedText> {
  if (!Array.isArray(value)) {
    throw new Error("registry.texts must be an array.");
  }
  if (value.length > NOTICE_LIMITS.registryTexts) {
    throw new Error(
      `registry.texts declares more than ${String(NOTICE_LIMITS.registryTexts)} texts.`,
    );
  }
  const texts = new Map<string, CuratedText>();
  for (const [index, entry] of value.entries()) {
    const label = `registry.texts[${String(index)}]`;
    if (!isRecord(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    const path = requireRelativePath(entry.path, `${label}.path`);
    const kind = requireString(entry.kind, `${label}.kind`);
    if (!TEXT_KINDS.has(kind)) {
      throw new Error(`${label}.kind must be upstream, canonical or vendored-extract.`);
    }
    if (texts.has(path)) {
      throw new Error(`${label}.path duplicates ${path}.`);
    }
    texts.set(path, {
      path,
      kind: kind as CuratedText["kind"],
      source: requireSource(entry.source, `${label}.source`),
      sha256: requireDigest(entry.sha256, `${label}.sha256`),
    });
  }
  return texts;
}

function parseOverrides(
  value: unknown,
  texts: ReadonlyMap<string, CuratedText>,
): Map<string, NoticeOverride> {
  if (!Array.isArray(value)) {
    throw new Error("registry.overrides must be an array.");
  }
  if (value.length > NOTICE_LIMITS.registryOverrides) {
    throw new Error(
      `registry.overrides declares more than ${String(NOTICE_LIMITS.registryOverrides)} entries.`,
    );
  }
  const overrides = new Map<string, NoticeOverride>();
  for (const [index, entry] of value.entries()) {
    const label = `registry.overrides[${String(index)}]`;
    if (!isRecord(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    const ecosystem = requireEcosystem(entry.ecosystem, `${label}.ecosystem`);
    const name = requireString(entry.name, `${label}.name`);
    const version = requireString(entry.version, `${label}.version`);
    const key = componentKey(ecosystem, name, version);
    if (overrides.has(key)) {
      throw new Error(`${label} duplicates ${ecosystem}:${name}@${version}.`);
    }
    if (!Array.isArray(entry.texts) || entry.texts.length === 0) {
      throw new Error(`${label}.texts must be a non-empty array.`);
    }
    const overrideTexts: OverrideText[] = [];
    for (const [textIndex, textEntry] of entry.texts.entries()) {
      const textLabel = `${label}.texts[${String(textIndex)}]`;
      if (!isRecord(textEntry)) {
        throw new Error(`${textLabel} must be an object.`);
      }
      const path = requireRelativePath(textEntry.path, `${textLabel}.path`);
      if (!texts.has(path)) {
        throw new Error(`${textLabel}.path ${path} is not declared in registry.texts.`);
      }
      overrideTexts.push({ path, source: requireSource(textEntry.source, `${textLabel}.source`) });
    }
    const note = entry.note === undefined ? undefined : requireString(entry.note, `${label}.note`);
    overrides.set(key, {
      ecosystem,
      name,
      version,
      selectedLicense: requireString(entry.selectedLicense, `${label}.selectedLicense`),
      reason: requireString(entry.reason, `${label}.reason`),
      texts: overrideTexts,
      ...(note === undefined ? {} : { note }),
    });
  }
  return overrides;
}

function parseVendored(value: unknown, texts: ReadonlyMap<string, CuratedText>): VendoredText[] {
  if (value === undefined) {
    return [];
  }
  if (!Array.isArray(value)) {
    throw new Error("registry.vendored must be an array when present.");
  }
  const vendored: VendoredText[] = [];
  for (const [index, entry] of value.entries()) {
    const label = `registry.vendored[${String(index)}]`;
    if (!isRecord(entry)) {
      throw new Error(`${label} must be an object.`);
    }
    const textPath = requireRelativePath(entry.textPath, `${label}.textPath`);
    if (!texts.has(textPath)) {
      throw new Error(`${label}.textPath ${textPath} is not declared in registry.texts.`);
    }
    vendored.push({
      ecosystem: requireEcosystem(entry.ecosystem, `${label}.ecosystem`),
      name: requireString(entry.name, `${label}.name`),
      version: requireString(entry.version, `${label}.version`),
      file: requireRelativePath(entry.file, `${label}.file`),
      sha256: requireDigest(entry.sha256, `${label}.sha256`),
      textPath,
      source: requireSource(entry.source, `${label}.source`),
      reason: requireString(entry.reason, `${label}.reason`),
    });
  }
  return vendored;
}

/** Maps a curated kind onto the rendered origin label. */
function originForKind(kind: CuratedText["kind"]): TextOrigin {
  switch (kind) {
    case "canonical":
      return "canonical";
    case "vendored-extract":
      return "vendored-extract";
    case "upstream":
      return "curated-upstream";
  }
}

/**
 * Loads and validates the curated notice registry.
 *
 * Every declared text must exist, stay inside `legal/sources/`, match its digest
 * and decode as UTF-8. Overrides may only reference declared texts, and an
 * unreferenced text is a review error: curated inputs are never silently unused.
 *
 * @throws When the registry is malformed, a digest drifts, or a text is unused.
 */
export function loadNoticeRegistry(root: string, limits = NOTICE_LIMITS): NoticeRegistry {
  const directory = join(root, "legal", "sources");
  const registryPath = join(directory, "registry.json");
  if (!existsSync(registryPath)) {
    throw new Error(`Missing curated notice registry at ${registryPath}.`);
  }
  const bytes = readBoundedFile(registryPath, limits.manifestBytes, "legal/sources/registry.json");
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8")) as unknown;
  } catch (error) {
    throw new Error(`legal/sources/registry.json is not valid JSON: ${describe(error)}.`, {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new Error("legal/sources/registry.json must contain an object.");
  }
  if (parsed.schemaVersion !== 1) {
    throw new Error("legal/sources/registry.json must declare schemaVersion 1.");
  }
  const texts = parseTexts(parsed.texts);
  const overrides = parseOverrides(parsed.overrides, texts);
  const vendored = parseVendored(parsed.vendored, texts);
  const used = new Set<string>();
  for (const override of overrides.values()) {
    for (const text of override.texts) {
      used.add(text.path);
    }
  }
  for (const entry of vendored) {
    used.add(entry.textPath);
  }
  for (const path of texts.keys()) {
    if (!used.has(path)) {
      throw new Error(`Curated text ${path} is not referenced by any override or vendored entry.`);
    }
  }
  return {
    directory,
    overrides,
    registryPath,
    registrySha256: sha256Hex(bytes),
    texts,
    vendored,
  };
}

/** Reads and digest-checks one curated text, returning it ready for rendering. */
export function readCuratedText(
  registry: NoticeRegistry,
  path: string,
  provenance: string,
  origin: TextOrigin,
  source: string | undefined,
  limits = NOTICE_LIMITS,
): NoticeText {
  const declared = registry.texts.get(path);
  if (declared === undefined) {
    throw new Error(`Curated text ${path} is not declared in the registry.`);
  }
  const absolute = resolve(registry.directory, path);
  const bytes = readBoundedFile(absolute, limits.textBytes, `curated text ${path}`);
  const digest = sha256Hex(bytes);
  if (digest !== declared.sha256) {
    throw new Error(
      `Curated text ${path} has digest ${digest}, but the registry records ${declared.sha256}.`,
    );
  }
  const base = {
    body: new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    bytes: bytes.byteLength,
    origin,
    path: absolute,
    provenance,
    sha256: digest,
    ...(source === undefined ? {} : { source }),
  };
  return base;
}

/** Renders the origin label for a curated kind without exposing the registry shape. */
export function curatedOrigin(kind: CuratedText["kind"]): TextOrigin {
  return originForKind(kind);
}

/** Sorts curated text paths so a component's texts render in a stable order. */
export function sortTextPaths(paths: readonly string[]): string[] {
  return [...paths].sort(compareCodeUnits);
}
