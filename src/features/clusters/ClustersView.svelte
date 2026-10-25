<!--
@component
The Home view: saved clusters. Cluster connections are not implemented yet, so
it shows the empty state and points to the Talos read probe. The editor
feasibility panel is an existing working view, not a navigation destination; it
lazy-loads the synthetic editor only when opened.
-->
<script lang="ts">
  import EditorFeasibilityPanel from "../editor/EditorFeasibilityPanel.svelte";
</script>

<section class="grid max-w-3xl gap-4" aria-labelledby="clusters-title">
  <h2 id="clusters-title" class="h5">Clusters</h2>
  <p class="card border border-dashed border-surface-300-700 p-6 text-center text-surface-700-300">
    No clusters connected
  </p>
  <p>
    Workload and cluster management are under development. The read-only probe under Talos checks an
    authenticated API connection and status stream.
  </p>
</section>

<EditorFeasibilityPanel />
