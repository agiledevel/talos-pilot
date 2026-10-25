import { CHART_SAMPLE_LIMIT, CHART_SERIES_LIMIT } from "./chartSnapshot";
import type { ChartProposal } from "./chartSnapshot";

/**
 * Synthetic chart proposals generated on demand by the Home surface.
 *
 * The owner retains only the requested kind and a small sequence number; every
 * timestamp and value array is materialized synchronously when the chart
 * surface asks for it. An oversized or invalid proposal therefore never lives in
 * reactive state between renders.
 */

/** Kinds of synthetic replacement offered by the chart feasibility surface. */
export type ChartSampleKind =
  | "sample"
  | "eight-series"
  | "over-sample"
  | "ninth-series"
  | "bad-length"
  | "bad-value"
  | "long-label"
  | "empty";

/** Samples in the ordinary two-series sample. */
export const CHART_SAMPLE_SERIES_COUNT = 2;
/** Samples in the ordinary two-series sample. */
export const CHART_SAMPLE_COUNT = 300;

/**
 * Builds one synthetic chart proposal.
 *
 * Values are deterministic, finite, and benign; timestamps are strictly
 * increasing Unix seconds. The malformed kinds are valid JavaScript shapes that
 * the admission boundary must reject visibly without disturbing the accepted
 * chart.
 *
 * @param kind Requested proposal kind.
 * @param sequence Small sequence number that shifts the time base.
 * @returns A newly generated proposal.
 */
export function syntheticChartProposal(kind: ChartSampleKind, sequence: number): ChartProposal {
  const base = 1_700_000_000 + sequence * 10_000;
  switch (kind) {
    case "sample":
      return aligned(base, CHART_SAMPLE_SERIES_COUNT, CHART_SAMPLE_COUNT);
    case "eight-series":
      return aligned(base, CHART_SERIES_LIMIT, CHART_SAMPLE_LIMIT);
    case "over-sample":
      return aligned(base, CHART_SERIES_LIMIT, CHART_SAMPLE_LIMIT + 1);
    case "ninth-series":
      return aligned(base, CHART_SERIES_LIMIT + 1, 8);
    case "bad-length": {
      const proposal = aligned(base, 2, 16);
      const second = proposal.series[1];
      if (second !== undefined) {
        proposal.series[1] = { ...second, values: second.values.slice(0, -1) };
      }
      return proposal;
    }
    case "bad-value": {
      const proposal = aligned(base, 2, 16);
      const first = proposal.series[0];
      if (first !== undefined) {
        const values = [...first.values];
        values[8] = Number.NaN;
        proposal.series[0] = { ...first, values };
      }
      return proposal;
    }
    case "long-label": {
      const proposal = aligned(base, 2, 16);
      const first = proposal.series[0];
      if (first !== undefined) {
        proposal.series[0] = { ...first, label: "L".repeat(81) };
      }
      return proposal;
    }
    case "empty":
      return { time: [], series: [] };
  }
}

interface MutableSeriesProposal {
  id: string;
  label: string;
  values: number[];
}

interface MutableProposal {
  time: number[];
  series: MutableSeriesProposal[];
}

function aligned(base: number, seriesCount: number, samples: number): MutableProposal {
  const time = Array.from({ length: samples }, (_unused, index) => base + index);
  const series: MutableSeriesProposal[] = Array.from({ length: seriesCount }, (_unused, index) => ({
    id: `synthetic-${String(index)}`,
    label: `Synthetic series ${String(index + 1)}`,
    values: Array.from(
      { length: samples },
      (_value, offset) =>
        Math.round((12 + index * 4 + Math.sin((offset + index * 7) / (10 + index)) * 6) * 10) / 10,
    ),
  }));
  return { time, series };
}
