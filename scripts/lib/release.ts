import { isRecord } from "./validation.ts";

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

/** Requires the npm, Tauri, and resolved Cargo package versions to match the tag. */
export function validateReleaseVersions(
  tag: string,
  npm: unknown,
  tauri: unknown,
  cargo: unknown,
): string {
  const version = versionFromTag(tag);
  if (
    !isRecord(npm) ||
    npm.version !== version ||
    !isRecord(tauri) ||
    tauri.version !== version ||
    !isRecord(cargo) ||
    !Array.isArray(cargo.packages)
  ) {
    throw new Error("The release tag must match the npm, Tauri, and Cargo versions.");
  }
  const packages: unknown[] = cargo.packages;
  const application = packages.filter((value) => isRecord(value) && value.name === "talos-pilot");
  if (application.length !== 1 || !isRecord(application[0]) || application[0].version !== version) {
    throw new Error("The release tag must match the resolved talos-pilot Cargo package.");
  }
  return version;
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
