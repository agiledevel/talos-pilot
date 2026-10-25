import { describe, expect, it } from "vitest";

import { CHART_SAMPLE_LIMIT, CHART_SERIES_LIMIT, admitChartSnapshot } from "./chartSnapshot";
import type { ChartProposal, ChartRejection } from "./chartSnapshot";
import {
  CHART_SAMPLE_COUNT,
  CHART_SAMPLE_SERIES_COUNT,
  syntheticChartProposal,
} from "./chartSamples";

describe("synthetic chart proposals", () => {
  it("builds a valid ordinary sample with strictly increasing timestamps", () => {
    const proposal = syntheticChartProposal("sample", 2);
    expect(proposal.series).toHaveLength(CHART_SAMPLE_SERIES_COUNT);
    expect(proposal.time).toHaveLength(CHART_SAMPLE_COUNT);
    for (const entry of proposal.series) {
      expect(entry.values).toHaveLength(CHART_SAMPLE_COUNT);
      expect(entry.values.every((value) => Number.isFinite(value))).toBe(true);
    }
    for (let index = 1; index < proposal.time.length; index += 1) {
      expect(proposal.time[index]).toBeGreaterThan(
        proposal.time[index - 1] ?? Number.NEGATIVE_INFINITY,
      );
    }
    expect(admitChartSnapshot(proposal).accepted).toBe(true);
  });

  it("uses a different time base for a later sequence", () => {
    const first = syntheticChartProposal("sample", 1);
    const second = syntheticChartProposal("sample", 2);
    expect(second.time[0]).toBeGreaterThan(first.time.at(-1) ?? Number.NEGATIVE_INFINITY);
  });

  it("builds the full 8 × 2,000 window and one sample beyond it", () => {
    const full = syntheticChartProposal("eight-series", 0);
    expect(full.series).toHaveLength(CHART_SERIES_LIMIT);
    expect(full.time).toHaveLength(CHART_SAMPLE_LIMIT);
    const admitted = admitChartSnapshot(full);
    expect(admitted).toMatchObject({ accepted: true, evictedSamples: 0 });

    const over = syntheticChartProposal("over-sample", 0);
    expect(over.time).toHaveLength(CHART_SAMPLE_LIMIT + 1);
    const trimmed = admitChartSnapshot(over);
    expect(trimmed.accepted).toBe(true);
    if (!trimmed.accepted || trimmed.snapshot === null) return;
    expect(trimmed.evictedSamples).toBe(1);
    expect(trimmed.snapshot.time).toHaveLength(CHART_SAMPLE_LIMIT);
  });

  it("builds each malformed proposal that admission must reject", () => {
    expect(requireRejected(syntheticChartProposal("ninth-series", 0)).code).toBe("series-limit");
    expect(requireRejected(syntheticChartProposal("bad-length", 0)).code).toBe("length-mismatch");
    expect(requireRejected(syntheticChartProposal("bad-value", 0)).code).toBe("non-finite-value");
    expect(requireRejected(syntheticChartProposal("long-label", 0)).code).toBe("metadata-too-long");
  });

  it("builds an explicit empty replacement", () => {
    const empty = syntheticChartProposal("empty", 0);
    expect(empty.time).toHaveLength(0);
    expect(empty.series).toHaveLength(0);
    expect(admitChartSnapshot(empty)).toMatchObject({ accepted: true, snapshot: null });
  });

  it("contains no credential or cluster material", () => {
    for (const kind of ["sample", "eight-series"] as const) {
      expect(JSON.stringify(syntheticChartProposal(kind, 0))).not.toMatch(
        /password|token|secret|kubeconfig/iu,
      );
    }
  });
});

function requireRejected(proposal: ChartProposal): ChartRejection {
  const result = admitChartSnapshot(proposal);
  if (result.accepted) {
    throw new Error("Expected the proposal to be rejected.");
  }
  return result;
}
