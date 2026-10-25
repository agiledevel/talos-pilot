/**
 * Admission for the synthetic chart's replacement snapshots.
 *
 * The feasibility chart plots at most eight named value series over Unix-second
 * timestamps. A proposal is validated and narrowed to the newest aligned sample
 * window before anything is copied or handed to uPlot, so an oversized history
 * is never retained or plotted. Series IDs and labels are bounded too, because
 * they become legend text.
 *
 * This is a deliberately narrow synthetic contract: one shared timestamp array
 * with one value per series, no nulls, no gaps, and no Prometheus semantics.
 */

/** Maximum number of value series; the shared time axis does not count. */
export const CHART_SERIES_LIMIT = 8;

/** Maximum number of newest aligned samples retained and plotted. */
export const CHART_SAMPLE_LIMIT = 2_000;

/** Maximum Unicode code points of a series ID or label. */
export const CHART_METADATA_LIMIT = 80;

/** One proposed series. `values` must align index-for-index with the proposal's time array. */
export interface ChartSeriesProposal {
  readonly id: string;
  readonly label: string;
  readonly values: ReadonlyArray<number>;
}

/** One proposed replacement snapshot. Timestamps are Unix seconds. */
export interface ChartProposal {
  readonly time: ReadonlyArray<number>;
  readonly series: ReadonlyArray<ChartSeriesProposal>;
}

/** One admitted series, copied into independent bounded storage. */
export interface ChartSeriesSnapshot {
  readonly id: string;
  readonly label: string;
  readonly values: Float64Array;
}

/** An admitted replacement window, or `null` for an explicit empty state. */
export interface ChartSnapshot {
  readonly time: Float64Array;
  readonly series: ReadonlyArray<ChartSeriesSnapshot>;
}

/** Why a proposal was rejected; the previously accepted chart is preserved. */
export interface ChartRejection {
  readonly accepted: false;
  readonly code:
    | "series-limit"
    | "duplicate-series-id"
    | "metadata-too-long"
    | "length-mismatch"
    | "non-finite-timestamp"
    | "timestamps-not-increasing"
    | "non-finite-value";
  /** Bounded, printable explanation suitable for a visible alert. */
  readonly message: string;
}

/** A successful admission; `snapshot` is `null` when the proposal clears the chart. */
export interface ChartAdmission {
  readonly accepted: true;
  readonly snapshot: ChartSnapshot | null;
  /** Aligned samples dropped from the oldest end of the proposal. */
  readonly evictedSamples: number;
}

/** Result of admitting one chart proposal. */
export type ChartSnapshotAdmission = ChartAdmission | ChartRejection;

/**
 * Admits a proposed chart replacement.
 *
 * Order of checks: the series ceiling covers the whole proposal, then metadata
 * (duplicate IDs and code-point length), then shape, then the newest
 * {@link CHART_SAMPLE_LIMIT} aligned rows. Only that retained window must be
 * finite and strictly increasing; discarded history is neither validated as
 * plot data nor retained. The admitted window is copied, so a retained
 * `Float64Array` never references an oversized source array.
 *
 * @param proposal Values proposed by the synthetic owner or a visible action.
 * @returns The admitted window or explicit empty state, or a bounded rejection.
 */
export function admitChartSnapshot(proposal: ChartProposal): ChartSnapshotAdmission {
  const { time, series } = proposal;
  if (series.length > CHART_SERIES_LIMIT) {
    return {
      accepted: false,
      code: "series-limit",
      message: `The synthetic chart shows at most ${CHART_SERIES_LIMIT} value series; this replacement proposed ${series.length}. The previous chart is unchanged.`,
    };
  }

  const seen = new Set<string>();
  for (const entry of series) {
    if (seen.has(entry.id)) {
      return {
        accepted: false,
        code: "duplicate-series-id",
        message: `The synthetic chart requires unique series IDs; “${bounded(entry.id)}” appeared twice. The previous chart is unchanged.`,
      };
    }
    seen.add(entry.id);
    if (codePointLength(entry.id) > CHART_METADATA_LIMIT) {
      return metadataRejection(entry.id);
    }
    if (codePointLength(entry.label) > CHART_METADATA_LIMIT) {
      return metadataRejection(entry.label);
    }
  }

  for (const entry of series) {
    if (entry.values.length !== time.length) {
      return {
        accepted: false,
        code: "length-mismatch",
        message: `The synthetic chart requires aligned time and value arrays; series “${bounded(entry.id)}” had ${entry.values.length} values for ${time.length} timestamps. The previous chart is unchanged.`,
      };
    }
  }

  if (time.length === 0 || series.length === 0) {
    return { accepted: true, snapshot: null, evictedSamples: 0 };
  }

  const start = Math.max(0, time.length - CHART_SAMPLE_LIMIT);
  const length = time.length - start;

  let previous = Number.NEGATIVE_INFINITY;
  for (let index = start; index < time.length; index += 1) {
    const timestamp = time[index];
    if (timestamp === undefined || !Number.isFinite(timestamp)) {
      return {
        accepted: false,
        code: "non-finite-timestamp",
        message: `The synthetic chart requires finite Unix-second timestamps; the retained window had a non-finite value at sample ${index - start}. The previous chart is unchanged.`,
      };
    }
    if (timestamp <= previous) {
      return {
        accepted: false,
        code: "timestamps-not-increasing",
        message: `The synthetic chart requires strictly increasing retained timestamps; sample ${index - start} did not increase. The previous chart is unchanged.`,
      };
    }
    previous = timestamp;
  }

  const admittedSeries: ChartSeriesSnapshot[] = [];
  for (const entry of series) {
    const values = new Float64Array(length);
    for (let offset = 0; offset < length; offset += 1) {
      const value = entry.values[start + offset];
      if (value === undefined || !Number.isFinite(value)) {
        return {
          accepted: false,
          code: "non-finite-value",
          message: `The synthetic chart requires finite values; series “${bounded(entry.id)}” had a non-finite value at retained sample ${offset}. The previous chart is unchanged.`,
        };
      }
      values[offset] = value;
    }
    admittedSeries.push({
      id: materialiseText(entry.id),
      label: materialiseText(entry.label),
      values,
    });
  }

  const admittedTime = new Float64Array(length);
  for (let offset = 0; offset < length; offset += 1) {
    const timestamp = time[start + offset];
    if (timestamp !== undefined) {
      admittedTime[offset] = timestamp;
    }
  }

  return {
    accepted: true,
    snapshot: { time: admittedTime, series: admittedSeries },
    evictedSamples: start,
  };
}

/** One bounded row of the chart's accessible numeric equivalent. */
export interface ChartSummaryRow {
  readonly id: string;
  readonly label: string;
  readonly latest: string;
  readonly minimum: string;
  readonly maximum: string;
}

/**
 * Builds the bounded numeric equivalent of an admitted chart.
 *
 * The projection has at most eight rows regardless of the sample count, so the
 * accessible representation never contains thousands of hidden data points.
 * Each string is bounded by {@link formatChartValue}.
 *
 * @param snapshot Admitted chart window.
 * @returns Per-series latest, minimum, and maximum values as display text.
 */
export function summariseChartSnapshot(snapshot: ChartSnapshot): ChartSummaryRow[] {
  return snapshot.series.map((entry) => {
    let minimum = Number.POSITIVE_INFINITY;
    let maximum = Number.NEGATIVE_INFINITY;
    let latest = Number.NaN;
    for (const value of entry.values) {
      if (value < minimum) minimum = value;
      if (value > maximum) maximum = value;
      latest = value;
    }
    return {
      id: entry.id,
      label: entry.label,
      latest: formatChartValue(latest),
      minimum: formatChartValue(minimum),
      maximum: formatChartValue(maximum),
    };
  });
}

/**
 * Formats one chart value into a short, locale-independent string.
 *
 * @param value Admitted finite value, or `NaN` for a series without samples.
 */
export function formatChartValue(value: number): string {
  if (!Number.isFinite(value)) {
    return "—";
  }
  const magnitude = Math.abs(value);
  if (magnitude !== 0 && (magnitude >= 1_000_000 || magnitude < 0.001)) {
    return value.toExponential(2);
  }
  return Number(value.toFixed(1)).toString();
}

function metadataRejection(text: string): ChartRejection {
  return {
    accepted: false,
    code: "metadata-too-long",
    message: `The synthetic chart limits each series ID and label to ${CHART_METADATA_LIMIT} characters; “${bounded(text)}” is too long. The previous chart is unchanged.`,
  };
}

/**
 * Truncates display/diagnostic text to a small printable bound.
 *
 * The prefix is built by iteration rather than by materialising the caller's
 * string, so rejecting an unbounded ID or label does not allocate a copy
 * proportional to its size.
 */
function bounded(text: string): string {
  let prefix = "";
  let length = 0;
  for (const codePoint of text) {
    if (length === CHART_METADATA_LIMIT) {
      return `${prefix}…`;
    }
    prefix += codePoint;
    length += 1;
  }
  return prefix;
}

/**
 * Copies a short metadata string into a flat string.
 *
 * `Array.from`/`join` materialises the characters, so a sliced source string
 * cannot keep a larger backing buffer alive through a retained label.
 */
function materialiseText(text: string): string {
  return Array.from(text).join("");
}

function codePointLength(text: string): number {
  let length = 0;
  for (const _codePoint of text) {
    length += 1;
  }
  return length;
}
