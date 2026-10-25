import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";
import uPlot from "uplot";
import "uplot/dist/uPlot.min.css";

import { observeSpecializedAppearance } from "../../lib/state/specializedAppearance";
import type { SpecializedAppearance } from "../../lib/state/specializedAppearance";
import {
  OwnedSpecializedResources,
  chartRuntime,
} from "../../lib/state/specializedViewRuntime.svelte";
import {
  chartAlignedData,
  chartOptions,
  chartRetainedBytes,
  chartShapeKey,
  clampChartSize,
} from "./chartData";
import { admitChartSnapshot } from "./chartSnapshot";
import type { ChartProposal, ChartSnapshot } from "./chartSnapshot";
import type { ChartSurfaceState } from "./chartSurfaceState.svelte";

/**
 * Attachment that owns the synthetic uPlot instance.
 *
 * uPlot and its stylesheet live only in the lazily imported surface chunk. The
 * attachment admits each replacement synchronously, keeps at most one accepted
 * window plus one newer scheduled window, and coalesces work into a single
 * animation frame. A same-shape replacement updates the instance in place; a
 * changed series shape destroys and recreates it. Every observer, listener,
 * frame, instance, and retained array is released on close.
 */

/** Space reserved above the plotting area for uPlot's legend. */
const LEGEND_HEIGHT = 34;

/** Options the chart attachment reads reactively. */
export interface ChartAttachmentOptions {
  /** Synchronous replacement-proposal reader; its result is admitted immediately. */
  readSnapshot: () => ChartProposal;
  /** Revision that changes whenever the owner proposes a new snapshot. */
  revision: () => number;
  /** Visible projection written by the attachment. */
  state: () => ChartSurfaceState;
}

/**
 * Creates the chart attachment for one host element.
 *
 * @param options Reader, revision, and visible projection.
 * @returns A Svelte attachment with idempotent cleanup.
 */
export function chartAttachment(options: ChartAttachmentOptions): Attachment<HTMLElement> {
  return (node) => {
    const resources = new OwnedSpecializedResources(chartRuntime);
    const state = options.state();
    let chart: uPlot | null = null;
    let shapeKey: string | null = null;
    let appearance: SpecializedAppearance | null = null;
    // The rendered window is retained so an appearance change can rebuild the
    // one instance with new compiled options (uPlot does not support mutating
    // axis/grid colour accessors in place).
    let current: ChartSnapshot | null = null;
    let pending: ChartSnapshot | null = null;
    let instanceCounted = false;
    let disposed = false;

    const destroyChart = (): void => {
      if (chart === null) {
        return;
      }
      chart.destroy();
      chart = null;
      shapeKey = null;
      if (instanceCounted) {
        instanceCounted = false;
        chartRuntime.instanceClosed();
      }
    };

    const releaseData = (): void => {
      current = null;
      pending = null;
      chartRuntime.retainedBytes = 0;
      chartRuntime.pendingBytes = 0;
      chartRuntime.queueDepth = 0;
    };

    const teardown = (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      resources.dispose();
      destroyChart();
      releaseData();
    };

    const fail = (message: string): void => {
      if (disposed) {
        return;
      }
      state.fail(message);
      teardown();
    };

    const guard = (work: () => void, message: string): void => {
      if (disposed) {
        return;
      }
      try {
        work();
      } catch {
        fail(message);
      }
    };

    const measure = (): { width: number; height: number } | null => {
      const box = node.getBoundingClientRect();
      return clampChartSize(box.width - 8, box.height - LEGEND_HEIGHT);
    };

    const create = (snapshot: ChartSnapshot, size: { width: number; height: number }): void => {
      if (appearance === null) {
        fail("The synthetic chart could not resolve the application appearance.");
        return;
      }
      chart = new uPlot(chartOptions(snapshot, appearance, size), chartAlignedData(snapshot), node);
      chartRuntime.instanceOpened();
      instanceCounted = true;
      shapeKey = chartShapeKey(snapshot);
      current = snapshot;
      chartRuntime.retainedBytes = chartRetainedBytes(snapshot);
    };

    const flush = (): void => {
      if (disposed) {
        return;
      }
      const snapshot = pending;
      pending = null;
      chartRuntime.pendingBytes = 0;
      chartRuntime.queueDepth = 0;
      if (snapshot === null) {
        return;
      }
      const size = measure();
      if (size === null) {
        // A hidden or not-yet-laid-out host: keep the single bounded snapshot and
        // wait for the next positive resize instead of creating a degenerate chart.
        pending = snapshot;
        chartRuntime.pendingBytes = chartRetainedBytes(snapshot);
        chartRuntime.queueDepth = 1;
        return;
      }
      if (chart !== null && shapeKey === chartShapeKey(snapshot)) {
        chart.setData(chartAlignedData(snapshot), true);
        current = snapshot;
        chartRuntime.retainedBytes = chartRetainedBytes(snapshot);
        return;
      }
      destroyChart();
      create(snapshot, size);
    };

    const schedule = (snapshot: ChartSnapshot): void => {
      pending = snapshot;
      chartRuntime.pendingBytes = chartRetainedBytes(snapshot);
      chartRuntime.queueDepth = 1;
      resources.scheduleFrame(() => {
        guard(flush, "The synthetic chart could not be rendered.");
      });
    };

    const resize = (): void => {
      if (chart === null) {
        if (pending !== null) {
          resources.scheduleFrame(() => {
            guard(flush, "The synthetic chart could not be rendered.");
          });
        }
        return;
      }
      const size = measure();
      if (size === null) {
        // Still hidden: keep the single bounded snapshot until a positive size
        // arrives from a later observer delivery.
        return;
      }
      chart.setSize(size);
      // Frame requests are coalesced, so a resize delivery can own the frame an
      // admitted replacement also asked for. This is the only callback that
      // runs, so it must re-drive the latest bounded snapshot as well.
      if (pending !== null) {
        resources.scheduleFrame(() => {
          guard(flush, "The synthetic chart could not be rendered.");
        });
      }
    };

    const applyAppearance = (next: SpecializedAppearance): void => {
      const previous = appearance;
      appearance = next;
      if (chart === null) {
        return;
      }
      if (
        previous !== null &&
        previous.muted === next.muted &&
        previous.border === next.border &&
        previous.chartFontSize === next.chartFontSize
      ) {
        return;
      }
      // uPlot compiles axis/grid colours and fonts into accessor functions, so a
      // theme or density change rebuilds the single instance with the new
      // options instead of mutating private compiled state. The admitted window
      // is retained and reused; no data is re-read or duplicated.
      const snapshot = current;
      const size = measure();
      if (snapshot === null || size === null) {
        return;
      }
      destroyChart();
      create(snapshot, size);
    };

    try {
      const observer = new ResizeObserver((entries) => {
        const box = entries.at(-1)?.contentRect;
        if (box === undefined || box.width <= 0 || box.height <= 0) {
          return;
        }
        resources.scheduleFrame(() => {
          guard(resize, "The synthetic chart could not be resized.");
        });
      });
      observer.observe(node);
      resources.addObserver(() => observer.disconnect());

      observeSpecializedAppearance(resources, (next) => {
        guard(() => {
          applyAppearance(next);
        }, "The synthetic chart could not apply the application appearance.");
      });
    } catch {
      fail("The synthetic chart could not observe its host. Close and reopen it to try again.");
      return () => undefined;
    }

    const applyProposal = (): void => {
      if (disposed) {
        return;
      }
      const admission = untrack(() => admitChartSnapshot(options.readSnapshot()));
      if (!admission.accepted) {
        state.rejected(admission.message);
        return;
      }
      if (admission.snapshot === null) {
        // Empty replacement: release the plotted data and any scheduled window.
        pending = null;
        destroyChart();
        releaseData();
        state.empty();
        return;
      }
      state.accepted(admission.snapshot, admission.evictedSamples);
      schedule(admission.snapshot);
    };

    $effect(() => {
      // Track the revision only; proposals are read at admission.
      const revision = options.revision();
      if (revision < 0) {
        return;
      }
      applyProposal();
    });

    return teardown;
  };
}
