import { describe, expect, it } from "vitest";

import {
  CHART_METADATA_LIMIT,
  CHART_SAMPLE_LIMIT,
  CHART_SERIES_LIMIT,
  admitChartSnapshot,
  formatChartValue,
  summariseChartSnapshot,
} from "./chartSnapshot";
import type { ChartAdmission, ChartRejection, ChartSnapshot } from "./chartSnapshot";

interface MutableSeries {
  id: string;
  label: string;
  values: number[];
}

interface MutableProposal {
  time: number[];
  series: MutableSeries[];
}

function series(id: string, length: number, value = (index: number) => index): MutableSeries {
  return { id, label: `Series ${id}`, values: Array.from({ length }, (_unused, i) => value(i)) };
}

function proposal(count = 2, samples = 10): MutableProposal {
  return {
    time: Array.from({ length: samples }, (_unused, index) => 1_700_000_000 + index),
    series: Array.from({ length: count }, (_unused, index) => series(`s${index}`, samples)),
  };
}

function requireAdmitted(
  value: MutableProposal,
): ChartAdmission & { readonly snapshot: ChartSnapshot } {
  const result = admitChartSnapshot(value);
  if (!result.accepted) {
    throw new Error(`Expected an admitted chart: ${result.code}`);
  }
  if (result.snapshot === null) {
    throw new Error("Expected plotted data, not the empty state.");
  }
  return { ...result, snapshot: result.snapshot };
}

function requireRejected(value: MutableProposal): ChartRejection {
  const result = admitChartSnapshot(value);
  if (result.accepted) {
    throw new Error("Expected the replacement to be rejected.");
  }
  return result;
}

describe("chart snapshot admission", () => {
  it("admits eight aligned series over the full sample window", () => {
    const result = requireAdmitted(proposal(CHART_SERIES_LIMIT, CHART_SAMPLE_LIMIT));
    expect(result.evictedSamples).toBe(0);
    expect(result.snapshot.series).toHaveLength(CHART_SERIES_LIMIT);
    expect(result.snapshot.time).toHaveLength(CHART_SAMPLE_LIMIT);
    for (const entry of result.snapshot.series) {
      expect(entry.values).toHaveLength(CHART_SAMPLE_LIMIT);
    }
    expect(result.snapshot.time[0]).toBe(1_700_000_000);
  });

  it("rejects a ninth series and preserves the caller's data", () => {
    const result = requireRejected(proposal(CHART_SERIES_LIMIT + 1, 10));
    expect(result.code).toBe("series-limit");
    expect(result.message).toContain("at most 8 value series");
    expect(result.message).toContain("previous chart is unchanged");
  });

  it("keeps only the newest aligned window and evicts the oldest row", () => {
    const source = proposal(2, CHART_SAMPLE_LIMIT + 1);
    const result = requireAdmitted(source);
    expect(result.evictedSamples).toBe(1);
    expect(result.snapshot.time).toHaveLength(CHART_SAMPLE_LIMIT);
    expect(result.snapshot.time[0]).toBe(source.time[1]);
    expect(result.snapshot.time.at(-1)).toBe(source.time.at(-1));
    expect(result.snapshot.series[0]?.values[0]).toBe(1);
    expect(result.snapshot.series[0]?.values.at(-1)).toBe(CHART_SAMPLE_LIMIT);
    expect(result.snapshot.series[1]?.values[0]).toBe(1);
  });

  it("copies the admitted window instead of retaining a source view", () => {
    const source = proposal(1, CHART_SAMPLE_LIMIT + 3);
    const result = requireAdmitted(source);
    source.time[source.time.length - 1] = -1;
    const sourceSeries = source.series[0];
    if (sourceSeries === undefined) throw new Error("missing series");
    sourceSeries.values[source.time.length - 1] = -1;
    expect(result.snapshot.time.at(-1)).toBe(1_700_000_000 + CHART_SAMPLE_LIMIT + 2);
    expect(result.snapshot.series[0]?.values.at(-1)).toBe(CHART_SAMPLE_LIMIT + 2);
  });

  it("rejects inconsistent lengths, duplicate IDs and oversized metadata", () => {
    const mismatch = requireRejected({
      time: [1, 2, 3],
      series: [{ id: "a", label: "A", values: [1, 2] }],
    });
    expect(mismatch.code).toBe("length-mismatch");

    const duplicate = requireRejected({
      time: [1, 2],
      series: [
        { id: "a", label: "A", values: [1, 2] },
        { id: "a", label: "B", values: [1, 2] },
      ],
    });
    expect(duplicate.code).toBe("duplicate-series-id");

    const longId = requireRejected({
      time: [1],
      series: [{ id: "i".repeat(CHART_METADATA_LIMIT + 1), label: "A", values: [1] }],
    });
    expect(longId.code).toBe("metadata-too-long");

    const longLabel = requireRejected({
      time: [1],
      series: [{ id: "a", label: "l".repeat(CHART_METADATA_LIMIT + 1), values: [1] }],
    });
    expect(longLabel.code).toBe("metadata-too-long");
  });

  it("counts metadata by Unicode code point, not UTF-16 units", () => {
    const exact = admitChartSnapshot({
      time: [1],
      series: [{ id: "😀".repeat(CHART_METADATA_LIMIT), label: "A", values: [1] }],
    });
    expect(exact.accepted).toBe(true);

    const over = requireRejected({
      time: [1],
      series: [{ id: "😀".repeat(CHART_METADATA_LIMIT + 1), label: "A", values: [1] }],
    });
    expect(over.code).toBe("metadata-too-long");
  });

  it("validates only the retained timestamp window", () => {
    const discarded = proposal(1, CHART_SAMPLE_LIMIT + 2);
    discarded.time[0] = Number.NaN;
    discarded.time[1] = -1;
    expect(admitChartSnapshot(discarded)).toMatchObject({
      accepted: true,
      evictedSamples: 2,
    });

    const nonFinite = proposal(1, 5);
    nonFinite.time[3] = Number.POSITIVE_INFINITY;
    const rejected = requireRejected(nonFinite);
    expect(rejected.code).toBe("non-finite-timestamp");

    const equal = proposal(1, 5);
    equal.time[2] = equal.time[1] ?? 0;
    const notIncreasing = requireRejected(equal);
    expect(notIncreasing.code).toBe("timestamps-not-increasing");
  });

  it("validates only retained values and rejects a non-finite retained value", () => {
    const discarded = proposal(1, CHART_SAMPLE_LIMIT + 1);
    const discardedSeries = discarded.series[0];
    if (discardedSeries === undefined) throw new Error("missing series");
    discardedSeries.values[0] = Number.NaN;
    expect(admitChartSnapshot(discarded).accepted).toBe(true);

    const retained = proposal(2, 5);
    const second = retained.series[1];
    if (second === undefined) throw new Error("missing series");
    second.values[4] = Number.NaN;
    const rejected = requireRejected(retained);
    expect(rejected.code).toBe("non-finite-value");
    expect(rejected.message).toContain("s1");
  });

  it("bounds a rejected metadata message without echoing the whole string", () => {
    const huge = "x".repeat(2_000_000);
    const result = requireRejected({
      time: [1],
      series: [{ id: "a", label: huge, values: [1] }],
    });
    expect(result.code).toBe("metadata-too-long");
    expect(result.message.length).toBeLessThan(500);
    expect(result.message).toContain("…");
    expect(result.message).not.toContain("x".repeat(81));
  });

  it("clears the chart for empty timestamps or no value series", () => {
    const emptyTime = admitChartSnapshot({ time: [], series: [] });
    expect(emptyTime).toMatchObject({ accepted: true, snapshot: null, evictedSamples: 0 });

    const noSeries = admitChartSnapshot({ time: [1, 2, 3], series: [] });
    expect(noSeries).toMatchObject({ accepted: true, snapshot: null, evictedSamples: 0 });
  });

  it("recovers with a valid window after an empty replacement", () => {
    expect(admitChartSnapshot({ time: [], series: [] }).accepted).toBe(true);
    const recovered = requireAdmitted(proposal(3, 4));
    expect(recovered.snapshot.series).toHaveLength(3);
    expect(recovered.snapshot.time).toHaveLength(4);
  });

  it("builds a bounded accessible summary with latest, minimum and maximum", () => {
    const result = requireAdmitted({
      time: [1, 2, 3],
      series: [
        { id: "cpu", label: "CPU", values: [0.5, 2.25, 1] },
        { id: "memory", label: "Memory", values: [-3, 0, -1] },
      ],
    });
    const rows = summariseChartSnapshot(result.snapshot);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({
      id: "cpu",
      label: "CPU",
      latest: "1",
      minimum: "0.5",
      maximum: "2.3",
    });
    expect(rows[1]).toMatchObject({ latest: "-1", minimum: "-3", maximum: "0" });
    expect(rows.length).toBeLessThanOrEqual(CHART_SERIES_LIMIT);
  });

  it("formats large and small values into short strings", () => {
    expect(formatChartValue(1_234_567)).toBe("1.23e+6");
    expect(formatChartValue(0.000_12)).toBe("1.20e-4");
    expect(formatChartValue(42)).toBe("42");
    expect(formatChartValue(Number.NaN)).toBe("—");
  });
});
