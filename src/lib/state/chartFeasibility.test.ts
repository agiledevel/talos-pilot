import { describe, expect, it } from "vitest";

import { ChartFeasibilityState } from "./chartFeasibility.svelte";
import { CHART_SAMPLE_LIMIT } from "../../features/charts/chartSnapshot";

describe("chart feasibility owner", () => {
  it("generates ordinary samples on demand and increments the revision once", () => {
    const feasibility = new ChartFeasibilityState();
    expect(feasibility.revision).toBe(0);
    const first = feasibility.readSnapshot();
    expect(first.series).toHaveLength(2);

    feasibility.nextSample();
    expect(feasibility.revision).toBe(1);
    const second = feasibility.readSnapshot();
    expect(second.time[0]).toBeGreaterThan(first.time.at(-1) ?? Number.NEGATIVE_INFINITY);
  });

  it("records only the requested kind, not the variable data", () => {
    const feasibility = new ChartFeasibilityState();
    feasibility.propose("eight-series");
    const full = feasibility.readSnapshot();
    expect(full.series).toHaveLength(8);
    expect(full.time).toHaveLength(CHART_SAMPLE_LIMIT);

    feasibility.propose("over-sample");
    expect(feasibility.readSnapshot().time).toHaveLength(CHART_SAMPLE_LIMIT + 1);
    feasibility.propose("ninth-series");
    expect(feasibility.readSnapshot().series).toHaveLength(9);
    feasibility.propose("empty");
    expect(feasibility.readSnapshot().time).toHaveLength(0);
    expect(feasibility.revision).toBe(4);
  });

  it("resets the visible projection on close and exposes a lazy surface", () => {
    const feasibility = new ChartFeasibilityState();
    feasibility.view.empty();
    expect(feasibility.view.status).toBe("empty");
    feasibility.close();
    expect(feasibility.view.status).toBe("idle");
    expect(feasibility.surface.status).toBe("closed");
    expect(feasibility.surface.surface).toBeNull();
  });
});
