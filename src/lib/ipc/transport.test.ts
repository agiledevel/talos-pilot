import { beforeEach, describe, expect, it, vi } from "vitest";

const tauriApi = vi.hoisted(() => ({
  invoke: vi.fn<(command: string) => Promise<unknown>>(),
  isTauri: vi.fn<() => boolean>(),
}));

vi.mock("@tauri-apps/api/core", () => tauriApi);

import { createBrowserMockTransport } from "./testing/browserMock";
import {
  IpcApplicationError,
  IpcTransportError,
  IpcTransportUnavailableError,
  createNativeIpcTransport,
  getAppearanceSettings,
  getCredentialStorageStatus,
  getHelperStatus,
  importKubeconfig,
  setAppearanceSettings,
  useSessionOnlyStorage,
} from "./transport";
import {
  IpcContractError,
  parseApplicationErrorDto,
  parseAppearanceSettingsDto,
  parseCredentialImportResultDto,
  parseCredentialStorageStatusDto,
  parseHelperStatusDto,
} from "./validation";

describe("runtime-validated IPC transport", () => {
  beforeEach(() => {
    tauriApi.invoke.mockReset();
    tauriApi.isTauri.mockReset();
  });

  it("accepts the named browser mock only when explicitly injected", async () => {
    const status = await getHelperStatus(createBrowserMockTransport());
    expect(status).toEqual({
      state: "ready",
      build_identity: "browser-mock",
      protocol_major: 1,
      capabilities: ["status"],
    });
  });

  it("rejects missing fields, unknown variants, and inconsistent readiness", () => {
    expect(() => parseHelperStatusDto({ state: "ready" })).toThrow(IpcContractError);
    expect(() =>
      parseHelperStatusDto({
        state: "connected",
        build_identity: "build",
        protocol_major: 1,
        capabilities: ["status"],
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseHelperStatusDto({
        state: "ready",
        build_identity: null,
        protocol_major: null,
        capabilities: [],
      }),
    ).toThrow(IpcContractError);
  });

  it("validates appearance, storage mode, and safe import metadata DTOs", () => {
    expect(parseAppearanceSettingsDto({ theme: "system", density: "compact" })).toEqual({
      theme: "system",
      density: "compact",
    });
    expect(parseCredentialStorageStatusDto({ mode: "vault_unavailable" })).toEqual({
      mode: "vault_unavailable",
    });
    expect(parseCredentialStorageStatusDto({ mode: "persistent_with_session_only" })).toEqual({
      mode: "persistent_with_session_only",
    });
    expect(
      parseCredentialImportResultDto({ context_name: "synthetic", storage_mode: "session_only" }),
    ).toEqual({ context_name: "synthetic", storage_mode: "session_only" });
    expect(
      parseCredentialImportResultDto({
        context_name: "synthetic",
        storage_mode: "persistent_with_session_only",
      }),
    ).toEqual({
      context_name: "synthetic",
      storage_mode: "persistent_with_session_only",
    });
    expect(() => parseAppearanceSettingsDto({ theme: "night", density: "compact" })).toThrow(
      IpcContractError,
    );
    expect(() => parseCredentialStorageStatusDto({ mode: "fallback_file" })).toThrow(
      IpcContractError,
    );
    expect(() =>
      parseCredentialImportResultDto({
        context_name: "x".repeat(129),
        storage_mode: "persistent",
        secret: "must-not-be-returned",
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseCredentialImportResultDto({
        context_name: "synthetic\nspoofed",
        storage_mode: "persistent",
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseCredentialImportResultDto({
        context_name: "synthetic",
        storage_mode: "vault_unavailable",
      }),
    ).toThrow(IpcContractError);
  });

  it("keeps absent values explicit and ignores harmless additive fields", () => {
    expect(
      parseHelperStatusDto({
        state: "stopped",
        build_identity: null,
        protocol_major: null,
        capabilities: [],
        added_in_future: true,
      }),
    ).toEqual({
      state: "stopped",
      build_identity: null,
      protocol_major: null,
      capabilities: [],
    });
  });

  it("rejects unsafe numeric values, excess capability entries, and oversized strings", () => {
    expect(() =>
      parseHelperStatusDto({
        state: "ready",
        build_identity: "build",
        protocol_major: Number.MAX_SAFE_INTEGER + 1,
        capabilities: ["status"],
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseHelperStatusDto({
        state: "ready",
        build_identity: "b".repeat(129),
        protocol_major: 1,
        capabilities: ["status"],
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseHelperStatusDto({
        state: "ready",
        build_identity: "build",
        protocol_major: 1,
        capabilities: Array.from({ length: 9 }, () => "status"),
      }),
    ).toThrow(IpcContractError);
  });

  it("maps validated application errors without leaking malformed rejection data", async () => {
    const backendError = {
      code: "HELPER_UNAVAILABLE",
      action: "get_helper_status",
      target: null,
      retryable: true,
      message: "The bundled helper is unavailable.",
    };
    const transport = createBrowserMockTransport({ kind: "reject", reason: backendError });
    const applicationError = await getHelperStatus(transport).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(applicationError).toBeInstanceOf(IpcApplicationError);
    expect(applicationError).toHaveProperty("detail", parseApplicationErrorDto(backendError));

    const secret = "synthetic-secret-marker";
    const transportError = await getHelperStatus(
      createBrowserMockTransport({ kind: "reject", reason: secret }),
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(transportError).toBeInstanceOf(IpcTransportError);
    expect(transportError).toHaveProperty(
      "message",
      "The native application could not complete this request.",
    );
    expect(transportError).not.toHaveProperty("message", secret);
  });

  it("fails closed in browsers instead of selecting a mock transport", () => {
    tauriApi.isTauri.mockReturnValue(false);
    expect(() => createNativeIpcTransport()).toThrow(IpcTransportUnavailableError);
    expect(tauriApi.invoke).not.toHaveBeenCalled();
  });

  it("calls only the registered native status command and validates its result", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    tauriApi.invoke.mockResolvedValue({
      state: "ready",
      build_identity: "native-build",
      protocol_major: 1,
      capabilities: ["status"],
    });

    const status = await getHelperStatus(createNativeIpcTransport());

    expect(tauriApi.invoke).toHaveBeenCalledExactlyOnceWith("get_helper_status");
    expect(status.build_identity).toBe("native-build");
  });

  it("invokes settings and storage commands with runtime-validated responses", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    tauriApi.invoke
      .mockResolvedValueOnce({ theme: "dark", density: "comfortable" })
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ mode: "vault_unavailable" })
      .mockResolvedValueOnce({ mode: "session_only" })
      .mockResolvedValueOnce({ context_name: "synthetic", storage_mode: "session_only" });
    const transport = createNativeIpcTransport();

    await expect(getAppearanceSettings(transport)).resolves.toEqual({
      theme: "dark",
      density: "comfortable",
    });
    await setAppearanceSettings(transport, { theme: "dark", density: "comfortable" });
    await expect(getCredentialStorageStatus(transport)).resolves.toEqual({
      mode: "vault_unavailable",
    });
    await expect(useSessionOnlyStorage(transport)).resolves.toEqual({ mode: "session_only" });
    await expect(importKubeconfig(transport)).resolves.toEqual({
      context_name: "synthetic",
      storage_mode: "session_only",
    });
    expect(tauriApi.invoke).toHaveBeenNthCalledWith(2, "set_appearance_settings", {
      settings: { theme: "dark", density: "comfortable" },
    });
  });

  it("rejects missing and oversized application error fields", () => {
    expect(() =>
      parseApplicationErrorDto({
        code: "HELPER_UNAVAILABLE",
        action: "get_helper_status",
        retryable: true,
        message: "Unavailable.",
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseApplicationErrorDto({
        code: "HELPER_UNAVAILABLE",
        action: "get_helper_status",
        target: null,
        retryable: true,
        message: "m".repeat(1025),
      }),
    ).toThrow(IpcContractError);
  });
});
