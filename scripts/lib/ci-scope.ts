import { isCommitSha, isRecord } from "./validation.ts";

/** A successful `Foundation checks` run that may hold earlier desktop evidence. */
export interface WorkflowRunSummary {
  readonly id: number;
  readonly headSha: string;
}

/** Rejects anything but a full lowercase commit SHA before it reaches a Git argument. */
export { isCommitSha };

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
    ["ubuntu-22.04", "macos-15", "windows-2022"].every((os) =>
      desktop.some((job) => isRecord(job) && job.name === `desktop (${os})`),
    ) && desktop.every((job) => isRecord(job) && job.conclusion === "success")
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
