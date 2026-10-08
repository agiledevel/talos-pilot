import type { IpcTransport } from "../transport";

/** A named test-only response choice for the browser IPC boundary. */
export type BrowserMockOutcome =
  | { readonly kind: "resolve"; readonly value: unknown }
  | { readonly kind: "reject"; readonly reason: unknown };

const DEFAULT_STATUS: BrowserMockOutcome = {
  kind: "resolve",
  value: {
    state: "ready",
    build_identity: "browser-mock",
    protocol_major: 1,
    capabilities: ["status"],
  },
};

/**
 * Creates an explicit browser test transport. Production transport selection
 * never falls back to this mock when Tauri IPC is unavailable.
 *
 * @param outcome The single deterministic response the mock should produce.
 */
export function createBrowserMockTransport(
  outcome: BrowserMockOutcome = DEFAULT_STATUS,
): IpcTransport {
  return {
    invoke: async () => {
      if (outcome.kind === "reject") {
        throw outcome.reason;
      }
      return outcome.value;
    },
  };
}
