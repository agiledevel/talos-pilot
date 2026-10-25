import { describe, expect, it } from "vitest";

import { admitChartSnapshot } from "./chartSnapshot";
import type { ChartSnapshot } from "./chartSnapshot";
import { syntheticChartProposal } from "./chartSamples";
import { ChartSurfaceState } from "./chartSurfaceState.svelte";

function snapshot(count: number, seriesCount = 2): ChartSnapshot {
  const admission = admitChartSnapshot(syntheticChartProposal("sample", 0));
  if (!admission.accepted || admission.snapshot === null) {
    throw new Error("sample proposal must be admitted");
  }
  return {
    time: admission.snapshot.time.slice(0, count),
    series: admission.snapshot.series.slice(0, seriesCount).map((entry) => ({
      ...entry,
      values: entry.values.slice(0, count),
    })),
  };
}

describe("chart surface state", () => {
  it("starts idle and resets every projection field", () => {
    const state = new ChartSurfaceState();
    expect(state.status).toBe("idle");
    state.accepted(snapshot(4), 1);
    state.rejected("no");
    state.reset();
    expect(state.status).toBe("idle");
    expect(state.notice).toBeNull();
    expect(state.rejection).toBeNull();
    expect(state.failure).toBeNull();
    expect(state.retainedSamples).toBe(0);
    expect(state.retainedSeries).toBe(0);
    expect(state.summary).toEqual([]);
  });

  it("publishes admitted sizes, a bounded summary, and an eviction notice", () => {
    const state = new ChartSurfaceState();
    state.accepted(snapshot(4), 0);
    expect(state.status).toBe("ready");
    expect(state.notice).toBeNull();
    expect(state.retainedSamples).toBe(4);
    expect(state.retainedSeries).toBe(2);
    expect(state.summary).toHaveLength(2);
    expect(state.summary[0]).toMatchObject({ id: "synthetic-0" });
    expect(Object.keys(state.summary[0] ?? {})).toEqual([
      "id",
      "label",
      "latest",
      "minimum",
      "maximum",
    ]);

    state.accepted(snapshot(4), 1);
    expect(state.notice).toContain("newest 4 aligned samples");
    expect(state.notice).toContain("evicted 1 older sample");
  });

  it("clears plotted data explicitly and preserves it across a rejection", () => {
    const state = new ChartSurfaceState();
    state.accepted(snapshot(4), 0);
    state.rejected("The synthetic chart requires aligned arrays.");
    expect(state.status).toBe("ready");
    expect(state.retainedSamples).toBe(4);
    expect(state.summary).toHaveLength(2);
    expect(state.rejection).toContain("aligned arrays");

    state.empty();
    expect(state.status).toBe("empty");
    expect(state.summary).toEqual([]);
    expect(state.retainedSamples).toBe(0);
    expect(state.rejection).toBeNull();

    state.accepted(snapshot(3), 0);
    expect(state.status).toBe("ready");
    expect(state.retainedSamples).toBe(3);
  });

  it("reports a failure and releases the projection", () => {
    const state = new ChartSurfaceState();
    state.accepted(snapshot(4), 0);
    state.fail("The synthetic chart could not be rendered.");
    expect(state.status).toBe("failed");
    expect(state.failure).toContain("could not be rendered");
    expect(state.summary).toEqual([]);
    expect(state.retainedSamples).toBe(0);
    expect(state.notice).toBeNull();
  });
});
