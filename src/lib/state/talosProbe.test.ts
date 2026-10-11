import { describe, expect, it, vi } from "vitest";
import type { IpcTransport } from "../ipc/transport";
import { TalosProbePanelState } from "./talosProbe.svelte";

const SESSION = {
  session_id: "talos-session-1",
  context_name: "synthetic-demo",
  endpoints: ["10.79.0.2"],
  nodes: ["10.79.0.4", "10.79.0.5"],
  storage_mode: "session_only",
};

function applicationError(code: string, message: string): Error {
  return Object.assign(new Error(message), {
    code,
    action: "start_talos_probe",
    target: null,
    retryable: false,
  });
}

/** A transport with one controllable probe stream; `end` resolves or rejects it. */
function probeTransport() {
  let settle: { resolve: (value: null) => void; reject: (reason: unknown) => void } | undefined;
  let emit: (message: unknown) => void = () => undefined;
  const invoke = vi.fn<IpcTransport["invoke"]>(async (command) =>
    command === "import_talosconfig" ? SESSION : true,
  );
  const invokeChannel = vi.fn<NonNullable<IpcTransport["invokeChannel"]>>(
    async (_command, _args, onMessage) => {
      emit = onMessage;
      return await new Promise<null>((resolve, reject) => {
        settle = { resolve, reject };
      });
    },
  );
  return {
    transport: { invoke, invokeChannel } satisfies IpcTransport,
    invoke,
    invokeChannel,
    emit: (message: unknown) => emit(message),
    end: (reason?: unknown) => {
      if (reason === undefined) {
        settle?.resolve(null);
      } else {
        settle?.reject(reason);
      }
    },
  };
}

async function importedProbe() {
  const harness = probeTransport();
  const probe = new TalosProbePanelState(harness.transport);
  await probe.importContext();
  return { ...harness, probe };
}

describe("Talos probe state", () => {
  it("does nothing without a transport", async () => {
    const probe = new TalosProbePanelState(undefined);
    await probe.importContext();
    await probe.runProbe();
    probe.dispose();

    expect(probe.native).toBe(false);
    expect(probe.session).toBeNull();
    expect(probe.probeEvent).toBeNull();
  });

  it("targets only a node that belongs to the open context", async () => {
    const { probe } = await importedProbe();
    expect(probe.node).toBe("10.79.0.4");

    probe.selectNode("10.99.0.1");
    expect(probe.node).toBe("10.79.0.4");
    probe.selectNode("10.79.0.5");
    expect(probe.node).toBe("10.79.0.5");
  });

  it("keeps one stream and one target while a probe is running", async () => {
    const { probe, invokeChannel, end } = await importedProbe();
    const running = probe.runProbe();
    await probe.runProbe();
    probe.selectNode("10.79.0.5");

    expect(invokeChannel).toHaveBeenCalledTimes(1);
    expect(probe.node).toBe("10.79.0.4");
    expect(probe.probing).toBe(true);

    end();
    await running;
    expect(probe.probing).toBe(false);
  });

  it.each([
    ["TALOS_CERTIFICATE_INVALID", "certificate_invalid"],
    ["TALOS_UNAVAILABLE", "unavailable"],
  ] as const)("classifies %s as %s with the backend's safe message", async (code, state) => {
    const { probe, end } = await importedProbe();
    const running = probe.runProbe();
    end(applicationError(code, "The Talos API could not be used."));
    await running;

    expect(probe.probeEvent?.state).toBe(state);
    expect(probe.error).toBe("The Talos API could not be used.");
  });

  it("does not call a connection that never became healthy stale", async () => {
    const { probe, end } = await importedProbe();
    const running = probe.runProbe();
    end(new Error("secret-bearing transport detail"));
    await running;

    expect(probe.probeEvent?.state).toBe("connecting");
    expect(probe.error).toBe("The Talos read probe could not complete.");
  });

  it("marks an unclassified failure after a healthy event stale", async () => {
    const { probe, emit, end } = await importedProbe();
    const running = probe.runProbe();
    emit({
      session_id: SESSION.session_id,
      state: "healthy",
      version: "v1.14.1",
      stage: "running",
      ready: true,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: true,
    });
    expect(probe.probeEvent?.state).toBe("healthy");

    end(applicationError("HELPER_UNAVAILABLE", "The bundled helper is unavailable."));
    await running;
    expect(probe.probeEvent?.state).toBe("stale");
    expect(probe.probeEvent?.version).toBe("v1.14.1");
  });

  it("keeps the retained projection stale until a replacement snapshot arrives", async () => {
    const { probe, emit, end } = await importedProbe();
    const running = probe.runProbe();
    emit({
      session_id: SESSION.session_id,
      state: "healthy",
      version: "v1.14.1",
      stage: "running",
      ready: true,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: true,
    });
    emit({
      session_id: SESSION.session_id,
      state: "stale",
      version: null,
      stage: null,
      ready: null,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: false,
    });

    expect(probe.probeEvent?.state).toBe("stale");
    expect(probe.probeEvent?.version).toBe("v1.14.1");
    expect(probe.probeEvent?.stage).toBe("running");

    emit({
      session_id: SESSION.session_id,
      state: "healthy",
      version: null,
      stage: "booting",
      ready: false,
      deleted: false,
      sequence: "1",
      generation: "2",
      snapshot: true,
    });

    expect(probe.probeEvent?.state).toBe("healthy");
    expect(probe.probeEvent?.stage).toBe("booting");
    expect(probe.probeEvent?.sequence).toBe("1");
    expect(probe.probeEvent?.generation).toBe("2");

    end();
    await running;
  });

  it("stops the stream on a stale, duplicate, or foreign generation", async () => {
    for (const violation of [
      // A duplicate of the bootstrap projection.
      {
        state: "healthy",
        version: null,
        stage: "running",
        ready: true,
        deleted: false,
        sequence: "0",
        generation: "1",
        snapshot: true,
      },
      // A sequence gap.
      {
        state: "healthy",
        version: null,
        stage: "running",
        ready: true,
        deleted: false,
        sequence: "2",
        generation: "1",
        snapshot: false,
      },
      // A foreign generation without a replacement snapshot.
      {
        state: "healthy",
        version: null,
        stage: "running",
        ready: true,
        deleted: false,
        sequence: "1",
        generation: "4",
        snapshot: false,
      },
      // A stale marker that repeats no projection identity.
      {
        state: "stale",
        version: null,
        stage: null,
        ready: null,
        deleted: false,
        sequence: "5",
        generation: "5",
        snapshot: false,
      },
    ] as const) {
      const { probe, emit, end, invoke } = await importedProbe();
      const running = probe.runProbe();
      emit({
        session_id: SESSION.session_id,
        state: "healthy",
        version: "v1.14.1",
        stage: "running",
        ready: true,
        deleted: false,
        sequence: "0",
        generation: "1",
        snapshot: true,
      });
      emit({ session_id: SESSION.session_id, ...violation });

      expect(probe.probeEvent?.state).toBe("stale");

      end();
      await running;
      expect(probe.error).toBe("The native application returned an invalid Talos probe response.");
      expect(invoke).toHaveBeenCalledWith("stop_talos_probe", { sessionId: SESSION.session_id });
    }
  });

  it("presents an exhausted reconnect budget as a terminal state, not as current", async () => {
    const { probe, emit, end } = await importedProbe();
    const running = probe.runProbe();
    emit({
      session_id: SESSION.session_id,
      state: "healthy",
      version: "v1.14.1",
      stage: "running",
      ready: true,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: true,
    });
    emit({
      session_id: SESSION.session_id,
      state: "stale",
      version: null,
      stage: null,
      ready: null,
      deleted: false,
      sequence: "0",
      generation: "1",
      snapshot: false,
    });

    end(
      applicationError("TALOS_UNAVAILABLE", "The selected Talos endpoint or node is unavailable."),
    );
    await running;

    expect(probe.probeEvent?.state).toBe("unavailable");
    expect(probe.probeEvent?.stage).toBe("running");
    expect(probe.error).toBe("The selected Talos endpoint or node is unavailable.");
  });

  it("releases nothing on dispose once the session is closed", async () => {
    const { probe, invoke } = await importedProbe();
    await probe.closeSession();
    invoke.mockClear();
    probe.dispose();

    expect(probe.session).toBeNull();
    expect(invoke).not.toHaveBeenCalled();
  });
});
