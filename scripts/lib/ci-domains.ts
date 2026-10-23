import { isDocumentationPath } from "./ci-scope.ts";
import { isRecord } from "./validation.ts";

/** Independently evidenced CI domains; unknown inputs affect every domain. */
export const CI_DOMAINS = [
  "desktop",
  "renderer",
  "actions",
  "javascript-typescript",
  "rust",
] as const;

/** A check domain whose earlier passing execution can be reused on a PR. */
export type CiDomain = (typeof CI_DOMAINS)[number];

/** Tests whether a path can change the inputs to a domain. Unknown paths fail closed. */
export function affectsDomain(domain: CiDomain, path: string): boolean {
  if (isDocumentationPath(path)) {
    return false;
  }
  if (domain === "desktop" || domain === "renderer") {
    return true;
  }
  // Narrow source roots only. Build scripts, schemas, lockfiles, configuration,
  // workflows and unknown paths deliberately rescan every language.
  if (
    (path.startsWith("src/") ||
      path.startsWith("tests/e2e/") ||
      path.startsWith("tests/native/")) &&
    /\.(ts|svelte|css|html)$/u.test(path)
  ) {
    return domain === "javascript-typescript";
  }
  if (
    (path.startsWith("src-tauri/src/") ||
      path.startsWith("src-tauri/tests/") ||
      path.startsWith("src-tauri/examples/")) &&
    path.endsWith(".rs")
  ) {
    return domain === "rust";
  }
  return true;
}

/** Recognises a real successful execution, never a reused or skipped check. */
export function domainExecuted(domain: CiDomain, payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new Error("The workflow-jobs response has no jobs list.");
  }
  const jobs: unknown[] = payload.jobs;
  const name = domain === "renderer" ? "renderer" : `CodeQL (${domain})`;
  const names =
    domain === "renderer" ? ["Verify renderer", "Run pnpm check"] : ["Require zero CodeQL results"];
  return jobs.some((job) => {
    if (
      !isRecord(job) ||
      job.name !== name ||
      job.conclusion !== "success" ||
      !Array.isArray(job.steps)
    ) {
      return false;
    }
    const steps: unknown[] = job.steps;
    return steps.some(
      (step) =>
        isRecord(step) && names.includes(String(step.name)) && step.conclusion === "success",
    );
  });
}

/** Paths and provenance for one domain's fresh or reused result. */
export interface DomainDecision {
  readonly run: boolean;
  readonly reason: string;
}

/** Compares all changes against actually executed evidence, not the last push. */
export function decideDomain(
  domain: CiDomain,
  sha: string,
  paths: readonly string[],
): DomainDecision {
  const affected = paths.filter((path) => affectsDomain(domain, path));
  return {
    run: affected.length > 0,
    reason:
      affected.length === 0
        ? `Unchanged ${domain} inputs since executed evidence at ${sha.slice(0, 7)}.`
        : `${domain}: ${String(affected.length)} affected path(s) since ${sha.slice(0, 7)}: ${affected.slice(0, 5).join(", ")}.`,
  };
}
