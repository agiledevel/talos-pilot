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
      if (command === "stop_talos_probe" || command === "close_talos_session") {
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
