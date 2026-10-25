<!--
@component
The lazily loaded synthetic chart surface.

This component and its uPlot imports are never part of the initial shell chunk:
Home imports it only after the user opens the chart. The chart host is owned by
the chart attachment, which admits aligned replacement windows, updates or
recreates the single instance, follows the shell appearance, and releases the
instance and every observer on unmount. Because a canvas is not accessible on
its own, the surface also renders a bounded numeric equivalent: one row per
admitted series with latest, minimum, and maximum values, never the full data.
-->
<script lang="ts">
  import { CHART_MAX_HEIGHT, CHART_MIN_HEIGHT, CHART_SERIES_COLORS } from "./chartData";
  import { CHART_METADATA_LIMIT, CHART_SAMPLE_LIMIT, CHART_SERIES_LIMIT } from "./chartSnapshot";
  import { chartAttachment } from "./chartAttachment.svelte";
  import { formatCount } from "../../lib/format/units";
  import type { ChartSurfaceProps } from "../../lib/state/chartFeasibility.svelte";

  let { readSnapshot, revision, view, targetLabel, onSample, onClose }: ChartSurfaceProps =
    $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
  const captionId = `${uid}-caption`;

  // Stable attachment: it follows `revision` through a getter and reads the
  // proposal only at admission, so re-renders never recreate the chart.
  const attach = chartAttachment({
    readSnapshot: () => readSnapshot(),
    revision: () => revision,
    state: () => view,
  });

  const limits = `${String(CHART_SERIES_LIMIT)} value series × ${formatCount(CHART_SAMPLE_LIMIT)} newest aligned samples, with at most ${String(CHART_METADATA_LIMIT)} characters per series ID or label`;
  const sizes = `${formatCount(CHART_MIN_HEIGHT)}–${formatCount(CHART_MAX_HEIGHT)} CSS pixels tall, ${CHART_SERIES_COLORS.length} categorical series colours`;
</script>

<section
  class="grid min-w-0 gap-3 rounded-base border border-surface-200-800 p-4"
  aria-labelledby={titleId}
  data-chart-surface
>
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div>
      <h3 id={titleId} class="h6">Synthetic metric chart</h3>
      <p class="text-sm">
        <strong>Target:</strong>
        {targetLabel}
      </p>
      <p class="text-sm text-surface-700-300">
        Synthetic replacement snapshots only. No metrics source, API request, or cluster connection
        is involved. Admission keeps {limits}; the plotting area is clamped to {sizes}.
      </p>
    </div>
    <button type="button" class="btn preset-outlined-surface-500" onclick={onClose}>
      Close chart surface
    </button>
  </div>

  <div class="flex flex-wrap gap-2" role="group" aria-label="Propose synthetic chart data">
    <button type="button" class="btn preset-primary-action" onclick={() => onSample("sample")}>
      Next sample
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("eight-series")}
    >
      8 series × 2,000
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("over-sample")}
    >
      Sample limit + 1
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("ninth-series")}
    >
      Add ninth series
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("bad-length")}
    >
      Break alignment
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("bad-value")}
    >
      Non-finite value
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("long-label")}
    >
      Oversized label
    </button>
    <button type="button" class="btn preset-outlined-surface-500" onclick={() => onSample("empty")}>
      Clear chart
    </button>
  </div>

  {#if view.failure !== null}
    <p class="alert variant-filled-error" role="alert" data-chart-failure>{view.failure}</p>
  {/if}
  {#if view.rejection !== null}
    <p class="alert variant-soft-warning" role="alert" data-chart-rejection>{view.rejection}</p>
  {/if}
  {#if view.notice !== null}
    <p class="text-sm" role="status" data-chart-notice>{view.notice}</p>
  {/if}
  <p class="text-sm text-surface-700-300" data-chart-retained>
    Admitted: {formatCount(view.retainedSeries)} series × {formatCount(view.retainedSamples)} aligned
    samples
  </p>

  {#if view.status === "empty"}
    <p class="text-sm" role="status" data-chart-empty>
      No chart data is accepted. Propose a valid synthetic snapshot to recover without reopening.
    </p>
  {/if}

  <div
    class="relative h-72 w-full overflow-hidden rounded-base border border-surface-300-700"
    aria-hidden="true"
    data-chart-host
    {@attach attach}
  ></div>

  <details open class="rounded-base border border-surface-200-800 p-2" data-chart-summary-region>
    <summary class="cursor-pointer text-sm font-semibold">
      Numeric equivalent of the synthetic chart (the canvas is decorative)
    </summary>
    <div class="overflow-x-auto">
      <table class="table-hover table-compact table" data-chart-summary>
        <caption id={captionId} class="text-left text-sm">
          Admitted values by series: latest, minimum, and maximum
        </caption>
        <thead>
          <tr>
            <th scope="col">Series</th>
            <th scope="col">Latest</th>
            <th scope="col">Minimum</th>
            <th scope="col">Maximum</th>
          </tr>
        </thead>
        <tbody>
          {#if view.summary.length === 0}
            <tr>
              <td colspan="4">No admitted series</td>
            </tr>
          {:else}
            {#each view.summary as row (row.id)}
              <tr>
                <th scope="row" class="break-words">{row.label}</th>
                <td>{row.latest}</td>
                <td>{row.minimum}</td>
                <td>{row.maximum}</td>
              </tr>
            {/each}
          {/if}
        </tbody>
      </table>
    </div>
  </details>

  <p class="text-xs text-surface-700-300">
    Keyboard: Tab to the numeric summary to expand or collapse it. Closing the surface returns focus
    to the “Open chart” button.
  </p>
</section>
