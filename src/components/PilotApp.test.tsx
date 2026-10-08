import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";
import type { IpcTransport } from "../lib/ipc/transport";
import { PilotApp } from "./PilotApp";

function createTransport(): {
  readonly transport: IpcTransport;
  readonly invoke: MockedFunction<IpcTransport["invoke"]>;
} {
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
      return null;
    },
  );
  return { transport: { invoke }, invoke };
}

describe("appearance and credential settings", () => {
  it("persists theme and density independently and keeps session status visible", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(<PilotApp transport={transport} />);

    await screen.findByText(/operating system vault is unavailable/i);
    await user.click(screen.getByText("Dark"));
    expect(invoke).toHaveBeenCalledWith("set_appearance_settings", {
      settings: { theme: "dark", density: "comfortable" },
    });
    await user.click(screen.getByText("Compact"));
    expect(invoke).toHaveBeenCalledWith("set_appearance_settings", {
      settings: { theme: "dark", density: "compact" },
    });
    expect(screen.getByText(/operating system vault is unavailable/i)).toBeInTheDocument();
  });

  it("shows session-only operation after the explicit choice", async () => {
    const user = userEvent.setup();
    render(<PilotApp transport={createTransport().transport} />);
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));
    await user.click(screen.getByText("Dark"));
    expect(
      await screen.findByText(/credentials remain in memory until the application exits/i),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText("Import kubeconfig").closest("button")).toBeEnabled();
    });
  });

  it("keeps earlier session credentials visibly distinct after vault retry", async () => {
    const user = userEvent.setup();
    render(<PilotApp transport={createTransport().transport} />);
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));
    await user.click(await screen.findByRole("button", { name: "Retry operating system vault" }));
    expect(
      await screen.findByText(/earlier session-only credentials remain in memory until exit/i),
    ).toBeInTheDocument();
    await user.click(screen.getByText("Dark"));
    expect(
      screen.getByText(/earlier session-only credentials remain in memory until exit/i),
    ).toBeInTheDocument();
  });

  it("associates failed preference saves with their controls", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(<PilotApp transport={transport} />);
    await screen.findByText(/operating system vault is unavailable/i);
    invoke.mockRejectedValueOnce({
      code: "STORAGE_UNAVAILABLE",
      action: "set_appearance_settings",
      target: null,
      retryable: true,
      message: "Local storage is unavailable.",
    });
    await user.click(screen.getByText("Dark"));
    await screen.findByText(/appearance settings could not be saved/i);
    expect(screen.getByRole("radiogroup", { name: "Theme" })).toHaveAttribute(
      "aria-describedby",
      "appearance-error",
    );
  });

  it("associates import errors with the import action", async () => {
    const user = userEvent.setup();
    const { transport, invoke } = createTransport();
    render(<PilotApp transport={transport} />);
    await user.click(await screen.findByRole("button", { name: "Use session-only storage" }));
    invoke.mockRejectedValueOnce({
      code: "IMPORT_EXEC_AUTH_UNSUPPORTED",
      action: "import_kubeconfig",
      target: null,
      retryable: false,
      message: "Kubeconfig exec authentication is not supported.",
    });
    await user.click(screen.getByText("Import kubeconfig"));
    await screen.findByText(/kubeconfig could not be imported/i);
    expect(screen.getByText("Import kubeconfig").closest("button")).toHaveAttribute(
      "aria-describedby",
      "credential-action-error",
    );
  });

  it("keeps native storage actions disabled in a browser without an explicit test transport", () => {
    render(<PilotApp />);
    expect(screen.getByRole("button", { name: "Import kubeconfig" })).toBeDisabled();
    expect(screen.getByText(/available in the native desktop application/i)).toBeInTheDocument();
  });
});
