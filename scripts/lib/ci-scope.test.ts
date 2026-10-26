import { describe, expect, it } from "vitest";
import { desktopJobsPassed, isCommitSha, isDocumentationPath, parseWorkflowRuns } from "./ci-scope";

const verified = "b49ca11000000000000000000000000000000000";

describe("desktop scope path classification", () => {
  it("treats Markdown under docs, root Markdown, and agent guidance as documentation", () => {
    for (const path of [
      "docs/ci-release.md",
      "docs/plans/foundation-finish/ledger.md",
      "README.md",
      "CHANGELOG.md",
      ".agents/skills/talos-pilot-rust/SKILL.md",
      ".agents/skills/svelte/agents/openai.yaml",
    ]) {
      expect([path, isDocumentationPath(path)]).toEqual([path, true]);
    }
  });

  it("treats checked inputs, workflows, and nested Markdown outside docs as code", () => {
    for (const path of [
      "docs/verification/dependency-inventory.json",
      // Legal artifacts are build inputs: `pnpm notices:check` runs before the
      // Tauri build and compares these exact bytes, so a documentation-only
      // classification would let stale analysis reuse a changed input.
      "legal/THIRD-PARTY-NOTICES.txt",
      "legal/third-party-manifest.json",
      "legal/sources/registry.json",
      "legal/sources/README.md",
      "legal/sources/upstream/kube-LICENSE.txt",
      ".github/workflows/check.yml",
      "src-tauri/src/lib.rs",
      "helper/README.md",
      "assets/README.md",
      "docs/protocol/schema.proto",
      "package.json",
    ]) {
      expect([path, isDocumentationPath(path)]).toEqual([path, false]);
    }
  });
});

describe("GitHub API payload validation", () => {
  it("accepts only full lowercase commit SHAs", () => {
    expect(isCommitSha(verified)).toBe(true);
    for (const value of ["b49ca11", "--upload-pack=x", verified.toUpperCase(), 7, undefined]) {
      expect(isCommitSha(value)).toBe(false);
    }
  });

  it("keeps the API order of workflow runs and rejects malformed entries", () => {
    expect(
      parseWorkflowRuns({
        workflow_runs: [
          { id: 2, head_sha: verified, status: "completed" },
          { id: 1, head_sha: verified.replace("b", "c") },
        ],
      }),
    ).toEqual([
      { id: 2, headSha: verified },
      { id: 1, headSha: verified.replace("b", "c") },
    ]);
    expect(() => parseWorkflowRuns({ message: "Not Found" })).toThrow("workflow_runs");
    expect(() => parseWorkflowRuns({ workflow_runs: [{ id: 1, head_sha: "main" }] })).toThrow(
      "head commit SHA",
    );
    expect(() => parseWorkflowRuns({ workflow_runs: [{ id: "1", head_sha: verified }] })).toThrow(
      "numeric id",
    );
  });

  it("counts a run as desktop evidence only when its desktop jobs ran and all passed", () => {
    const job = (name: string, conclusion: string | null) => ({ name, conclusion });
    expect(
      desktopJobsPassed({
        jobs: [
          job("renderer", "success"),
          job("desktop (ubuntu-22.04)", "success"),
          job("desktop (macos-15)", "success"),
          job("desktop (windows-2022)", "success"),
        ],
      }),
    ).toBe(true);
    expect(
      desktopJobsPassed({
        jobs: [job("desktop (ubuntu-22.04)", "success"), job("desktop (windows-2022)", "failure")],
      }),
    ).toBe(false);
    expect(desktopJobsPassed({ jobs: [job("desktop (ubuntu-22.04)", null)] })).toBe(false);
    expect(desktopJobsPassed({ jobs: [job("desktop (ubuntu-22.04)", "success")] })).toBe(false);
    // A skipped matrix is reported as one unexpanded `desktop` job.
    expect(
      desktopJobsPassed({ jobs: [job("renderer", "success"), job("desktop", "skipped")] }),
    ).toBe(false);
    expect(() => desktopJobsPassed({ message: "Not Found" })).toThrow("jobs list");
  });
});
