import type { AlignedData, Axis, Options } from "uplot";

import type { ChartSnapshot } from "./chartSnapshot";
import type { SpecializedAppearance } from "../../lib/state/specializedAppearance";

/**
 * Rendering projections for the synthetic chart.
 *
 * These helpers keep the uPlot-specific mapping out of the Svelte component:
 * aligned data, a stable shape key for in-place updates, the retained-data byte
 * count shown in diagnostics, and the clamped plotting size. The series palette
 * is a fixed categorical set chosen to stay distinguishable on both the light
 * and dark tokens; the adapter still maps background, grid, and label colours.
 */

/** Minimum plotting area width in CSS pixels. */
export const CHART_MIN_WIDTH = 240;
/** Minimum plotting area height in CSS pixels. */
export const CHART_MIN_HEIGHT = 160;
/** Maximum plotting area width in CSS pixels. */
export const CHART_MAX_WIDTH = 1_600;
/** Maximum plotting area height in CSS pixels. */
export const CHART_MAX_HEIGHT = 480;

/** Categorical series colours, bounded to the eight-series ceiling. */
export const CHART_SERIES_COLORS = [
  "#2563eb",
  "#ea580c",
  "#16a34a",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#ca8a04",
  "#db2777",
] as const;

/**
 * Converts an admitted snapshot into uPlot's aligned data layout.
 *
 * The admitted typed arrays are passed by reference: they are already
 * independent copies of at most 2,000 aligned rows, so no further copy or view
 * of the oversized source is created.
 *
 * @param snapshot Admitted chart window with at least one series.
 */
export function chartAlignedData(snapshot: ChartSnapshot): AlignedData {
  return [snapshot.time, ...snapshot.series.map((entry) => entry.values)];
}

/**
 * Builds a stable identity for the admitted series shape.
 *
 * Series IDs and labels, not just their count, are part of the identity because
 * a changed legend label or ID requires a new uPlot configuration instead of an
 * in-place data update.
 *
 * @param snapshot Admitted chart window.
 */
export function chartShapeKey(snapshot: ChartSnapshot): string {
  return JSON.stringify(snapshot.series.map((entry) => [entry.id, entry.label]));
}

/**
 * Counts the retained numeric bytes of one admitted snapshot.
 *
 * This is the payload the attachment keeps for the chart (time plus values),
 * not uPlot's own allocation.
 *
 * @param snapshot Admitted chart window.
 */
export function chartRetainedBytes(snapshot: ChartSnapshot): number {
  let bytes = snapshot.time.byteLength;
  for (const entry of snapshot.series) {
    bytes += entry.values.byteLength;
  }
  return bytes;
}

/** A clamped plotting size, or `null` when the host has no usable size. */
export type ChartSize = { readonly width: number; readonly height: number } | null;

/**
 * Clamps a measured host box into a finite plotting size.
 *
 * A hidden or not-yet-laid-out host measures as zero and is ignored, so the
 * chart is never created with a degenerate canvas. Oversized measurements are
 * clamped before they reach uPlot.
 *
 * @param width Measured host width in CSS pixels.
 * @param height Available plotting height in CSS pixels.
 */
export function clampChartSize(width: number, height: number): ChartSize {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return null;
  }
  return {
    width: Math.min(CHART_MAX_WIDTH, Math.max(CHART_MIN_WIDTH, Math.floor(width))),
    height: Math.min(CHART_MAX_HEIGHT, Math.max(CHART_MIN_HEIGHT, Math.floor(height))),
  };
}

/**
 * Returns the categorical colour for one admitted series index.
 *
 * @param index Zero-based series index, already bounded by admission.
 */
export function chartSeriesColor(index: number): string {
  return CHART_SERIES_COLORS[index % CHART_SERIES_COLORS.length] ?? CHART_SERIES_COLORS[0];
}

/**
 * Builds one uPlot axis configuration from the resolved appearance.
 *
 * @param appearance Resolved colours and density-derived font size.
 */
export function chartAxis(appearance: SpecializedAppearance): Axis {
  return {
    stroke: appearance.muted,
    grid: { stroke: appearance.border, width: 1 },
    ticks: { stroke: appearance.border, width: 1 },
    font: `${String(appearance.chartFontSize)}px system-ui, sans-serif`,
  };
}

/**
 * Builds the complete uPlot options for one admitted snapshot shape.
 *
 * @param snapshot Admitted chart window; its series labels become legend text.
 * @param appearance Resolved colours and density-derived font size.
 * @param size Clamped plotting size in CSS pixels.
 */
export function chartOptions(
  snapshot: ChartSnapshot,
  appearance: SpecializedAppearance,
  size: { readonly width: number; readonly height: number },
): Options {
  return {
    width: size.width,
    height: size.height,
    padding: [8, 8, 0, 0],
    legend: { show: true, live: false },
    cursor: { show: true, y: false, drag: { x: true, y: false } },
    scales: { x: { time: true } },
    axes: [chartAxis(appearance), chartAxis(appearance)],
    series: [
      { label: "Time" },
      ...snapshot.series.map((entry, index) => ({
        label: entry.label,
        stroke: chartSeriesColor(index),
        width: 1.5,
        points: { show: false },
      })),
    ],
  };
}
