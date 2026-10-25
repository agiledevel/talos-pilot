<!--
@component
A reusable, attachment-owned Monaco diff between two read-only YAML documents.

The two models, diff editor, resize observer, theme listener, and Monaco worker
are released by the attachment cleanup. Both sides are admitted against a 64 KiB
UTF-8 byte ceiling as one pair before either model is created or replaced; an
oversized side keeps both previous documents and shows an alert. Both sides are
read-only: this component shows a reviewable difference and never dispatches an
edit. The visible before and after labels and the owning surface's target line
keep the comparison identity clear.
-->
<script lang="ts">
  import { untrack } from "svelte";
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import { YamlDiffSession } from "../../lib/state/yamlDiffSession.svelte";

  interface Props {
    /** Accessible name of the diff group. */
    label: string;
    /** Original document text. */
    original: string;
    /** Modified document text. */
    modified: string;
    /** Accessible and visible name of the original side. */
    originalLabel: string;
    /** Accessible and visible name of the modified side. */
    modifiedLabel: string;
    /** Identity of the synthetic comparison shown above the diff. */
    targetLabel: string;
  }

  let { label, original, modified, originalLabel, modifiedLabel, targetLabel }: Props = $props();

  // The session starts from the mount-time documents; the effects below apply
  // later replacements.
  const initial = untrack(() => ({ label, original, modified, originalLabel, modifiedLabel }));
  const session = new YamlDiffSession(initial);
  const attachment = session.createAttachment();

  $effect(() => {
    session.setDocuments(original, modified);
  });
  $effect(() => {
    session.setLabel(label);
  });
</script>

<div class="grid min-w-0 gap-2" role="group" aria-label={label} data-yaml-diff>
  <dl class="grid gap-1 text-sm sm:grid-cols-2">
    <div>
      <dt class="text-surface-700-300">{originalLabel}</dt>
      <dd>{targetLabel}</dd>
    </div>
    <div>
      <dt class="text-surface-700-300">{modifiedLabel}</dt>
      <dd>{targetLabel}</dd>
    </div>
  </dl>
  <div
    class="h-64 max-h-[50vh] min-h-40 overflow-hidden rounded-base border border-surface-200-800"
    {@attach attachment}
  ></div>
  {#if session.mountError !== null}
    <StatusMessage role="alert" tone="error" message={session.mountError} />
  {/if}
  {#if session.documentError !== null}
    <StatusMessage role="alert" tone="error" message={session.documentError} />
  {/if}
  {#if session.status === "ready"}
    <p role="status" class="text-sm text-surface-700-300">
      Read-only diff between {originalLabel} and {modifiedLabel}.
    </p>
  {/if}
</div>
