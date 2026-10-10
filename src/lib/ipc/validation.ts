import type { ApplicationErrorDto } from "./generated/ApplicationErrorDto";
import type { AppearanceDensity } from "./generated/AppearanceDensity";
import type { AppearanceSettingsDto } from "./generated/AppearanceSettingsDto";
import type { AppearanceTheme } from "./generated/AppearanceTheme";
import type { CredentialImportResultDto } from "./generated/CredentialImportResultDto";
import type { CredentialStorageModeDto } from "./generated/CredentialStorageModeDto";
import type { CredentialStorageStatusDto } from "./generated/CredentialStorageStatusDto";
import type { HelperCapability } from "./generated/HelperCapability";
import type { HelperState } from "./generated/HelperState";
import type { HelperStatusDto } from "./generated/HelperStatusDto";
import type { TalosCredentialSessionDto } from "./generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "./generated/TalosProbeEventDto";
import type { TalosProbeState } from "./generated/TalosProbeState";

const HELPER_STATES: ReadonlySet<string> = new Set(["stopped", "starting", "ready", "failed"]);
const HELPER_CAPABILITIES: ReadonlySet<string> = new Set(["status", "talos_probe"]);
const MAX_BUILD_ID_LENGTH = 128;
const MAX_ERROR_FIELD_LENGTH = 256;
const MAX_ERROR_MESSAGE_LENGTH = 1024;
const MAX_CAPABILITY_COUNT = 8;
const MAX_CONTEXT_NAME_LENGTH = 128;
const TALOS_PROBE_STATES: ReadonlySet<string> = new Set([
  "connecting",
  "healthy",
  "stale",
  "unauthorized",
  "certificate_invalid",
  "unavailable",
  "unsupported",
]);

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

/** Validates persisted appearance settings received from native IPC. */
export function parseAppearanceSettingsDto(value: unknown): AppearanceSettingsDto {
  if (!isRecord(value) || !isAppearanceTheme(value.theme) || !isAppearanceDensity(value.density)) {
    throw new IpcContractError();
  }
  return {
    theme: value.theme,
    density: value.density,
  };
}

/** Validates the nonsensitive credential persistence status from native IPC. */
export function parseCredentialStorageStatusDto(value: unknown): CredentialStorageStatusDto {
  if (!isRecord(value) || !isCredentialStorageMode(value.mode)) {
    throw new IpcContractError();
  }
  return { mode: value.mode };
}

/** Validates safe metadata returned after a native kubeconfig import. */
export function parseCredentialImportResultDto(value: unknown): CredentialImportResultDto {
  if (
    !isRecord(value) ||
    !isSafeContextLabel(value.context_name) ||
    !isCredentialStorageMode(value.storage_mode) ||
    value.storage_mode === "vault_not_checked" ||
    value.storage_mode === "vault_unavailable"
  ) {
    throw new IpcContractError();
  }
  return {
    context_name: value.context_name,
    storage_mode: value.storage_mode,
  };
}

/** Validates safe metadata returned after importing a native Talos context. */
export function parseTalosCredentialSessionDto(value: unknown): TalosCredentialSessionDto {
  if (
    !isRecord(value) ||
    !isTalosSessionId(value.session_id) ||
    !isSafeContextLabel(value.context_name) ||
    value.storage_mode !== "session_only" ||
    !isSafeIdentityArray(value.endpoints, 8) ||
    !isSafeIdentityArray(value.nodes, 64)
  ) {
    throw new IpcContractError();
  }
  return {
    session_id: value.session_id,
    context_name: value.context_name,
    endpoints: value.endpoints,
    nodes: value.nodes,
    storage_mode: "session_only",
  };
}

/** Validates one bounded, sequenced Talos probe event from the native channel. */
export function parseTalosProbeEventDto(value: unknown): TalosProbeEventDto {
  if (
    !isRecord(value) ||
    !isTalosSessionId(value.session_id) ||
    !isTalosProbeState(value.state) ||
    !(value.version === null || isSafeTalosVersion(value.version)) ||
    !(value.stage === null || isSafeTalosStage(value.stage)) ||
    !(value.ready === null || typeof value.ready === "boolean") ||
    typeof value.deleted !== "boolean" ||
    typeof value.sequence !== "string" ||
    !/^(0|[1-9][0-9]{0,2})$/u.test(value.sequence) ||
    Number(value.sequence) > 256
  ) {
    throw new IpcContractError();
  }
  if (value.state === "connecting" && (value.version !== null || value.stage !== null)) {
    throw new IpcContractError();
  }
  return {
    session_id: value.session_id,
    state: value.state,
    version: value.version,
    stage: value.stage,
    ready: value.ready,
    deleted: value.deleted,
    sequence: value.sequence,
  };
}

function isAppearanceTheme(value: unknown): value is AppearanceTheme {
  return value === "system" || value === "light" || value === "dark";
}

function isAppearanceDensity(value: unknown): value is AppearanceDensity {
  return value === "comfortable" || value === "compact";
}

function isCredentialStorageMode(value: unknown): value is CredentialStorageModeDto {
  return (
    value === "vault_not_checked" ||
    value === "persistent" ||
    value === "persistent_with_session_only" ||
    value === "vault_unavailable" ||
    value === "session_only"
  );
}

function isTalosProbeState(value: unknown): value is TalosProbeState {
  return typeof value === "string" && TALOS_PROBE_STATES.has(value);
}

function isTalosSessionId(value: unknown): value is string {
  return typeof value === "string" && /^talos-session-[0-9]+$/u.test(value);
}

function isSafeIdentityArray(value: unknown, maximum: number): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximum &&
    value.every(
      (item: unknown) =>
        typeof item === "string" &&
        item.length > 0 &&
        item.length <= 253 &&
        Array.from(item).every(
          (character) => /[A-Za-z0-9]/u.test(character) || ":._[]-".includes(character),
        ),
    ) &&
    new Set(value).size === value.length
  );
}

function isSafeTalosVersion(value: unknown): value is string {
  return typeof value === "string" && value.length <= 64 && /^[A-Za-z0-9._+-]+$/u.test(value);
}

function isSafeTalosStage(value: unknown): value is string {
  return typeof value === "string" && value.length <= 32 && /^[A-Za-z0-9_]+$/u.test(value);
}

function isBoundedString(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength;
}

function isSafeContextLabel(value: unknown): value is string {
  return (
    isBoundedString(value, MAX_CONTEXT_NAME_LENGTH) &&
    !Array.from(value).some((character) => {
      const codePoint = character.codePointAt(0);
      return (
        codePoint === undefined ||
        codePoint <= 0x1f ||
        (codePoint >= 0x7f && codePoint <= 0x9f) ||
        (codePoint >= 0x202a && codePoint <= 0x202e) ||
        (codePoint >= 0x2066 && codePoint <= 0x2069)
      );
    })
  );
}
