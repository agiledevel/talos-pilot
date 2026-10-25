<!--
@component
The Home view's synthetic editor feasibility surface.

It shows the target identity, the resource counters that prove worker/model/
listener ownership, and one persistent toggle button. The editor component is
imported dynamically, so the initial shell chunk contains only this panel. A
close during loading cancels the pending import; after a close, focus returns to
the same toggle button.
-->
<script lang="ts">
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import { editorRuntime } from "../../lib/state/editorRuntimeDiagnostics.svelte";
  import {
    CORRECTED_YAML_SAMPLE,
    EDITOR_TARGET_LABEL,
    EditorFeasibilityState,
    MALFORMED_YAML_SAMPLE,
  } from "../../lib/state/editorFeasibility.svelte";

  const feasibility = new EditorFeasibilityState();
  let toggle = $state<HTMLButtonElement | undefined>(undefined);

  const status = $derived(feasibility.surface.status);
  const toggleLabel = $derived(
    status === "ready"
      ? "Close YAML editor"
      : status === "loading"
        ? "Cancel loading editor"
        : status === "failed"
          ? "Try opening the editor again"
          : "Open YAML editor",
  );

  function restoreFocus(): void {
    // The toggle is the same element in every state, so it is still available
    // after the surface unmounts; defer to the next task so Svelte has removed it.
    queueMicrotask(() => {
      toggle?.focus();
    });
  }

  function close(): void {
    feasibility.close();
    restoreFocus();
  }

  async function toggleEditor(): Promise<void> {
    if (status === "ready" || status === "loading") {
      close();
      return;
    }
    await feasibility.open();
  }
</script>

<section
  class="grid max-w-3xl gap-4"
  aria-labelledby="editor-feasibility-title"
  data-editor-feasibility
>
  <div class="grid gap-1">
    <h2 id="editor-feasibility-title" class="h5">Editor feasibility</h2>
    <p>
      A synthetic YAML editor and read-only diff exercise the offline editor and its bundled worker
      under the packaged content security policy.
    </p>
    <p class="text-sm">
      <strong>Target:</strong>
      {EDITOR_TARGET_LABEL}
    </p>
  </div>

  <div class="flex flex-wrap items-center gap-3">
    <button
      bind:this={toggle}
      type="button"
      class="btn preset-outlined-surface-500"
      aria-expanded={status === "ready"}
      onclick={() => void toggleEditor()}
    >
      {toggleLabel}
    </button>
    <p class="text-sm text-surface-700-300" data-editor-runtime>
      Workers: {editorRuntime.workers} · Models: {editorRuntime.models} · Listeners:
      {editorRuntime.listeners}
    </p>
  </div>

  <div class="grid gap-1 text-xs break-all text-surface-700-300">
    <p data-editor-chunk>
      Editor chunk: {editorRuntime.lazyChunkStatus}{editorRuntime.lazyChunkUrl === null
        ? ""
        : ` (${editorRuntime.lazyChunkUrl})`}
    </p>
    <p data-editor-worker-assets>
      YAML worker: {editorRuntime.yamlWorkerAsset ?? "not loaded"} · Monaco worker:
      {editorRuntime.monacoWorkerAsset ?? "not loaded"}
    </p>
  </div>

  {#if status === "loading"}
    <p role="status">Loading the offline editor and its bundled assets…</p>
  {:else if status === "failed" && feasibility.surface.error !== null}
    <StatusMessage role="alert" tone="error" message={feasibility.surface.error} />
  {/if}

  {#if status === "ready" && feasibility.surface.surface !== null}
    {@const Surface = feasibility.surface.surface}
    <Surface
      value={feasibility.value}
      onChange={(next) => {
        feasibility.value = next;
      }}
      onCorrect={() => {
        feasibility.correct();
      }}
      onReset={() => {
        feasibility.reset();
      }}
      onClose={close}
      targetLabel={EDITOR_TARGET_LABEL}
      original={MALFORMED_YAML_SAMPLE}
      corrected={CORRECTED_YAML_SAMPLE}
    />
  {/if}
</section>
