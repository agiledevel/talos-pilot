<!--
@component
Provides the application shell, backend-persisted appearance settings, and safe
credential import.

Without a `transport` the shell renders in its browser state: appearance and
credential actions stay disabled and no native command is attempted. The
selected theme and density are applied to the document root for as long as the
shell is mounted, so portalled content shares them, and removed on unmount.
-->
<script lang="ts">
  import type { IpcTransport } from "../lib/ipc/transport";
  import { ShellState } from "../lib/state/shell.svelte";
  import TalosProbePanel from "./TalosProbePanel.svelte";
  import SegmentedChoice from "./ui/SegmentedChoice.svelte";
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

  let { transport }: Props = $props();

  // One state object per transport, so a replaced transport starts from a clean load.
  const shell = $derived(new ShellState(transport));
  const appearanceDescription = $derived(
    shell.appearanceError === null ? undefined : "appearance-error",
  );

  $effect(() => {
    void shell.load();
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

<div class="flex min-h-screen flex-col">
  <header
    class="flex flex-wrap items-center justify-between gap-6 border-b border-surface-200-800 px-8 py-5 max-sm:flex-col max-sm:items-start max-sm:p-5"
  >
    <h1 class="h3">Talos Pilot</h1>
    <section
      class="flex flex-wrap items-center gap-5 max-sm:flex-col max-sm:items-start max-sm:gap-3"
      aria-label="Appearance settings"
    >
      <SegmentedChoice
        label="Theme"
        options={THEME_OPTIONS}
        value={shell.selectedAppearance.theme}
        disabled={!shell.native || shell.busy}
        describedBy={appearanceDescription}
        onChange={(theme) => void shell.selectTheme(theme)}
      />
      <SegmentedChoice
        label="Density"
        options={DENSITY_OPTIONS}
        value={shell.selectedAppearance.density}
        disabled={!shell.native || shell.busy}
        describedBy={appearanceDescription}
        onChange={(density) => void shell.selectDensity(density)}
      />
    </section>
    {#if shell.appearanceError !== null}
      <StatusMessage
        id="appearance-error"
        role="alert"
        class="w-full"
        tone="error"
        message={shell.appearanceError}
      />
    {/if}
  </header>

  <main class="flex-1 p-8 max-sm:p-5">
    <h2 class="h2">Clusters</h2>
    <p
      class="mx-auto mt-6 max-w-md card border border-dashed border-surface-300-700 p-8 text-center text-surface-700-300"
    >
      No clusters connected
    </p>
    <p class="mx-auto my-6 max-w-lg text-center">
      Workload and cluster management are under development. The read-only Talos probe below checks
      an authenticated API connection and status stream.
    </p>

    <TalosProbePanel {transport} />

    <section class="mx-auto mt-12 grid max-w-3xl gap-4" aria-labelledby="credentials-title">
      <h3 id="credentials-title" class="h4">Credentials</h3>
      {#if shell.storageMode === "persistent"}
        <StatusMessage
          tone="success"
          message="Persistent storage uses the operating system credential vault."
        />
      {:else if shell.storageMode === "persistent_with_session_only"}
        <StatusMessage
          tone="warning"
          message="Persistent storage is active. Earlier session-only credentials remain in memory until exit."
        />
      {:else if shell.storageMode === "session_only"}
        <StatusMessage
          tone="warning"
          message="Session-only: credentials remain in memory until the application exits."
        />
      {:else if shell.storageMode === "vault_not_checked"}
        <p>
          Persistent encryption will use the operating system vault when you import a kubeconfig.
        </p>
      {:else if shell.storageMode === "vault_unavailable"}
        <StatusMessage
          tone="warning"
          message="The operating system vault is unavailable. Choose session-only storage or retry the vault."
        />
      {:else if shell.storageMode === null}
        <p>Credential storage is available in the native desktop application.</p>
      {/if}
      <div class="flex flex-wrap gap-2">
        <button
          type="button"
          class="btn preset-primary-action"
          disabled={!shell.canImport}
          aria-busy={shell.busy}
          aria-describedby={shell.error === null ? undefined : "credential-action-error"}
          onclick={() => void shell.importCredential()}
        >
          Import kubeconfig
        </button>
        {#if shell.vaultUnavailable}
          <button
            type="button"
            class="btn preset-outlined-surface-500"
            disabled={shell.busy || !shell.native}
            onclick={() => void shell.selectSessionOnly()}
          >
            Use session-only storage
          </button>
        {/if}
        {#if shell.storageMode === "session_only" || shell.vaultUnavailable}
          <button
            type="button"
            class="btn preset-outlined-surface-500"
            disabled={shell.busy || !shell.native}
            onclick={() => void shell.retryVault()}
          >
            Retry operating system vault
          </button>
        {/if}
      </div>
      {#if shell.error !== null}
        <StatusMessage
          id="credential-action-error"
          role="alert"
          tone="error"
          message={shell.error}
        />
      {/if}
      {#if shell.notice !== null}
        <StatusMessage tone="success" message={shell.notice} />
      {/if}
    </section>
  </main>

  <footer class="px-8 py-5 text-center text-surface-700-300">
    Foundation preview · Local desktop application
  </footer>
</div>
