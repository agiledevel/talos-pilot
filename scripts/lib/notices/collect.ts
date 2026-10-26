import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";

import {
  compareCodeUnits,
  decodeUtf8,
  describe,
  findLicenceFiles,
  noticeTextFromBytes,
  readBoundedFile,
  resolveInside,
  sha256Hex,
} from "./files.ts";
import {
  componentKey,
  loadNoticeRegistry,
  readCuratedText,
  type NoticeRegistry,
} from "./sources.ts";
import {
  CARGO_TARGETS,
  ECOSYSTEM_ORDER,
  GO_TARGETS,
  NOTICE_LIMITS,
  type CollectedNotices,
  type NoticeComponent,
  type NoticeEcosystem,
  type NoticeText,
} from "./types.ts";
import { classifyGoLicense, splitJsonObjects } from "../inventory.ts";
import { isRecord } from "../validation.ts";

/** One external command invocation, recorded so tests can replace the process boundary. */
export interface CommandInvocation {
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd: string;
  readonly env: Readonly<Record<string, string>>;
}

/** Runs one graph command and returns its standard output. */
export type CommandRunner = (invocation: CommandInvocation) => string;

/**
 * Creates the production command runner.
 *
 * Commands are executed without a shell, with a fixed deadline and a captured
 * output limit, so a hung tool or a pathological graph fails instead of
 * blocking the build.
 */
export function createCommandRunner(limits = NOTICE_LIMITS): CommandRunner {
  return (invocation) => {
    try {
      return execFileSync(invocation.command, [...invocation.args], {
        cwd: invocation.cwd,
        encoding: "utf8",
        env: { ...process.env, ...invocation.env },
        maxBuffer: limits.commandMaxBytes,
        timeout: limits.commandTimeoutMs,
        windowsHide: true,
      });
    } catch (error) {
      throw new Error(
        `${invocation.command} ${invocation.args.join(" ")} failed in ${invocation.cwd}: ${describe(error)}.`,
        { cause: error },
      );
    }
  };
}

/** Options for one collection pass. */
export interface CollectOptions {
  readonly root: string;
  readonly run?: CommandRunner;
  readonly registry?: NoticeRegistry;
  readonly limits?: typeof NOTICE_LIMITS;
  readonly log?: (message: string) => void;
}

/**
 * Picks the licence alternative the notices rely on.
 *
 * An `AND` expression keeps every obligation, so it is never reduced. An `OR`
 * expression resolves to its first alternative, which is the selection the
 * reviewed decisions record; the declared expression stays in the manifest.
 */
export function selectLicense(expression: string): string {
  const declared = expression.trim();
  if (declared.length === 0) {
    return "unknown";
  }
  if (/\bAND\b/u.test(declared)) {
    return declared;
  }
  const alternatives = declared
    .split(/\s+OR\s+/iu)
    .map((part) => part.trim().replace(/^\(+/u, "").replace(/\)+$/u, "").trim())
    .filter((part) => part.length > 0);
  if (alternatives.length > 1) {
    return alternatives[0] ?? declared;
  }
  const slash = declared.split("/").map((part) => part.trim());
  if (slash.length > 1 && slash[0] !== undefined && slash[0].length > 0) {
    return slash[0];
  }
  return declared;
}

/** Package managers differ by file name on Windows. */
function packageManagerCommand(): string {
  return process.platform === "win32" ? "pnpm.cmd" : "pnpm";
}

interface NpmPackage {
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly path: string;
  readonly source: string;
}

function parseNpmPackageJson(
  directory: string,
  expectedName: string,
  limits: typeof NOTICE_LIMITS,
): NpmPackage {
  const packageJson = join(directory, "package.json");
  const bytes = readBoundedFile(
    packageJson,
    limits.packageJsonBytes,
    `${expectedName} package.json`,
  );
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeUtf8(bytes, `${expectedName} package.json`)) as unknown;
  } catch (error) {
    throw new Error(`${packageJson} is not valid JSON: ${describe(error)}.`, { cause: error });
  }
  if (!isRecord(parsed) || typeof parsed.name !== "string" || typeof parsed.version !== "string") {
    throw new Error(`${packageJson} is missing a name or version.`);
  }
  if (parsed.name !== expectedName) {
    throw new Error(`${packageJson} declares ${parsed.name}, but the graph lists ${expectedName}.`);
  }
  for (const field of ["os", "cpu", "libc"] as const) {
    const value = parsed[field];
    if (Array.isArray(value) && value.length > 0) {
      throw new Error(
        `${expectedName}@${parsed.version} declares a ${field} restriction (${value.join(", ")}); ` +
          "the production notice graph is required to be target-neutral.",
      );
    }
  }
  return {
    name: parsed.name,
    version: parsed.version,
    license: typeof parsed.license === "string" ? parsed.license : "",
    path: directory,
    source: `https://registry.npmjs.org/${parsed.name}/${parsed.version}`,
  };
}

function collectNpm(
  options: Required<Pick<CollectOptions, "root" | "run" | "limits" | "log">> & {
    registry: NoticeRegistry;
  },
): NoticeComponent[] {
  const { root, run, limits, registry, log } = options;
  const output = run({
    command: packageManagerCommand(),
    args: ["licenses", "list", "--prod", "--json"],
    cwd: root,
    env: {},
  });
  let parsed: unknown;
  try {
    parsed = JSON.parse(output) as unknown;
  } catch (error) {
    throw new Error(`pnpm licenses output is not valid JSON: ${describe(error)}.`, {
      cause: error,
    });
  }
  if (!isRecord(parsed)) {
    throw new Error("pnpm licenses output must be an object.");
  }
  const byIdentity = new Map<
    string,
    { component: NoticeComponent; directory: string; texts: Map<string, NoticeText> }
  >();
  for (const [licenseKey, packages] of Object.entries(parsed)) {
    if (!Array.isArray(packages)) {
      throw new Error(`pnpm licenses section ${licenseKey} must be a list.`);
    }
    for (const entry of packages) {
      if (!isRecord(entry) || typeof entry.name !== "string") {
        throw new Error("pnpm licenses entry is missing a name.");
      }
      const paths = Array.isArray(entry.paths)
        ? entry.paths.filter((path: unknown): path is string => typeof path === "string")
        : [];
      if (paths.length === 0) {
        throw new Error(`${entry.name} has no installed path in the production graph.`);
      }
      for (const path of paths) {
        const pkg = parseNpmPackageJson(path, entry.name, limits);
        const declared = pkg.license.length > 0 ? pkg.license : licenseKey;
        const key = componentKey("npm", pkg.name, pkg.version);
        const existing = byIdentity.get(key);
        const files = findLicenceFiles(pkg.path, limits);
        const texts = new Map<string, NoticeText>(existing?.texts ?? []);
        for (const file of files) {
          const provenance = `npm:${pkg.name}@${pkg.version}/${file.relativePath}`;
          const bytes = readBoundedFile(file.path, limits.textBytes, provenance);
          const digest = sha256Hex(bytes);
          const previous = texts.get(provenance);
          if (previous !== undefined && previous.sha256 !== digest) {
            throw new Error(
              `${provenance} has two different contents (${previous.sha256} and ${digest}).`,
            );
          }
          texts.set(
            provenance,
            noticeTextFromBytes({ bytes, origin: "upstream", path: file.path, provenance }),
          );
        }
        byIdentity.set(key, {
          directory: pkg.path,
          component:
            existing?.component ??
            ({
              declaredLicense: declared,
              ecosystem: "npm",
              name: pkg.name,
              notes: [],
              selectedLicense: selectLicense(declared),
              source: pkg.source,
              targets: [],
              texts: [],
              version: pkg.version,
            } satisfies NoticeComponent),
          texts,
        });
      }
    }
  }
  log(`Collected ${String(byIdentity.size)} npm production packages.`);
  return [...byIdentity.values()].map(({ component, directory, texts }) =>
    finalizeComponent(component, [...texts.values()], directory, registry, limits),
  );
}

interface CargoNode {
  readonly id: string;
  readonly deps?: readonly {
    readonly pkg: string;
    readonly dep_kinds?: readonly { readonly kind?: string | null }[];
  }[];
}

interface CargoPackage {
  readonly id: string;
  readonly name: string;
  readonly version: string;
  readonly license: string | null;
  readonly license_file: string | null;
  readonly manifest_path: string | undefined;
  readonly source: string | null;
  readonly repository: string | null;
}

function parseCargoMetadata(
  value: string,
  label: string,
): {
  packages: CargoPackage[];
  workspace: Set<string>;
  nodes: Map<string, CargoNode>;
} {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value) as unknown;
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${describe(error)}.`, { cause: error });
  }
  if (
    !isRecord(parsed) ||
    !Array.isArray(parsed.packages) ||
    !Array.isArray(parsed.workspace_members)
  ) {
    throw new Error(`${label} must contain packages and workspace_members.`);
  }
  if (!isRecord(parsed.resolve) || !Array.isArray(parsed.resolve.nodes)) {
    throw new Error(`${label} must contain resolve.nodes.`);
  }
  const packages: CargoPackage[] = [];
  for (const entry of parsed.packages) {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.name !== "string") {
      throw new Error(`${label} has a package without an id or name.`);
    }
    if (typeof entry.version !== "string") {
      throw new Error(`${label} package ${entry.name} has no version.`);
    }
    packages.push({
      id: entry.id,
      license: typeof entry.license === "string" ? entry.license : null,
      license_file: typeof entry.license_file === "string" ? entry.license_file : null,
      manifest_path: typeof entry.manifest_path === "string" ? entry.manifest_path : undefined,
      name: entry.name,
      repository: typeof entry.repository === "string" ? entry.repository : null,
      source: typeof entry.source === "string" ? entry.source : null,
      version: entry.version,
    });
  }
  const workspace = new Set<string>();
  for (const member of parsed.workspace_members) {
    if (typeof member !== "string") {
      throw new Error(`${label} workspace_members must contain strings.`);
    }
    workspace.add(member);
  }
  const nodes = new Map<string, CargoNode>();
  for (const entry of parsed.resolve.nodes) {
    if (!isRecord(entry) || typeof entry.id !== "string") {
      throw new Error(`${label} resolve node is missing an id.`);
    }
    const deps: { pkg: string; dep_kinds?: { kind?: string | null }[] }[] = [];
    if (Array.isArray(entry.deps)) {
      for (const dep of entry.deps) {
        if (!isRecord(dep) || typeof dep.pkg !== "string") {
          throw new Error(`${label} resolve dependency is missing a pkg id.`);
        }
        const kinds: { kind?: string | null }[] = [];
        if (Array.isArray(dep.dep_kinds)) {
          for (const kind of dep.dep_kinds) {
            if (isRecord(kind)) {
              kinds.push({ kind: typeof kind.kind === "string" ? kind.kind : null });
            }
          }
        }
        deps.push({ pkg: dep.pkg, dep_kinds: kinds });
      }
    }
    nodes.set(entry.id, { id: entry.id, deps });
  }
  return { nodes, packages, workspace };
}

/** Normal and build edges only: a dev-dependency edge is test-only for workspace members. */
function cargoClosure(
  workspace: ReadonlySet<string>,
  nodes: ReadonlyMap<string, CargoNode>,
): Set<string> {
  const reachable = new Set<string>();
  const stack = [...workspace];
  while (stack.length > 0) {
    const id = stack.pop();
    if (id === undefined || reachable.has(id)) {
      continue;
    }
    reachable.add(id);
    for (const dep of nodes.get(id)?.deps ?? []) {
      const kinds = dep.dep_kinds ?? [];
      const redistributed = kinds.some(
        (kind) =>
          kind.kind === null ||
          kind.kind === undefined ||
          kind.kind === "normal" ||
          kind.kind === "build",
      );
      if (redistributed) {
        stack.push(dep.pkg);
      }
    }
  }
  return reachable;
}

function collectCargo(
  options: Required<Pick<CollectOptions, "root" | "run" | "limits" | "log">> & {
    registry: NoticeRegistry;
  },
): NoticeComponent[] {
  const { root, run, limits, registry, log } = options;
  const cargoRoot = join(root, "src-tauri");
  const readMetadata = (args: readonly string[]): string =>
    run({ command: "cargo", args, cwd: cargoRoot, env: {} });
  const base = parseCargoMetadata(
    readMetadata(["metadata", "--locked", "--format-version", "1"]),
    "cargo metadata",
  );
  const targetsByCrate = new Map<string, Set<string>>();
  for (const target of CARGO_TARGETS) {
    const metadata = parseCargoMetadata(
      readMetadata(["metadata", "--locked", "--format-version", "1", "--filter-platform", target]),
      `cargo metadata for ${target}`,
    );
    for (const id of cargoClosure(metadata.workspace, metadata.nodes)) {
      if (metadata.workspace.has(id)) {
        continue;
      }
      const targetSet = targetsByCrate.get(id) ?? new Set<string>();
      targetSet.add(target);
      targetsByCrate.set(id, targetSet);
    }
  }
  const packages = new Map(base.packages.map((entry) => [entry.id, entry]));
  const components: NoticeComponent[] = [];
  for (const [id, targetSet] of targetsByCrate) {
    const pkg = packages.get(id);
    if (pkg === undefined) {
      throw new Error(`cargo metadata does not describe ${id}.`);
    }
    const licensed = pkg.license ?? "";
    if (licensed.trim().length === 0) {
      throw new Error(
        `Cargo package ${pkg.name}@${pkg.version} declares no license expression; review it before it ships.`,
      );
    }
    const manifest = pkg.manifest_path;
    if (manifest === undefined) {
      throw new Error(`Cargo package ${pkg.name}@${pkg.version} has no manifest path.`);
    }
    const directory = dirname(manifest);
    const texts: NoticeText[] = [];
    for (const file of findLicenceFiles(directory, limits)) {
      const provenance = `cargo:${pkg.name}@${pkg.version}/${file.relativePath}`;
      const bytes = readBoundedFile(file.path, limits.textBytes, provenance);
      texts.push(noticeTextFromBytes({ bytes, origin: "upstream", path: file.path, provenance }));
    }
    if (pkg.license_file !== null) {
      const licenceFile = resolveInside(
        directory,
        pkg.license_file,
        `Cargo package ${pkg.name}@${pkg.version} license_file`,
      );
      const provenance = `cargo:${pkg.name}@${pkg.version}/${pkg.license_file}`;
      if (!texts.some((text) => text.provenance === provenance)) {
        const bytes = readBoundedFile(licenceFile, limits.textBytes, provenance);
        texts.push(
          noticeTextFromBytes({ bytes, origin: "upstream", path: licenceFile, provenance }),
        );
      }
    }
    components.push(
      finalizeComponent(
        {
          declaredLicense: licensed,
          ecosystem: "cargo",
          name: pkg.name,
          notes: [],
          selectedLicense: selectLicense(licensed),
          source: `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`,
          targets: [...targetSet].sort(compareCodeUnits),
          texts: [],
          version: pkg.version,
        },
        texts,
        directory,
        registry,
        limits,
      ),
    );
  }
  log(
    `Collected ${String(components.length)} Cargo crates across ${String(CARGO_TARGETS.length)} targets.`,
  );
  return components;
}

function collectGo(
  options: Required<Pick<CollectOptions, "root" | "run" | "limits" | "log">> & {
    registry: NoticeRegistry;
  },
): NoticeComponent[] {
  const { root, run, limits, registry, log } = options;
  const helper = join(root, "helper");
  const modulesOutput = run({
    command: "go",
    args: ["list", "-m", "-json", "all"],
    cwd: helper,
    env: {},
  });
  const modules: unknown[] = splitJsonObjects(modulesOutput).map(
    (chunk) => JSON.parse(chunk) as unknown,
  );
  const linked = new Set<string>();
  for (const target of GO_TARGETS) {
    const label = `${target.goos}/${target.goarch}`;
    const packagesOutput = run({
      command: "go",
      args: ["list", "-deps", "-json", "./..."],
      cwd: helper,
      env: { GOARCH: target.goarch, GOOS: target.goos },
    });
    let count = 0;
    for (const chunk of splitJsonObjects(packagesOutput)) {
      const parsed = JSON.parse(chunk) as unknown;
      if (!isRecord(parsed) || !isRecord(parsed.Module)) {
        continue;
      }
      const module = parsed.Module;
      if (typeof module.Path !== "string") {
        continue;
      }
      if (module.Main === true) {
        continue;
      }
      linked.add(module.Path);
      count += 1;
    }
    if (count === 0) {
      throw new Error(`go list reported no helper modules for ${label}.`);
    }
  }
  const components: NoticeComponent[] = [];
  for (const item of modules) {
    if (!isRecord(item) || typeof item.Path !== "string") {
      throw new Error("go list module entry is missing a path.");
    }
    if (item.Main === true || !linked.has(item.Path)) {
      continue;
    }
    const modulePath = item.Path;
    const version = typeof item.Version === "string" ? item.Version : "devel";
    const directory = typeof item.Dir === "string" ? item.Dir : "";
    if (directory.length === 0 || !existsSync(directory)) {
      throw new Error(
        `Helper module ${modulePath}@${version} has no extracted source; run go mod download before generating notices.`,
      );
    }
    const files = findLicenceFiles(directory, limits);
    const read = files.map((file) => {
      const provenance = `go:${modulePath}@${version}/${file.relativePath}`;
      const bytes = readBoundedFile(file.path, limits.textBytes, provenance);
      return {
        relativePath: file.relativePath,
        text: noticeTextFromBytes({ bytes, origin: "upstream", path: file.path, provenance }),
      };
    });
    const texts: NoticeText[] = read.map((entry) => entry.text);
    if (texts.length === 0) {
      throw new Error(`Helper module ${modulePath}@${version} ships no licence text.`);
    }
    // Nested files can be subcomponent notices of a different licence, so the
    // module's own licence is classified from its root files first.
    const rootTexts = read
      .filter((entry) => !entry.relativePath.includes("/"))
      .map((entry) => entry.text.body);
    const classified =
      rootTexts.length === 0
        ? classifyGoLicense(texts.map((text) => text.body))
        : classifyGoLicense(rootTexts);
    if (classified === "unknown") {
      throw new Error(
        `Helper module ${modulePath}@${version} has no recognized licence; review it before it ships.`,
      );
    }
    components.push(
      finalizeComponent(
        {
          declaredLicense: classified,
          ecosystem: "go",
          name: modulePath,
          notes: [],
          selectedLicense: classified,
          source: `https://pkg.go.dev/${modulePath}@${version}`,
          targets: [],
          texts: [],
          version,
        },
        texts,
        directory,
        registry,
        limits,
      ),
    );
  }
  log(`Collected ${String(components.length)} linked Go modules.`);
  return components;
}

/**
 * Applies the curated override for one component, or keeps its own texts.
 *
 * An override for a component that already ships licence text is rejected: a
 * curated file may close a gap, never replace upstream attribution.
 */
function finalizeComponent(
  component: NoticeComponent,
  texts: readonly NoticeText[],
  directory: string,
  registry: NoticeRegistry,
  limits: typeof NOTICE_LIMITS,
): NoticeComponent {
  const key = componentKey(component.ecosystem, component.name, component.version);
  const override = registry.overrides.get(key);
  if (override !== undefined) {
    if (texts.length > 0) {
      throw new Error(
        `${component.ecosystem}:${component.name}@${component.version} ships licence text, so the curated override is stale.`,
      );
    }
    const curated = override.texts.map((entry) => {
      const kind = registry.texts.get(entry.path)?.kind;
      if (kind === undefined) {
        throw new Error(`Curated text ${entry.path} is not declared in the registry.`);
      }
      return readCuratedText(
        registry,
        entry.path,
        `curated:${entry.path}`,
        originFor(kind),
        entry.source,
        limits,
      );
    });
    return withTexts(
      {
        ...component,
        notes: override.note === undefined ? [] : [override.note],
        overrideReason: override.reason,
        selectedLicense: override.selectedLicense,
      },
      curated,
      directory,
      registry,
      limits,
    );
  }
  if (texts.length === 0) {
    throw new Error(
      `${component.ecosystem}:${component.name}@${component.version} ships no licence text and has no curated override in legal/sources/registry.json.`,
    );
  }
  return withTexts(component, texts, directory, registry, limits);
}

function originFor(kind: "upstream" | "canonical" | "vendored-extract"): NoticeText["origin"] {
  switch (kind) {
    case "canonical":
      return "canonical";
    case "vendored-extract":
      return "vendored-extract";
    case "upstream":
      return "curated-upstream";
  }
}

/** Adds vendored extracts, sorts the texts and enforces the per-component limits. */
function withTexts(
  component: NoticeComponent,
  texts: readonly NoticeText[],
  directory: string,
  registry: NoticeRegistry,
  limits: typeof NOTICE_LIMITS,
): NoticeComponent {
  const collected = [...texts];
  const notes = [...component.notes];
  for (const entry of registry.vendored) {
    if (
      entry.ecosystem !== component.ecosystem ||
      entry.name !== component.name ||
      entry.version !== component.version
    ) {
      continue;
    }
    const file = resolveInside(directory, entry.file, `${component.name} vendored file`);
    const bytes = readBoundedFile(file, limits.vendoredBytes, `${component.name} vendored file`);
    const digest = sha256Hex(bytes);
    if (digest !== entry.sha256) {
      throw new Error(
        `${component.name}@${component.version} ${entry.file} has digest ${digest}, but the registry records ${entry.sha256}.`,
      );
    }
    const text = readCuratedText(
      registry,
      entry.textPath,
      `vendored:${component.name}@${component.version}/${entry.file}`,
      "vendored-extract",
      entry.source,
      limits,
    );
    const haystack = decodeUtf8(bytes, `${component.name} vendored file`);
    if (!haystack.includes(text.body.trimEnd())) {
      throw new Error(
        `Curated extract ${entry.textPath} does not appear in ${component.name}@${component.version} ${entry.file}.`,
      );
    }
    collected.push(text);
    notes.push(entry.reason);
  }
  if (collected.length === 0) {
    throw new Error(
      `${component.name}@${component.version} would render without any licence text.`,
    );
  }
  if (collected.length > limits.textsPerComponent) {
    throw new Error(
      `${component.name}@${component.version} has ${String(collected.length)} licence texts, above the ${String(
        limits.textsPerComponent,
      )}-text limit.`,
    );
  }
  return {
    ...component,
    notes,
    texts: collected.sort((left, right) => compareCodeUnits(left.provenance, right.provenance)),
  };
}

/**
 * Collects every redistributed component from the live locked graphs.
 *
 * The command boundary is injectable so tests can prove drift, bounds and
 * failure semantics against a synthetic graph without touching a real lockfile.
 *
 * @throws When a graph command fails, a component has no reviewable licence
 *   text, a curated override is stale or malformed, a file escapes its root, or
 *   any declared bound is exceeded.
 */
export function collectNotices(options: CollectOptions): CollectedNotices {
  const limits = options.limits ?? NOTICE_LIMITS;
  const run = options.run ?? createCommandRunner(limits);
  const log = options.log ?? (() => undefined);
  const registry = options.registry ?? loadNoticeRegistry(options.root, limits);
  const components = [
    ...collectNpm({ limits, log, registry, root: options.root, run }),
    ...collectCargo({ limits, log, registry, root: options.root, run }),
    ...collectGo({ limits, log, registry, root: options.root, run }),
  ];
  if (components.length > limits.components) {
    throw new Error(
      `The notice graph has ${String(components.length)} components, above the ${String(
        limits.components,
      )}-component limit.`,
    );
  }
  const seen = new Set<string>();
  for (const component of components) {
    const key = componentKey(component.ecosystem, component.name, component.version);
    if (seen.has(key)) {
      throw new Error(
        `Component ${component.ecosystem}:${component.name}@${component.version} is duplicated.`,
      );
    }
    seen.add(key);
  }
  for (const [key, override] of registry.overrides) {
    if (!seen.has(key)) {
      throw new Error(
        `Curated override for ${override.ecosystem}:${override.name}@${override.version} is stale: the locked graph no longer contains it.`,
      );
    }
  }
  const totalTextBytes = components.reduce(
    (total, component) => total + component.texts.reduce((sum, text) => sum + text.bytes, 0),
    0,
  );
  if (totalTextBytes > limits.totalTextBytes) {
    throw new Error(
      `The notice texts total ${String(totalTextBytes)} bytes, above the ${String(
        limits.totalTextBytes,
      )}-byte limit.`,
    );
  }
  const order = new Map<NoticeEcosystem, number>(
    ECOSYSTEM_ORDER.map((ecosystem, index) => [ecosystem, index]),
  );
  const sorted = [...components].sort((left, right) => {
    const byEcosystem = (order.get(left.ecosystem) ?? 0) - (order.get(right.ecosystem) ?? 0);
    if (byEcosystem !== 0) {
      return byEcosystem;
    }
    const byName = compareCodeUnits(left.name, right.name);
    if (byName !== 0) {
      return byName;
    }
    return compareCodeUnits(left.version, right.version);
  });
  return {
    components: sorted,
    inputs: {
      cargoLockSha256: sha256Hex(
        readBoundedFile(
          join(options.root, "src-tauri", "Cargo.lock"),
          limits.manifestBytes,
          "src-tauri/Cargo.lock",
        ),
      ),
      goSumSha256: sha256Hex(
        readBoundedFile(
          join(options.root, "helper", "go.sum"),
          limits.manifestBytes,
          "helper/go.sum",
        ),
      ),
      pnpmLockSha256: sha256Hex(
        readBoundedFile(
          join(options.root, "pnpm-lock.yaml"),
          limits.manifestBytes,
          "pnpm-lock.yaml",
        ),
      ),
      registrySha256: registry.registrySha256,
    },
  };
}
