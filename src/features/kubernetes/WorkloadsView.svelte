<!--
@component
Lists bounded Pod summaries through the Rust-owned Kubernetes session.

The shell owns the credential session and the Svelte Query cache owns server
projections. The view keeps the session and namespace visible, lets the user
load only an explicitly selected namespace, and renders separate authorization,
unsupported, empty, partial, and failure states.
-->
<script lang="ts">
  import { createQuery } from "@tanstack/svelte-query";
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import type { KubernetesWorkloadsState } from "../../lib/state/kubernetesWorkloads.svelte";
  import { kubernetesPodListError } from "../../lib/state/kubernetesWorkloads.svelte";

  interface Props {
    /** Kubernetes context state owned by the application shell. */
    workloads: KubernetesWorkloadsState;
  }

  let { workloads }: Props = $props();

  const query = createQuery(() => workloads.queryOptions());
  const credentials = $derived(
    workloads.credentials.map((credential) => ({
      value: credential.credential_handle,
      label: `${credential.context_label} (${credential.storage_mode.replaceAll("_", " ")})`,
    })),
  );
  const listError = $derived(query.isError ? kubernetesPodListError(query.error) : null);
  const readinessLabel = (readiness: string): string => readiness.replaceAll("_", " ");
</script>

<section class="grid max-w-4xl min-w-0 gap-4" aria-labelledby="workloads-title">
  <h2 id="workloads-title" class="h5">Kubernetes workloads</h2>
  <p>
    Read-only Pod summaries come from the selected Kubernetes context through the native backend.
  </p>

  <div class="grid gap-3 rounded-base border border-surface-200-800 p-4">
    <h3 class="h6">Kubernetes context</h3>
    {#if workloads.session === null}
      <p>No Kubernetes session is open.</p>
      <div class="flex flex-wrap items-end gap-3">
        <button
          type="button"
          class="btn preset-outlined-surface-500"
          disabled={!workloads.native || workloads.busy}
          aria-busy={workloads.busy}
          onclick={() => void workloads.loadCredentials()}
        >
          Load saved contexts
        </button>
        {#if workloads.credentials.length > 0}
          <label class="grid min-w-56 flex-1 gap-1">
            <span class="label-text">Saved Kubernetes context</span>
            <select
              class="input w-full"
              value={workloads.selectedHandle}
              disabled={workloads.busy}
              onchange={(event) => workloads.selectCredential(event.currentTarget.value)}
            >
              {#each credentials as credential (credential.value)}
                <option value={credential.value}>{credential.label}</option>
              {/each}
            </select>
          </label>
          <button
            type="button"
            class="btn preset-primary-action"
            disabled={!workloads.native || workloads.busy || workloads.selectedHandle === ""}
            aria-busy={workloads.busy}
            onclick={() => void workloads.openSession()}
          >
            Open Kubernetes session
          </button>
        {/if}
      </div>
      {#if workloads.credentials.length === 0 && !workloads.busy && workloads.native}
        <p role="status">Load saved contexts to choose an imported kubeconfig.</p>
      {:else if !workloads.native}
        <p>
          Import a kubeconfig in Settings, then open this view in the native desktop application.
        </p>
      {/if}
    {:else}
      <p>
        <strong>Context:</strong>
        {workloads.session.context_label}
        <span class="text-surface-700-300">({workloads.session.session_id})</span>
      </p>
      <div class="grid min-w-0 gap-3 sm:grid-cols-2">
        <label class="grid min-w-0 gap-1">
          <span class="label-text">Namespace</span>
          <input class="input w-full" bind:value={workloads.namespace} autocomplete="off" />
        </label>
        <label class="grid min-w-0 gap-1">
          <span class="label-text">Label selector (optional)</span>
          <input
            class="input w-full"
            bind:value={workloads.labelSelector}
            autocomplete="off"
            placeholder="app=web"
          />
        </label>
        <label class="grid min-w-0 gap-1 sm:col-span-2">
          <span class="label-text">Field selector (optional)</span>
          <input
            class="input w-full"
            bind:value={workloads.fieldSelector}
            autocomplete="off"
            placeholder="status.phase=Running"
          />
        </label>
      </div>
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn preset-primary-action"
          disabled={!workloads.native || workloads.busy || query.isFetching}
          aria-busy={query.isFetching}
          onclick={() => workloads.listPods()}
        >
          List Pods
        </button>
        <button
          type="button"
          class="btn preset-outlined-surface-500"
          disabled={workloads.busy}
          onclick={() => void workloads.closeSession()}
        >
          Close Kubernetes session
        </button>
      </div>
    {/if}
    {#if workloads.actionError !== null}
      <StatusMessage role="alert" tone="error" message={workloads.actionError} />
    {/if}
  </div>

  {#if workloads.session !== null}
    <section class="grid min-w-0 gap-3" aria-labelledby="pod-list-title">
      <h3 id="pod-list-title" class="h6">
        Pods in {workloads.namespace || "the selected namespace"}
      </h3>
      {#if workloads.hasRequestedPods && query.isFetching}
        <p role="status" aria-live="polite">Loading Pod summaries…</p>
      {/if}
      {#if listError !== null}
        <StatusMessage
          role="alert"
          tone="error"
          message={`${listError.outcome}: ${listError.message}`}
        />
      {/if}
      {#if query.data !== undefined}
        {#if query.data.complete}
          <p role="status">
            {query.data.items.length === 0
              ? "No Pods were found in this namespace."
              : `${query.data.items.length} Pod summaries · resource version ${query.data.resource_version}`}
          </p>
        {:else}
          <StatusMessage
            role="status"
            tone="warning"
            message={`Partial Pod list: ${query.data.items.length} summaries reached the backend collection limit.`}
          />
        {/if}
        {#if query.data.items.length > 0}
          <div class="min-w-0 overflow-x-auto rounded-base border border-surface-200-800">
            <table class="w-full min-w-[36rem] text-left text-sm">
              <caption class="sr-only">
                Pod summaries for {query.data.namespace}, Kubernetes session {query.data.session_id}
              </caption>
              <thead class="bg-surface-100-900 text-surface-700-300">
                <tr>
                  <th scope="col" class="p-2">Name</th>
                  <th scope="col" class="p-2">Phase</th>
                  <th scope="col" class="p-2">Readiness</th>
                </tr>
              </thead>
              <tbody>
                {#each query.data.items as pod (`${pod.namespace}/${pod.name}/${pod.uid}`)}
                  <tr class="border-t border-surface-200-800">
                    <th scope="row" class="max-w-64 truncate p-2 font-medium" title={pod.name}>
                      {pod.name}
                    </th>
                    <td class="p-2">{pod.phase}</td>
                    <td class="p-2">{readinessLabel(pod.readiness)}</td>
                  </tr>
                {/each}
              </tbody>
            </table>
          </div>
        {/if}
      {/if}
    </section>
  {/if}
</section>
