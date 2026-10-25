<!--
@component
The Home view's synthetic terminal feasibility surface.

It shows the target identity, the honest resource counters of the terminal
attachment, and one persistent toggle button. The terminal component is imported
dynamically, so the initial shell chunk contains only this panel. A close during
loading cancels the pending import; after a close, focus returns to the same
toggle button.
-->
<script lang="ts">
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import { formatBytes } from "../../lib/format/units";
  import {
    TERMINAL_TARGET_LABEL,
    TerminalFeasibilityState,
  } from "../../lib/state/terminalFeasibility.svelte";
  import { terminalRuntime } from "../../lib/state/specializedViewRuntime.svelte";

  const feasibility = new TerminalFeasibilityState();
  let toggle = $state<HTMLButtonElement | undefined>(undefined);

  const status = $derived(feasibility.surface.status);
  const toggleLabel = $derived(
    status === "ready"
      ? "Close terminal"
      : status === "loading"
        ? "Cancel loading terminal"
        : status === "failed"
          ? "Try opening the terminal again"
          : "Open terminal",
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

  async function toggleTerminal(): Promise<void> {
    if (status === "ready" || status === "loading") {
      close();
      return;
    }
    await feasibility.open();
  }
</script>

<section
  class="grid max-w-3xl gap-4"
  aria-labelledby="terminal-feasibility-title"
  data-terminal-feasibility
>
  <div class="grid gap-1">
    <h2 id="terminal-feasibility-title" class="h5">Terminal feasibility</h2>
    <p>
      A synthetic, read-only terminal exercises bounded replacement snapshots, callback-paced
      replay, and explicit cleanup.
    </p>
    <p class="text-sm">
      <strong>Target:</strong>
      {TERMINAL_TARGET_LABEL}
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <button
      bind:this={toggle}
      type="button"
      class="btn preset-outlined-surface-500"
      aria-expanded={status === "ready"}
      onclick={() => void toggleTerminal()}
    >
      {toggleLabel}
    </button>
    <p class="text-sm break-all text-surface-700-300" data-terminal-runtime>
      Instances: {terminalRuntime.instances} · Listeners: {terminalRuntime.listeners} · Observers:
      {terminalRuntime.observers} · Frame: {terminalRuntime.framePending ? "pending" : "none"} · Deadline:
      {terminalRuntime.deadlinePending ? "armed" : "none"}
    </p>
  </div>

  <p class="text-xs break-all text-surface-700-300" data-terminal-buffers>
    Retained: {formatBytes(terminalRuntime.retainedBytes)} · Pending: {formatBytes(
      terminalRuntime.pendingBytes,
    )} · In flight: {formatBytes(terminalRuntime.inFlightBytes)} · Queue:
    {terminalRuntime.queueDepth}
  </p>

  {#if status === "loading"}
    <p role="status">Loading the offline terminal component and its bundled styles…</p>
  {:else if status === "failed" && feasibility.surface.error !== null}
    <StatusMessage role="alert" tone="error" message={feasibility.surface.error} />
  {/if}

  {#if status === "ready" && feasibility.surface.surface !== null}
    {@const Surface = feasibility.surface.surface}
    <Surface
      readSnapshot={() => feasibility.readSnapshot()}
      revision={feasibility.revision}
      view={feasibility.view}
      targetLabel={TERMINAL_TARGET_LABEL}
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
