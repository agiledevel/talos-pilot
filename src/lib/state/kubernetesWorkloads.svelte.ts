import type { KubernetesCredentialSummaryDto } from "../ipc/generated/KubernetesCredentialSummaryDto";
import type { KubernetesPodListDto } from "../ipc/generated/KubernetesPodListDto";
import type { KubernetesSessionDto } from "../ipc/generated/KubernetesSessionDto";
import type { IpcTransport } from "../ipc/transport";
import {
  closeKubernetesSession,
  IpcApplicationError,
  IpcTransportError,
  listKubernetesCredentials,
  listKubernetesPods,
  openKubernetesSession,
} from "../ipc/transport";
import { IpcContractError } from "../ipc/validation";

/** Cache identity for one whole backend-collected Pod snapshot. */
export type KubernetesPodQueryKey = readonly [
  "kubernetes",
  "pods",
  string,
  string,
  "pods",
  string | null,
  string | null,
  "complete-snapshot",
  number,
];

const DISABLED_QUERY_KEY: KubernetesPodQueryKey = [
  "kubernetes",
  "pods",
  "",
  "",
  "pods",
  null,
  null,
  "complete-snapshot",
  0,
];

/**
 * Shell-owned state for the Kubernetes workload view.
 *
 * It owns one backend session and only safe credential/session projections.
 * Pod snapshots stay in TanStack Query's cache. Every snapshot key includes
 * the session, namespace, resource, selectors, and the backend's complete-
 * snapshot page identity, so a late response for an earlier query cannot be
 * displayed for a replacement context. Disposing the shell closes its session.
 */
export class KubernetesWorkloadsState {
  /** Credentials loaded only after the user asks to show saved contexts. */
  credentials = $state.raw<readonly KubernetesCredentialSummaryDto[]>([]);
  /** Opaque handle selected for the next session. */
  selectedHandle = $state("");
  /** Current backend session, or `null` when none is open. */
  session = $state.raw<KubernetesSessionDto | null>(null);
  /** Namespace used for the next explicit list request. */
  namespace = $state("default");
  /** Optional Kubernetes label selector. */
  labelSelector = $state("");
  /** Optional Kubernetes field selector. */
  fieldSelector = $state("");
  /** Safe message for credential listing or session actions. */
  actionError = $state<string | null>(null);
  /** True while a credential or session command is running. */
  busy = $state(false);
  /** Whether a Pod list has been requested for the current input identity. */
  hasRequestedPods = $state(false);

  #queryKey = $state.raw<KubernetesPodQueryKey | null>(null);
  #requestGeneration = $state(0);
  readonly #transport: IpcTransport | undefined;

  /** @param transport Native command boundary; `undefined` in an ordinary browser. */
  constructor(transport: IpcTransport | undefined) {
    this.#transport = transport;
  }

  /** True when native commands are available. */
  get native(): boolean {
    return this.#transport !== undefined;
  }

  /** Current complete-snapshot query identity, or `null` before a list request. */
  get queryKey(): KubernetesPodQueryKey | null {
    const requested = this.#queryKey;
    const session = this.session;
    if (requested === null || session === null) {
      return null;
    }
    const current = this.#makeQueryKey(session.session_id, requested[8]);
    return requested.every((part, index) => part === current[index]) ? requested : null;
  }

  /** Returns reactive TanStack options for the current query identity. */
  queryOptions() {
    const currentKey = this.queryKey;
    const queryKey = currentKey ?? DISABLED_QUERY_KEY;
    return {
      queryKey,
      enabled: currentKey !== null,
      queryFn: ({ queryKey: requestedKey }: { queryKey: KubernetesPodQueryKey }) =>
        this.#readSnapshot(requestedKey),
      retry: false,
      staleTime: 0,
      gcTime: 0,
    };
  }

  /** Loads saved credential labels after the user explicitly requests them. */
  async loadCredentials(): Promise<void> {
    const transport = this.#transport;
    if (transport === undefined || this.busy) {
      return;
    }
    this.busy = true;
    this.actionError = null;
    try {
      this.credentials = await listKubernetesCredentials(transport);
      if (
        !this.credentials.some((credential) => credential.credential_handle === this.selectedHandle)
      ) {
        this.selectedHandle = this.credentials[0]?.credential_handle ?? "";
      }
    } catch (cause: unknown) {
      this.actionError = safeActionError(cause, "Saved Kubernetes contexts could not be loaded.");
    } finally {
      this.busy = false;
    }
  }

  /** Selects only a handle present in the latest validated credential listing. */
  selectCredential(handle: string): void {
    if (this.credentials.some((credential) => credential.credential_handle === handle)) {
      this.selectedHandle = handle;
    }
  }

  /** Opens the selected credential, closing the prior session before replacement. */
  async openSession(): Promise<void> {
    const transport = this.#transport;
    const selected = this.selectedHandle;
    if (
      transport === undefined ||
      selected === "" ||
      !this.credentials.some((credential) => credential.credential_handle === selected) ||
      this.busy
    ) {
      return;
    }

    this.busy = true;
    this.actionError = null;
    this.#queryKey = null;
    this.hasRequestedPods = false;
    try {
      const previous = this.session;
      if (previous !== null) {
        await closeKubernetesSession(transport, previous.session_id);
        this.session = null;
      }
      const session = await openKubernetesSession(transport, selected);
      this.session = session;
    } catch (cause: unknown) {
      this.actionError = safeActionError(cause, "The Kubernetes session could not be opened.");
    } finally {
      this.busy = false;
    }
  }

  /** Starts a Pod snapshot request using the current session and query fields. */
  listPods(): void {
    if (this.#transport === undefined || this.session === null || this.busy) {
      return;
    }
    this.#requestGeneration =
      this.#requestGeneration === Number.MAX_SAFE_INTEGER ? 1 : this.#requestGeneration + 1;
    this.#queryKey = this.#makeQueryKey(this.session.session_id, this.#requestGeneration);
    this.hasRequestedPods = true;
  }

  /** Closes the current backend session and hides its snapshot identity. */
  async closeSession(): Promise<void> {
    const transport = this.#transport;
    const session = this.session;
    if (transport === undefined || session === null || this.busy) {
      return;
    }
    this.busy = true;
    this.actionError = null;
    this.#queryKey = null;
    this.hasRequestedPods = false;
    try {
      await closeKubernetesSession(transport, session.session_id);
      this.session = null;
    } catch (cause: unknown) {
      this.actionError = safeActionError(cause, "The Kubernetes session could not be closed.");
    } finally {
      this.busy = false;
    }
  }

  /** Closes the shell-owned Kubernetes session when the application shell unmounts. */
  dispose(): void {
    const transport = this.#transport;
    const session = this.session;
    if (transport !== undefined && session !== null) {
      closeKubernetesSession(transport, session.session_id).catch(() => undefined);
    }
  }

  async #readSnapshot(queryKey: KubernetesPodQueryKey): Promise<KubernetesPodListDto> {
    const transport = this.#transport;
    const [
      ,
      ,
      sessionId,
      namespace,
      resource,
      labelSelector,
      fieldSelector,
      pageIdentity,
      generation,
    ] = queryKey;
    if (
      transport === undefined ||
      sessionId === "" ||
      resource !== "pods" ||
      pageIdentity !== "complete-snapshot" ||
      !Number.isSafeInteger(generation) ||
      generation < 1
    ) {
      throw new IpcContractError();
    }
    const result = await listKubernetesPods(
      transport,
      sessionId,
      namespace,
      labelSelector,
      fieldSelector,
    );
    if (result.session_id !== sessionId || result.namespace !== namespace) {
      throw new IpcContractError();
    }
    return result;
  }

  #makeQueryKey(sessionId: string, generation: number): KubernetesPodQueryKey {
    return [
      "kubernetes",
      "pods",
      sessionId,
      this.namespace.trim(),
      "pods",
      optionalSelector(this.labelSelector),
      optionalSelector(this.fieldSelector),
      "complete-snapshot",
      generation,
    ];
  }
}

/** A safe outcome label and message for one Pod-list error state. */
export interface KubernetesPodListError {
  /** Distinct state suitable for visible text. */
  readonly outcome: string;
  /** Sanitized application message or a static fallback. */
  readonly message: string;
}

/** Maps stable backend error codes to distinct, user-facing list states. */
export function kubernetesPodListError(cause: unknown): KubernetesPodListError {
  if (cause instanceof IpcApplicationError) {
    const outcome = POD_ERROR_OUTCOMES[cause.detail.code] ?? "List failed";
    return { outcome, message: cause.message };
  }
  if (cause instanceof IpcContractError) {
    return {
      outcome: "Invalid response",
      message: "The Kubernetes API returned data that does not match the supported Pod summary.",
    };
  }
  if (cause instanceof IpcTransportError) {
    return { outcome: "Unavailable", message: cause.message };
  }
  return { outcome: "List failed", message: "The Pod list could not be loaded." };
}

const POD_ERROR_OUTCOMES: Readonly<Record<string, string>> = {
  KUBERNETES_UNAUTHORIZED: "Unauthorized",
  KUBERNETES_FORBIDDEN: "Forbidden",
  KUBERNETES_API_UNSUPPORTED: "Pod API unsupported",
  KUBERNETES_NAMESPACE_NOT_FOUND: "Namespace not found",
  KUBERNETES_CONTINUATION_EXPIRED: "Snapshot expired",
  KUBERNETES_CERTIFICATE_INVALID: "TLS certificate invalid",
  KUBERNETES_UNAVAILABLE: "Kubernetes unavailable",
  KUBERNETES_CAPACITY_EXCEEDED: "Request capacity reached",
  KUBERNETES_QUERY_INVALID: "Invalid list query",
  KUBERNETES_RESPONSE_INVALID: "Invalid API response",
};

function optionalSelector(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function safeActionError(cause: unknown, fallback: string): string {
  if (cause instanceof IpcApplicationError) {
    return cause.message;
  }
  if (cause instanceof IpcContractError) {
    return "The native application returned invalid Kubernetes data.";
  }
  if (cause instanceof IpcTransportError) {
    return cause.message;
  }
  return fallback;
}
