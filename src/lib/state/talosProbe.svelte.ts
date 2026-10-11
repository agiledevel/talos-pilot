import type { TalosCredentialSessionDto } from "../ipc/generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "../ipc/generated/TalosProbeEventDto";
import type { TalosProbeState } from "../ipc/generated/TalosProbeState";
import type { IpcTransport } from "../ipc/transport";
import {
  closeTalosSession,
  IpcApplicationError,
  importTalosconfig,
  startTalosProbe,
  stopTalosProbe,
} from "../ipc/transport";
import { IpcContractError } from "../ipc/validation";

/**
 * View state for the Talos read probe: one imported session-only Talos context
 * and at most one probe stream against a selected node.
 *
 * The instance owns the imported session until {@link TalosProbePanelState.closeSession}
 * or {@link TalosProbePanelState.dispose}. Only the bounded session projection is
 * held here; the mTLS credentials stay in the backend. A stream that ends or
 * fails after a healthy event is marked stale, so its last values are never
 * presented as current. Actions report failures through
 * {@link TalosProbePanelState.error} and never reject.
 */
export class TalosProbePanelState {
  /** Imported context projection, or `null` when no context is open. */
  session = $state.raw<TalosCredentialSessionDto | null>(null);
  /** Node the next probe targets; empty when the context lists no nodes. */
  node = $state("");
  /** Latest probe projection, or `null` before the first probe. */
  probeEvent = $state.raw<TalosProbeEventDto | null>(null);
  /** Safe message for the last failed action. */
  error = $state<string | null>(null);
  /** True while an import or close is in flight. */
  busy = $state(false);
  /** True while a probe stream is open. */
  probing = $state(false);

  readonly #transport: IpcTransport | undefined;

  /** @param transport Native command boundary; `undefined` in an ordinary browser. */
  constructor(transport: IpcTransport | undefined) {
    this.#transport = transport;
  }

  /** True when native commands are available. */
  get native(): boolean {
    return this.#transport !== undefined;
  }

  /** Imports a Talos context through the native picker; a cancelled picker changes nothing. */
  async importContext(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined || this.session !== null) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      const imported = await importTalosconfig(transport);
      if (imported !== null) {
        this.session = imported;
        this.node = imported.nodes[0] ?? "";
        this.probeEvent = null;
      }
    } catch (cause: unknown) {
      this.error = errorMessage(cause, "The Talos config could not be imported.");
    } finally {
      this.busy = false;
    }
  }

  /** Targets another node of the open context; ignored while a probe or command runs. */
  selectNode(node: string): void {
    if (this.busy || this.probing || this.session === null || !this.session.nodes.includes(node)) {
      return;
    }
    this.node = node;
  }

  /**
   * Opens the probe stream for the selected node and resolves when it ends.
   * Cancellation through {@link TalosProbePanelState.stopProbe} ends the stream;
   * it does not reverse anything on the node, because the probe only reads.
   */
  async runProbe(): Promise<void> {
    const transport = this.#transport;
    const session = this.session;
    if (transport === undefined || session === null || this.node === "" || this.probing) {
      return;
    }
    this.error = null;
    this.probing = true;
    let sawHealthy = false;
    this.probeEvent = {
      session_id: session.session_id,
      state: "connecting",
      version: null,
      stage: null,
      ready: null,
      deleted: false,
      sequence: "0",
    };
    try {
      await startTalosProbe(transport, session.session_id, this.node, (next) => {
        if (next.state === "healthy") {
          sawHealthy = true;
        }
        this.probeEvent = next;
      });
      // A stream that ends without a later event can no longer be current.
      this.#markProbe(sawHealthy ? "stale" : null);
    } catch (cause: unknown) {
      const state = probeFailureState(cause);
      this.#markProbe(state === "stale" && !sawHealthy ? null : state);
      this.error = errorMessage(cause, "The Talos read probe could not complete.");
    } finally {
      this.probing = false;
    }
  }

  /** Requests cancellation of the running probe stream for this session only. */
  async stopProbe(): Promise<void> {
    const transport = this.#transport;
    const session = this.session;
    if (transport === undefined || session === null || !this.probing) {
      return;
    }
    this.error = null;
    try {
      await stopTalosProbe(transport, session.session_id);
    } catch (cause: unknown) {
      this.error = errorMessage(cause, "The Talos stream could not be stopped.");
    }
  }

  /** Stops a running probe and releases the in-memory session; the session stays open if either step fails. */
  async closeSession(): Promise<void> {
    const transport = this.#transport;
    const session = this.session;
    if (transport === undefined || session === null) {
      return;
    }
    this.busy = true;
    this.error = null;
    try {
      if (this.probing) {
        await stopTalosProbe(transport, session.session_id);
      }
      await closeTalosSession(transport, session.session_id);
      this.session = null;
      this.node = "";
      this.probeEvent = null;
    } catch (cause: unknown) {
      this.error = errorMessage(cause, "The in-memory Talos session could not be closed.");
    } finally {
      this.busy = false;
    }
  }

  /**
   * Releases everything this instance owns when its owner goes away: cancels a
   * running probe and closes the session. Failures are ignored because no view
   * remains to report them; the backend drops session-only state on exit.
   */
  dispose(): void {
    const transport = this.#transport;
    const session = this.session;
    if (transport === undefined || session === null) {
      return;
    }
    if (this.probing) {
      stopTalosProbe(transport, session.session_id).catch(() => undefined);
    }
    closeTalosSession(transport, session.session_id).catch(() => undefined);
  }

  #markProbe(state: TalosProbeState | null): void {
    if (state !== null && this.probeEvent !== null) {
      this.probeEvent = { ...this.probeEvent, state };
    }
  }
}

function errorMessage(cause: unknown, fallback: string): string {
  if (cause instanceof IpcApplicationError) {
    return cause.message;
  }
  if (cause instanceof IpcContractError) {
    return "The native application returned an invalid Talos probe response.";
  }
  return fallback;
}

function probeFailureState(cause: unknown): TalosProbeState {
  if (!(cause instanceof IpcApplicationError)) {
    return "stale";
  }
  switch (cause.detail.code) {
    case "TALOS_UNAUTHORIZED":
      return "unauthorized";
    case "TALOS_CERTIFICATE_INVALID":
      return "certificate_invalid";
    case "TALOS_UNAVAILABLE":
      return "unavailable";
    case "TALOS_UNSUPPORTED":
      return "unsupported";
    default:
      return "stale";
  }
}
