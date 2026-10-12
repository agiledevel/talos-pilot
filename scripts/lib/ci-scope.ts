import { isRecord } from "./validation.ts";

/** A successful `Foundation checks` run that may hold earlier desktop evidence. */
export interface WorkflowRunSummary {
  readonly id: number;
  readonly headSha: string;
}

/** Whether the desktop matrix must run, with the reason printed in the job log. */
export interface DesktopScope {
  readonly desktop: boolean;
  readonly reason: string;
}

const COMMIT_SHA = /^[0-9a-f]{40}$/u;

/** Rejects anything but a full lowercase commit SHA before it reaches a Git argument. */
export function isCommitSha(value: unknown): value is string {
  return typeof value === "string" && COMMIT_SHA.test(value);
}

/**
 * Reads the run list returned by the GitHub workflow-runs API.
 *
 * Runs keep the API's order, newest first. An entry without a numeric id or a
 * full commit SHA makes the whole payload invalid, so a changed API shape is
 * reported instead of being read as "no earlier evidence".
 */
export function parseWorkflowRuns(payload: unknown): WorkflowRunSummary[] {
  if (!isRecord(payload) || !Array.isArray(payload.workflow_runs)) {
    throw new Error("The workflow-runs response has no workflow_runs list.");
  }
  const runs: unknown[] = payload.workflow_runs;
  return runs.map((run) => {
    if (!isRecord(run) || typeof run.id !== "number" || !isCommitSha(run.head_sha)) {
      throw new Error("A workflow run entry has no numeric id or full head commit SHA.");
    }
    return { id: run.id, headSha: run.head_sha };
  });
}

/**
 * Reports whether a run executed the desktop matrix and every desktop job passed.
 *
 * A run that skipped the matrix has no `desktop (<runner>)` job, so it is not
 * evidence and never becomes the comparison base for a later change.
 */
export function desktopJobsPassed(payload: unknown): boolean {
  if (!isRecord(payload) || !Array.isArray(payload.jobs)) {
    throw new Error("The workflow-jobs response has no jobs list.");
  }
  const jobs: unknown[] = payload.jobs;
  const desktop = jobs.filter(
    (job) => isRecord(job) && typeof job.name === "string" && job.name.startsWith("desktop ("),
  );
  return (
    desktop.length > 0 && desktop.every((job) => isRecord(job) && job.conclusion === "success")
  );
}

/**
 * Identifies a path that no desktop job reads: Markdown under `docs/`, Markdown
 * in the repository root, and the agent guidance under `.agents/`.
 *
 * Everything else counts as code. That includes `docs/verification/*.json`,
 * which `pnpm inventory:check` compares against the lockfiles.
 */
export function isDocumentationPath(path: string): boolean {
  if (path.startsWith(".agents/")) {
    return true;
  }
  if (!path.endsWith(".md")) {
    return false;
  }
  return path.startsWith("docs/") || !path.includes("/");
}

/**
 * Decides the desktop scope from the paths that differ from the last commit
 * whose desktop jobs passed.
 */
export function decideDesktopScope(
  verifiedSha: string,
  changedPaths: readonly string[],
): DesktopScope {
  const code = changedPaths.filter((path) => !isDocumentationPath(path));
  const base = verifiedSha.slice(0, 7);
  if (code.length === 0) {
    return {
      desktop: false,
      reason: `Only documentation differs from ${base}, whose desktop jobs passed (${String(changedPaths.length)} path(s)).`,
    };
  }
  const shown = code.slice(0, 5).join(", ");
  const more = code.length > 5 ? `, and ${String(code.length - 5)} more` : "";
  return {
    desktop: true,
    reason: `${String(code.length)} non-documentation path(s) differ from ${base}: ${shown}${more}.`,
  };
}
