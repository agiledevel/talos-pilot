import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";
import type { IpcTransport } from "../lib/ipc/transport";
import { TalosProbePanel } from "./TalosProbePanel";

const SESSION = {
  session_id: "talos-session-1",
  context_name: "synthetic-demo",
  endpoints: ["10.79.0.2"],
  nodes: ["10.79.0.4"],
  storage_mode: "session_only",
};

const HEALTHY_EVENT = {
  session_id: "talos-session-1",
  state: "healthy",
  version: "v1.14.1",
  stage: "running",
  ready: true,
  deleted: false,
  sequence: "0",
};

type ChannelHandler = ((message: unknown) => void) | undefined;

function createProbeTransport(rejection?: unknown): {
  readonly transport: IpcTransport;
  readonly invoke: MockedFunction<IpcTransport["invoke"]>;
  readonly channelCalls: { readonly command: string; readonly args: Record<string, unknown> }[];
  readonly emit: (message: unknown) => void;
  readonly settleProbe: () => void;
} {
  let handler: ChannelHandler;
  let settle: () => void = () => undefined;
  const channelCalls: { command: string; args: Record<string, unknown> }[] = [];
  const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
    async (command) => (command === "import_talosconfig" ? SESSION : true),
  );
  const transport: IpcTransport = {
    invoke,
    invokeChannel: async (command, args, onMessage) => {
      if (rejection !== undefined) {
        throw rejection;
      }
      channelCalls.push({ command, args });
      handler = onMessage;
      return await new Promise<null>((resolve) => {
        settle = () => resolve(null);
      });
    },
  };

  return {
    transport,
    invoke,
    channelCalls,
    emit: (message: unknown) => {
      if (handler === undefined) {
        throw new Error("the native probe channel was never opened");
      }
      handler(message);
    },
    settleProbe: () => settle(),
  };
}

async function importContext(user: ReturnType<typeof userEvent.setup>): Promise<void> {
  await user.click(screen.getByRole("button", { name: "Import Talos config" }));
  await screen.findByRole("button", { name: /Start read probe/u });
}

describe("Talos read probe panel", () => {
  it("keeps native probe actions disabled in a browser without an injected transport", () => {
    render(<TalosProbePanel transport={undefined} />);
    expect(screen.getByRole("button", { name: "Import Talos config" })).toBeDisabled();
  });

  it("shows only the bounded session label and target identities after import", async () => {
    const user = userEvent.setup();
    render(<TalosProbePanel transport={createProbeTransport().transport} />);

    await importContext(user);
    expect(await screen.findByText(/Session-only context “synthetic-demo”/u)).toBeInTheDocument();
    expect(screen.getByText("Talos API endpoints: 10.79.0.2")).toBeInTheDocument();
    expect(screen.queryByText(/crt|key:|ca:|BEGIN/u)).not.toBeInTheDocument();
  });

  it("renders the streamed healthy projection and closes only its own session", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emit, settleProbe, channelCalls } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit(HEALTHY_EVENT);

    expect(await screen.findByText("Talos: healthy")).toBeInTheDocument();
    expect(screen.getByText("Version: v1.14.1")).toBeInTheDocument();
    expect(screen.getByText("Stage: running")).toBeInTheDocument();
    expect(screen.getByText("Ready: Yes")).toBeInTheDocument();
    expect(channelCalls).toEqual([
      {
        command: "start_talos_probe",
        args: { sessionId: SESSION.session_id, node: SESSION.nodes[0] },
      },
    ]);

    settleProbe();
    await user.click(screen.getByRole("button", { name: "Close Talos context" }));
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("close_talos_session", {
        sessionId: SESSION.session_id,
      });
    });
    expect(await screen.findByRole("button", { name: /Import Talos config/u })).toBeEnabled();
  });

  it("requests cancellation scoped to the active session from the stop action", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emit } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit(HEALTHY_EVENT);
    await screen.findByText("Talos: healthy");
    await user.click(screen.getByRole("button", { name: "Stop stream" }));

    expect(invoke).toHaveBeenCalledWith("stop_talos_probe", { sessionId: SESSION.session_id });
  });

  it("maps a rejected Talos role to the unauthorized state with the safe message", async () => {
    const user = userEvent.setup();
    const { transport } = createProbeTransport({
      code: "TALOS_UNAUTHORIZED",
      action: "start_talos_probe",
      target: null,
      retryable: false,
      message: "Talos rejected the configured permissions.",
    });
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));

    expect(await screen.findByText("Talos: unauthorized")).toBeInTheDocument();
    expect(
      await screen.findByText("Talos rejected the configured permissions."),
    ).toBeInTheDocument();
  });

  it("disables the connection visibly when the helper cannot probe Talos", async () => {
    const user = userEvent.setup();
    const { transport } = createProbeTransport({
      code: "TALOS_UNSUPPORTED",
      action: "start_talos_probe",
      target: null,
      retryable: false,
      message: "The bundled helper cannot run this Talos probe. Update or restart the application.",
    });
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));

    expect(await screen.findByText("Talos: unsupported")).toBeInTheDocument();
    expect(
      await screen.findByText(/bundled helper cannot run this Talos probe/iu),
    ).toBeInTheDocument();
  });

  it("reports a malformed native event as a contract failure and cancels its session", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emit, settleProbe } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit({ ...HEALTHY_EVENT, state: "connected" });
    settleProbe();

    expect(
      await screen.findByText(/returned an invalid Talos probe response/iu),
    ).toBeInTheDocument();
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("stop_talos_probe", { sessionId: SESSION.session_id });
    });
  });

  it("marks a gap in a previously healthy stream stale instead of reusing the last values", async () => {
    const user = userEvent.setup();
    const { transport, emit, settleProbe } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit(HEALTHY_EVENT);
    await screen.findByText("Talos: healthy");
    emit({ ...HEALTHY_EVENT, state: "unknown_variant", sequence: "1" });
    settleProbe();

    expect(await screen.findByText("Talos: stale")).toBeInTheDocument();
    expect(screen.getByText("Version: v1.14.1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start read probe/u })).toBeEnabled();
  });

  it("associates a rejected import with the import action", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    invoke.mockRejectedValueOnce({
      code: "TALOS_CONFIG_INVALID",
      action: "import_talosconfig",
      target: null,
      retryable: false,
      message: "The selected file does not contain a supported Talos mTLS context.",
    });
    await user.click(screen.getByRole("button", { name: "Import Talos config" }));

    expect(
      await screen.findByText(/does not contain a supported Talos mTLS context/iu),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Import Talos config/u })).toHaveAttribute(
      "aria-describedby",
      "talos-probe-error",
    );
  });

  it("associates a failed cancellation with the stop action", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emit } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit(HEALTHY_EVENT);
    await screen.findByText("Talos: healthy");
    invoke.mockRejectedValueOnce({
      code: "HELPER_UNAVAILABLE",
      action: "stop_talos_probe",
      target: null,
      retryable: true,
      message: "The bundled helper is unavailable.",
    });
    await user.click(screen.getByRole("button", { name: "Stop stream" }));

    expect(await screen.findByText("The bundled helper is unavailable.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Stop stream" })).toHaveAttribute(
      "aria-describedby",
      "talos-probe-error",
    );
  });

  it("keeps the session visible when the in-memory close fails", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createProbeTransport();
    render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    invoke.mockRejectedValueOnce({
      code: "TALOS_SESSION_UNAVAILABLE",
      action: "close_talos_session",
      target: null,
      retryable: false,
      message: "The in-memory Talos session could not be accessed.",
    });
    await user.click(screen.getByRole("button", { name: "Close Talos context" }));

    expect(
      await screen.findByText("The in-memory Talos session could not be accessed."),
    ).toBeInTheDocument();
    expect(screen.getByText(/Session-only context “synthetic-demo”/u)).toBeInTheDocument();
  });

  it("cancels and closes the retained session when the view unmounts", async () => {
    const user = userEvent.setup();
    const { transport, invoke, emit } = createProbeTransport();
    const view = render(<TalosProbePanel transport={transport} />);

    await importContext(user);
    await user.click(screen.getByRole("button", { name: /Start read probe/u }));
    emit(HEALTHY_EVENT);
    await screen.findByText("Talos: healthy");

    view.unmount();
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("stop_talos_probe", { sessionId: SESSION.session_id });
      expect(invoke).toHaveBeenCalledWith("close_talos_session", { sessionId: SESSION.session_id });
    });
  });
});
