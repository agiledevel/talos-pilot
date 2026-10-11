import type { AppearanceSettingsDto } from "../ipc/generated/AppearanceSettingsDto";
import type { CredentialStorageModeDto } from "../ipc/generated/CredentialStorageModeDto";
import type { IpcTransport } from "../ipc/transport";
import {
  IpcApplicationError,
  IpcTransportError,
  getAppearanceSettings,
  getCredentialStorageStatus,
  importKubeconfig,
  retryPersistentStorage,
  setAppearanceSettings,
  useSessionOnlyStorage,
} from "../ipc/transport";
import { IpcContractError } from "../ipc/validation";

const DEFAULT_APPEARANCE: AppearanceSettingsDto = {
  theme: "system",
  density: "comfortable",
};
const APPEARANCE_SAVE_FAILED =
  "Appearance settings could not be saved. Your previous settings remain active.";

/**
 * View state for the application shell: backend-persisted appearance settings
 * and credential-storage status, with the native commands behind each action.
 *
 * One instance belongs to one transport. Without a transport every action is a
 * no-op, which keeps the browser shell inert instead of falling back to a mock.
 * Components read the reactive fields; only this class writes them. Actions
 * report failures through {@link ShellState.error} or
 * {@link ShellState.appearanceError} and never reject. No credential material
 * is held here: the backend returns only storage modes and context names.
 */
export class ShellState {
  /** Appearance in effect; replaced only after the backend accepts a save. */
  appearance = $state.raw(DEFAULT_APPEARANCE);
  /** Credential storage mode, or `null` until the backend has reported it. */
  storageMode = $state<CredentialStorageModeDto | null>(null);
  /** Safe message for the last failed load or credential action. */
  error = $state<string | null>(null);
  /** Safe message for the last failed appearance save. */
  appearanceError = $state<string | null>(null);
  /** Confirmation of the last successful import. */
  notice = $state<string | null>(null);
  /** True while a command that must not overlap another is in flight. */
  busy = $state(false);

  /** Appearance being saved, or `null` when no save is in flight. */
  #requestedAppearance = $state.raw<AppearanceSettingsDto | null>(null);

  /**
   * Appearance the controls show: the request being saved while a save is in
   * flight, otherwise the appearance in effect. A rejected save therefore moves
   * the controls back, which resynchronises the native radio inputs that the
   * user's click had already toggled.
   */
  readonly selectedAppearance = $derived(this.#requestedAppearance ?? this.appearance);
  /** True when the operating system vault could not be used. */
  readonly vaultUnavailable = $derived(this.storageMode === "vault_unavailable");
  /** True when a kubeconfig import can start now. */
  readonly canImport = $derived(
    this.native && this.storageMode !== null && !this.vaultUnavailable && !this.busy,
  );

  readonly #transport: IpcTransport | undefined;

  /** @param transport Native command boundary; `undefined` in an ordinary browser. */
  constructor(transport: IpcTransport | undefined) {
    this.#transport = transport;
  }

  /** True when native commands are available. */
  get native(): boolean {
    return this.#transport !== undefined;
  }

  /** Loads the persisted appearance and the current credential storage mode. */
  async load(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined) {
      return;
    }
    try {
      const settings = await getAppearanceSettings(transport);
      const storage = await getCredentialStorageStatus(transport);
      this.appearance = settings;
      this.storageMode = storage.mode;
      this.error = null;
    } catch (cause: unknown) {
      this.error = loadFailureMessage(cause);
    }
  }

  /** Persists a theme choice and applies it once the backend accepts it. */
  async selectTheme(theme: AppearanceSettingsDto["theme"]): Promise<void> {
    await this.#saveAppearance({ ...this.appearance, theme });
  }

  /** Persists a density choice and applies it once the backend accepts it. */
  async selectDensity(density: AppearanceSettingsDto["density"]): Promise<void> {
    await this.#saveAppearance({ ...this.appearance, density });
  }

  /** Switches to in-memory credential storage after the user's explicit choice. */
  async selectSessionOnly(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const status = await useSessionOnlyStorage(transport);
      this.storageMode = status.mode;
    } catch {
      this.error = "Session-only storage could not be started. No credentials were imported.";
    } finally {
      this.busy = false;
    }
  }

  /** Asks the backend to try the operating system vault again. */
  async retryVault(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const status = await retryPersistentStorage(transport);
      this.storageMode = status.mode;
    } catch {
      this.error =
        "The operating system vault is still unavailable. Session data remains in memory.";
    } finally {
      this.busy = false;
    }
  }

  /**
   * Imports a kubeconfig through the native picker. A cancelled picker changes
   * nothing; an unavailable vault is reflected in {@link ShellState.storageMode}
   * so the user can choose session-only storage or retry.
   */
  async importCredential(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined) {
      return;
    }
    this.busy = true;
    this.error = null;
    this.notice = null;
    try {
      const result = await importKubeconfig(transport);
      if (result !== null) {
        this.storageMode = result.storage_mode;
        const persistence =
          result.storage_mode === "session_only" ? "for this session" : "encrypted";
        this.notice = `Imported context “${result.context_name}” ${persistence}.`;
      }
    } catch (cause: unknown) {
      if (
        cause instanceof IpcApplicationError &&
        cause.detail.code === "CREDENTIAL_VAULT_UNAVAILABLE"
      ) {
        this.storageMode = "vault_unavailable";
        this.error =
          "The operating system vault is unavailable. Choose session-only storage or retry the vault.";
      } else {
        this.error = "The kubeconfig could not be imported. Check its contents and try again.";
      }
    } finally {
      this.busy = false;
    }
  }

  async #saveAppearance(next: AppearanceSettingsDto): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined) {
      return;
    }
    this.busy = true;
    this.appearanceError = null;
    // Recorded before the command starts, so the controls render the request
    // before any outcome can arrive.
    this.#requestedAppearance = next;
    try {
      await setAppearanceSettings(transport, next);
      this.appearance = next;
    } catch {
      this.appearanceError = APPEARANCE_SAVE_FAILED;
    } finally {
      this.#requestedAppearance = null;
      this.busy = false;
    }
  }
}

function loadFailureMessage(cause: unknown): string {
  if (cause instanceof IpcApplicationError) {
    return cause.message;
  }
  if (cause instanceof IpcContractError) {
    return "The native application returned invalid settings data. Restart the application and try again.";
  }
  if (cause instanceof IpcTransportError) {
    return "The native application could not load settings. Restart the application and try again.";
  }
  return "Desktop settings could not be loaded. Restart the application and try again.";
}
