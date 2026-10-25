import { describe, expect, it } from "vitest";

import { TerminalFeasibilityState } from "./terminalFeasibility.svelte";
import { TERMINAL_BYTE_LIMIT, TERMINAL_LINE_LIMIT } from "../../features/terminal/terminalSnapshot";

describe("terminal feasibility owner", () => {
  it("generates ordinary samples on demand and increments the revision once", () => {
    const feasibility = new TerminalFeasibilityState();
    expect(feasibility.revision).toBe(0);
    const first = feasibility.readSnapshot();
    expect(first).toContain("run 1");
    expect(first).toContain("completed 24 steps");

    feasibility.nextSample();
    expect(feasibility.revision).toBe(1);
    const second = feasibility.readSnapshot();
    expect(second).toContain("run 2");
    expect(second).not.toBe(first);
  });

  it("records only the requested kind, not the oversized payload", () => {
    const feasibility = new TerminalFeasibilityState();
    feasibility.propose("byte-over");
    expect(feasibility.revision).toBe(1);
    // Newly generated each call, and never retained between reads.
    expect(feasibility.readSnapshot()).toHaveLength(TERMINAL_BYTE_LIMIT + 1);
    expect(feasibility.readSnapshot()).toHaveLength(TERMINAL_BYTE_LIMIT + 1);

    feasibility.propose("line-over");
    expect(feasibility.readSnapshot().split("\n").length - 1).toBe(TERMINAL_LINE_LIMIT + 1);
    feasibility.propose("long-line");
    expect(feasibility.readSnapshot().endsWith(" NEWEST-TAIL")).toBe(true);

    feasibility.propose("empty");
    expect(feasibility.readSnapshot()).toBe("");
    feasibility.propose("control");
    expect(feasibility.readSnapshot()).toContain("\u001b[31m");
  });

  it("resets the visible projection on close and exposes a lazy surface", () => {
    const feasibility = new TerminalFeasibilityState();
    feasibility.view.accepted({
      accepted: true,
      text: "x\n",
      bytes: 2,
      lines: 1,
      evictedLines: 0,
      evictedBytes: 0,
      partialLine: false,
    });
    expect(feasibility.view.status).toBe("ready");
    feasibility.close();
    expect(feasibility.view.status).toBe("idle");
    expect(feasibility.surface.status).toBe("closed");
    expect(feasibility.surface.surface).toBeNull();
  });
});
