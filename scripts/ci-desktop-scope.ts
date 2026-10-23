import { execFileSync, spawnSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import process from "node:process";

import { decideDomain, domainExecuted } from "./lib/ci-domains.ts";
import type { CiDomain, DomainDecision } from "./lib/ci-domains.ts";
import { desktopJobsPassed, isCommitSha, parseWorkflowRuns } from "./lib/ci-scope.ts";

const MAX_RUNS = 50;
const MAX_JOB_LOOKUPS = 10;
const API_TIMEOUT_MS = 20_000;

function required(name: string): string {
  const value = process.env[name];
  if (value === undefined || value === "") {
    throw new Error(`Set ${name}.`);
  }
  return value;
}

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

function isAncestor(candidate: string, head: string): boolean {
  return (
    spawnSync("git", ["merge-base", "--is-ancestor", candidate, head], { stdio: "ignore" })
      .status === 0
  );
}

function changedPaths(base: string, head: string): string[] {
  return execFileSync("git", ["diff", "--no-renames", "--name-only", "-z", base, head], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  })
    .split("\0")
    .filter((path) => path !== "");
}

/** Missing or unreadable evidence always requests fresh checks. */
async function decide(domains: readonly CiDomain[]): Promise<Map<CiDomain, DomainDecision>> {
  const event = required("GITHUB_EVENT_NAME");
  const decisions = new Map<CiDomain, DomainDecision>(
    domains.map((domain) => [
      domain,
      {
        run: true,
        reason:
          event === "pull_request"
            ? "No compatible executed evidence found."
            : `A ${event} run always executes every domain.`,
      },
    ]),
  );
  if (event !== "pull_request") {
    return decisions;
  }
  const head = process.env.PULL_REQUEST_HEAD_SHA;
  const base = process.env.PULL_REQUEST_BASE_SHA;
  if (!isCommitSha(head) || !isCommitSha(base)) {
    throw new Error("Set PULL_REQUEST_HEAD_SHA and PULL_REQUEST_BASE_SHA to full commit SHAs.");
  }
  const workflow = required("CI_SCOPE_WORKFLOW");
  if (workflow !== "check.yml" && workflow !== "security.yml") {
    throw new Error("Unsupported scope workflow.");
  }
  const runs = parseWorkflowRuns(
    await github(`/actions/workflows/${workflow}/runs?status=success&per_page=${String(MAX_RUNS)}`),
  );
  const pending = new Set(domains);
  let lookups = 0;
  for (const run of runs) {
    // The base must already be contained in the verified head. Otherwise a new
    // base could affect the merge even when the PR head changed only Markdown.
    if (
      run.id === Number(required("GITHUB_RUN_ID")) ||
      !isAncestor(run.headSha, head) ||
      !isAncestor(base, run.headSha)
    ) {
      continue;
    }
    if (lookups === MAX_JOB_LOOKUPS || pending.size === 0) {
      break;
    }
    lookups += 1;
    const jobs = await github(`/actions/runs/${String(run.id)}/jobs?per_page=100`);
    for (const domain of pending) {
      if (domain === "desktop" ? desktopJobsPassed(jobs) : domainExecuted(domain, jobs)) {
        decisions.set(domain, decideDomain(domain, run.headSha, changedPaths(run.headSha, head)));
        pending.delete(domain);
      }
    }
  }
  return decisions;
}

const domains: readonly CiDomain[] =
  process.env.CI_SCOPE_WORKFLOW === "security.yml"
    ? ["actions", "javascript-typescript", "rust"]
    : ["desktop", "renderer"];
let decisions: Map<CiDomain, DomainDecision>;
try {
  decisions = await decide(domains);
} catch (error: unknown) {
  const detail = (error instanceof Error ? error.message : String(error)).replace(/\s+/gu, " ");
  console.info(
    `::warning title=CI scope::Earlier evidence could not be read (${detail}); running every domain.`,
  );
  decisions = new Map(
    domains.map((domain) => [domain, { run: true, reason: "Earlier evidence could not be read." }]),
  );
}
for (const [domain, decision] of decisions) {
  if (process.env.GITHUB_OUTPUT !== undefined) {
    appendFileSync(process.env.GITHUB_OUTPUT, `${domain}=${String(decision.run)}\n`);
  }
  const message = `${domain}: ${decision.run ? "RUN" : "REUSE (not a fresh execution)"} — ${decision.reason}`;
  console.info(message);
  if (process.env.GITHUB_STEP_SUMMARY !== undefined) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${message}\n\n`);
  }
}
