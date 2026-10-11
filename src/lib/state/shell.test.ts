import { describe, expect, it } from "vitest";
import type { IpcTransport } from "../ipc/transport";
import { ShellState } from "./shell.svelte";

type Responder = (command: string, args?: Record<string, unknown>) => unknown;

/** Builds a transport whose responder returns a value or throws the rejection. */
function transportFrom(responder: Responder): IpcTransport {
  return { invoke: async (command, args) => responder(command, args) };
}

function applicationError(code: string, action: string, message: string): Error {
  return Object.assign(new Error(message), { code, action, target: null, retryable: false });
}

const LOADED: Responder = (command) => {
  if (command === "get_appearance_settings") {
    return { theme: "system", density: "comfortable" };
  }
  if (command === "get_credential_storage_status") {
    return { mode: "vault_not_checked" };
  }
  return null;
};

async function loadedShell(responder: Responder): Promise<ShellState> {
  const shell = new ShellState(transportFrom((command, args) => responder(command, args)));
  await shell.load();
  return shell;
}

describe("shell state without a transport", () => {
  it("stays inert instead of attempting native commands", async () => {
    const shell = new ShellState(undefined);
    await shell.load();
    await shell.importCredential();
    await shell.selectTheme("dark");

    expect(shell.native).toBe(false);
    expect(shell.canImport).toBe(false);
    expect(shell.storageMode).toBeNull();
    expect(shell.appearance.theme).toBe("system");
    expect(shell.error).toBeNull();
  });
});

describe("loading shell state", () => {
  it("shows the backend's safe message for a structured failure", async () => {
    const shell = await loadedShell(() => {
      throw applicationError(
        "STORAGE_UNAVAILABLE",
        "get_appearance_settings",
        "Local storage is unavailable.",
      );
    });
    expect(shell.error).toBe("Local storage is unavailable.");
    expect(shell.storageMode).toBeNull();
  });

  it("reports malformed settings as a contract failure without applying them", async () => {
    const shell = await loadedShell((command) =>
      command === "get_appearance_settings" ? { theme: "neon", density: "comfortable" } : null,
    );
    expect(shell.error).toMatch(/returned invalid settings data/u);
    expect(shell.appearance.theme).toBe("system");
  });

  it("does not expose an unstructured rejection", async () => {
    const shell = await loadedShell(() => {
      throw new Error("secret-bearing transport detail");
    });
    expect(shell.error).toMatch(/could not load settings/u);
    expect(shell.error).not.toMatch(/secret-bearing/u);
  });
});

describe("saving appearance", () => {
  it("shows the request while saving and restores the accepted value when rejected", async () => {
    let rejectSave: (reason: unknown) => void = () => undefined;
    const shell = await loadedShell((command, args) =>
      command === "set_appearance_settings"
        ? new Promise((_resolve, reject) => {
            rejectSave = reject;
          })
        : LOADED(command, args),
    );

    const saving = shell.selectTheme("dark");
    expect(shell.selectedAppearance.theme).toBe("dark");
    expect(shell.appearance.theme).toBe("system");
    expect(shell.busy).toBe(true);

    rejectSave(new Error("rejected"));
    await saving;
    expect(shell.selectedAppearance.theme).toBe("system");
    expect(shell.appearance.theme).toBe("system");
    expect(shell.appearanceError).toMatch(/could not be saved/u);
    expect(shell.busy).toBe(false);
  });
});

describe("importing a kubeconfig", () => {
  it.each([
    ["session_only", "Imported context “demo” for this session."],
    ["persistent", "Imported context “demo” encrypted."],
  ] as const)("confirms a %s import and records its mode", async (mode, notice) => {
    const shell = await loadedShell((command, args) =>
      command === "import_kubeconfig"
        ? { context_name: "demo", storage_mode: mode }
        : LOADED(command, args),
    );
    await shell.importCredential();

    expect(shell.notice).toBe(notice);
    expect(shell.storageMode).toBe(mode);
    expect(shell.error).toBeNull();
    expect(shell.busy).toBe(false);
  });

  it("changes nothing when the native picker is cancelled", async () => {
    const shell = await loadedShell(LOADED);
    await shell.importCredential();

    expect(shell.notice).toBeNull();
    expect(shell.error).toBeNull();
    expect(shell.storageMode).toBe("vault_not_checked");
  });

  it("offers session-only storage when the vault turns out to be unavailable", async () => {
    const shell = await loadedShell((command, args) => {
      if (command === "import_kubeconfig") {
        throw applicationError(
          "CREDENTIAL_VAULT_UNAVAILABLE",
          "import_kubeconfig",
          "The operating system vault is unavailable.",
        );
      }
      return LOADED(command, args);
    });
    await shell.importCredential();

    expect(shell.storageMode).toBe("vault_unavailable");
    expect(shell.vaultUnavailable).toBe(true);
    expect(shell.canImport).toBe(false);
    expect(shell.error).toMatch(/Choose session-only storage or retry the vault/u);
  });
});

describe("changing credential storage", () => {
  it("keeps the current mode and explains a failed session-only switch", async () => {
    const shell = await loadedShell((command, args) => {
      if (command === "use_session_only_storage") {
        throw new Error("unavailable");
      }
      return LOADED(command, args);
    });
    await shell.selectSessionOnly();

    expect(shell.storageMode).toBe("vault_not_checked");
    expect(shell.error).toMatch(/Session-only storage could not be started/u);
  });

  it("keeps the current mode and explains a failed vault retry", async () => {
    const shell = await loadedShell((command, args) => {
      if (command === "retry_persistent_storage") {
        throw new Error("unavailable");
      }
      return LOADED(command, args);
    });
    await shell.retryVault();

    expect(shell.storageMode).toBe("vault_not_checked");
    expect(shell.error).toMatch(/vault is still unavailable/u);
    expect(shell.busy).toBe(false);
  });
});
