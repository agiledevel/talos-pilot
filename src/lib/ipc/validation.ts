import type { ApplicationErrorDto } from "./generated/ApplicationErrorDto";
import type { HelperCapability } from "./generated/HelperCapability";
import type { HelperState } from "./generated/HelperState";
import type { HelperStatusDto } from "./generated/HelperStatusDto";

const HELPER_STATES: ReadonlySet<string> = new Set(["stopped", "starting", "ready", "failed"]);
const HELPER_CAPABILITIES: ReadonlySet<string> = new Set(["status"]);
const MAX_BUILD_ID_LENGTH = 128;
const MAX_ERROR_FIELD_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 1024;
const MAX_CAPABILITY_COUNT = 8;

/** Describes a malformed value received across the native IPC boundary. */
export class IpcContractError extends Error {
  constructor() {
    super("The native application returned an invalid response.");
    this.name = "IpcContractError";
  }
}

/** Returns whether a value is an object whose fields can be checked safely. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNullableBoundedString(value: unknown, maxLength: number): value is string | null {
  return (
    value === null || (typeof value === "string" && value.length > 0 && value.length <= maxLength)
  );
}

function isHelperState(value: unknown): value is HelperState {
  return typeof value === "string" && HELPER_STATES.has(value);
}

function isHelperCapability(value: unknown): value is HelperCapability {
  return typeof value === "string" && HELPER_CAPABILITIES.has(value);
}

function isHelperCapabilityArray(value: unknown): value is HelperCapability[] {
  return (
    Array.isArray(value) && value.length <= MAX_CAPABILITY_COUNT && value.every(isHelperCapability)
  );
}

/**
 * Validates the helper status projection received from Tauri or a test transport.
 * Unknown additive fields are ignored; required fields, enum tags, ranges, and
 * the relationship between readiness and identity are checked at runtime.
 *
 * @throws {@link IpcContractError} when the value does not match the generated DTO contract.
 */
export function parseHelperStatusDto(value: unknown): HelperStatusDto {
  if (!isRecord(value) || !isHelperState(value.state)) {
    throw new IpcContractError();
  }
  const buildIdentity = value.build_identity;
  const protocolMajor = value.protocol_major;
  const capabilities = value.capabilities;
  if (
    !isNullableBoundedString(buildIdentity, MAX_BUILD_ID_LENGTH) ||
    !(protocolMajor === null || isProtocolMajor(protocolMajor)) ||
    !isHelperCapabilityArray(capabilities) ||
    new Set(capabilities).size !== capabilities.length
  ) {
    throw new IpcContractError();
  }

  const ready = value.state === "ready";
  if (
    (ready &&
      (buildIdentity === null || protocolMajor === null || !capabilities.includes("status"))) ||
    (!ready && (buildIdentity !== null || protocolMajor !== null || capabilities.length !== 0))
  ) {
    throw new IpcContractError();
  }

  return {
    state: value.state,
    build_identity: buildIdentity,
    protocol_major: protocolMajor,
    capabilities,
  };
}

function isProtocolMajor(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && typeof value === "number" && value > 0 && value <= 0xffff_ffff
  );
}

/**
 * Validates a structured, safe application error returned by a Tauri command.
 *
 * @throws {@link IpcContractError} when a required field or bounded value is invalid.
 */
export function parseApplicationErrorDto(value: unknown): ApplicationErrorDto {
  if (
    !isRecord(value) ||
    !isBoundedString(value.code, MAX_ERROR_FIELD_LENGTH) ||
    !isBoundedString(value.action, MAX_ERROR_FIELD_LENGTH) ||
    !(value.target === null || isBoundedString(value.target, MAX_ERROR_FIELD_LENGTH)) ||
    typeof value.retryable !== "boolean" ||
    !isBoundedString(value.message, MAX_ERROR_MESSAGE_LENGTH)
  ) {
    throw new IpcContractError();
  }
  return {
    code: value.code,
    action: value.action,
    target: value.target,
    retryable: value.retryable,
    message: value.message,
  };
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}
