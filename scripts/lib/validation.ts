/** Narrows JSON objects at CLI/API boundaries without trusting a wire declaration. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A full lowercase Git commit SHA, as GitHub resolves a source revision. */
const COMMIT_SHA = /^[0-9a-f]{40}$/u;

/**
 * Rejects anything but a full lowercase commit SHA before it reaches a Git
 * argument, a checkout or release metadata.
 *
 * Short SHAs, tags, branch names and ref syntax (`^`, `~`, `..`) are rejected:
 * a release or qualification artifact must name one immutable commit.
 */
export function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && COMMIT_SHA.test(value);
}
