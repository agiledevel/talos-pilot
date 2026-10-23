import { describe, expect, it } from "vitest";
import { CI_DOMAINS, affectsDomain, decideDomain, domainExecuted } from "./ci-domains";

const sha = "b49ca11000000000000000000000000000000000";

describe("CI domains", () => {
  it("reuses documentation inputs but treats build inputs and unknown paths conservatively", () => {
    for (const domain of CI_DOMAINS) {
      expect(decideDomain(domain, sha, ["docs/quality.md", "README.md"]).run).toBe(false);
      for (const path of [
        "package.json",
        "pnpm-lock.yaml",
        "src-tauri/Cargo.lock",
        "scripts/ci-desktop-scope.ts",
        "proto/helper.proto",
        ".github/actions/a/action.yml",
        "new-root/input.json",
        "tests/fixtures/synthetic-ca.base64",
        "src/unknown.rs",
      ]) {
        expect([domain, path, affectsDomain(domain, path)]).toEqual([domain, path, true]);
      }
    }
  });

  it("scopes source languages without skipping desktop or renderer integration checks", () => {
    expect(affectsDomain("rust", "src/components/Editor.svelte")).toBe(false);
    expect(affectsDomain("javascript-typescript", "src/components/Editor.svelte")).toBe(true);
    expect(affectsDomain("rust", "src-tauri/src/lib.rs")).toBe(true);
    expect(affectsDomain("javascript-typescript", "src-tauri/src/lib.rs")).toBe(false);
    expect(affectsDomain("actions", "src-tauri/tests/storage.rs")).toBe(false);
    expect(affectsDomain("desktop", "src/components/Editor.svelte")).toBe(true);
    expect(affectsDomain("renderer", "src-tauri/src/lib.rs")).toBe(true);
    expect(decideDomain("rust", sha, ["docs/quality.md", "src-tauri/src/lib.rs"]).run).toBe(true);
  });

  it("bounds diagnostic output", () => {
    const paths = Array.from({ length: 8 }, (_, i) => `unknown/${String(i)}`);
    const decision = decideDomain("rust", sha, paths);
    expect(decision.reason).toContain("unknown/4");
    expect(decision.reason).not.toContain("unknown/5");
  });

  it("requires an executed zero-findings step, not just a green CodeQL job", () => {
    const job = (conclusion: string, step: string) => ({
      name: "CodeQL (rust)",
      conclusion: "success",
      steps: [{ name: step, conclusion }],
    });
    expect(domainExecuted("rust", { jobs: [job("success", "Require zero CodeQL results")] })).toBe(
      true,
    );
    expect(domainExecuted("rust", { jobs: [job("skipped", "Require zero CodeQL results")] })).toBe(
      false,
    );
    expect(domainExecuted("rust", { jobs: [job("success", "Reused evidence")] })).toBe(false);
    expect(
      domainExecuted("rust", { jobs: [{ name: "CodeQL (rust)", conclusion: "success" }] }),
    ).toBe(false);
    expect(() => domainExecuted("rust", { jobs: null })).toThrow("jobs list");
  });

  it("accepts old and new full renderer commands but never format-only evidence", () => {
    for (const step of ["Run pnpm check", "Verify renderer"]) {
      expect(
        domainExecuted("renderer", {
          jobs: [
            {
              name: "renderer",
              conclusion: "success",
              steps: [{ name: step, conclusion: "success" }],
            },
          ],
        }),
      ).toBe(true);
    }
    expect(
      domainExecuted("renderer", {
        jobs: [
          {
            name: "renderer",
            conclusion: "success",
            steps: [{ name: "Check documentation formatting", conclusion: "success" }],
          },
        ],
      }),
    ).toBe(false);
  });
});
