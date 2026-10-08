import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { validateReleaseVersions, versionFromTag } from "./lib/release.ts";

const tag = process.env.RELEASE_TAG;
if (tag === undefined) throw new Error("Set RELEASE_TAG to the version tag being built.");
versionFromTag(tag);
const revision = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const tagRevision = execFileSync("git", ["rev-parse", `${tag}^{commit}`], {
  encoding: "utf8",
}).trim();
if (tagRevision !== revision)
  throw new Error("The checked-out source does not match the requested release tag.");
execFileSync("git", ["merge-base", "--is-ancestor", revision, "origin/main"]);
const version = validateReleaseVersions(
  tag,
  JSON.parse(readFileSync("package.json", "utf8")),
  JSON.parse(readFileSync("src-tauri/tauri.conf.json", "utf8")),
  JSON.parse(
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
  ),
);
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
const range = previous === undefined ? revision : `${previous}..${revision}`;
if (process.env.GITHUB_OUTPUT !== undefined) {
  appendFileSync(
    process.env.GITHUB_OUTPUT,
    `version=${version}\ntag=${tag}\nrevision=${revision}\nrange=${range}\n`,
  );
}
console.info(`Release source validated: ${tag} at ${revision}.`);
