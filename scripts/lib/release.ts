import { isCommitSha, isRecord } from "./validation.ts";

/** How an artifact run was requested; publication rights differ between them. */
export type ReleaseMode = "release" | "qualification";

/** Rejects malformed tags before they are used as refs, file names, or release metadata. */
export function versionFromTag(tag: string): string {
  if (
    !/^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(?:0|[1-9]\d*))?$/.test(
      tag,
    )
  ) {
    throw new Error(
      "Release tags must be vMAJOR.MINOR.PATCH, optionally with -alpha.N, -beta.N, or -rc.N.",
    );
  }
  return tag.slice(1);
}

/** Rejects a package version that is not a plain semantic version. */
export function validatePackageVersion(value: unknown): string {
  if (
    typeof value !== "string" ||
    !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(?:0|[1-9]\d*))?$/.test(
      value,
    )
  ) {
    throw new Error(
      "The package version must be MAJOR.MINOR.PATCH, optionally with -alpha.N, -beta.N, or -rc.N.",
    );
  }
  return value;
}

/** Reads the requested artifact mode from an environment value. */
export function releaseModeFrom(value: unknown): ReleaseMode {
  if (value === "release" || value === "qualification") return value;
  throw new Error('RELEASE_MODE must be "release" or "qualification".');
}

/**
 * Requires a full immutable commit SHA for a release or qualification build.
 *
 * The workflow layer validates the shape before a dispatch input reaches any
 * checkout or Git argument; this boundary keeps a malformed value from
 * becoming artifact provenance.
 */
export function validateSourceRevision(value: unknown): string {
  if (!isCommitSha(value)) {
    throw new Error("The source revision must be a full lowercase 40-character commit SHA.");
  }
  return value;
}

/**
 * Requires the npm, Tauri and resolved Cargo package versions to agree.
 *
 * Qualification builds have no tag to compare against, so the three package
 * manifests are the only version source. Release builds additionally require
 * the tag to name the same version.
 */
export function validatePackageVersions(npm: unknown, tauri: unknown, cargo: unknown): string {
  if (!isRecord(npm) || !isRecord(tauri) || !isRecord(cargo) || !Array.isArray(cargo.packages)) {
    throw new Error("The npm, Tauri, and Cargo package metadata could not be read.");
  }
  const version = validatePackageVersion(npm.version);
  if (tauri.version !== version) {
    throw new Error("The npm and Tauri package versions must match.");
  }
  const packages: unknown[] = cargo.packages;
  const application = packages.filter((value) => isRecord(value) && value.name === "talos-pilot");
  if (application.length !== 1 || !isRecord(application[0]) || application[0].version !== version) {
    throw new Error("The resolved talos-pilot Cargo package version must match the npm version.");
  }
  return version;
}

/** Requires the npm, Tauri, and resolved Cargo package versions to match the tag. */
export function validateReleaseVersions(
  tag: string,
  npm: unknown,
  tauri: unknown,
  cargo: unknown,
): string {
  const version = versionFromTag(tag);
  if (validatePackageVersions(npm, tauri, cargo) !== version) {
    throw new Error("The release tag must match the npm, Tauri, and Cargo versions.");
  }
  return version;
}

/**
 * Confirms that a requested qualification revision is one immutable, reviewed
 * in-repository commit rather than a tag, a remote URL, or a dangling object.
 *
 * `resolved` is what Git reports for the requested value, `head` is the
 * checked-out commit, and `containingRefs` are the repository branch refs that
 * contain it. Requiring a containing branch keeps qualification source inside
 * this repository while leaving the release-only main-ancestry rule untouched.
 */
export function validateQualificationRevision(input: {
  readonly requested: unknown;
  readonly resolved: string;
  readonly head: string;
  readonly containingRefs: readonly string[];
}): string {
  const revision = validateSourceRevision(input.requested);
  if (input.resolved !== revision) {
    throw new Error("The requested qualification revision did not resolve to itself.");
  }
  if (input.head !== revision) {
    throw new Error("The checked-out source does not match the requested qualification revision.");
  }
  if (input.containingRefs.length === 0) {
    throw new Error(
      "The qualification revision is not reachable from a branch of this repository.",
    );
  }
  return revision;
}

/** Lists the required package extensions for each declared platform's asset build. */
export function requiredAssetExtensions(target: string): readonly string[] {
  switch (target) {
    case "x86_64-unknown-linux-gnu":
      return [".deb", ".rpm", ".AppImage"];
    case "aarch64-apple-darwin":
    case "x86_64-apple-darwin":
      return [".dmg"];
    case "x86_64-pc-windows-msvc":
      return [".exe"];
    default:
      throw new Error(`Unsupported release target: ${target}`);
  }
}
