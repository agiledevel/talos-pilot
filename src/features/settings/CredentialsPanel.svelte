<!--
@component
Shows where imported credentials are kept and offers the kubeconfig import with
its storage choices: session-only storage and a retry of the operating system
vault.

The panel renders the shell's state and owns none of it. It shows storage modes
and context names only; credential material stays in the backend.
-->
<script lang="ts">
  import StatusMessage from "../../components/ui/StatusMessage.svelte";
  import type { ShellState } from "../../lib/state/shell.svelte";

  interface Props {
    /** Shell state holding the storage mode and the credential actions. */
    shell: ShellState;
  }

  let { shell }: Props = $props();
</script>

<section class="grid max-w-3xl gap-4" aria-labelledby="credentials-title">
  <h2 id="credentials-title" class="h5">Credentials</h2>
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
    <p>Persistent encryption will use the operating system vault when you import a kubeconfig.</p>
  {:else if shell.storageMode === "vault_unavailable"}
    <StatusMessage
      tone="warning"
      message="The operating system vault is unavailable. Choose session-only storage or retry the vault."
    />
  {:else if !shell.native}
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
    <StatusMessage id="credential-action-error" role="alert" tone="error" message={shell.error} />
  {/if}
  {#if shell.notice !== null}
    <StatusMessage tone="success" message={shell.notice} />
  {/if}
</section>
