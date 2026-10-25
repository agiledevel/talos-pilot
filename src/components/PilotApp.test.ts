import { render, screen, waitFor, within } from "@testing-library/svelte";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";
import type { IpcTransport } from "../lib/ipc/transport";
import PilotApp from "./PilotApp.svelte";

type User = ReturnType<typeof userEvent.setup>;

const TALOS_SESSION = {
  session_id: "talos-session-1",
  context_name: "synthetic-demo",
  endpoints: ["10.79.0.2"],
  nodes: ["10.79.0.4"],
  storage_mode: "session_only",
};

const KUBERNETES_SESSION = {
  session_id: "kube-session-7",
  context_label: "synthetic-kubernetes",
  storage_mode: "session_only",
};

const KUBERNETES_PODS = {
  session_id: KUBERNETES_SESSION.session_id,
  namespace: "workloads",
  resource_version: "rv-42",
  complete: true,
  items: [
    {
      name: "api-0",
      namespace: "workloads",
      uid: "uid-api-0",
      resource_version: "rv-42",
      phase: "Running",
      readiness: "ready",
    },
  ],
};

function createTransport(): {
  readonly transport: IpcTransport;
  readonly invoke: MockedFunction<IpcTransport["invoke"]>;
  readonly emitProbeEvent: (message: unknown) => void;
} {
  let probeHandler: ((message: unknown) => void) | undefined;
  const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
    async (command) => {
      if (command === "get_appearance_settings") {
        return { theme: "system", density: "comfortable" };
      }
      if (command === "get_credential_storage_status") {
        return { mode: "vault_unavailable" };
      }
      if (command === "use_session_only_storage") {
        return { mode: "session_only" };
      }
      if (command === "retry_persistent_storage") {
        return { mode: "persistent_with_session_only" };
      }
      if (command === "import_talosconfig") {
        return TALOS_SESSION;
      }
      if (command === "list_kubernetes_credentials") {
        return [
          {
            credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
            context_label: "synthetic-kubernetes",
            storage_mode: "session_only",
          },
        ];
      }
      if (command === "open_kubernetes_session") {
        return KUBERNETES_SESSION;
      }
      if (command === "list_kubernetes_pods") {
        return KUBERNETES_PODS;
      }
      if (
        command === "close_kubernetes_session" ||
        command === "stop_talos_probe" ||
        command === "close_talos_session"
      ) {
        return true;
      }
      return null;
    },
  );
  const transport: IpcTransport = {
    invoke,
    // The stream stays open until the test ends, as a followed status stream does.
    invokeChannel: async (_command, _args, onMessage) => {
      probeHandler = onMessage;
      return await new Promise<null>(() => undefined);
    },
  };
  return {
    transport,
    invoke,
    emitProbeEvent: (message) => {
      if (probeHandler === undefined) {
        throw new Error("the native probe channel was never opened");
      }
      probeHandler(message);
    },
  };
}

function statusBar(): HTMLElement {
  return screen.getByRole("contentinfo", { name: "Status bar" });
}

async function openView(user: User, name: string): Promise<void> {
  const navigation = screen.getByRole("navigation", { name: "Primary" });
  await user.click(within(navigation).getByRole("button", { name }));
}

/*
 * The menu is positioned by measuring layout, which jsdom does not perform, so
 * it stays `visibility: hidden` here and its items have no computed accessible
 * name. Items are therefore found by their text. Playwright covers the visible
 * menu, its keyboard path, and focus.
 */
async function openViewMenu(user: User): Promise<void> {
  await user.click(screen.getByText("View", { selector: "[role='menuitem']" }));
}

async function findViewMenuItem(label: string): Promise<HTMLElement> {
  return await screen.findByText(label, { selector: "[role='menuitemradio']" });
}

async function chooseFromViewMenu(user: User, label: string): Promise<void> {
  await openViewMenu(user);
  await user.click(await findViewMenuItem(label));
}

/** Resolves once the shell has rendered the storage mode loaded from the backend. */
async function loaded(): Promise<void> {
  await waitFor(() => {
    expect(statusBar()).toHaveTextContent("Credentials: vault unavailable");
  });
}

describe("appearance menu", () => {
  it("persists theme and density independently", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(PilotApp, { props: { transport } });
    await loaded();

    await chooseFromViewMenu(user, "Dark");
    expect(invoke).toHaveBeenCalledWith("set_appearance_settings", {
      settings: { theme: "dark", density: "comfortable" },
    });
    await chooseFromViewMenu(user, "Compact");
    expect(invoke).toHaveBeenCalledWith("set_appearance_settings", {
      settings: { theme: "dark", density: "compact" },
    });
    expect(statusBar()).toHaveTextContent("Credentials: vault unavailable");
  });

  it("applies the saved theme and density to the document and removes them on unmount", async () => {
    const user = userEvent.setup();
    const view = render(PilotApp, { props: { transport: createTransport().transport } });
    await loaded();
    expect(document.documentElement).not.toHaveAttribute("data-mode");
    expect(document.documentElement).not.toHaveAttribute("data-density");

    await chooseFromViewMenu(user, "Dark");
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-mode", "dark");
    });
    await chooseFromViewMenu(user, "Compact");
    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute("data-density", "compact");
    });
    await chooseFromViewMenu(user, "System");
    await waitFor(() => {
      expect(document.documentElement).not.toHaveAttribute("data-mode");
    });
    expect(document.documentElement).toHaveAttribute("data-density", "compact");

    view.unmount();
    expect(document.documentElement).not.toHaveAttribute("data-density");
  });

  it("marks the choice in effect and associates a failed save with the menu", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(PilotApp, { props: { transport } });
    await loaded();
    invoke.mockRejectedValueOnce({
      code: "STORAGE_UNAVAILABLE",
      action: "set_appearance_settings",
      target: null,
      retryable: true,
      message: "Local storage is unavailable.",
    });

    await chooseFromViewMenu(user, "Dark");
    await screen.findByText(/appearance settings could not be saved/i);

    expect(screen.getByText("View", { selector: "[role='menuitem']" })).toHaveAttribute(
      "aria-describedby",
      "appearance-error",
    );
    expect(document.documentElement).not.toHaveAttribute("data-mode");
    await openViewMenu(user);
    expect(await findViewMenuItem("System")).toHaveAttribute("aria-checked", "true");
    expect(await findViewMenuItem("Dark")).toHaveAttribute("aria-checked", "false");
  });

  it("keeps the choices readable but disabled in a browser without a transport", async () => {
    const user = userEvent.setup();
    render(PilotApp);

    await openViewMenu(user);
    expect(await findViewMenuItem("Dark")).toHaveAttribute("aria-disabled", "true");
    expect(await findViewMenuItem("System")).toHaveAttribute("aria-checked", "true");
    expect(statusBar()).toHaveTextContent("Credentials: desktop application only");
  });
});

describe("navigation and status bar", () => {
  it("opens on Home and shows one view at a time", async () => {
    const user = userEvent.setup();
    render(PilotApp, { props: { transport: createTransport().transport } });
    const navigation = screen.getByRole("navigation", { name: "Primary" });

    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("No clusters connected")).toBeInTheDocument();
    expect(statusBar()).toHaveTextContent("Kubernetes: no session");
    expect(within(navigation).getByRole("button", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    await openView(user, "Settings");
    expect(screen.getByRole("heading", { level: 1, name: "Settings" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Credentials" })).toBeInTheDocument();
    expect(screen.queryByText("No clusters connected")).not.toBeInTheDocument();
    expect(within(navigation).getByRole("button", { name: "Settings" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("button", { name: "Home" })).not.toHaveAttribute(
      "aria-current",
    );
  });

  it("names the cluster, Talos, and credential context in the status bar", async () => {
    render(PilotApp, { props: { transport: createTransport().transport } });
    await loaded();

    expect(statusBar()).toHaveTextContent("Cluster: none connected");
    expect(statusBar()).toHaveTextContent("Talos: no context");
  });

  it("reports a failed settings load from every view, once", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    invoke.mockRejectedValueOnce({
      code: "STORAGE_UNAVAILABLE",
      action: "get_appearance_settings",
      target: null,
      retryable: true,
      message: "Local storage is unavailable.",
    });
    render(PilotApp, { props: { transport } });

    expect(await screen.findByRole("alert")).toHaveTextContent("Local storage is unavailable.");
    expect(screen.getByRole("heading", { level: 1, name: "Home" })).toBeInTheDocument();
    expect(statusBar()).toHaveTextContent("Credentials: status not loaded");

    await openView(user, "Settings");
    expect(screen.getAllByText("Local storage is unavailable.")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Import kubeconfig" })).toBeDisabled();
    expect(screen.queryByText(/available in the native desktop application/i)).toBeNull();
  });

  it("keeps the Talos context and its running probe when another view opens", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emitProbeEvent } = createTransport();
    render(PilotApp, { props: { transport } });

    await openView(user, "Talos");
    await user.click(screen.getByRole("button", { name: "Import Talos config" }));
    await user.click(await screen.findByRole("button", { name: "Start read probe" }));
    emitProbeEvent({
      session_id: TALOS_SESSION.session_id,
      state: "healthy",
      version: "v1.14.1",
      stage: "running",
      ready: true,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: true,
    });
    await screen.findByText("Talos: healthy");

    await openView(user, "Home");
    expect(statusBar()).toHaveTextContent(
      "Talos: synthetic-demo (session-only) · 10.79.0.4 · healthy",
    );
    expect(invoke).not.toHaveBeenCalledWith("stop_talos_probe", expect.anything());
    expect(invoke).not.toHaveBeenCalledWith("close_talos_session", expect.anything());

    await openView(user, "Talos");
    expect(screen.getByText("Talos: healthy")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop stream" })).toBeEnabled();
  });

  it("opens a saved Kubernetes context and lists Pods in the chosen namespace", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(PilotApp, { props: { transport } });
    await openView(user, "Workloads");

    await user.click(screen.getByRole("button", { name: "Load saved contexts" }));
    await screen.findByRole("option", { name: /synthetic-kubernetes/u });
    await user.click(screen.getByRole("button", { name: "Open Kubernetes session" }));
    expect(await screen.findByText("(kube-session-7)")).toBeInTheDocument();

    const namespace = screen.getByRole("textbox", { name: "Namespace" });
    await user.clear(namespace);
    await user.type(namespace, "workloads");
    await user.type(screen.getByRole("textbox", { name: "Label selector (optional)" }), "app=web");
    await user.type(
      screen.getByRole("textbox", { name: "Field selector (optional)" }),
      "status.phase=Running",
    );
    await user.click(screen.getByRole("button", { name: "List Pods" }));

    expect(await screen.findByRole("row", { name: /api-0 Running ready/u })).toBeInTheDocument();
    expect(invoke).toHaveBeenCalledWith("list_kubernetes_pods", {
      sessionId: KUBERNETES_SESSION.session_id,
      namespace: "workloads",
      labelSelector: "app=web",
      fieldSelector: "status.phase=Running",
    });
    expect(statusBar()).toHaveTextContent(
      "Kubernetes: synthetic-kubernetes · kube-session-7 · namespace workloads",
    );
  });

  it("distinguishes unauthorized and forbidden Pod list results", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(PilotApp, { props: { transport } });
    await openView(user, "Workloads");
    await user.click(screen.getByRole("button", { name: "Load saved contexts" }));
    await user.click(await screen.findByRole("button", { name: "Open Kubernetes session" }));

    invoke.mockRejectedValueOnce({
      code: "KUBERNETES_UNAUTHORIZED",
      action: "list_kubernetes_pods",
      target: null,
      retryable: false,
      message: "The Kubernetes API server rejected the credential.",
    });
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Unauthorized: The Kubernetes API server rejected the credential.",
    );

    invoke.mockRejectedValueOnce({
      code: "KUBERNETES_FORBIDDEN",
      action: "list_kubernetes_pods",
      target: null,
      retryable: false,
      message: "The Kubernetes API server denied the request for this credential.",
    });
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Forbidden: The Kubernetes API server denied the request for this credential.",
    );
  });

  it("renders empty and unsupported Pod list outcomes as separate states", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    let returnEmpty = true;
    let returnUnsupported = false;
    const defaultInvoke = invoke.getMockImplementation();
    invoke.mockImplementation(async (command, args) => {
      if (command === "list_kubernetes_pods" && returnEmpty) {
        return { ...KUBERNETES_PODS, namespace: "default", items: [] };
      }
      if (command === "list_kubernetes_pods" && returnUnsupported) {
        throw {
          code: "KUBERNETES_API_UNSUPPORTED",
          action: "list_kubernetes_pods",
          target: null,
          retryable: false,
          message: "This Kubernetes API server does not provide the Pod list API.",
        };
      }
      return await defaultInvoke?.(command, args);
    });
    render(PilotApp, { props: { transport } });
    await openView(user, "Workloads");
    await user.click(screen.getByRole("button", { name: "Load saved contexts" }));
    await user.click(await screen.findByRole("button", { name: "Open Kubernetes session" }));

    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByText("No Pods were found in this namespace.")).toBeInTheDocument();

    returnEmpty = false;
    returnUnsupported = true;
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Pod API unsupported: This Kubernetes API server does not provide the Pod list API.",
    );
  });

  it("does not display a late response after a Kubernetes session is replaced", async () => {
    const user = userEvent.setup();
    let finishOldRequest: ((value: typeof KUBERNETES_PODS) => void) | undefined;
    let openedSessions = 0;
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async (command, args) => {
        if (command === "get_appearance_settings") {
          return { theme: "system", density: "comfortable" };
        }
        if (command === "get_credential_storage_status") {
          return { mode: "session_only" };
        }
        if (command === "list_kubernetes_credentials") {
          return [
            {
              credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
              context_label: "first-context",
              storage_mode: "session_only",
            },
            {
              credential_handle: "kubecred-BBBBBBBBBBBBBBBBBBBBBB",
              context_label: "second-context",
              storage_mode: "session_only",
            },
          ];
        }
        if (command === "open_kubernetes_session") {
          openedSessions += 1;
          return {
            session_id: `kube-session-${openedSessions}`,
            context_label: openedSessions === 1 ? "first-context" : "second-context",
            storage_mode: "session_only",
          };
        }
        if (command === "list_kubernetes_pods") {
          if (args?.sessionId === "kube-session-1") {
            return await new Promise<typeof KUBERNETES_PODS>((resolve) => {
              finishOldRequest = resolve;
            });
          }
          return {
            ...KUBERNETES_PODS,
            session_id: "kube-session-2",
            namespace: "default",
            items: [
              {
                name: "second-session-pod",
                namespace: "default",
                uid: "uid-second-session-pod",
                resource_version: "rv-42",
                phase: "Running",
                readiness: "ready",
              },
            ],
          };
        }
        return true;
      },
    );
    const transport: IpcTransport = { invoke };
    render(PilotApp, { props: { transport } });
    await openView(user, "Workloads");
    await user.click(screen.getByRole("button", { name: "Load saved contexts" }));
    await user.click(await screen.findByRole("button", { name: "Open Kubernetes session" }));
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    await vi.waitFor(() => {
      expect(finishOldRequest).toBeTypeOf("function");
    });

    await user.click(screen.getByRole("button", { name: "Close Kubernetes session" }));
    await user.selectOptions(
      screen.getByRole("combobox", { name: "Saved Kubernetes context" }),
      "kubecred-BBBBBBBBBBBBBBBBBBBBBB",
    );
    await user.click(screen.getByRole("button", { name: "Open Kubernetes session" }));
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByText("second-session-pod")).toBeInTheDocument();

    finishOldRequest?.({
      ...KUBERNETES_PODS,
      session_id: "kube-session-1",
      items: [
        {
          name: "late-first-session-pod",
          namespace: "workloads",
          uid: "uid-late-first-session-pod",
          resource_version: "rv-42",
          phase: "Running",
          readiness: "ready",
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByText("late-first-session-pod")).not.toBeInTheDocument();
      expect(screen.getByText("second-session-pod")).toBeInTheDocument();
      expect(statusBar()).toHaveTextContent("second-context · kube-session-2 · namespace default");
    });
  });

  it("discards a late Pod snapshot after the namespace query changes", async () => {
    const user = userEvent.setup();
    let finishFirst: ((value: typeof KUBERNETES_PODS) => void) | undefined;
    const { transport, invoke } = createTransport();
    invoke.mockImplementation(async (command, args) => {
      if (command === "get_appearance_settings") {
        return { theme: "system", density: "comfortable" };
      }
      if (command === "get_credential_storage_status") {
        return { mode: "vault_unavailable" };
      }
      if (command === "list_kubernetes_credentials") {
        return [
          {
            credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
            context_label: "synthetic-kubernetes",
            storage_mode: "session_only",
          },
        ];
      }
      if (command === "open_kubernetes_session") {
        return KUBERNETES_SESSION;
      }
      if (command === "list_kubernetes_pods") {
        const request = args as { namespace: string } | undefined;
        if (request?.namespace === "first") {
          return await new Promise<typeof KUBERNETES_PODS>((resolve) => {
            finishFirst = resolve;
          });
        }
        return {
          ...KUBERNETES_PODS,
          namespace: "second",
          items: [
            {
              name: "second-context-pod",
              namespace: "second",
              uid: "uid-second-context-pod",
              resource_version: "rv-42",
              phase: "Running",
              readiness: "ready",
            },
          ],
        };
      }
      return true;
    });
    render(PilotApp, { props: { transport } });
    await openView(user, "Workloads");
    await user.click(screen.getByRole("button", { name: "Load saved contexts" }));
    await user.click(await screen.findByRole("button", { name: "Open Kubernetes session" }));

    const namespace = screen.getByRole("textbox", { name: "Namespace" });
    await user.clear(namespace);
    await user.type(namespace, "first");
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    await vi.waitFor(() => expect(finishFirst).toBeTypeOf("function"));

    await user.clear(namespace);
    await user.type(namespace, "second");
    await user.click(screen.getByRole("button", { name: "List Pods" }));
    expect(await screen.findByText("second-context-pod")).toBeInTheDocument();

    finishFirst?.({
      ...KUBERNETES_PODS,
      namespace: "first",
      items: [
        {
          name: "late-first-pod",
          namespace: "first",
          uid: "uid-late-first-pod",
          resource_version: "rv-42",
          phase: "Running",
          readiness: "ready",
        },
      ],
    });
    await waitFor(() => {
      expect(screen.queryByText("late-first-pod")).not.toBeInTheDocument();
      expect(screen.getByText("second-context-pod")).toBeInTheDocument();
    });
  });

  it("cancels the probe and closes the Talos session when the shell unmounts", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    const view = render(PilotApp, { props: { transport } });

    await openView(user, "Talos");
    await user.click(screen.getByRole("button", { name: "Import Talos config" }));
    await user.click(await screen.findByRole("button", { name: "Start read probe" }));
    await screen.findByText("Talos: connecting");

    view.unmount();
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("stop_talos_probe", {
        sessionId: TALOS_SESSION.session_id,
      });
      expect(invoke).toHaveBeenCalledWith("close_talos_session", {
        sessionId: TALOS_SESSION.session_id,
      });
    });
  });
});

describe("credential settings", () => {
  it("shows session-only operation after the explicit choice", async () => {
    const user = userEvent.setup();
    render(PilotApp, { props: { transport: createTransport().transport } });
    await openView(user, "Settings");
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));

    expect(
      await screen.findByText(/credentials remain in memory until the application exits/i),
    ).toBeInTheDocument();
    expect(statusBar()).toHaveTextContent("Credentials: session-only");
    await waitFor(() => {
      expect(screen.getByRole("button", { name: "Import kubeconfig" })).toBeEnabled();
    });
  });

  it("keeps earlier session credentials visibly distinct after vault retry", async () => {
    const user = userEvent.setup();
    render(PilotApp, { props: { transport: createTransport().transport } });
    await openView(user, "Settings");
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));
    await user.click(await screen.findByRole("button", { name: "Retry operating system vault" }));

    expect(
      await screen.findByText(/earlier session-only credentials remain in memory until exit/i),
    ).toBeInTheDocument();
    await chooseFromViewMenu(user, "Dark");
    expect(
      screen.getByText(/earlier session-only credentials remain in memory until exit/i),
    ).toBeInTheDocument();
    expect(statusBar()).toHaveTextContent(
      "Credentials: operating system vault, earlier session-only credentials in memory",
    );
  });

  it("associates import errors with the import action", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(PilotApp, { props: { transport } });
    await openView(user, "Settings");
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));
    invoke.mockRejectedValueOnce({
      code: "IMPORT_EXEC_AUTH_UNSUPPORTED",
      action: "import_kubeconfig",
      target: null,
      retryable: false,
      message: "Kubeconfig exec authentication is not supported.",
    });
    await user.click(screen.getByRole("button", { name: "Import kubeconfig" }));
    await screen.findByText(/kubeconfig could not be imported/i);
    expect(screen.getByRole("button", { name: "Import kubeconfig" })).toHaveAttribute(
      "aria-describedby",
      "credential-action-error",
    );
  });

  it("keeps native storage actions disabled in a browser without an explicit test transport", async () => {
    const user = userEvent.setup();
    render(PilotApp);
    await openView(user, "Settings");
    expect(screen.getByRole("button", { name: "Import kubeconfig" })).toBeDisabled();
    expect(screen.getByText(/available in the native desktop application/i)).toBeInTheDocument();
  });
});
