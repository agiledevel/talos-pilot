import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MockedFunction } from "vitest";

const tauriApi = vi.hoisted(() => {
  const created: { onmessage?: (message: unknown) => void }[] = [];
  class ChannelStub {
    onmessage?: (message: unknown) => void;
    constructor() {
      created.push(this);
    }
  }
  return {
    invoke: vi.fn<(command: string, ...args: unknown[]) => Promise<unknown>>(),
    isTauri: vi.fn<() => boolean>(),
    Channel: ChannelStub,
    createdChannels: created,
  };
});

vi.mock("@tauri-apps/api/core", () => tauriApi);

import { createBrowserMockTransport } from "./testing/browserMock";
import type { IpcTransport } from "./transport";
import {
  IpcApplicationError,
  IpcTransportError,
  IpcTransportUnavailableError,
  closeTalosSession,
  createNativeIpcTransport,
  getAppearanceSettings,
  getCredentialStorageStatus,
  getHelperStatus,
  importKubeconfig,
  importTalosconfig,
  setAppearanceSettings,
  startTalosProbe,
  stopTalosProbe,
  useSessionOnlyStorage,
} from "./transport";
import {
  IpcContractError,
  parseApplicationErrorDto,
  parseAppearanceSettingsDto,
  parseCredentialImportResultDto,
  parseCredentialStorageStatusDto,
  parseHelperStatusDto,
  parseTalosCredentialSessionDto,
  parseTalosProbeEventDto,
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

const VALID_SESSION_DTO = {
  session_id: "talos-session-1",
  context_name: "synthetic",
  endpoints: ["10.79.0.2"],
  nodes: ["10.79.0.4"],
  storage_mode: "session_only",
};

const VALID_PROBE_EVENT = {
  session_id: "talos-session-1",
  state: "healthy",
  version: "v1.14.1",
  stage: "running",
  ready: true,
  deleted: false,
  sequence: "0",
};

function createUnusedInvoke(): MockedFunction<IpcTransport["invoke"]> {
  return vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
}

describe("Talos probe session and stream contracts", () => {
  beforeEach(() => {
    tauriApi.invoke.mockReset();
    tauriApi.isTauri.mockReset();
    tauriApi.createdChannels.length = 0;
  });

  it("accepts only bounded session metadata and ignores additive fields", () => {
    expect(parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, future_field: 1 })).toEqual(
      VALID_SESSION_DTO,
    );
    expect(() => parseTalosCredentialSessionDto(VALID_SESSION_DTO)).not.toThrow();
  });

  it("rejects persistent session metadata, unsafe labels, and bad identities", () => {
    expect(() =>
      parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, storage_mode: "persistent" }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, session_id: "session-1" }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, context_name: "synthetic\nspoofed" }),
    ).toThrow(IpcContractError);
    expect(() => parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, endpoints: [] })).toThrow(
      IpcContractError,
    );
    expect(() =>
      parseTalosCredentialSessionDto({
        ...VALID_SESSION_DTO,
        endpoints: ["10.79.0.2", "10.79.0.2"],
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseTalosCredentialSessionDto({
        ...VALID_SESSION_DTO,
        endpoints: Array.from({ length: 9 }, (_value, index) => `10.79.0.${index}`),
      }),
    ).toThrow(IpcContractError);
    expect(() =>
      parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, nodes: ["node.internal"] }),
    ).not.toThrow();
    expect(() =>
      parseTalosCredentialSessionDto({ ...VALID_SESSION_DTO, nodes: ["10.79.0.4;rm"] }),
    ).toThrow(IpcContractError);
  });

  it("validates probe event state, sequence, and projection bounds", () => {
    expect(parseTalosProbeEventDto(VALID_PROBE_EVENT)).toEqual(VALID_PROBE_EVENT);
    expect(
      parseTalosProbeEventDto({
        session_id: "talos-session-2",
        state: "connecting",
        version: null,
        stage: null,
        ready: null,
        deleted: false,
        sequence: "0",
      }),
    ).toEqual({
      session_id: "talos-session-2",
      state: "connecting",
      version: null,
      stage: null,
      ready: null,
      deleted: false,
      sequence: "0",
    });
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, state: "connected" })).toThrow(
      IpcContractError,
    );
    expect(() =>
      parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, state: "connecting", version: "v1.14.1" }),
    ).toThrow(IpcContractError);
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, sequence: "01" })).toThrow(
      IpcContractError,
    );
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, sequence: "257" })).toThrow(
      IpcContractError,
    );
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, sequence: 3 })).toThrow(
      IpcContractError,
    );
    expect(() =>
      parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, version: "v".repeat(65) }),
    ).toThrow(IpcContractError);
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, stage: "run\nning" })).toThrow(
      IpcContractError,
    );
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, ready: "true" })).toThrow(
      IpcContractError,
    );
    expect(() => parseTalosProbeEventDto({ ...VALID_PROBE_EVENT, deleted: null })).toThrow(
      IpcContractError,
    );
  });

  it("imports a talosconfig session or an explicit cancellation null", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    tauriApi.invoke.mockResolvedValueOnce(VALID_SESSION_DTO);
    await expect(importTalosconfig(createNativeIpcTransport())).resolves.toEqual(VALID_SESSION_DTO);
    tauriApi.invoke.mockResolvedValueOnce(null);
    await expect(importTalosconfig(createNativeIpcTransport())).resolves.toBeNull();
  });

  it("streams validated channel events and requires a null command result", async () => {
    const events: unknown[] = [];
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
    const transport = {
      invoke,
      invokeChannel: async (
        _command: string,
        _args: Record<string, unknown>,
        onMessage: (message: unknown) => void,
      ) => {
        onMessage(VALID_PROBE_EVENT);
        onMessage({ ...VALID_PROBE_EVENT, sequence: "1", version: null });
        return null;
      },
    };

    await startTalosProbe(transport, "talos-session-1", "10.79.0.4", (event) => {
      events.push(event);
    });
    expect(events).toEqual([
      VALID_PROBE_EVENT,
      { ...VALID_PROBE_EVENT, sequence: "1", version: null },
    ]);
  });

  it("wires the native Tauri channel and detaches its callback when the command settles", async () => {
    tauriApi.isTauri.mockReturnValue(true);
    const received: unknown[] = [];
    tauriApi.invoke.mockImplementation(async (command) => {
      expect(command).toBe("start_talos_probe");
      const channel = tauriApi.createdChannels.at(-1);
      if (channel === undefined) {
        throw new Error("the native transport created no channel");
      }
      channel.onmessage?.(VALID_PROBE_EVENT);
      channel.onmessage?.({ ...VALID_PROBE_EVENT, sequence: "1", version: null });
      return null;
    });

    await startTalosProbe(createNativeIpcTransport(), "talos-session-1", "10.79.0.4", (event) => {
      received.push(event);
    });

    expect(tauriApi.invoke).toHaveBeenCalledExactlyOnceWith("start_talos_probe", {
      sessionId: "talos-session-1",
      node: "10.79.0.4",
      channel: tauriApi.createdChannels[0],
    });
    expect(received).toEqual([
      VALID_PROBE_EVENT,
      { ...VALID_PROBE_EVENT, sequence: "1", version: null },
    ]);

    const detached = tauriApi.createdChannels[0]?.onmessage;
    expect(detached).toBeTypeOf("function");
    detached?.({ ...VALID_PROBE_EVENT, sequence: "999" });
    expect(received).toHaveLength(2);
  });

  it("rejects a malformed stream event and requests scoped cancellation", async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>(
      async () => true,
    );
    const transport = {
      invoke,
      invokeChannel: async (
        _command: string,
        _args: Record<string, unknown>,
        onMessage: (message: unknown) => void,
      ) => {
        onMessage({ ...VALID_PROBE_EVENT, state: "connected" });
        onMessage({ ...VALID_PROBE_EVENT, state: "connected" });
        return null;
      },
    };

    await expect(
      startTalosProbe(transport, "talos-session-1", "10.79.0.4", () => undefined),
    ).rejects.toThrow(IpcContractError);
    await vi.waitFor(() => {
      expect(invoke).toHaveBeenCalledWith("stop_talos_probe", { sessionId: "talos-session-1" });
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it("rejects a non-null probe result and a transport without channels", async () => {
    await expect(
      startTalosProbe(
        { invoke: createUnusedInvoke(), invokeChannel: async () => ({ unexpected: true }) },
        "talos-session-1",
        "10.79.0.4",
        () => undefined,
      ),
    ).rejects.toThrow(IpcContractError);
    await expect(
      startTalosProbe(
        { invoke: createUnusedInvoke() },
        "talos-session-1",
        "10.79.0.4",
        () => undefined,
      ),
    ).rejects.toThrow(IpcTransportUnavailableError);
  });

  it("maps probe rejections without exposing raw transport data", async () => {
    const rejection = {
      code: "TALOS_UNAUTHORIZED",
      action: "start_talos_probe",
      target: null,
      retryable: false,
      message: "Talos rejected the configured permissions.",
    };
    const applicationError = await startTalosProbe(
      {
        invoke: createUnusedInvoke(),
        invokeChannel: async () => {
          throw rejection;
        },
      },
      "talos-session-1",
      "10.79.0.4",
      () => undefined,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(applicationError).toBeInstanceOf(IpcApplicationError);
    expect(applicationError).toHaveProperty("detail", parseApplicationErrorDto(rejection));

    const transportError = await startTalosProbe(
      {
        invoke: createUnusedInvoke(),
        invokeChannel: async () => {
          throw "synthetic-secret-marker";
        },
      },
      "talos-session-1",
      "10.79.0.4",
      () => undefined,
    ).then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(transportError).toBeInstanceOf(IpcTransportError);
    expect(transportError).not.toHaveProperty("message", "synthetic-secret-marker");
  });

  it("requires boolean session control results", async () => {
    const invoke = vi.fn<(command: string, args?: Record<string, unknown>) => Promise<unknown>>();
    const transport = { invoke };

    invoke.mockResolvedValueOnce(true);
    await expect(stopTalosProbe(transport, "talos-session-1")).resolves.toBe(true);
    expect(invoke).toHaveBeenLastCalledWith("stop_talos_probe", { sessionId: "talos-session-1" });

    invoke.mockResolvedValueOnce("cancelled");
    await expect(stopTalosProbe(transport, "talos-session-1")).rejects.toThrow(IpcContractError);

    invoke.mockResolvedValueOnce(false);
    await expect(closeTalosSession(transport, "talos-session-9")).resolves.toBe(false);
    expect(invoke).toHaveBeenLastCalledWith("close_talos_session", {
      sessionId: "talos-session-9",
    });
  });
});
