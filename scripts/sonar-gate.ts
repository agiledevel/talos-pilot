import { setTimeout } from "node:timers/promises";
import { parseChecks, waitForGate } from "./lib/sonar-gate.ts";

const repository = process.env.GITHUB_REPOSITORY;
const revision = process.env.ANALYSIS_SHA;
const token = process.env.GITHUB_TOKEN;
const name = process.env.SONAR_CHECK_NAME || "SonarCloud Code Analysis";
if (
  repository === undefined ||
  !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) ||
  revision === undefined ||
  !/^[a-f0-9]{40}$/.test(revision) ||
  !token ||
  name.length > 100
) {
  throw new Error(
    "A valid repository, analysis SHA, GitHub token, and SonarCloud check name are required.",
  );
}
const endpoint = new URL(
  `https://api.github.com/repos/${repository}/commits/${revision}/check-runs`,
);
endpoint.searchParams.set("check_name", name);
endpoint.searchParams.set("filter", "latest");
endpoint.searchParams.set("per_page", "100");
await waitForGate(
  async () => {
    const response = await fetch(endpoint, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok)
      throw new Error(`Reading SonarCloud checks failed: GitHub HTTP ${response.status}.`);
    const checks = parseChecks(await response.json());
    if (checks.length >= 100)
      throw new Error("The check response exceeds the gate's bounded projection.");
    return checks;
  },
  {
    revision,
    name,
    timeoutMs: 600_000,
    intervalMs: 15_000,
    now: Date.now,
    wait: async (milliseconds) => {
      await setTimeout(milliseconds);
    },
  },
);
console.info(`SonarCloud quality gate passed for ${revision}.`);
