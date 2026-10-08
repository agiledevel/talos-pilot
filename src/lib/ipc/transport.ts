import { invoke, isTauri } from "@tauri-apps/api/core";

import type { ApplicationErrorDto } from "./generated/ApplicationErrorDto";
import type { HelperStatusDto } from "./generated/HelperStatusDto";
import { parseApplicationErrorDto, parseHelperStatusDto } from "./validation";

/** Supplies the one native read currently exposed to the renderer. */
export interface IpcTransport {
  /** Requests a helper status payload that is validated by the IPC adapter. */
  getHelperStatus(): Promise<unknown>;
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
    getHelperStatus: () => invoke<unknown>("get_helper_status"),
  };
}

/**
 * Reads helper status through an explicitly supplied transport and validates
 * the untrusted response before returning the generated DTO.
 *
 * @param transport Native IPC or an explicitly selected test transport.
 * @throws {@link IpcContractError} for malformed successful responses.
 * @throws {@link IpcApplicationError} for valid structured backend errors.
 * @throws {@link IpcTransportError} for all unstructured transport failures.
 */
export async function getHelperStatus(transport: IpcTransport): Promise<HelperStatusDto> {
  let response: unknown;
  try {
    response = await transport.getHelperStatus();
  } catch (error: unknown) {
    let detail: ApplicationErrorDto;
    try {
      detail = parseApplicationErrorDto(error);
    } catch {
      throw new IpcTransportError();
    }
    throw new IpcApplicationError(detail);
  }
  return parseHelperStatusDto(response);
}
