import { execFile, execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const exec = promisify(execFile);
const script = resolve("scripts/ci-desktop-scope.ts");

interface Scenario {
  readonly paths?: readonly string[];
  readonly missingEvidence?: boolean;
  readonly malformed?: boolean;
  readonly apiFailure?: boolean;
  readonly newBase?: boolean;
  readonly event?: string;
}

async function scope(
  scenario: Scenario = {},
): Promise<{ output: string; log: string; requests: number }> {
  const directory = mkdtempSync(join(tmpdir(), "talos-ci-scope-"));
  let requests = 0;
  const git = (...args: string[]): string =>
    execFileSync("git", args, {
      cwd: directory,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  const commit = (): string => {
    git(
      "-c",
      "user.name=Fixture",
      "-c",
      "user.email=fixture@example.invalid",
      "commit",
      "--allow-empty",
      "-m",
      "fixture",
    );
    return git("rev-parse", "HEAD");
  };
  git("init");
  const verified = commit();
  let head = verified;
  for (const path of scenario.paths ?? ["docs/ledger.md"]) {
    mkdirSync(dirname(join(directory, path)), { recursive: true });
    writeFileSync(join(directory, path), "fixture\n");
    git("add", "--", path);
    head = commit();
  }
  const server = createServer((request, response) => {
    requests += 1;
    response.setHeader("content-type", "application/json");
    if (scenario.apiFailure) {
      response.writeHead(503).end(JSON.stringify({ message: "unavailable" }));
      return;
    }
    if (scenario.malformed) {
      response.end(JSON.stringify({ workflow_runs: "invalid" }));
      return;
    }
    response.end(
      JSON.stringify(
        request.url?.includes("/jobs?")
          ? {
              jobs: ["rust", "actions", "javascript-typescript"].map((language) => ({
                name: `CodeQL (${language})`,
                conclusion: "success",
                steps: [
                  {
                    name: "Require zero CodeQL results",
                    conclusion: scenario.missingEvidence ? "skipped" : "success",
                  },
                ],
              })),
            }
          : { workflow_runs: [{ id: 1, head_sha: verified }] },
      ),
    );
  });
  try {
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    const address = server.address();
    if (address === null || typeof address === "string") {
      throw new Error("No fixture server port.");
    }
    const output = join(directory, "outputs");
    writeFileSync(output, "");
    const result = await exec(process.execPath, [script], {
      cwd: directory,
      timeout: 10_000,
      env: {
        ...process.env,
        CI_SCOPE_WORKFLOW: "security.yml",
        GITHUB_API_URL: `http://127.0.0.1:${String(address.port)}`,
        GITHUB_REPOSITORY: "fixture/repo",
        GITHUB_TOKEN: "synthetic-fixture-token",
        GITHUB_RUN_ID: "2",
        GITHUB_EVENT_NAME: scenario.event ?? "pull_request",
        PULL_REQUEST_HEAD_SHA: head,
        PULL_REQUEST_BASE_SHA: scenario.newBase ? head : verified,
        GITHUB_OUTPUT: output,
        GITHUB_STEP_SUMMARY: join(directory, "summary"),
      },
    });
    return { output: readFileSync(output, "utf8"), log: result.stdout, requests };
  } finally {
    await new Promise<void>((resolveClose, rejectClose) =>
      server.close((error) => (error === undefined ? resolveClose() : rejectClose(error))),
    );
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("CI scope CLI evidence boundary", () => {
  it("reuses documentation changes only from genuinely executed ancestor analysis", async () => {
    const result = await scope();
    expect(result.output).toContain("rust=false");
    expect(result.log).toContain("REUSE (not a fresh execution)");
    expect((await scope({ missingEvidence: true })).output).toContain("rust=true");
  });

  it("does not hide an unverified Rust change behind a later documentation edit", async () => {
    const result = await scope({ paths: ["src-tauri/src/lib.rs", "docs/ledger.md"] });
    expect(result.output).toContain("rust=true");
    expect(result.output).toContain("javascript-typescript=false");
  });

  it("fails closed on an unreadable API, malformed evidence, or changed base", async () => {
    for (const scenario of [{ apiFailure: true }, { malformed: true }, { newBase: true }]) {
      const result = await scope(scenario);
      expect(result.output).toContain("rust=true");
      expect(result.output).not.toContain("=false");
    }
  });

  it("never skips or queries previous evidence on main, release, manual or scheduled runs", async () => {
    for (const event of ["push", "workflow_call", "workflow_dispatch", "schedule"]) {
      const result = await scope({ event });
      expect(result.requests).toBe(0);
      expect(result.output).not.toContain("=false");
    }
  });
});
