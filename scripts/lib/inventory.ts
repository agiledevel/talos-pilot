import { isRecord } from "./validation.ts";

/** One npm package entry in the generated inventory. */
export interface NpmEntry {
  readonly name: string;
  readonly versions: readonly string[];
  readonly license: string;
  readonly hasNotice: boolean;
}

/** One Cargo package entry in the generated inventory. */
export interface CargoEntry {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly hasNotice: boolean;
}

/**
 * One Go module entry. `linked` marks modules that provide packages compiled
 * into the helper binary, which are the redistributed-notice obligations; the
 * rest are graph-only entries kept for completeness.
 */
export interface GoEntry {
  readonly path: string;
  readonly version: string;
  readonly indirect: boolean;
  readonly linked: boolean;
  readonly license: string;
  readonly licenseFiles: readonly string[];
  readonly hasNotice: boolean;
}

export interface DependencyInventory {
  readonly schemaVersion: 2;
  readonly generatedFrom: string;
  readonly sources: {
    readonly node: string;
    readonly pnpm: string;
    readonly rustc: string;
    readonly go: string;
    readonly lockfiles: {
      readonly pnpmLock: string;
      readonly cargoLock: string;
      readonly goSum: string;
    };
  };
  readonly npm: readonly NpmEntry[];
  readonly cargo: readonly CargoEntry[];
  readonly go: readonly GoEntry[];
}

/**
 * Canonical markers used only to name a license, never to judge its terms.
 * `absent` keeps a broader text (BSD-3-Clause) from also matching a narrower
 * marker (BSD-2-Clause) whose needles are a subset.
 */
const licenseMarkers: readonly {
  readonly id: string;
  readonly needles: readonly string[];
  readonly absent?: readonly string[];
}[] = [
  { id: "Apache-2.0", needles: ["apache license", "version 2.0"] },
  { id: "MIT", needles: ["permission is hereby granted, free of charge"] },
  { id: "ISC", needles: ["permission to use, copy, modify"] },
  { id: "MPL-2.0", needles: ["mozilla public license", "version 2.0"] },
  {
    id: "BSD-3-Clause",
    needles: ["neither the name", "redistributions in binary form must reproduce"],
  },
  {
    id: "BSD-2-Clause",
    needles: ["redistributions in binary form must reproduce"],
    absent: ["neither the name"],
  },
  { id: "0BSD", needles: ["permission to use, copy, modify, and/or distribute"] },
];

/**
 * Names a license from its text using the markers above. More than one match,
 * or no match at all, returns `unknown` so a human reviews it rather than the
 * generator guessing an SPDX identifier.
 */
export function classifyGoLicense(texts: readonly string[]): string {
  const haystack = texts.join("\n").toLowerCase();
  if (haystack.trim().length === 0) {
    return "unknown";
  }
  const matched = licenseMarkers
    .filter((marker) => marker.needles.every((needle) => haystack.includes(needle)))
    .filter((marker) => (marker.absent ?? []).every((needle) => !haystack.includes(needle)))
    .map((marker) => marker.id);
  if (matched.length === 1) {
    return matched[0] ?? "unknown";
  }
  return "unknown";
}

/** Sorts entries by the given key so regeneration is byte-stable. */
export function sortedBy<T>(entries: readonly T[], key: (entry: T) => string): T[] {
  return [...entries].sort((left, right) => {
    const leftKey = key(left);
    const rightKey = key(right);
    if (leftKey === rightKey) {
      return 0;
    }
    return leftKey < rightKey ? -1 : 1;
  });
}

/**
 * Splits concatenated JSON values, as produced by `go list -m -json all`, into
 * individual source texts. Braces inside strings are ignored so a license-like
 * value cannot corrupt the boundaries.
 */
export function splitJsonObjects(text: string): readonly string[] {
  const chunks: string[] = [];
  let depth = 0;
  let start = -1;
  let inString = false;
  let escaped = false;
  for (let index = 0; index < text.length; index += 1) {
    const character = text[index] ?? "";
    if (inString) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === '"') {
        inString = false;
      }
      continue;
    }
    if (character === '"') {
      inString = true;
    } else if (character === "{") {
      if (depth === 0) {
        start = index;
      }
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0 && start !== -1) {
        chunks.push(text.slice(start, index + 1));
        start = -1;
      }
    }
  }
  if (depth !== 0) {
    throw new Error("unterminated JSON object in generator input.");
  }
  return chunks;
}

/** Flattens `pnpm licenses list --json` output into inventory entries. */
export function parseNpmLicenses(
  value: unknown,
  noticeFor: (directory: string) => boolean,
): readonly NpmEntry[] {
  if (!isRecord(value)) {
    throw new Error("pnpm licenses output must be an object.");
  }
  const entries: NpmEntry[] = [];
  for (const [licenseKey, packages] of Object.entries(value)) {
    if (!Array.isArray(packages)) {
      throw new Error(`pnpm licenses section ${licenseKey} must be a list.`);
    }
    for (const pkg of packages) {
      if (!isRecord(pkg) || typeof pkg.name !== "string") {
        throw new Error("pnpm licenses entry is missing a name.");
      }
      const versions = Array.isArray(pkg.versions)
        ? pkg.versions.filter((version: unknown): version is string => typeof version === "string")
        : [];
      const paths = Array.isArray(pkg.paths)
        ? pkg.paths.filter((path: unknown): path is string => typeof path === "string")
        : [];
      entries.push({
        name: pkg.name,
        versions: [...versions].sort(),
        license: typeof pkg.license === "string" ? pkg.license : licenseKey,
        hasNotice: paths.some((path) => noticeFor(path)),
      });
    }
  }
  return sortedBy(entries, (entry) => `${entry.name}\u0000${entry.versions.join(",")}`);
}

/** Reads `cargo metadata --format-version 1` package entries. */
export function parseCargoPackages(
  value: unknown,
  noticeFor: (directory: string) => boolean,
): readonly CargoEntry[] {
  if (!isRecord(value) || !Array.isArray(value.packages)) {
    throw new Error("cargo metadata output must contain a packages array.");
  }
  const entries: CargoEntry[] = [];
  for (const pkg of value.packages) {
    if (!isRecord(pkg) || typeof pkg.name !== "string" || typeof pkg.version !== "string") {
      throw new Error("cargo metadata package is missing identity fields.");
    }
    if (pkg.source === null || pkg.source === undefined) {
      // A workspace member is first-party code, not a dependency obligation.
      continue;
    }
    const manifest = typeof pkg.manifest_path === "string" ? pkg.manifest_path : undefined;
    entries.push({
      name: pkg.name,
      version: pkg.version,
      license: typeof pkg.license === "string" ? pkg.license : "unknown",
      hasNotice: manifest === undefined ? false : noticeFor(parentDirectory(manifest)),
    });
  }
  return sortedBy(entries, (entry) => `${entry.name}\u0000${entry.version}`);
}

/**
 * Reads a stream of `go list -m -json all` module objects.
 *
 * License files are read only for `linked` modules. Building the helper
 * extracts their source on every machine, whereas a graph-only module is in the
 * module cache only if something else downloaded it; inspecting those would
 * make the inventory depend on the host. Graph-only modules are therefore
 * always reported as `unobserved`.
 *
 * @throws When an entry has no path, or a linked module has no extracted source.
 */
export function parseGoModules(
  modules: readonly unknown[],
  linked: ReadonlySet<string>,
  readLicenses: (module: { readonly dir: string }) => {
    readonly files: readonly string[];
    readonly texts: readonly string[];
    readonly notice: boolean;
    /** False when this machine's module cache holds no extracted source. */
    readonly observed: boolean;
  },
): readonly GoEntry[] {
  const entries: GoEntry[] = [];
  for (const item of modules) {
    if (!isRecord(item) || typeof item.Path !== "string") {
      throw new Error("go module entry is missing a path.");
    }
    if (typeof item.Main === "boolean" && item.Main) {
      continue;
    }
    const identity = {
      path: item.Path,
      version: typeof item.Version === "string" ? item.Version : "devel",
      indirect: item.Indirect === true,
    };
    if (!linked.has(item.Path)) {
      entries.push({
        ...identity,
        linked: false,
        license: "unobserved",
        licenseFiles: [],
        hasNotice: false,
      });
      continue;
    }
    const dir = typeof item.Dir === "string" ? item.Dir : "";
    const discovered = readLicenses({ dir });
    if (dir.length === 0 || !discovered.observed) {
      throw new Error(`linked Go module ${item.Path} has no extracted source to inspect.`);
    }
    entries.push({
      ...identity,
      linked: true,
      license: classifyGoLicense(discovered.texts),
      licenseFiles: [...discovered.files].sort(),
      hasNotice: discovered.notice,
    });
  }
  return sortedBy(entries, (entry) => `${entry.path}\u0000${entry.version}`);
}

/** Serializes the inventory with a trailing newline for stable diffs. */
export function renderInventory(inventory: DependencyInventory): string {
  return `${JSON.stringify(inventory, undefined, 2)}\n`;
}

function parentDirectory(path: string): string {
  const index = Math.max(path.lastIndexOf("/"), path.lastIndexOf("\\"));
  return index <= 0 ? path : path.slice(0, index);
}
