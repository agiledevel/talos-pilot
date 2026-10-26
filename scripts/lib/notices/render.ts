import {
  CARGO_TARGETS,
  ECOSYSTEM_ORDER,
  GO_TARGETS,
  NOTICE_LIMITS,
  type CollectedNotices,
  type NoticeComponent,
  type NoticeText,
} from "./types.ts";
import { compareCodeUnits, sha256Hex } from "./files.ts";
import { isRecord } from "../validation.ts";

/** Repository-relative paths of the two committed artifacts. */
export const NOTICES_PATH = "legal/THIRD-PARTY-NOTICES.txt";
export const MANIFEST_PATH = "legal/third-party-manifest.json";

/** Machine-readable record rendered next to the notices. */
export interface NoticeManifest {
  readonly schemaVersion: 1;
  readonly generatedBy: string;
  readonly policy: string;
  readonly inputs: CollectedNotices["inputs"] & {
    readonly cargoTargets: readonly string[];
    readonly goTargets: readonly string[];
  };
  readonly coverage: {
    readonly components: number;
    readonly npm: number;
    readonly cargo: number;
    readonly go: number;
    readonly texts: number;
    readonly textBytes: number;
  };
  readonly notices: {
    readonly path: string;
    readonly sha256: string;
    readonly bytes: number;
  };
  readonly components: readonly ManifestComponent[];
}

/** One component as recorded in the manifest. */
export interface ManifestComponent {
  readonly ecosystem: NoticeComponent["ecosystem"];
  readonly name: string;
  readonly version: string;
  readonly declaredLicense: string;
  readonly selectedLicense: string;
  readonly source: string;
  readonly targets: readonly string[];
  readonly notes: readonly string[];
  readonly overrideReason?: string;
  readonly texts: readonly {
    readonly provenance: string;
    readonly origin: NoticeText["origin"];
    readonly sha256: string;
    readonly bytes: number;
    readonly source?: string;
  }[];
}

/** The rendered notices text and manifest, before either is written. */
export interface RenderedNotices {
  readonly notices: string;
  readonly manifest: NoticeManifest;
  /** Serialized manifest with a trailing newline, ready to write. */
  readonly manifestJson: string;
}

const RULE = "=".repeat(80);
const SUB_RULE = "-".repeat(80);

function renderHeader(collected: CollectedNotices): string {
  const counts = countEcosystems(collected.components);
  const textCount = collected.components.reduce(
    (total, component) => total + component.texts.length,
    0,
  );
  const textBytes = collected.components.reduce(
    (total, component) => total + component.texts.reduce((sum, text) => sum + text.bytes, 0),
    0,
  );
  return [
    "TALOS PILOT THIRD-PARTY NOTICES",
    "================================",
    "",
    "Generated file. Do not edit it by hand; run `pnpm notices:generate` instead.",
    "The machine-readable identity and digest record is legal/third-party-manifest.json.",
    "",
    "Coverage: every third-party component redistributed by this application and verified",
    "against the live locked dependency inputs below.",
    "",
    "Locked inputs:",
    `  pnpm-lock.yaml            sha256 ${collected.inputs.pnpmLockSha256}`,
    `  src-tauri/Cargo.lock      sha256 ${collected.inputs.cargoLockSha256}`,
    `  helper/go.sum             sha256 ${collected.inputs.goSumSha256}`,
    `  legal/sources/registry.json sha256 ${collected.inputs.registrySha256}`,
    "",
    "Scope:",
    `  npm    ${String(counts.npm)} production packages (frontend assets, workers and CSS)`,
    `  cargo  ${String(counts.cargo)} crates (native executable, union of the declared targets)`,
    `  go     ${String(counts.go)} modules (bundled helper binary)`,
    `  Cargo targets: ${CARGO_TARGETS.join(", ")}`,
    `  Go targets:    ${GO_TARGETS.map((target) => `${target.goos}/${target.goarch}`).join(", ")}`,
    `  Texts: ${String(textCount)} files, ${String(textBytes)} bytes`,
    "",
    "Development-only packages, test harnesses and first-party application code are excluded.",
    "Upstream licence and notice texts are reproduced verbatim; line endings are preserved.",
    "",
  ].join("\n");
}

/** Orders components by ecosystem, name and version; rendering never trusts caller order. */
function orderComponents(components: readonly NoticeComponent[]): NoticeComponent[] {
  const order = new Map(ECOSYSTEM_ORDER.map((ecosystem, index) => [ecosystem, index]));
  return [...components].sort((left, right) => {
    const byEcosystem = (order.get(left.ecosystem) ?? 0) - (order.get(right.ecosystem) ?? 0);
    if (byEcosystem !== 0) {
      return byEcosystem;
    }
    const byName = compareCodeUnits(left.name, right.name);
    return byName !== 0 ? byName : compareCodeUnits(left.version, right.version);
  });
}

function countEcosystems(
  components: readonly NoticeComponent[],
): Record<NoticeComponent["ecosystem"], number> {
  const counts = { cargo: 0, go: 0, npm: 0 };
  for (const component of components) {
    counts[component.ecosystem] += 1;
  }
  return counts;
}

function renderTargets(component: NoticeComponent): string {
  if (component.targets.length === 0) {
    return "every declared target";
  }
  return component.targets.join(", ");
}

function renderTextHeading(text: NoticeText): string {
  const origin = {
    canonical: "canonical SPDX text",
    "curated-upstream": "curated copy of an upstream file",
    upstream: "upstream file",
    "vendored-extract": "extract of a vendored file",
  }[text.origin];
  const lines = [`${SUB_RULE}`, `Text: ${origin} at ${text.provenance}`];
  if (text.source !== undefined) {
    lines.push(`Upstream: ${text.source}`);
  }
  lines.push(`sha256 ${text.sha256}, ${String(text.bytes)} bytes`, SUB_RULE, "");
  return `${lines.join("\n")}\n`;
}

function renderText(text: NoticeText): string {
  const body = text.body.endsWith("\n") ? text.body : `${text.body}\n`;
  return `${renderTextHeading(text)}${body}\n`;
}

/** Renders one component block deterministically. */
export function renderComponent(component: NoticeComponent): string {
  const lines = [
    RULE,
    `[${component.ecosystem}] ${component.name} ${component.version}`,
    RULE,
    `Declared license: ${component.declaredLicense}`,
    `Selected license: ${component.selectedLicense}`,
    `Redistributed by: ${renderTargets(component)}`,
    `Source: ${component.source}`,
  ];
  if (component.overrideReason !== undefined) {
    lines.push(`Curated override: ${component.overrideReason}`);
  }
  for (const note of component.notes) {
    lines.push(`Note: ${note}`);
  }
  lines.push("");
  return `${lines.join("\n")}${component.texts.map((text) => renderText(text)).join("")}`;
}

/** Serializes the manifest with a stable shape and a trailing newline. */
function renderManifest(manifest: NoticeManifest): string {
  return `${JSON.stringify(manifest, undefined, 2)}\n`;
}

/**
 * Renders both artifacts from a collected graph.
 *
 * The result is a pure function of the collection: repeated calls with the same
 * inputs and texts produce identical bytes. The manifest records the notices
 * digest, so hand-editing either file is detected by `pnpm notices:check`.
 *
 * @throws When the rendered notices or manifest would exceed their byte limits.
 */
export function renderNotices(
  collected: CollectedNotices,
  limits = NOTICE_LIMITS,
): RenderedNotices {
  const ordered = orderComponents(collected.components);
  const header = renderHeader({ ...collected, components: ordered });
  const body = ordered.map((component) => renderComponent(component)).join("");
  const notices = `${header}\n${body}`;
  const noticesBytes = Buffer.byteLength(notices, "utf8");
  if (noticesBytes > limits.noticesBytes) {
    throw new Error(
      `The notices would be ${String(noticesBytes)} bytes, above the ${String(limits.noticesBytes)}-byte limit.`,
    );
  }
  const counts = countEcosystems(ordered);
  const components: ManifestComponent[] = ordered.map((component) => ({
    ecosystem: component.ecosystem,
    declaredLicense: component.declaredLicense,
    name: component.name,
    notes: [...component.notes],
    ...(component.overrideReason === undefined ? {} : { overrideReason: component.overrideReason }),
    selectedLicense: component.selectedLicense,
    source: component.source,
    targets: [...component.targets],
    texts: component.texts.map((text) => ({
      bytes: text.bytes,
      origin: text.origin,
      provenance: text.provenance,
      sha256: text.sha256,
      ...(text.source === undefined ? {} : { source: text.source }),
    })),
    version: component.version,
  }));
  const manifest: NoticeManifest = {
    coverage: {
      cargo: counts.cargo,
      components: ordered.length,
      go: counts.go,
      npm: counts.npm,
      textBytes: ordered.reduce(
        (total, component) => total + component.texts.reduce((sum, text) => sum + text.bytes, 0),
        0,
      ),
      texts: ordered.reduce((total, component) => total + component.texts.length, 0),
    },
    components,
    generatedBy: "pnpm notices:generate",
    inputs: {
      ...collected.inputs,
      cargoTargets: [...CARGO_TARGETS],
      goTargets: GO_TARGETS.map((target) => `${target.goos}/${target.goarch}`),
    },
    notices: {
      bytes: noticesBytes,
      path: NOTICES_PATH,
      sha256: sha256Hex(Buffer.from(notices, "utf8")),
    },
    policy: "docs/decisions/0020-dependency-notice-generation.md",
    schemaVersion: 1,
  };
  const manifestJson = renderManifest(manifest);
  if (Buffer.byteLength(manifestJson, "utf8") > limits.manifestBytes) {
    throw new Error("The manifest exceeds its byte limit.");
  }
  return { manifest, manifestJson, notices };
}

/** One difference between generated and committed artifacts. */
export interface ArtifactDifference {
  readonly kind: "stale" | "missing" | "unexpected" | "malformed" | "inconsistent";
  readonly path: string;
  readonly detail: string;
}

/** Compares committed bytes with rendered artifacts without writing anything. */
export function compareArtifacts(
  rendered: RenderedNotices,
  committed: { readonly notices: string | undefined; readonly manifest: string | undefined },
): ArtifactDifference[] {
  const differences: ArtifactDifference[] = [];
  if (committed.notices === undefined) {
    differences.push({
      detail: "the committed notices file is missing",
      kind: "missing",
      path: NOTICES_PATH,
    });
  } else if (committed.notices !== rendered.notices) {
    differences.push({
      detail: `committed ${String(Buffer.byteLength(committed.notices, "utf8"))} bytes, regenerated ${String(
        Buffer.byteLength(rendered.notices, "utf8"),
      )} bytes`,
      kind: "stale",
      path: NOTICES_PATH,
    });
  }
  if (committed.manifest === undefined) {
    differences.push({
      detail: "the committed manifest is missing",
      kind: "missing",
      path: MANIFEST_PATH,
    });
  } else if (committed.manifest !== rendered.manifestJson) {
    differences.push({
      detail: "the committed manifest does not match the regenerated manifest",
      kind: "stale",
      path: MANIFEST_PATH,
    });
  }
  return differences;
}

/**
 * Cross-checks a committed artifact pair: the manifest must parse, match the
 * schema version, and record the digest of the committed notices file.
 *
 * @throws When the pair is malformed or internally inconsistent.
 */
export function assertArtifactPair(
  notices: string | undefined,
  manifest: string | undefined,
): NoticeManifest {
  if (notices === undefined || manifest === undefined) {
    throw new Error("Both committed notice artifacts must exist.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(manifest) as unknown;
  } catch (error) {
    throw new Error(`The committed manifest is not valid JSON: ${String(error)}.`, {
      cause: error,
    });
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("The committed manifest must contain an object.");
  }
  const candidate = parsed as Partial<NoticeManifest>;
  if (candidate.schemaVersion !== 1) {
    throw new Error("The committed manifest has an unexpected schemaVersion.");
  }
  if (candidate.notices === undefined || typeof candidate.notices.sha256 !== "string") {
    throw new Error("The committed manifest does not record the notices digest.");
  }
  const digest = sha256Hex(Buffer.from(notices, "utf8"));
  if (digest !== candidate.notices.sha256) {
    throw new Error(
      `The committed notices digest ${digest} does not match the manifest's ${candidate.notices.sha256}.`,
    );
  }
  if (!Array.isArray(candidate.components)) {
    throw new Error("The committed manifest has no components list.");
  }
  for (const component of candidate.components as unknown[]) {
    if (
      !isRecord(component) ||
      typeof component.name !== "string" ||
      !Array.isArray(component.texts)
    ) {
      throw new Error("The committed manifest has a malformed component entry.");
    }
    for (const text of component.texts as unknown[]) {
      if (
        !isRecord(text) ||
        typeof text.sha256 !== "string" ||
        typeof text.provenance !== "string"
      ) {
        throw new Error("The committed manifest has a malformed text entry.");
      }
      const provenance = text.provenance;
      if (provenance.includes("\\") || provenance.startsWith("/") || provenance.includes("..")) {
        throw new Error("The committed manifest has an unsafe text provenance.");
      }
    }
  }
  return candidate as NoticeManifest;
}

/** Sorts and validates a component list, used by tests and payload inspection. */
export function sortedComponentNames(components: readonly NoticeComponent[]): string[] {
  return [...components]
    .map((component) => `${component.ecosystem}:${component.name}@${component.version}`)
    .sort(compareCodeUnits);
}
