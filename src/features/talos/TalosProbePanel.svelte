<!--
@component
Lets a user import a native talosconfig and run one read-only Talos probe.

The panel renders the probe state it is given and owns none of it: the shell
owns the imported session, so leaving this view keeps the context and a running
stream, and the status bar keeps naming them. A stream that ends or fails after
a healthy event is shown as stale; its last values are never presented as
current.
-->
<script lang="ts">
  import SelectField from "../../components/ui/SelectField.svelte";
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import type { TalosProbePanelState } from "../../lib/state/talosProbe.svelte";

  interface Props {
    /** Probe state owned by the shell, which releases it. */
    probe: TalosProbePanelState;
  }

  let { probe }: Props = $props();

  const errorDescription = $derived(probe.error === null ? undefined : "talos-probe-error");
</script>

<section class="grid max-w-3xl gap-4" aria-labelledby="talos-probe-title">
  <h2 id="talos-probe-title" class="h5">Talos read probe</h2>
  {#if probe.session === null}
    <p>
      Import a Talos context from the native picker. Its inline mTLS credentials stay in memory
      until you close the context or exit the application.
    </p>
  {:else}
    <StatusMessage
      tone="warning"
      message={`Session-only context “${probe.session.context_name}”. Credentials are held in memory.`}
    />
    <p>Talos API endpoints: {probe.session.endpoints.join(", ")}</p>
    <SelectField
      label="Talos node target"
      value={probe.node}
      disabled={probe.busy || probe.probing}
      options={probe.session.nodes.map((target) => ({ label: target, value: target }))}
      onChange={(target) => probe.selectNode(target)}
    />
  {/if}
  {#if probe.probeEvent !== null}
    <output class="grid gap-1" aria-live="polite">
      <strong>Talos: {probe.probeEvent.state.replaceAll("_", " ")}</strong>
      {#if probe.probeEvent.version !== null}
        <p>Version: {probe.probeEvent.version}</p>
      {/if}
      {#if probe.probeEvent.stage !== null}
        <p>Stage: {probe.probeEvent.stage}</p>
      {/if}
      {#if probe.probeEvent.ready !== null}
        <p>Ready: {probe.probeEvent.ready ? "Yes" : "No"}</p>
      {/if}
    </output>
  {/if}
  <div class="flex flex-wrap gap-2">
    {#if probe.session === null}
      <button
        type="button"
        class="btn preset-primary-action"
        disabled={!probe.native || probe.busy}
        aria-busy={probe.busy}
        aria-describedby={errorDescription}
        onclick={() => void probe.importContext()}
      >
        Import Talos config
      </button>
    {:else}
      <button
        type="button"
        class="btn preset-primary-action"
        disabled={!probe.native || probe.busy || probe.probing || probe.node === ""}
        aria-busy={probe.probing}
        aria-describedby={errorDescription}
        onclick={() => void probe.runProbe()}
      >
        Start read probe
      </button>
      <button
        type="button"
        class="btn preset-outlined-surface-500"
        disabled={!probe.probing || probe.busy}
        aria-describedby={errorDescription}
        onclick={() => void probe.stopProbe()}
      >
        Stop stream
      </button>
      <button
        type="button"
        class="btn preset-outlined-surface-500"
        disabled={probe.busy}
        aria-describedby={errorDescription}
        onclick={() => void probe.closeSession()}
      >
        Close Talos context
      </button>
    {/if}
  </div>
  {#if probe.error !== null}
    <StatusMessage id="talos-probe-error" role="alert" tone="error" message={probe.error} />
  {/if}
</section>
