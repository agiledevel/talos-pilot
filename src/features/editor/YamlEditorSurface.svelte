<!--
@component
The lazily loaded feasibility surface for the offline YAML editor and diff.

This component and its Monaco imports are never part of the initial shell chunk:
Home imports it only after the user asks for the editor. It owns no application
state beyond the props it is given; the editor and diff components own their
models, workers, and listeners, and release them when this surface unmounts.
-->
<script lang="ts" module>
  import { editorRuntime } from "../../lib/state/editorRuntimeDiagnostics.svelte";

  // This module body runs only when the dynamic import evaluates the lazy
  // chunk. The recorder makes that first use and its same-origin URL visible in
  // the feasibility panel; it is an observation, not a test hook.
  editorRuntime.recordLazyChunk(import.meta.url);
</script>

<script lang="ts">
  import YamlDiffView from "./YamlDiffView.svelte";
  import YamlEditor from "./YamlEditor.svelte";
  import type { EditorSurfaceProps } from "../../lib/state/editorFeasibility.svelte";

  let {
    readValue,
    onChange,
    onCorrect,
    onReset,
    onOversize,
    onClose,
    targetLabel,
    original,
    corrected,
  }: EditorSurfaceProps = $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
</script>

<section
  class="grid min-w-0 gap-4 rounded-base border border-surface-200-800 p-4"
  aria-labelledby={titleId}
  data-editor-surface
>
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div>
      <h3 id={titleId} class="h6">Synthetic YAML editor</h3>
      <p class="text-sm">
        <strong>Target:</strong>
        {targetLabel}
      </p>
      <p class="text-sm text-surface-700-300">
        The editor and YAML worker load only after you open this surface. No schema or remote asset
        is downloaded.
      </p>
    </div>
    <button type="button" class="btn preset-outlined-surface-500" onclick={onClose}>
      Close editor
    </button>
  </div>

  <div class="flex flex-wrap gap-2">
    <button type="button" class="btn preset-primary-action" onclick={onCorrect}>
      Apply correction
    </button>
    <button type="button" class="btn preset-outlined-surface-500" onclick={onReset}>
      Reset malformed sample
    </button>
    <button type="button" class="btn preset-outlined-surface-500" onclick={onOversize}>
      Try oversized replacement
    </button>
  </div>

  <YamlEditor label="Synthetic release manifest YAML" {readValue} {onChange} autoFocus />

  <YamlDiffView
    label="Synthetic release manifest comparison"
    originalLabel="Malformed sample"
    modifiedLabel="Corrected sample"
    {original}
    modified={corrected}
    {targetLabel}
  />
</section>
