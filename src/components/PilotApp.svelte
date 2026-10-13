<!--
@component
The desktop application shell: a menu bar, a navigation bar, the active view,
and a status bar, laid out to fill the window.

The shell owns the state its regions share. The View menu changes the
backend-persisted theme and density, the navigation bar selects one view, and
the status bar names the current cluster, Talos context, and credential
storage whichever view is open. A failed settings load is reported under the
menu bar, so it is visible from every view. The imported Talos session belongs to the
shell, so changing views keeps it; unmounting the shell cancels a running probe
and closes the session.

Without a `transport` the shell renders in its browser state: appearance and
credential actions stay disabled and no native command is attempted. The
selected theme and density are applied to the document root for as long as the
shell is mounted, so popup content shares them, and removed on unmount.
-->
<script lang="ts">
  import { QueryClient, QueryClientProvider } from "@tanstack/svelte-query";
  import { Navigation } from "@skeletonlabs/skeleton-svelte";
  import ClustersView from "../features/clusters/ClustersView.svelte";
  import WorkloadsView from "../features/kubernetes/WorkloadsView.svelte";
  import CredentialsPanel from "../features/settings/CredentialsPanel.svelte";
  import TalosProbePanel from "../features/talos/TalosProbePanel.svelte";
  import {
    credentialStorageSummary,
    kubernetesContextSummary,
    talosContextSummary,
  } from "../lib/format/status";
  import type { IpcTransport } from "../lib/ipc/transport";
  import { KubernetesWorkloadsState } from "../lib/state/kubernetesWorkloads.svelte";
  import { ShellState } from "../lib/state/shell.svelte";
  import { TalosProbePanelState } from "../lib/state/talosProbe.svelte";
  import { menuChoiceGroup } from "./ui/menu";
  import MenuBar from "./ui/MenuBar.svelte";
  import StatusBar from "./ui/StatusBar.svelte";
  import StatusMessage from "./ui/StatusMessage.svelte";

  interface Props {
    /** Native command boundary; omitted in an ordinary browser. */
    transport?: IpcTransport | undefined;
  }

  const THEME_OPTIONS = [
    { value: "system", label: "System" },
    { value: "light", label: "Light" },
    { value: "dark", label: "Dark" },
  ] as const;
  const DENSITY_OPTIONS = [
    { value: "comfortable", label: "Comfortable" },
    { value: "compact", label: "Compact" },
  ] as const;
  // Views in navigation order, named after the navigation groups of the design.
  const VIEWS = [
    { id: "home", label: "Home" },
    { id: "talos", label: "Talos" },
    { id: "workloads", label: "Workloads" },
    { id: "settings", label: "Settings" },
  ] as const;

  let { transport }: Props = $props();

  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0 } },
  });
  let activeView = $state<(typeof VIEWS)[number]["id"]>("home");

  // One state object per transport, so a replaced transport starts from a clean load.
  const shell = $derived(new ShellState(transport));
  const probe = $derived(new TalosProbePanelState(transport));
  const workloads = $derived(new KubernetesWorkloadsState(transport));

  const activeLabel = $derived(VIEWS.find((view) => view.id === activeView)?.label);
  const menus = $derived([
    {
      label: "View",
      disabled: !shell.native || shell.busy,
      describedBy: shell.appearanceError === null ? undefined : "appearance-error",
      groups: [
        menuChoiceGroup({
          label: "Theme",
          options: THEME_OPTIONS,
          value: shell.selectedAppearance.theme,
          onChange: (theme) => void shell.selectTheme(theme),
        }),
        menuChoiceGroup({
          label: "Density",
          options: DENSITY_OPTIONS,
          value: shell.selectedAppearance.density,
          onChange: (density) => void shell.selectDensity(density),
        }),
      ],
    },
  ]);
  const statusItems = $derived([
    { label: "Cluster", value: "none connected" },
    { label: "Talos", value: talosContextSummary(probe) },
    {
      label: "Kubernetes",
      value: kubernetesContextSummary({
        session: workloads.session,
        namespace: workloads.namespace,
      }),
    },
    { label: "Credentials", value: credentialStorageSummary(shell.storageMode, shell.native) },
  ]);

  $effect(() => {
    void shell.load();
  });

  // The shell releases the probe state it replaces and the last one on unmount.
  $effect(() => {
    const owned = probe;
    return () => owned.dispose();
  });

  // The shell owns the Kubernetes client lifetime across navigation changes.
  $effect(() => {
    const owned = workloads;
    return () => owned.dispose();
  });

  // The stylesheet resolves "system" from the operating system preference when
  // no explicit mode is recorded on the root element.
  $effect(() => {
    const root = document.documentElement;
    const { theme, density } = shell.appearance;
    if (theme === "system") {
      delete root.dataset.mode;
    } else {
      root.dataset.mode = theme;
    }
    if (density === "compact") {
      root.dataset.density = density;
    } else {
      delete root.dataset.density;
    }
    return () => {
      delete root.dataset.mode;
      delete root.dataset.density;
    };
  });
</script>

<QueryClientProvider client={queryClient}>
  <div class="flex h-screen flex-col overflow-hidden">
    <header class="border-b border-surface-200-800 bg-surface-100-900">
      <MenuBar label="Application menu" {menus} />
      {#if shell.loadError !== null}
        <StatusMessage role="alert" class="mx-2 mb-2" tone="error" message={shell.loadError} />
      {/if}
      {#if shell.appearanceError !== null}
        <StatusMessage
          id="appearance-error"
          role="alert"
          class="mx-2 mb-2"
          tone="error"
          message={shell.appearanceError}
        />
      {/if}
    </header>

    <div class="flex min-h-0 flex-1">
      <nav aria-label="Primary" class="border-r border-surface-200-800">
        <Navigation layout="sidebar" class="w-40 p-2">
          <Navigation.Menu>
            {#each VIEWS as view (view.id)}
              <Navigation.Trigger
                class={view.id === activeView ? "preset-tonal-primary font-semibold" : ""}
                aria-current={view.id === activeView ? "page" : undefined}
                onclick={() => (activeView = view.id)}
              >
                <Navigation.TriggerText>{view.label}</Navigation.TriggerText>
              </Navigation.Trigger>
            {/each}
          </Navigation.Menu>
        </Navigation>
      </nav>

      <main class="min-h-0 min-w-0 flex-1 overflow-y-auto p-6">
        <h1 class="mb-4 h4">{activeLabel}</h1>
        {#if activeView === "home"}
          <ClustersView />
        {:else if activeView === "talos"}
          <TalosProbePanel {probe} />
        {:else if activeView === "workloads"}
          <WorkloadsView {workloads} />
        {:else}
          <CredentialsPanel {shell} />
        {/if}
      </main>
    </div>

    <StatusBar label="Status bar" items={statusItems} note="Foundation preview" />
  </div>
</QueryClientProvider>
