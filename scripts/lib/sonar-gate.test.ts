import { describe, expect, it } from "vitest";
import { evaluateGate, parseChecks, waitForGate } from "./sonar-gate";
import type { AppCheck } from "./sonar-gate";

const revision = "a".repeat(40);
const name = "SonarCloud Code Analysis";
const success: AppCheck = {
  id: 1,
  name,
  app: "sonarqubecloud",
  revision,
  status: "completed",
  conclusion: "success",
};

describe("SonarCloud app gate", () => {
  it("requires the app identity and the exact analyzed commit", () => {
    expect(evaluateGate([success], revision, name)).toEqual({ status: "passed" });
    expect(evaluateGate([{ ...success, app: "github-actions" }], revision, name)).toEqual({
      status: "pending",
    });
    expect(evaluateGate([{ ...success, revision: "b".repeat(40) }], revision, name)).toEqual({
      status: "pending",
    });
    expect(evaluateGate([], revision, name)).toEqual({ status: "pending" });
  });
  it("does not accept an older success when a newer rerun failed or is pending", () => {
    expect(
      evaluateGate([success, { ...success, id: 2, conclusion: "failure" }], revision, name).status,
    ).toBe("failed");
    expect(
      evaluateGate(
        [success, { ...success, id: 2, status: "in_progress", conclusion: null }],
        revision,
        name,
      ).status,
    ).toBe("pending");
    expect(evaluateGate([{ ...success, conclusion: "skipped" }], revision, name).status).toBe(
      "failed",
    );
  });
  it("validates actual wire fields and rejects malformed responses", () => {
    expect(
      parseChecks({
        check_runs: [
          {
            id: 1,
            name,
            app: { slug: "sonarqubecloud" },
            head_sha: revision,
            status: "completed",
            conclusion: "success",
          },
        ],
      }),
    ).toEqual([success]);
    expect(() => parseChecks({ check_runs: [{ id: 1 }] })).toThrow("invalid check identity");
    expect(() => parseChecks({})).toThrow("invalid check response");
  });
  it("times out missing analyses with an injected clock and no real sleep", async () => {
    let clock = 0;
    let reads = 0;
    await expect(
      waitForGate(
        async () => {
          reads += 1;
          return [];
        },
        {
          revision,
          name,
          timeoutMs: 30,
          intervalMs: 10,
          now: () => clock,
          wait: async (milliseconds) => {
            clock += milliseconds;
          },
        },
      ),
    ).rejects.toThrow("before the deadline");
    expect(reads).toBe(3);
  });
  it("stops immediately for failed checks or unavailable GitHub responses", async () => {
    const options = {
      revision,
      name,
      timeoutMs: 30,
      intervalMs: 10,
      now: () => 0,
      wait: async () => {},
    };
    await expect(
      waitForGate(async () => [{ ...success, conclusion: "failure" }], options),
    ).rejects.toThrow("failure");
    await expect(
      waitForGate(async () => {
        throw new Error("GitHub unavailable");
      }, options),
    ).rejects.toThrow("GitHub unavailable");
    await expect(waitForGate(async () => [success], options)).resolves.toBeUndefined();
  });
});
