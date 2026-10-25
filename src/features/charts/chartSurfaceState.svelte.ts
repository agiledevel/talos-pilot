import { formatCount } from "../../lib/format/units";
import { summariseChartSnapshot } from "./chartSnapshot";
import type { ChartSnapshot, ChartSummaryRow } from "./chartSnapshot";

/**
 * Visible state of one synthetic chart attachment.
 *
 * The attachment owns the uPlot instance and writes this bounded projection:
 * the admitted window size, one eviction or rejection message, and the numeric
 * equivalent of the canvas. It never stores timestamp or value arrays, so the
 * accessible summary cannot become a second copy of the plotted data.
 */
export class ChartSurfaceState {
  /** Attachment state: no accepted data, plotted data, empty, or failed. */
  status = $state<"idle" | "ready" | "empty" | "failed">("idle");
  /** Eviction summary of the last accepted replacement, or `null`. */
  notice = $state<string | null>(null);
  /** Visible rejection of a malformed replacement; the accepted chart is preserved. */
  rejection = $state<string | null>(null);
  /** A failed initialization or render; the surface needs a reopen. */
  failure = $state<string | null>(null);
  /** Aligned samples in the admitted window. */
  retainedSamples = $state(0);
  /** Value series in the admitted window; the time axis is excluded. */
  retainedSeries = $state(0);
  /** Bounded at most eight rows of latest/minimum/maximum text. */
  summary = $state.raw<ChartSummaryRow[]>([]);

  /** Returns the surface to its pre-attachment state for a fresh open. */
  reset(): void {
    this.status = "idle";
    this.notice = null;
    this.rejection = null;
    this.failure = null;
    this.retainedSamples = 0;
    this.retainedSeries = 0;
    this.summary = [];
  }

  /**
   * Publishes an admitted replacement and its numeric equivalent.
   *
   * @param snapshot Admitted aligned window.
   * @param evictedSamples Aligned rows dropped from the oldest end.
   */
  accepted(snapshot: ChartSnapshot, evictedSamples: number): void {
    this.status = "ready";
    this.rejection = null;
    this.failure = null;
    this.retainedSamples = snapshot.time.length;
    this.retainedSeries = snapshot.series.length;
    this.summary = summariseChartSnapshot(snapshot);
    this.notice =
      evictedSamples > 0
        ? `Retained the newest ${formatCount(snapshot.time.length)} aligned samples and evicted ${formatCount(evictedSamples)} older ${evictedSamples === 1 ? "sample" : "samples"}.`
        : null;
  }

  /** Publishes an explicit empty replacement and releases the plotted data. */
  empty(): void {
    this.status = "empty";
    this.notice = null;
    this.rejection = null;
    this.failure = null;
    this.retainedSamples = 0;
    this.retainedSeries = 0;
    this.summary = [];
  }

  /**
   * Publishes a rejected proposal without touching the accepted chart.
   *
   * @param message Bounded rejection message from the admission boundary.
   */
  rejected(message: string): void {
    this.rejection = message;
  }

  /**
   * Publishes a chart failure; the attachment destroys the instance.
   *
   * @param message Bounded failure message.
   */
  fail(message: string): void {
    this.status = "failed";
    this.failure = message;
    this.notice = null;
    this.rejection = null;
    this.retainedSamples = 0;
    this.retainedSeries = 0;
    this.summary = [];
  }
}
