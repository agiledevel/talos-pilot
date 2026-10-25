import type { KubernetesPodDto } from "./generated/KubernetesPodDto";
import type { KubernetesPodWatchEndDto } from "./generated/KubernetesPodWatchEndDto";
import type { KubernetesPodWatchEventDto } from "./generated/KubernetesPodWatchEventDto";
import type { KubernetesPodWatchSubscriptionDto } from "./generated/KubernetesPodWatchSubscriptionDto";
import type { IpcTransport } from "./transport";
import {
  openKubernetesPodWatch,
  stopKubernetesPodWatch,
  streamKubernetesPodWatch,
} from "./transport";
import { IpcContractError } from "./validation";

const MAX_SNAPSHOT_PODS = 10_000;
const SNAPSHOT_BATCH_ITEMS = 200;

/** Internal per-consumer event with an independent sequence after IPC validation. */
export type KubernetesPodWatchConsumerEvent = Omit<KubernetesPodWatchEventDto, "sequence"> & {
  readonly sequence: string;
};

type Listener = (event: KubernetesPodWatchConsumerEvent) => void;

interface Consumer {
  readonly listener: Listener;
  readonly finish: (end: KubernetesPodWatchEndDto) => void;
  activated: boolean;
  active: boolean;
  failed: boolean;
  sequence: bigint;
}

interface SharedWatch {
  readonly key: string;
  readonly transport: IpcTransport;
  readonly sessionId: string;
  readonly consumers: Map<symbol, Consumer>;
  readonly ready: Promise<KubernetesPodWatchSubscriptionDto>;
  identity: KubernetesPodWatchSubscriptionDto | null;
  readonly live: Map<string, KubernetesPodDto>;
  readonly closed: Promise<void>;
  resolveClosed: () => void;
  staging: Map<string, KubernetesPodDto> | null;
  generation: string;
  sourceSequence: bigint;
  terminal: boolean;
  closing: boolean;
}

const registries = new WeakMap<IpcTransport, Map<string, SharedWatch>>();

/** One owner lease on an IPC watch shared by identical Pod queries. */
export interface KubernetesPodWatchLease {
  /** Backend session and subscription identities shared by this query. */
  readonly identity: KubernetesPodWatchSubscriptionDto;
  /** Resolves when this consumer stops or the shared watch ends. */
  readonly done: Promise<KubernetesPodWatchEndDto>;
  /** Starts delivering events to this owner after its state is ready to validate them. */
  activate(): void;
  /** Releases only this owner; the backend watch stops when the last owner leaves. */
  release(): Promise<void>;
}

/**
 * Acquires a consumer lease for a query. Matching consumers share one native
 * subscription and one ordered IPC stream; each consumer receives its own
 * sequence space and an atomic replay of the latest completed snapshot.
 *
 * @param transport Native IPC transport that owns the Kubernetes session.
 * @param query Validated query identity. The session, namespace, and selectors define sharing.
 * @param listener Applies one event to this consumer's projection.
 * @returns An inactive lease. Call `activate` after storing its subscription identity.
 * @throws Transport or application errors returned while opening the watch.
 */
export async function acquireKubernetesPodWatch(
  transport: IpcTransport,
  query: {
    readonly sessionId: string;
    readonly namespace: string;
    readonly labelSelector: string | null;
    readonly fieldSelector: string | null;
  },
  listener: Listener,
): Promise<KubernetesPodWatchLease> {
  const key = JSON.stringify([
    query.sessionId,
    query.namespace,
    query.labelSelector,
    query.fieldSelector,
  ]);
  let registry = registries.get(transport);
  if (registry === undefined) {
    registry = new Map();
    registries.set(transport, registry);
  }

  let shared: SharedWatch;
  while (true) {
    const existing = registry.get(key);
    if (existing?.closing || existing?.terminal) {
      await existing.closed;
      continue;
    }
    if (existing !== undefined) {
      shared = existing;
      break;
    }
    shared = createSharedWatch(transport, key, query);
    registry.set(key, shared);
    const current = shared;
    void current.ready.then(
      (identity) => {
        current.identity = identity;
        void streamKubernetesPodWatch(
          transport,
          identity.session_id,
          identity.subscription_id,
          (event) => distribute(current, event),
        ).then(
          (end) => finishShared(current, end),
          () => finishShared(current, "failed"),
        );
      },
      () => finishShared(current, "failed"),
    );
    break;
  }

  const current = shared;
  const consumerId = Symbol("kubernetes-pod-watch-consumer");
  let finishConsumer!: (end: KubernetesPodWatchEndDto) => void;
  const done = new Promise<KubernetesPodWatchEndDto>((resolve) => {
    finishConsumer = resolve;
  });
  const consumer: Consumer = {
    listener,
    finish: finishConsumer,
    activated: false,
    active: false,
    failed: false,
    sequence: 0n,
  };
  current.consumers.set(consumerId, consumer);
  let identity: KubernetesPodWatchSubscriptionDto;
  try {
    identity = await current.ready;
  } catch (cause: unknown) {
    current.consumers.delete(consumerId);
    throw cause;
  }
  if (current.terminal || current.closing) {
    current.consumers.delete(consumerId);
    finishConsumer("failed");
    throw new Error("The Kubernetes watch ended before this consumer joined.");
  }
  let released = false;
  return {
    identity,
    done,
    activate() {
      if (released || current.terminal || consumer.activated) return;
      consumer.activated = true;
      consumer.active = true;
      if (current.generation !== "" && current.staging === null) {
        replaySnapshot(current, consumer);
      } else if (current.staging !== null) {
        consumer.active = false;
      }
      if (consumer.failed) {
        current.consumers.delete(consumerId);
        if (current.consumers.size === 0) closeUnusedShared(current);
      }
    },
    async release() {
      if (released) return;
      released = true;
      current.consumers.delete(consumerId);
      finishConsumer("stopped");
      if (current.consumers.size === 0 && !current.terminal && !current.closing) {
        current.closing = true;
        const backendIdentity = await current.ready.catch(() => null);
        if (backendIdentity !== null) {
          await stopKubernetesPodWatch(
            transport,
            backendIdentity.session_id,
            backendIdentity.subscription_id,
          ).catch(() => false);
        }
        finishShared(current, "stopped");
      }
    },
  };
}

function createSharedWatch(
  transport: IpcTransport,
  key: string,
  query: {
    readonly sessionId: string;
    readonly namespace: string;
    readonly labelSelector: string | null;
    readonly fieldSelector: string | null;
  },
): SharedWatch {
  const ready = openKubernetesPodWatch(
    transport,
    query.sessionId,
    query.namespace,
    query.labelSelector,
    query.fieldSelector,
  );
  let resolveClosed!: () => void;
  const closed = new Promise<void>((resolve) => {
    resolveClosed = resolve;
  });
  return {
    key,
    transport,
    sessionId: query.sessionId,
    consumers: new Map(),
    ready,
    identity: null,
    closed,
    resolveClosed,
    live: new Map(),
    staging: null,
    generation: "",
    sourceSequence: 0n,
    terminal: false,
    closing: false,
  };
}

function distribute(shared: SharedWatch, event: KubernetesPodWatchEventDto): void {
  const sourceSequence = BigInt(event.sequence);
  if (sourceSequence !== shared.sourceSequence + 1n) throw new IpcContractError();
  shared.sourceSequence = sourceSequence;
  if (!updateSnapshot(shared, event)) {
    throw new IpcContractError();
  }
  for (const [id, consumer] of shared.consumers) {
    if (consumer.failed) {
      shared.consumers.delete(id);
      continue;
    }
    if (!consumer.active) {
      if (event.change === "snapshot_complete" && shared.generation !== "") {
        consumer.active = true;
        replaySnapshot(shared, consumer);
      }
      continue;
    }
    if (event.change === "snapshot_complete") {
      deliver(consumer, event);
    } else {
      deliver(consumer, event);
    }
    if (consumer.failed) shared.consumers.delete(id);
  }
  if (shared.consumers.size === 0 && !shared.terminal) {
    closeUnusedShared(shared);
  }
}

function updateSnapshot(shared: SharedWatch, event: KubernetesPodWatchEventDto): boolean {
  switch (event.change) {
    case "snapshot_begin":
      shared.staging = new Map();
      break;
    case "snapshot_batch":
      if (shared.staging === null) return false;
      for (const pod of event.items) {
        if (shared.staging.has(pod.uid) || shared.staging.size >= MAX_SNAPSHOT_PODS) return false;
        shared.staging?.set(pod.uid, pod);
      }
      break;
    case "snapshot_complete":
      if (shared.staging === null) return false;
      shared.live.clear();
      for (const [uid, pod] of shared.staging) shared.live.set(uid, pod);
      shared.staging = null;
      shared.generation = event.generation;
      break;
    case "upsert":
      if (event.pod === null) return false;
      if (!shared.live.has(event.pod.uid) && shared.live.size >= MAX_SNAPSHOT_PODS) return false;
      shared.live.set(event.pod.uid, event.pod);
      break;
    case "delete":
      if (event.uid === null) return false;
      shared.live.delete(event.uid);
      break;
    case "stale":
      break;
  }
  return true;
}

function replaySnapshot(shared: SharedWatch, consumer: Consumer): void {
  if (shared.identity === null) return;
  deliver(consumer, emptyEvent(shared, "snapshot_begin"));
  const pods = [...shared.live.values()];
  for (let start = 0; start < pods.length; start += SNAPSHOT_BATCH_ITEMS) {
    const items = pods.slice(start, start + SNAPSHOT_BATCH_ITEMS);
    deliver(consumer, { ...emptyEvent(shared, "snapshot_batch"), items });
  }
  deliver(consumer, emptyEvent(shared, "snapshot_complete"));
}

function deliver(consumer: Consumer, event: KubernetesPodWatchConsumerEvent): void {
  if (!consumer.active || consumer.failed) return;
  if (consumer.sequence === 18_446_744_073_709_551_615n) {
    consumer.failed = true;
    consumer.finish("failed");
    return;
  }
  consumer.sequence += 1n;
  try {
    consumer.listener({ ...event, sequence: consumer.sequence.toString() });
  } catch {
    consumer.failed = true;
    consumer.finish("failed");
  }
}

function emptyEvent(
  shared: SharedWatch,
  change: KubernetesPodWatchEventDto["change"],
): KubernetesPodWatchConsumerEvent {
  return {
    session_id: shared.sessionId,
    subscription_id: shared.identity?.subscription_id ?? "",
    generation: shared.generation,
    sequence: "0",
    change,
    items: [],
    pod: null,
    uid: null,
    name: null,
  };
}

function finishShared(shared: SharedWatch, end: KubernetesPodWatchEndDto): void {
  if (shared.terminal) return;
  shared.terminal = true;
  shared.closing = false;
  for (const consumer of shared.consumers.values()) consumer.finish(end);
  shared.consumers.clear();
  removeShared(shared.transport, shared.key, shared);
  shared.resolveClosed();
}

function closeUnusedShared(shared: SharedWatch): void {
  if (shared.terminal || shared.closing) return;
  shared.closing = true;
  const identity = shared.identity;
  const stop =
    identity === null
      ? shared.ready.then((readyIdentity) =>
          stopKubernetesPodWatch(
            shared.transport,
            readyIdentity.session_id,
            readyIdentity.subscription_id,
          ),
        )
      : stopKubernetesPodWatch(shared.transport, identity.session_id, identity.subscription_id);
  void stop
    .catch(() => false)
    .then(() => finishShared(shared, "failed"))
    .catch(() => finishShared(shared, "failed"));
}

function removeShared(transport: IpcTransport, key: string, expected: SharedWatch): void {
  const registry = registries.get(transport);
  if (registry?.get(key) === expected) registry.delete(key);
}
