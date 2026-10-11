import { describe, expect, it } from "vitest";
import type { TalosCredentialSessionDto } from "../ipc/generated/TalosCredentialSessionDto";
import type { TalosProbeEventDto } from "../ipc/generated/TalosProbeEventDto";
import { credentialStorageSummary, talosContextSummary } from "./status";

const SESSION: TalosCredentialSessionDto = {
  session_id: "talos-session-1",
  context_name: "synthetic-demo",
  endpoints: ["10.79.0.2"],
  nodes: ["10.79.0.4", "10.79.0.5"],
  storage_mode: "session_only",
};

function probeEvent(state: TalosProbeEventDto["state"]): TalosProbeEventDto {
  return {
    session_id: SESSION.session_id,
    state,
    version: "v1.14.1",
    stage: "running",
    ready: true,
    deleted: false,
    sequence: "0",
  };
}

describe("credential storage summary", () => {
  it("never reports a storage mode where no native storage exists", () => {
    expect(credentialStorageSummary(null, false)).toBe("desktop application only");
    expect(credentialStorageSummary("persistent", false)).toBe("desktop application only");
  });

  it("distinguishes an unreported mode from every reported one", () => {
    expect(credentialStorageSummary(null, true)).toBe("status not loaded");
    expect(credentialStorageSummary("vault_unavailable", true)).toBe("vault unavailable");
    expect(credentialStorageSummary("session_only", true)).toBe("session-only");
  });

  it("keeps earlier session-only credentials visible beside the vault", () => {
    expect(credentialStorageSummary("persistent", true)).toBe("operating system vault");
    expect(credentialStorageSummary("persistent_with_session_only", true)).toBe(
      "operating system vault, earlier session-only credentials in memory",
    );
    expect(credentialStorageSummary("vault_not_checked", true)).toBe(
      "operating system vault, not yet used",
    );
  });
});

describe("Talos context summary", () => {
  it("reports that no context is open", () => {
    expect(talosContextSummary({ session: null, node: "", probing: false, probeEvent: null })).toBe(
      "no context",
    );
  });

  it("names the target and state only while the stream is open", () => {
    expect(
      talosContextSummary({
        session: SESSION,
        node: "10.79.0.5",
        probing: true,
        probeEvent: probeEvent("certificate_invalid"),
      }),
    ).toBe("synthetic-demo (session-only) · 10.79.0.5 · certificate invalid");
  });

  it("does not repeat the last projection of a finished stream as current", () => {
    expect(
      talosContextSummary({
        session: SESSION,
        node: "10.79.0.5",
        probing: false,
        probeEvent: probeEvent("healthy"),
      }),
    ).toBe("synthetic-demo (session-only)");
  });
});
