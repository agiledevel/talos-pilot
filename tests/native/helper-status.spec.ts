import assert from "node:assert/strict";

import { browser } from "@wdio/globals";
import { describe, it } from "mocha";
import { withExecuteOptions } from "@wdio/tauri-service";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

describe("native helper status command", () => {
  it("allows the main capability to complete a real Rust-to-Go handshake", async () => {
    const status = await browser.tauri.execute(({ core }) => core.invoke("get_helper_status"));
    assert.ok(isRecord(status));
    assert.equal(status.state, "ready");
    assert.equal(status.protocol_major, 1);
    assert.deepEqual(status.capabilities, ["status", "talos_probe"]);
    assert.equal(typeof status.build_identity, "string");
    if (typeof status.build_identity === "string") {
      assert.match(status.build_identity, /^[a-f0-9]{40}$/u);
    }
  });

  it("denies the custom application command from a window without its capability", async () => {
    const result = await browser.tauri.execute(
      async ({ core }) => {
        try {
          await core.invoke("get_helper_status");
          return "unexpectedly-allowed";
        } catch {
          return "denied";
        }
      },
      withExecuteOptions({ windowLabel: "unauthorized" }),
    );
    assert.equal(result, "denied");
  });
});

describe("native storage and appearance commands", () => {
  it("renders storage state loaded through the native IPC transport", async () => {
    const text = await browser.tauri.execute(() => document.body.innerText);
    assert.match(text, /Session-only: credentials remain in memory/u);
  });

  it("stores and reads appearance preferences through the Rust command boundary", async () => {
    const updated = await browser.tauri.execute(async ({ core }) => {
      await core.invoke("set_appearance_settings", {
        settings: { theme: "dark", density: "compact" },
      });
      return core.invoke("get_appearance_settings");
    });
    assert.deepEqual(updated, { theme: "dark", density: "compact" });

    const restored = await browser.tauri.execute(async ({ core }) => {
      await core.invoke("set_appearance_settings", {
        settings: { theme: "system", density: "comfortable" },
      });
      return core.invoke("get_appearance_settings");
    });
    assert.deepEqual(restored, { theme: "system", density: "comfortable" });
  });

  it("uses isolated session-only credential storage in the native-test app", async () => {
    const status = await browser.tauri.execute(({ core }) =>
      core.invoke("get_credential_storage_status"),
    );
    assert.deepEqual(status, { mode: "session_only" });
    const selected = await browser.tauri.execute(({ core }) =>
      core.invoke("use_session_only_storage"),
    );
    assert.deepEqual(selected, { mode: "session_only" });
  });

  it("cannot access a production vault through the native-test runtime", async () => {
    const result = await browser.tauri.execute(async ({ core }) => {
      try {
        await core.invoke("retry_persistent_storage");
        return "unexpectedly-available";
      } catch {
        return "isolated-vault-unavailable";
      }
    });
    assert.equal(result, "isolated-vault-unavailable");
    assert.deepEqual(
      await browser.tauri.execute(({ core }) => core.invoke("get_credential_storage_status")),
      { mode: "session_only" },
    );
  });

  it("denies storage commands from the webview without its capability", async () => {
    const result = await browser.tauri.execute(
      async ({ core }) => {
        try {
          await core.invoke("get_credential_storage_status");
          return "unexpectedly-allowed";
        } catch {
          return "denied";
        }
      },
      withExecuteOptions({ windowLabel: "unauthorized" }),
    );
    assert.equal(result, "denied");
  });

  it("denies native file import from the webview without its capability", async () => {
    const result = await browser.tauri.execute(
      async ({ core }) => {
        try {
          await core.invoke("import_kubeconfig");
          return "unexpectedly-allowed";
        } catch {
          return "denied";
        }
      },
      withExecuteOptions({ windowLabel: "unauthorized" }),
    );
    assert.equal(result, "denied");
  });
});

describe("native Talos probe commands", () => {
  it("reports the Talos probe capability from the real helper handshake", async () => {
    const status = await browser.tauri.execute(({ core }) => core.invoke("get_helper_status"));
    assert.ok(isRecord(status));
    assert.equal(status.state, "ready");
    assert.deepEqual(status.capabilities, ["status", "talos_probe"]);
  });

  it("releases no helper work for a session the main window never imported", async () => {
    const stopped = await browser.tauri.execute(({ core }) =>
      core.invoke("stop_talos_probe", { sessionId: "talos-session-999" }),
    );
    assert.equal(stopped, false);
    const closed = await browser.tauri.execute(({ core }) =>
      core.invoke("close_talos_session", { sessionId: "talos-session-999" }),
    );
    assert.equal(closed, false);
    const repeated = await browser.tauri.execute(({ core }) =>
      core.invoke("stop_talos_probe", { sessionId: "talos-session-999" }),
    );
    assert.equal(repeated, false);
  });

  it("denies every Talos probe command from the webview without its capability", async () => {
    const result = await browser.tauri.execute(
      async ({ core }) => {
        const attempts: string[] = [];
        for (const invocation of [
          { command: "import_talosconfig", args: [] as unknown[] },
          { command: "start_talos_probe", args: [{ sessionId: "s", node: "10.79.0.2" }] },
          { command: "stop_talos_probe", args: [{ sessionId: "s" }] },
          { command: "close_talos_session", args: [{ sessionId: "s" }] },
        ]) {
          try {
            await core.invoke(invocation.command, ...invocation.args);
            attempts.push(`${invocation.command}:allowed`);
          } catch (error: unknown) {
            const reason = typeof error === "string" ? error : "";
            attempts.push(
              reason.includes("not allowed")
                ? `${invocation.command}:denied`
                : `${invocation.command}:${reason.slice(0, 40)}`,
            );
          }
        }
        return attempts.join(",");
      },
      withExecuteOptions({ windowLabel: "unauthorized" }),
    );
    assert.equal(
      result,
      "import_talosconfig:denied,start_talos_probe:denied,stop_talos_probe:denied,close_talos_session:denied",
    );
  });
});
