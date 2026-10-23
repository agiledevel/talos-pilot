<!--
@component
A reusable, attachment-owned Monaco YAML editor with a bundled diagnostic worker.

The component is controlled through `value`: user edits are reported with
`onChange`, and a replaced value is applied without reporting it back. The
editor instance, text model, dedicated YAML worker, resize observer, theme
listener, and model listeners belong to this component and are released when its
host element unmounts. Diagnostics are produced by the worker; the component
renders the first one in text and marks all of them in the model.

The editor is intentionally independent of cluster credentials and session
state. `readOnly` keeps the document selectable and focusable, and `autoFocus`
moves keyboard focus into the editor after a lazily opened surface mounts.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import type { YamlDiagnostic } from "./yamlAnalysis";
  import { YamlEditorSession } from "../../lib/state/yamlEditorSession.svelte";

  interface Props {
    /** Accessible name of the editor and its surrounding group. */
    label: string;
    /** Controlled document text. */
    value: string;
    /** Reports a user edit; programmatic value replacement is not reported. */
    onChange?: ((value: string) => void) | undefined;
    /** Reports each worker diagnostic set for an owning surface or test. */
    onDiagnostics?: ((diagnostics: readonly YamlDiagnostic[]) => void) | undefined;
    /** Prevents typing while keeping the document readable and selectable. */
    readOnly?: boolean;
    /** Moves focus into the editor when it mounts. */
    autoFocus?: boolean;
  }

  let {
    label,
    value,
    onChange,
    onDiagnostics,
    readOnly = false,
    autoFocus = false,
  }: Props = $props();

  // The constructor takes the mount-time values; the effects below apply every
  // later prop change, so this read is intentionally outside reactivity.
  const initial = untrack(() => ({ label, value, readOnly, autoFocus }));
  const session = new YamlEditorSession({
    ...initial,
    onChange: (next) => {
      onChange?.(next);
    },
    onDiagnostics: (diagnostics) => {
      onDiagnostics?.(diagnostics);
    },
  });
  const attachment = session.createAttachment();

  $effect(() => {
    session.setValue(value);
  });
  $effect(() => {
    session.setReadOnly(readOnly);
  });
  $effect(() => {
    session.setLabel(label);
  });

  const firstDiagnostic = $derived(session.diagnostics[0]);
  const extraDiagnostics = $derived(Math.max(0, session.diagnostics.length - 1));
</script>

<div class="grid min-w-0 gap-2" role="group" aria-label={label} data-yaml-editor>
  <div
    class="h-64 max-h-[50vh] min-h-40 overflow-hidden rounded-base border border-surface-200-800"
    {@attach attachment}
  ></div>
  {#if session.mountError !== null}
    <StatusMessage role="alert" tone="error" message={session.mountError} />
  {:else if firstDiagnostic !== undefined}
    <div role="status" class="rounded-base preset-tonal-warning p-3 text-sm">
      <p>
        <strong>YAML diagnostic:</strong>
        {firstDiagnostic.message}
        <span class="text-surface-700-300">
          (line {firstDiagnostic.line}, column {firstDiagnostic.column})
        </span>
      </p>
      {#if extraDiagnostics > 0}
        <p class="mt-1">
          and {extraDiagnostics} more {extraDiagnostics === 1 ? "diagnostic" : "diagnostics"}
        </p>
      {/if}
    </div>
  {:else if session.status === "ready"}
    <p role="status" class="text-sm text-surface-700-300">No YAML diagnostics</p>
  {/if}
</div>
