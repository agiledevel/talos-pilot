import { describe, expect, it, vi } from "vitest";

import type { IpcTransport } from "./transport";
import { acquireKubernetesPodWatch } from "./kubernetesPodWatchRegistry";

describe("Kubernetes Pod watch consumer ownership", () => {
  it("shares one backend stream and stops it only after the final consumer leaves", async () => {
    let onMessage: ((message: unknown) => void) | undefined;
    let finishStream: ((end: string) => void) | undefined;
    let started!: () => void;
    const channelStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const invoke = vi.fn<IpcTransport["invoke"]>(async (command) => {
      if (command === "open_kubernetes_pod_watch") {
        return { session_id: "kube-session-1", subscription_id: "kube-watch-1" };
      }
      if (command === "acknowledge_kubernetes_pod_watch") return true;
      if (command === "stop_kubernetes_pod_watch") {
        finishStream?.("stopped");
        return true;
      }
      throw new Error(`unexpected command ${command}`);
    });
    const invokeChannel = vi.fn<NonNullable<IpcTransport["invokeChannel"]>>(
      async (_command, _args, callback) => {
        onMessage = callback;
        started();
        return new Promise((resolve) => {
          finishStream = (end) => resolve(end);
        });
      },
    );
    const transport: IpcTransport = { invoke, invokeChannel };
    const firstEvents: string[] = [];
    const secondEvents: string[] = [];
    const firstSequences: string[] = [];
    const secondSequences: string[] = [];
    const query = {
      sessionId: "kube-session-1",
      namespace: "workloads",
      labelSelector: null,
      fieldSelector: null,
    };

    const first = await acquireKubernetesPodWatch(transport, query, (event) => {
      firstEvents.push(event.change);
      firstSequences.push(event.sequence);
    });
    const second = await acquireKubernetesPodWatch(transport, query, (event) => {
      secondEvents.push(event.change);
      secondSequences.push(event.sequence);
    });
    first.activate();
    first.activate();
    second.activate();
    second.activate();
    await channelStarted;

    expect(first.identity).toEqual(second.identity);
    expect(
      invoke.mock.calls.filter(([command]) => command === "open_kubernetes_pod_watch"),
    ).toHaveLength(1);

    const send = async (sequence: string, change: string, extra: Record<string, unknown> = {}) => {
      onMessage?.({
        session_id: "kube-session-1",
        subscription_id: "kube-watch-1",
        generation: "1",
        sequence,
        change,
        items: [],
        pod: null,
        uid: null,
        name: null,
        ...extra,
      });
      await vi.waitFor(() => {
        expect(
          invoke.mock.calls.filter(([command]) => command === "acknowledge_kubernetes_pod_watch"),
        ).toHaveLength(Number(sequence));
      });
    };
    await send("1", "snapshot_begin");
    await send("2", "snapshot_complete");
    expect(firstEvents).toEqual(["snapshot_begin", "snapshot_complete"]);
    expect(secondEvents).toEqual(firstEvents);
    expect(firstSequences).toEqual(["1", "2"]);
    expect(secondSequences).toEqual(firstSequences);

    await first.release();
    await expect(first.done).resolves.toBe("stopped");
    expect(
      invoke.mock.calls.filter(([command]) => command === "stop_kubernetes_pod_watch"),
    ).toHaveLength(0);

    await send("3", "stale");
    expect(secondEvents).toEqual(["snapshot_begin", "snapshot_complete", "stale"]);
    expect(firstEvents).toHaveLength(2);
    expect(secondSequences).toEqual(["1", "2", "3"]);
    expect(
      invoke.mock.calls.filter(([command]) => command === "acknowledge_kubernetes_pod_watch"),
    ).toHaveLength(3);
    expect(invokeChannel).toHaveBeenCalledTimes(1);

    await second.release();
    await expect(second.done).resolves.toBe("stopped");
    expect(
      invoke.mock.calls.filter(([command]) => command === "stop_kubernetes_pod_watch"),
    ).toHaveLength(1);
  });

  it("replays the last complete bounded snapshot to a late consumer", async () => {
    let onMessage: ((message: unknown) => void) | undefined;
    let finishStream: ((end: string) => void) | undefined;
    let started!: () => void;
    const channelStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const invoke = vi.fn<IpcTransport["invoke"]>(async (command) => {
      if (command === "open_kubernetes_pod_watch") {
        return { session_id: "kube-session-2", subscription_id: "kube-watch-2" };
      }
      if (command === "acknowledge_kubernetes_pod_watch") return true;
      if (command === "stop_kubernetes_pod_watch") {
        finishStream?.("stopped");
        return true;
      }
      throw new Error(`unexpected command ${command}`);
    });
    const transport: IpcTransport = {
      invoke,
      invokeChannel: async (_command, _args, callback) => {
        onMessage = callback;
        started();
        return new Promise((resolve) => {
          finishStream = (end) => resolve(end);
        });
      },
    };
    const query = {
      sessionId: "kube-session-2",
      namespace: "workloads",
      labelSelector: null,
      fieldSelector: null,
    };
    const first = await acquireKubernetesPodWatch(transport, query, () => undefined);
    first.activate();
    await channelStarted;
    const pod = {
      name: "api",
      namespace: "workloads",
      uid: "uid-api",
      resource_version: "42",
      phase: "Running",
      readiness: "ready",
    };
    const send = async (sequence: string, change: string, items: unknown[] = []) => {
      onMessage?.({
        session_id: "kube-session-2",
        subscription_id: "kube-watch-2",
        generation: "1",
        sequence,
        change,
        items,
        pod: null,
        uid: null,
        name: null,
      });
      await vi.waitFor(() => {
        expect(
          invoke.mock.calls.filter(([command]) => command === "acknowledge_kubernetes_pod_watch"),
        ).toHaveLength(Number(sequence));
      });
    };
    await send("1", "snapshot_begin");
    await send("2", "snapshot_batch", [pod]);
    await send("3", "snapshot_complete");

    const replayed: string[] = [];
    const second = await acquireKubernetesPodWatch(transport, query, (event) => {
      replayed.push(`${event.sequence}:${event.change}:${event.items[0]?.uid ?? ""}`);
    });
    second.activate();
    second.activate();
    expect(replayed).toEqual([
      "1:snapshot_begin:",
      "2:snapshot_batch:uid-api",
      "3:snapshot_complete:",
    ]);
    expect(
      invoke.mock.calls.filter(([command]) => command === "open_kubernetes_pod_watch"),
    ).toHaveLength(1);

    await first.release();
    await second.release();
  });

  it("rejects a gap in the shared backend sequence before fanout or acknowledgement", async () => {
    let onMessage: ((message: unknown) => void) | undefined;
    let finishStream: ((end: string) => void) | undefined;
    let started!: () => void;
    const channelStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    const invoke = vi.fn<IpcTransport["invoke"]>(async (command) => {
      if (command === "open_kubernetes_pod_watch") {
        return { session_id: "kube-session-3", subscription_id: "kube-watch-3" };
      }
      if (command === "acknowledge_kubernetes_pod_watch") return true;
      if (command === "stop_kubernetes_pod_watch") {
        finishStream?.("stopped");
        return true;
      }
      throw new Error(`unexpected command ${command}`);
    });
    const transport: IpcTransport = {
      invoke,
      invokeChannel: async (_command, _args, callback) => {
        onMessage = callback;
        started();
        return new Promise((resolve) => {
          finishStream = (end) => resolve(end);
        });
      },
    };
    const received: string[] = [];
    const lease = await acquireKubernetesPodWatch(
      transport,
      {
        sessionId: "kube-session-3",
        namespace: "workloads",
        labelSelector: null,
        fieldSelector: null,
      },
      (event) => received.push(event.change),
    );
    lease.activate();
    await channelStarted;
    onMessage?.({
      session_id: "kube-session-3",
      subscription_id: "kube-watch-3",
      generation: "1",
      sequence: "2",
      change: "snapshot_begin",
      items: [],
      pod: null,
      uid: null,
      name: null,
    });

    await expect(lease.done).resolves.toBe("failed");
    expect(received).toEqual([]);
    expect(
      invoke.mock.calls.filter(([command]) => command === "acknowledge_kubernetes_pod_watch"),
    ).toHaveLength(0);
    expect(
      invoke.mock.calls.filter(([command]) => command === "stop_kubernetes_pod_watch"),
    ).toHaveLength(1);
  });
});
