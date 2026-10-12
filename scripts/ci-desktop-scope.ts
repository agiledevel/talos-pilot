import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";

import {
  decideDesktopScope,
  desktopJobsPassed,
  isCommitSha,
  parseWorkflowRuns,
} from "./lib/ci-scope.ts";
import type { DesktopScope } from "./lib/ci-scope.ts";

/** Successful runs inspected, newest first; older evidence is treated as absent. */
const MAX_RUNS = 50;
/** Bound on per-run job lookups, so a long history cannot stall the job. */
const MAX_JOB_LOOKUPS = 10;
const API_TIMEOUT_MS = 20_000;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

/** Reads one repository-scoped GitHub API resource with the job's read-only token. */
async function github(path: string): Promise<unknown> {
  const base = process.env.GITHUB_API_URL ?? "https://api.github.com";
  const response = await fetch(`${base}/repos/${required("GITHUB_REPOSITORY")}${path}`, {
    headers: {
      accept: "application/vnd.github+json",
      authorization: `Bearer ${required("GITHUB_TOKEN")}`,
      "x-github-api-version": "2022-11-28",
    },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`GitHub API ${path} returned HTTP ${String(response.status)}.`);
  }
  return (await response.json()) as unknown;
}

/**
 * Reports whether `candidate` is in the history of `head`. A commit missing
 * from the clone, such as one removed by a force-push, is not an ancestor.
 */
function isAncestor(candidate: string, head: string): boolean {
  const result = spawnSync("git", ["merge-base", "--is-ancestor", candidate, head], {
    stdio: "ignore",
  });
  return result.status === 0;
}

/** Lists every path that differs between two trees; a rename reports both names. */
function changedPaths(base: string, head: string): string[] {
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, head], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter((path) => path !== "");
}

/**
 * Finds the newest ancestor commit whose desktop jobs passed and compares the
 * pull request head against it. Comparing against the last passing commit, not
 * the previous push, keeps a cancelled or failed code run from being hidden by
 * a later documentation-only push.
 */
async function decide(): Promise<DesktopScope> {
  const event = required("GITHUB_EVENT_NAME");
  if (event !== "pull_request") {
    return { desktop: true, reason: `A ${event} run always executes the desktop matrix.` };
  }
  const head = process.env.PULL_REQUEST_HEAD_SHA;
  if (!isCommitSha(head)) {
    throw new Error("Set PULL_REQUEST_HEAD_SHA to the pull request's head commit.");
  }
  const currentRun = Number(required("GITHUB_RUN_ID"));
  const runs = parseWorkflowRuns(
    await github(`/actions/workflows/check.yml/runs?status=success&per_page=${String(MAX_RUNS)}`),
  );
  let lookups = 0;
  for (const run of runs) {
    if (run.id === currentRun || !isAncestor(run.headSha, head)) {
      continue;
    }
    if (lookups === MAX_JOB_LOOKUPS) {
      break;
    }
    lookups += 1;
    if (desktopJobsPassed(await github(`/actions/runs/${String(run.id)}/jobs?per_page=100`))) {
      return decideDesktopScope(run.headSha, changedPaths(run.headSha, head));
    }
  }
  return {
    desktop: true,
    reason: "No earlier run with passing desktop jobs is an ancestor of this commit.",
  };
}

let scope: DesktopScope;
try {
  scope = await decide();
} catch (error: unknown) {
  // Missing evidence must never skip the matrix, so an unreadable API or
  // history runs it and says why in the run's annotations.
  const detail = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ");
  console.info(
    `::warning title=Desktop scope::Earlier desktop evidence could not be read (${detail}); running the desktop matrix.`,
  );
  scope = { desktop: true, reason: "Earlier desktop evidence could not be read." };
}

if (process.env.GITHUB_OUTPUT !== undefined) {
  appendFileSync(process.env.GITHUB_OUTPUT, `desktop=${String(scope.desktop)}\n`);
}
console.info(`Desktop matrix ${scope.desktop ? "runs" : "is skipped"}: ${scope.reason}`);
