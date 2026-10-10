import { Channel, invoke, isTauri } from "@tauri-apps/api/core";

import type { ApplicationErrorDto } from "./generated/ApplicationErrorDto";
import type { AppearanceSettingsDto } from "./generated/AppearanceSettingsDto";
import type { CredentialImportResultDto } from "./generated/CredentialImportResultDto";
import type { CredentialStorageStatusDto } from "./generated/CredentialStorageStatusDto";
import type { HelperStatusDto } from "./generated/HelperStatusDto";
import type { TalosCredentialSessionDto } from "./generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "./generated/TalosProbeEventDto";
import {
  IpcContractError,
  parseApplicationErrorDto,
  parseHelperStatusDto,
  parseAppearanceSettingsDto,
  parseCredentialImportResultDto,
  parseCredentialStorageStatusDto,
  parseTalosCredentialSessionDto,
  parseTalosProbeEventDto,
} from "./validation";

/** Supplies validated native commands to application use cases. */
export interface IpcTransport {
  /** Invokes a registered native command with its typed argument record. */
  invoke(command: string, args?: Record<string, unknown>): Promise<unknown>;
  /** Invokes a native command that streams untrusted messages over a Tauri channel. */
  invokeChannel?(
    command: string,
    args: Record<string, unknown>,
    onMessage: (message: unknown) => void,
  ): Promise<unknown>;
}

/** Signals that a native transport was requested from an ordinary browser. */
export class IpcTransportUnavailableError extends Error {
  constructor() {
    super("Native application features are unavailable in this browser.");
    this.name = "IpcTransportUnavailableError";
  }
}

/** Provides a safe, typed error returned by an application command. */
export class IpcApplicationError extends Error {
  /** The validated application error projection. */
  readonly detail: ApplicationErrorDto;

  constructor(detail: ApplicationErrorDto) {
    super(detail.message);
    this.name = "IpcApplicationError";
    this.detail = detail;
  }
}

/** Signals an unstructured transport rejection without exposing its raw payload. */
export class IpcTransportError extends Error {
  constructor() {
    super("The native application could not complete this request.");
    this.name = "IpcTransportError";
  }
}

/**
 * Creates the production transport, which is available only inside a Tauri webview.
 *
 * @throws {@link IpcTransportUnavailableError} when called in a browser or test page.
 */
export function createNativeIpcTransport(): IpcTransport {
  if (!isTauri()) {
    throw new IpcTransportUnavailableError();
  }
  return {
    invoke: (command, args) =>
      args === undefined ? invoke<unknown>(command) : invoke<unknown>(command, args),
    invokeChannel: async (command, args, onMessage) => {
      const channel = new Channel<unknown>();
      channel.onmessage = onMessage;
      try {
        return await invoke<unknown>(command, { ...args, channel });
      } finally {
        channel.onmessage = () => undefined;
      }
    },
  };
}

/**
 * Invokes a command through an explicitly supplied transport and validates
 * the untrusted response before returning its generated DTO.
 *
 * @param transport Native IPC or an explicitly selected test transport.
 * @throws {@link IpcContractError} for malformed successful responses.
 * @throws {@link IpcApplicationError} for valid structured backend errors.
 * @throws {@link IpcTransportError} for all unstructured transport failures.
 */
async function invokeValidated<T>(
  transport: IpcTransport,
  command: string,
  parse: (value: unknown) => T,
  args?: Record<string, unknown>,
): Promise<T> {
  let response: unknown;
  try {
    response = await transport.invoke(command, args);
  } catch (error: unknown) {
    let detail: ApplicationErrorDto;
    try {
      detail = parseApplicationErrorDto(error);
    } catch {
      throw new IpcTransportError();
    }
    throw new IpcApplicationError(detail);
  }
  return parse(response);
}

/** Reads and validates the helper status projection from the native backend. */
export function getHelperStatus(transport: IpcTransport): Promise<HelperStatusDto> {
  return invokeValidated(transport, "get_helper_status", parseHelperStatusDto);
}

/** Reads persisted theme and density settings from the native backend. */
export function getAppearanceSettings(transport: IpcTransport): Promise<AppearanceSettingsDto> {
  return invokeValidated(transport, "get_appearance_settings", parseAppearanceSettingsDto);
}

/** Persists theme and density together, then confirms the native unit result. */
export async function setAppearanceSettings(
  transport: IpcTransport,
  settings: AppearanceSettingsDto,
): Promise<void> {
  const response = await invokeValidated(transport, "set_appearance_settings", (value) => value, {
    settings,
  });
  if (response !== null) {
    throw new IpcContractError();
  }
}

/** Reads the nonsensitive persistent or session-only credential mode. */
export function getCredentialStorageStatus(
  transport: IpcTransport,
): Promise<CredentialStorageStatusDto> {
  return invokeValidated(
    transport,
    "get_credential_storage_status",
    parseCredentialStorageStatusDto,
  );
}

/** Selects explicitly requested, process-memory-only credential storage. */
export function useSessionOnlyStorage(
  transport: IpcTransport,
): Promise<CredentialStorageStatusDto> {
  return invokeValidated(transport, "use_session_only_storage", parseCredentialStorageStatusDto);
}

/** Retries access to the native vault without discarding active session data. */
export function retryPersistentStorage(
  transport: IpcTransport,
): Promise<CredentialStorageStatusDto> {
  return invokeValidated(transport, "retry_persistent_storage", parseCredentialStorageStatusDto);
}

/** Opens the native kubeconfig picker and returns only safe import metadata. */
export async function importKubeconfig(
  transport: IpcTransport,
): Promise<CredentialImportResultDto | null> {
  const response = await invokeValidated(transport, "import_kubeconfig", (value) => value);
  return response === null ? null : parseCredentialImportResultDto(response);
}

/** Opens the native talosconfig picker and retains its mTLS context in memory. */
export async function importTalosconfig(
  transport: IpcTransport,
): Promise<TalosCredentialSessionDto | null> {
  const response = await invokeValidated(transport, "import_talosconfig", (value) => value);
  return response === null ? null : parseTalosCredentialSessionDto(response);
}

/** Starts the bounded Talos read and validates every native channel event. */
export async function startTalosProbe(
  transport: IpcTransport,
  sessionId: string,
  node: string,
  onEvent: (event: TalosProbeEventDto) => void,
): Promise<void> {
  if (transport.invokeChannel === undefined) {
    throw new IpcTransportUnavailableError();
  }
  let callbackError: unknown;
  let response: unknown;
  try {
    response = await transport.invokeChannel(
      "start_talos_probe",
      { sessionId, node },
      (message) => {
        if (callbackError !== undefined) {
          return;
        }
        try {
          onEvent(parseTalosProbeEventDto(message));
        } catch (error: unknown) {
          callbackError = error;
          void stopTalosProbe(transport, sessionId).catch(() => undefined);
        }
      },
    );
  } catch (error: unknown) {
    let detail: ApplicationErrorDto;
    try {
      detail = parseApplicationErrorDto(error);
    } catch {
      throw new IpcTransportError();
    }
    throw new IpcApplicationError(detail);
  }
  if (callbackError !== undefined) {
    throw callbackError;
  }
  if (response !== null) {
    throw new IpcContractError();
  }
}

/** Requests cancellation of the Talos subscription owned by one session. */
export async function stopTalosProbe(transport: IpcTransport, sessionId: string): Promise<boolean> {
  const result = await invokeValidated(transport, "stop_talos_probe", (value) => value, {
    sessionId,
  });
  if (typeof result !== "boolean") {
    throw new IpcContractError();
  }
  return result;
}

/** Closes and zeroizes a session-only Talos credential context. */
export async function closeTalosSession(
  transport: IpcTransport,
  sessionId: string,
): Promise<boolean> {
  const result = await invokeValidated(transport, "close_talos_session", (value) => value, {
    sessionId,
  });
  if (typeof result !== "boolean") {
    throw new IpcContractError();
  }
  return result;
}
