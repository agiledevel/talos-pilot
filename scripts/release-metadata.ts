import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";

import {
  releaseModeFrom,
  validatePackageVersions,
  validateQualificationRevision,
  validateReleaseVersions,
  validateSourceRevision,
  versionFromTag,
} from "./lib/release.ts";

/**
 * Validates the source of one artifact build and writes its identity for later
 * jobs.
 *
 * Release mode keeps every publication guard: a real tag, a checkout equal to
 * the tag commit, main ancestry, and npm/Tauri/Cargo versions equal to the tag.
 * Qualification mode has no tag and no publication identity; it requires one
 * immutable commit that is reachable from a branch of this repository and
 * matching package versions. Both modes record the resolved commit, which the
 * build, Go helper and Rust binary then embed.
 */

function git(...args: string[]): string {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function readCargoMetadata(): unknown {
  return JSON.parse(
    execFileSync(
      "cargo",
      [
        "metadata",
        "--manifest-path",
        "src-tauri/Cargo.toml",
        "--locked",
        "--no-deps",
        "--format-version",
        "1",
      ],
      { encoding: "utf8" },
    ),
  );
}

function readPackageInputs(): { npm: unknown; tauri: unknown; cargo: unknown } {
  return {
    npm: JSON.parse(readFileSync("package.json", "utf8")),
    tauri: JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")),
    cargo: readCargoMetadata(),
  };
}

const mode = releaseModeFrom(process.env.RELEASE_MODE ?? "release");
const head = git("rev-parse", "HEAD");
const inputs = readPackageInputs();
let revision: string;
let version: string;
let tag = "";
let range: string;

if (mode === "release") {
  const requestedTag = process.env.RELEASE_TAG;
  if (requestedTag === undefined || requestedTag === "") {
    throw new Error("Set RELEASE_TAG to the version tag being built.");
  }
  versionFromTag(requestedTag);
  if (process.env.RELEASE_REVISION !== undefined && process.env.RELEASE_REVISION !== "") {
    throw new Error("Release mode resolves its revision from the tag, not RELEASE_REVISION.");
  }
  revision = head;
  if (git("rev-parse", `${requestedTag}^{commit}`) !== revision) {
    throw new Error("The checked-out source does not match the requested release tag.");
  }
  execFileSync("git", ["merge-base", "--is-ancestor", revision, "origin/main"]);
  version = validateReleaseVersions(requestedTag, inputs.npm, inputs.tauri, inputs.cargo);
  tag = requestedTag;
  const previous = execFileSync(
    "git",
    ["tag", "--merged", `${revision}^`, "--sort=-version:refname"],
    { encoding: "utf8" },
  )
    .split("\n")
    .find((candidate) =>
      /^v(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)(?:-(?:alpha|beta|rc)\.(?:0|[1-9]\d*))?$/.test(
        candidate,
      ),
    );
  range = previous === undefined ? revision : `${previous}..${revision}`;
} else {
  if (process.env.RELEASE_TAG !== undefined && process.env.RELEASE_TAG !== "") {
    throw new Error("Qualification mode does not accept a release tag.");
  }
  const requested = validateSourceRevision(process.env.RELEASE_REVISION);
  revision = validateQualificationRevision({
    requested,
    resolved: git("rev-parse", "--verify", `${requested}^{commit}`),
    head,
    containingRefs: execFileSync(
      "git",
      [
        "for-each-ref",
        "--contains",
        requested,
        "--format=%(refname)",
        "refs/heads",
        "refs/remotes",
      ],
      { encoding: "utf8" },
    )
      .split("\n")
      .filter((ref) => ref.length > 0),
  });
  version = validatePackageVersions(inputs.npm, inputs.tauri, inputs.cargo);
  range = revision;
}

if (process.env.GITHUB_OUTPUT !== undefined) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `mode=${mode}\nversion=${version}\ntag=${tag}\nrevision=${revision}\nrange=${range}\n`,
  );
}
console.info(
  `${mode === "release" ? "Release" : "Qualification"} source validated: version ${version} at ${revision}.`,
);
