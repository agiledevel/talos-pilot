import type { CredentialStorageModeDto } from "../ipc/generated/CredentialStorageModeDto";
import type { TalosCredentialSessionDto } from "../ipc/generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "../ipc/generated/TalosProbeEventDto";

/** The part of the Talos probe state that the status bar summarises. */
export interface TalosContextStatus {
  /** Open session-only context, or `null` when none is imported. */
  readonly session: TalosCredentialSessionDto | null;
  /** Node the probe targets. */
  readonly node: string;
  /** True while a probe stream is open. */
  readonly probing: boolean;
  /** Latest probe projection, or `null` before the first probe. */
  readonly probeEvent: TalosProbeEventDto | null;
}

/**
 * Describes where imported credentials are kept, for the status bar.
 *
 * @param mode Storage mode reported by the backend, or `null` when it has not
 * reported one: before the first load completes and after a failed load.
 * @param native False in an ordinary browser, where no storage exists.
 */
export function credentialStorageSummary(
  mode: CredentialStorageModeDto | null,
  native: boolean,
): string {
  if (!native) {
    return "desktop application only";
  }
  switch (mode) {
    case null:
      return "status not loaded";
    case "vault_not_checked":
      return "operating system vault, not yet used";
    case "persistent":
      return "operating system vault";
    case "persistent_with_session_only":
      return "operating system vault, earlier session-only credentials in memory";
    case "vault_unavailable":
      return "vault unavailable";
    case "session_only":
      return "session-only";
  }
}

/**
 * Describes the imported Talos context for the status bar.
 *
 * The node and probe state appear only while the stream is open. A finished
 * stream leaves its last projection in the Talos view, which labels it; the
 * status bar never repeats it as the current state.
 */
export function talosContextSummary(status: TalosContextStatus): string {
  if (status.session === null) {
    return "no context";
  }
  const context = `${status.session.context_name} (session-only)`;
  if (!status.probing || status.probeEvent === null) {
    return context;
  }
  return `${context} · ${status.node} · ${status.probeEvent.state.replaceAll("_", " ")}`;
}
