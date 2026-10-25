import { describe, expect, it } from "vitest";

import {
  CHART_MAX_HEIGHT,
  CHART_MAX_WIDTH,
  CHART_MIN_HEIGHT,
  CHART_MIN_WIDTH,
  CHART_SERIES_COLORS,
  chartAlignedData,
  chartAxis,
  chartOptions,
  chartRetainedBytes,
  chartSeriesColor,
  chartShapeKey,
  clampChartSize,
} from "./chartData";
import type { ChartSnapshot } from "./chartSnapshot";
import type { SpecializedAppearance } from "../../lib/state/specializedAppearance";

const appearance: SpecializedAppearance = {
  mode: "dark",
  density: "comfortable",
  background: "#0f172a",
  surface: "#1e293b",
  foreground: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#60a5fa",
  border: "#334155",
  terminalFontFamily: "monospace",
  terminalFontSize: 13,
  chartFontSize: 11,
};

function snapshot(seriesCount = 2, samples = 4): ChartSnapshot {
  return {
    time: Float64Array.from({ length: samples }, (_unused, index) => 1_700_000_000 + index),
    series: Array.from({ length: seriesCount }, (_unused, index) => ({
      id: `series-${String(index)}`,
      label: `Series ${String(index)}`,
      values: Float64Array.from({ length: samples }, (_value, offset) => index * 10 + offset),
    })),
  };
}

describe("chart rendering projections", () => {
  it("passes the admitted arrays through as aligned data", () => {
    const value = snapshot(8, 2_000);
    const data = chartAlignedData(value);
    expect(data).toHaveLength(9);
    expect(data[0]).toBe(value.time);
    expect(data[1]).toBe(value.series[0]?.values);
    expect(data[8]).toBe(value.series[7]?.values);
  });

  it("identifies the shape by series IDs, not only by count", () => {
    const first = snapshot(2, 3);
    expect(chartShapeKey(first)).toBe(chartShapeKey(snapshot(2, 10)));
    const renamed = {
      ...first,
      series: first.series.map((entry, index) =>
        index === 0 ? { ...entry, id: "renamed" } : entry,
      ),
    };
    expect(chartShapeKey(renamed)).not.toBe(chartShapeKey(first));

    const relabelled = {
      ...first,
      series: first.series.map((entry, index) =>
        index === 1 ? { ...entry, label: "Relabelled" } : entry,
      ),
    };
    expect(chartShapeKey(relabelled)).not.toBe(chartShapeKey(first));
  });

  it("counts retained numeric bytes without including uPlot allocations", () => {
    const value = snapshot(8, 2_000);
    expect(chartRetainedBytes(value)).toBe(9 * 2_000 * 8);
  });

  it("ignores zero-size hosts and clamps finite sizes", () => {
    expect(clampChartSize(0, 300)).toBeNull();
    expect(clampChartSize(300, 0)).toBeNull();
    expect(clampChartSize(Number.NaN, 300)).toBeNull();
    expect(clampChartSize(100, 80)).toEqual({ width: CHART_MIN_WIDTH, height: CHART_MIN_HEIGHT });
    expect(clampChartSize(10_000, 10_000)).toEqual({
      width: CHART_MAX_WIDTH,
      height: CHART_MAX_HEIGHT,
    });
    expect(clampChartSize(640.8, 288.9)).toEqual({ width: 640, height: 288 });
  });

  it("bounds the categorical palette to the declared colours", () => {
    expect(chartSeriesColor(0)).toBe(CHART_SERIES_COLORS[0]);
    expect(chartSeriesColor(7)).toBe(CHART_SERIES_COLORS[7]);
    expect(chartSeriesColor(8)).toBe(CHART_SERIES_COLORS[0]);
    expect(new Set(CHART_SERIES_COLORS).size).toBe(8);
  });

  it("builds theme- and density-aware axes and series options", () => {
    const value = snapshot(2, 4);
    const axis = chartAxis(appearance);
    expect(axis.stroke).toBe(appearance.muted);
    expect(axis.grid?.stroke).toBe(appearance.border);
    expect(axis.font).toContain("11px");

    const options = chartOptions(value, appearance, { width: 640, height: 288 });
    expect(options.width).toBe(640);
    expect(options.height).toBe(288);
    expect(options.series).toHaveLength(3);
    expect(options.series[0]?.label).toBe("Time");
    expect(options.series[1]?.label).toBe("Series 0");
    expect(options.series[1]?.stroke).toBe(CHART_SERIES_COLORS[0]);
    expect(options.scales?.["x"]?.time).toBe(true);
  });
});
