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
import type { KubernetesCredentialSummaryDto } from "./generated/KubernetesCredentialSummaryDto";
import type { KubernetesPodListDto } from "./generated/KubernetesPodListDto";
import type { KubernetesPodReadinessDto } from "./generated/KubernetesPodReadinessDto";
import type { KubernetesSessionDto } from "./generated/KubernetesSessionDto";
import type { KubernetesVersionDto } from "./generated/KubernetesVersionDto";
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
const MAX_VERSION_FIELD_LENGTH = 64;
/**
 * Upper bound on one credential listing projection.
 *
 * The backend caps stored credentials and session-only credentials at 256 each,
 * so no accepted response can exceed their sum.
 */
const MAX_CREDENTIAL_LIST_LENGTH = 512;
const MAX_POD_LIST_LENGTH = 10_000;
const UTF8_ENCODER = new TextEncoder();
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
    !isCredentialHandle(value.credential_handle) ||
    !isSafeContextLabel(value.context_name) ||
    !isCredentialStorageMode(value.storage_mode) ||
    value.storage_mode === "vault_not_checked" ||
    value.storage_mode === "vault_unavailable"
  ) {
    throw new IpcContractError();
  }
  return {
    credential_handle: value.credential_handle,
    context_name: value.context_name,
    storage_mode: value.storage_mode,
  };
}

/**
 * Validates the bounded credential listing returned for an explicit user action.
 *
 * The backend never produces this projection at startup, so an empty list means
 * "nothing stored", not "not yet loaded". Each entry carries an opaque handle
 * and the mode the entry currently lives in; a handle is not an authorization
 * grant, and this validator does not treat it as one.
 *
 * @throws {@link IpcContractError} for an oversized list, duplicate handles, or an entry that is not a stored credential identity.
 */
export function parseKubernetesCredentialList(value: unknown): KubernetesCredentialSummaryDto[] {
  if (!Array.isArray(value) || value.length > MAX_CREDENTIAL_LIST_LENGTH) {
    throw new IpcContractError();
  }
  const summaries = value.map((entry) => {
    if (
      !isRecord(entry) ||
      !isCredentialHandle(entry.credential_handle) ||
      !isSafeContextLabel(entry.context_label) ||
      !isStoredCredentialMode(entry.storage_mode)
    ) {
      throw new IpcContractError();
    }
    return {
      credential_handle: entry.credential_handle,
      context_label: entry.context_label,
      storage_mode: entry.storage_mode,
    };
  });
  if (new Set(summaries.map((entry) => entry.credential_handle)).size !== summaries.length) {
    throw new IpcContractError();
  }
  return summaries;
}

/** Validates safe metadata for one opened Kubernetes credential session. */
export function parseKubernetesSessionDto(value: unknown): KubernetesSessionDto {
  if (
    !isRecord(value) ||
    !isKubernetesSessionId(value.session_id) ||
    !isSafeContextLabel(value.context_label) ||
    !isStoredCredentialMode(value.storage_mode)
  ) {
    throw new IpcContractError();
  }
  return {
    session_id: value.session_id,
    context_label: value.context_label,
    storage_mode: value.storage_mode,
  };
}

/** Validates the nonsensitive API server version read through one session. */
export function parseKubernetesVersionDto(value: unknown): KubernetesVersionDto {
  if (
    !isRecord(value) ||
    !isKubernetesSessionId(value.session_id) ||
    !isVersionField(value.version) ||
    !isVersionField(value.major) ||
    !isVersionField(value.minor)
  ) {
    throw new IpcContractError();
  }
  return {
    session_id: value.session_id,
    version: value.version,
    major: value.major,
    minor: value.minor,
  };
}

/** Validates a bounded, namespaced Pod projection returned by native IPC. */
export function parseKubernetesPodListDto(value: unknown): KubernetesPodListDto {
  if (
    !isRecord(value) ||
    !isKubernetesSessionId(value.session_id) ||
    !isKubernetesNamespace(value.namespace) ||
    !isBoundedUtf8String(value.resource_version, 128) ||
    typeof value.complete !== "boolean" ||
    !Array.isArray(value.items) ||
    value.items.length > MAX_POD_LIST_LENGTH
  ) {
    throw new IpcContractError();
  }
  const namespace = value.namespace;

  const items = value.items.map((item): KubernetesPodListDto["items"][number] => {
    if (
      !isRecord(item) ||
      !isKubernetesPodName(item.name) ||
      !isKubernetesNamespace(item.namespace) ||
      item.namespace !== namespace ||
      !isBoundedUtf8String(item.uid, 64) ||
      !isBoundedUtf8String(item.resource_version, 128) ||
      !isBoundedUtf8String(item.phase, 32) ||
      !isKubernetesPodReadiness(item.readiness)
    ) {
      throw new IpcContractError();
    }
    return {
      name: item.name,
      namespace: item.namespace,
      uid: item.uid,
      resource_version: item.resource_version,
      phase: item.phase,
      readiness: item.readiness,
    };
  });

  return {
    session_id: value.session_id,
    namespace: value.namespace,
    resource_version: value.resource_version,
    complete: value.complete,
    items,
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
    !isBoundedDecimal(value.sequence) ||
    Number(value.sequence) > 256 ||
    !isBoundedDecimal(value.generation) ||
    Number(value.generation) < 1 ||
    Number(value.generation) > 256 ||
    typeof value.snapshot !== "boolean"
  ) {
    throw new IpcContractError();
  }
  if (value.state === "connecting" && (value.version !== null || value.stage !== null)) {
    throw new IpcContractError();
  }
  if (
    value.state === "stale" &&
    (value.version !== null || value.stage !== null || value.ready !== null)
  ) {
    // A stale marker repeats the identity of the projection it invalidates and
    // carries no data: the view keeps its retained values and marks them stale.
    throw new IpcContractError();
  }
  if (value.state === "stale" && (value.snapshot || value.deleted)) {
    throw new IpcContractError();
  }
  if (value.state === "healthy" && value.stage === null) {
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
    generation: value.generation,
    snapshot: value.snapshot,
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

/**
 * Narrows a value to a mode a single stored credential can live in.
 *
 * A listing entry is either encrypted and persistent or held in process
 * memory; the runtime-wide modes describe what a *new* import would do and
 * must not be reported for one already-stored credential.
 */
function isStoredCredentialMode(value: unknown): value is CredentialStorageModeDto {
  return value === "persistent" || value === "session_only";
}

/**
 * Narrows a value to an opaque Kubernetes credential handle.
 *
 * The backend issues `kubecred-` plus a 16-byte URL-safe base64 reference, so
 * the shape is checkable without interpreting the handle. Possessing a
 * well-formed handle is not authorization: the backend re-validates its kind,
 * profile, and storage mode before use.
 */
function isCredentialHandle(value: unknown): value is string {
  return typeof value === "string" && /^kubecred-[A-Za-z0-9_-]{22}$/u.test(value);
}

/** Narrows a value to a backend-issued Kubernetes session identifier. */
function isKubernetesSessionId(value: unknown): value is string {
  return typeof value === "string" && /^kube-session-[0-9]+$/u.test(value);
}

function isBoundedUtf8String(value: unknown, maxBytes: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maxBytes &&
    UTF8_ENCODER.encode(value).byteLength <= maxBytes &&
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

function isKubernetesNamespace(value: unknown): value is string {
  return isBoundedUtf8String(value, 63) && /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u.test(value);
}

function isKubernetesPodName(value: unknown): value is string {
  return (
    isBoundedUtf8String(value, 253) &&
    value.split(".").every((part) => /^[a-z0-9](?:[-a-z0-9]*[a-z0-9])?$/u.test(part))
  );
}

function isKubernetesPodReadiness(value: unknown): value is KubernetesPodReadinessDto {
  return value === "ready" || value === "not_ready" || value === "unknown";
}

/** Narrows a value to one bounded, nonsecret Kubernetes version field. */
function isVersionField(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_VERSION_FIELD_LENGTH &&
    /^[A-Za-z0-9._+-]+$/u.test(value)
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

/** Accepts a canonical decimal string for a sequence or generation bound to 256. */
function isBoundedDecimal(value: unknown): value is string {
  return typeof value === "string" && /^(0|[1-9][0-9]{0,2})$/u.test(value);
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
