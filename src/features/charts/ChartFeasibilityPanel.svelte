<!--
@component
The Home view's synthetic chart feasibility surface.

It shows the target identity, the honest instance/observer/frame counters and
retained/pending sizes of the chart attachment, and one persistent toggle
button. The chart component is imported dynamically, so the initial shell chunk
contains only this panel. A close during loading cancels the pending import;
after a close, focus returns to the same toggle button.
-->
<script lang="ts">
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import { formatBytes } from "../../lib/format/units";
  import {
    CHART_TARGET_LABEL,
    ChartFeasibilityState,
  } from "../../lib/state/chartFeasibility.svelte";
  import { chartRuntime } from "../../lib/state/specializedViewRuntime.svelte";

  const feasibility = new ChartFeasibilityState();
  let toggle = $state<HTMLButtonElement | undefined>(undefined);

  const status = $derived(feasibility.surface.status);
  const toggleLabel = $derived(
    status === "ready"
      ? "Close chart"
      : status === "loading"
        ? "Cancel loading chart"
        : status === "failed"
          ? "Try opening the chart again"
          : "Open chart",
  );

  function restoreFocus(): void {
    queueMicrotask(() => {
      toggle?.focus();
    });
  }

  function close(): void {
    feasibility.close();
    restoreFocus();
  }

  async function toggleChart(): Promise<void> {
    if (status === "ready" || status === "loading") {
      close();
      return;
    }
    await feasibility.open();
  }
</script>

<section
  class="grid max-w-3xl gap-4"
  aria-labelledby="chart-feasibility-title"
  data-chart-feasibility
>
  <div class="grid gap-1">
    <h2 id="chart-feasibility-title" class="h5">Chart feasibility</h2>
    <p>
      A synthetic aligned time series exercises bounded replacement windows, in-place chart updates,
      appearance changes, and explicit cleanup.
    </p>
    <p class="text-sm">
      <strong>Target:</strong>
      {CHART_TARGET_LABEL}
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <button
      bind:this={toggle}
      type="button"
      class="btn preset-outlined-surface-500"
      aria-expanded={status === "ready"}
      onclick={() => void toggleChart()}
    >
      {toggleLabel}
    </button>
    <p class="text-sm break-all text-surface-700-300" data-chart-runtime>
      Instances: {chartRuntime.instances} · Listeners: {chartRuntime.listeners} · Observers:
      {chartRuntime.observers} · Frame: {chartRuntime.framePending ? "pending" : "none"}
    </p>
  </div>

  <p class="text-xs break-all text-surface-700-300" data-chart-chunk>
    Chunk: {chartRuntime.chunkUrl === null ? "not loaded" : `loaded (${chartRuntime.chunkUrl})`}
  </p>

  <p class="text-xs break-all text-surface-700-300" data-chart-buffers>
    Rendered: {formatBytes(chartRuntime.retainedBytes)} · Scheduled: {formatBytes(
      chartRuntime.pendingBytes,
    )} · Queue: {chartRuntime.queueDepth}
  </p>

  {#if status === "loading"}
    <p role="status">Loading the offline chart component and its bundled styles…</p>
  {:else if status === "failed" && feasibility.surface.error !== null}
    <StatusMessage role="alert" tone="error" message={feasibility.surface.error} />
  {/if}

  {#if status === "ready" && feasibility.surface.surface !== null}
    {@const Surface = feasibility.surface.surface}
    <Surface
      readSnapshot={() => feasibility.readSnapshot()}
      revision={feasibility.revision}
      view={feasibility.view}
      targetLabel={CHART_TARGET_LABEL}
      onSample={(kind) => {
        if (kind === "sample") {
          feasibility.nextSample();
        } else {
          feasibility.propose(kind);
        }
      }}
      onClose={close}
    />
  {/if}
</section>
