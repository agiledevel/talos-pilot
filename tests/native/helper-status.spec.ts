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
    assert.deepEqual(status.capabilities, ["status"]);
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
