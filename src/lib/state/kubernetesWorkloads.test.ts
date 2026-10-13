import { beforeEach, describe, expect, it, vi } from "vitest";
import type { IpcTransport } from "../ipc/transport";
import { KubernetesWorkloadsState } from "./kubernetesWorkloads.svelte";

describe("Kubernetes workload watch state", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("keeps the prior generation stale until an atomic relist completes and applies UID changes", async () => {
    let onMessage: ((message: unknown) => void) | undefined;
    let finishStream: ((value: unknown) => void) | undefined;
    const invoke = vi.fn<IpcTransport["invoke"]>(async (command) => {
      switch (command) {
        case "list_kubernetes_credentials":
          return [
            {
              credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
              context_label: "synthetic",
              storage_mode: "session_only",
            },
          ];
        case "open_kubernetes_session":
          return {
            session_id: "kube-session-7",
            context_label: "synthetic",
            storage_mode: "session_only",
          };
        case "list_kubernetes_pods":
          return { ...snapshot, items: [pod("api", "uid-old", "rv-1")] };
        case "open_kubernetes_pod_watch":
          return {
            session_id: "kube-session-7",
            subscription_id: "kube-watch-1",
          };
        case "acknowledge_kubernetes_pod_watch":
          return true;
        case "stop_kubernetes_pod_watch":
          finishStream?.("stopped");
          return true;
        default:
          return null;
      }
    });
    const transport: IpcTransport = {
      invoke,
      invokeChannel: async (_command, _args, handler) => {
        onMessage = handler;
        return await new Promise((resolve) => {
          finishStream = resolve;
        });
      },
    };
    const state = new KubernetesWorkloadsState(transport);
    await state.loadCredentials();
    await state.openSession();
    state.namespace = "workloads";
    state.listPods();
    const query = state.queryOptions();
    if (query.enabled) {
      await query.queryFn({ queryKey: query.queryKey });
    }

    const stream = state.startWatch();
    await vi.waitFor(() => expect(onMessage).toBeTypeOf("function"));
    const send = async (event: Record<string, unknown>): Promise<void> => {
      const handler = onMessage;
      if (handler === undefined) {
        throw new Error("the watch channel has not opened");
      }
      handler(event);
      await vi.waitFor(() => {
        expect(invoke).toHaveBeenCalledWith(
          "acknowledge_kubernetes_pod_watch",
          expect.objectContaining({ sequence: event.sequence }),
        );
      });
      await Promise.resolve();
    };

    await send(watchEvent("1", "1", "snapshot_begin"));
    expect(state.watchStatus).toBe("stale");
    expect(state.watchPods.map((item) => item.uid)).toEqual(["uid-old"]);
    await send(watchEvent("1", "2", "snapshot_batch", [pod("api", "uid-old", "rv-1")]));
    await send(watchEvent("1", "3", "snapshot_complete"));
    expect(state.watchStatus).toBe("live");

    await send(watchEvent("1", "4", "delete", [], null, "uid-old", "api"));
    await send(watchEvent("1", "5", "upsert", [], pod("api", "uid-new", "rv-3")));
    expect(state.watchPods).toEqual([pod("api", "uid-new", "rv-3")]);

    await send(watchEvent("2", "6", "snapshot_begin"));
    expect(state.watchStatus).toBe("stale");
    expect(state.watchPods).toEqual([pod("api", "uid-new", "rv-3")]);
    await send(watchEvent("2", "7", "snapshot_batch", [pod("api", "uid-new", "rv-3")]));
    await send(watchEvent("2", "8", "snapshot_complete"));
    expect(state.watchStatus).toBe("live");
    expect(state.watchPods).toEqual([pod("api", "uid-new", "rv-3")]);

    await state.stopWatch();
    await stream;
    expect(state.watchStatus).toBe("stopped");
    await state.closeSession();
  });

  it("rejects sequence gaps and asks the backend to stop the foreign stream", async () => {
    const invoke = vi.fn<IpcTransport["invoke"]>(async (command) => {
      if (command === "list_kubernetes_credentials") {
        return [
          {
            credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
            context_label: "synthetic",
            storage_mode: "session_only",
          },
        ];
      }
      if (command === "open_kubernetes_session") {
        return {
          session_id: "kube-session-7",
          context_label: "synthetic",
          storage_mode: "session_only",
        };
      }
      if (command === "open_kubernetes_pod_watch") {
        return { session_id: "kube-session-7", subscription_id: "kube-watch-2" };
      }
      if (command === "stop_kubernetes_pod_watch") {
        return true;
      }
      return null;
    });
    const transport: IpcTransport = {
      invoke,
      invokeChannel: async (_command, _args, handler) => {
        handler(watchEvent("1", "2", "snapshot_begin", [], null, null, null, "kube-watch-2"));
        return "stopped";
      },
    };
    const state = new KubernetesWorkloadsState(transport);
    await state.loadCredentials();
    await state.openSession();
    state.namespace = "workloads";
    state.listPods();
    await state.startWatch();
    expect(state.watchStatus).toBe("failed");
    expect(invoke).toHaveBeenCalledWith(
      "stop_kubernetes_pod_watch",
      expect.objectContaining({ subscriptionId: "kube-watch-2" }),
    );
    await state.closeSession();
  });
});

const snapshot = {
  session_id: "kube-session-7",
  namespace: "workloads",
  resource_version: "rv-1",
  complete: true,
  items: [] as ReturnType<typeof pod>[],
};

function pod(name: string, uid: string, resourceVersion: string) {
  return {
    name,
    namespace: "workloads",
    uid,
    resource_version: resourceVersion,
    phase: "Running",
    readiness: "ready" as const,
  };
}

function watchEvent(
  generation: string,
  sequence: string,
  change: string,
  items: ReturnType<typeof pod>[] = [],
  currentPod: ReturnType<typeof pod> | null = null,
  uid: string | null = null,
  name: string | null = null,
  subscriptionId = "kube-watch-1",
): Record<string, unknown> {
  return {
    session_id: "kube-session-7",
    subscription_id: subscriptionId,
    generation,
    sequence,
    change,
    items,
    pod: currentPod,
    uid,
    name,
  };
}
