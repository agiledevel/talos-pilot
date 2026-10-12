import { describe, expect, it } from "vitest";
import {
  decideDesktopScope,
  desktopJobsPassed,
  isCommitSha,
  isDocumentationPath,
  parseWorkflowRuns,
} from "./ci-scope";

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

describe("desktop scope decision", () => {
  it("skips the desktop matrix only when every changed path is documentation", () => {
    expect(decideDesktopScope(verified, ["docs/quality.md", "README.md"])).toEqual({
      desktop: false,
      reason: "Only documentation differs from b49ca11, whose desktop jobs passed (2 path(s)).",
    });
    expect(decideDesktopScope(verified, []).desktop).toBe(false);
  });

  it("runs the desktop matrix when one code path is mixed into a documentation change", () => {
    const scope = decideDesktopScope(verified, ["docs/quality.md", "src-tauri/Cargo.lock"]);
    expect(scope.desktop).toBe(true);
    expect(scope.reason).toBe(
      "1 non-documentation path(s) differ from b49ca11: src-tauri/Cargo.lock.",
    );
  });

  it("bounds the paths named in the reason", () => {
    const paths = Array.from({ length: 8 }, (_, index) => `src/file-${String(index)}.ts`);
    expect(decideDesktopScope(verified, paths).reason).toContain("src/file-4.ts, and 3 more.");
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
        ],
      }),
    ).toBe(true);
    expect(
      desktopJobsPassed({
        jobs: [job("desktop (ubuntu-22.04)", "success"), job("desktop (windows-2022)", "failure")],
      }),
    ).toBe(false);
    expect(desktopJobsPassed({ jobs: [job("desktop (ubuntu-22.04)", null)] })).toBe(false);
    // A skipped matrix is reported as one unexpanded `desktop` job.
    expect(
      desktopJobsPassed({ jobs: [job("renderer", "success"), job("desktop", "skipped")] }),
    ).toBe(false);
    expect(() => desktopJobsPassed({ message: "Not Found" })).toThrow("jobs list");
  });
});
