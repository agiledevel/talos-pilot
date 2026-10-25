import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";

import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/** Runs only bounded X11 test-host commands, never an application/renderer shell. */
function x11(args: readonly string[]): string {
  return execFileSync("xdotool", [...args], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 16_384,
  }).trim();
}

/** Observes actual WebView focus without setting or repairing it. */
async function expectFocus(role: string, label: string): Promise<void> {
  await browser.waitUntil(
    async () =>
      await browser.tauri.execute(
        (_tauri, wantedRole, wantedLabel) => {
          const active = document.activeElement;
          if (active?.getAttribute("role") !== wantedRole) return false;
          // A checked item has a visual ✓ excluded from its accessible name.
          // Ignore hidden content rather than misreading “✓ System”.
          const visibleLabel = active.cloneNode(true);
          if (!(visibleLabel instanceof HTMLElement)) return false;
          for (const hidden of visibleLabel.querySelectorAll('[aria-hidden="true"]'))
            hidden.remove();
          return visibleLabel.textContent?.trim() === wantedLabel;
        },
        role,
        label,
      ),
    { timeout: 5_000, timeoutMsg: `Expected keyboard focus on ${role} “${label}”.` },
  );
}

/**
 * Opt-in Linux/X11 acceptance check, outside the portable native suite's glob.
 * Requires a built native-test app and a dedicated Xvfb display whose value is
 * also supplied as TALOS_PILOT_NATIVE_X11_DISPLAY. xdotool uses XTEST on that
 * display (no --window SendEvent or script-dispatched keyboard events). The
 * embedded driver's own keyboard actions are script-generated in pinned 1.5.0
 * and cannot establish this trusted-input contract.
 */
describe("native X11 menu keyboard acceptance", () => {
  it("opens, traverses, selects and dismisses View with trusted keyboard input", async () => {
    assert.equal(process.platform, "linux", "This explicit checkpoint requires Linux/X11.");
    const display = process.env["DISPLAY"];
    assert.ok(display?.startsWith(":"), "Run on a private local Xvfb display.");
    assert.equal(
      process.env["TALOS_PILOT_NATIVE_X11_DISPLAY"],
      display,
      "Explicitly identify the private display before sending native input.",
    );
    await browser.tauri.switchWindow("main");
    const windows = x11(["search", "--onlyvisible", "--name", "^Talos Pilot$"]).split("\n");
    assert.equal(windows.length, 1, "The private display must have exactly one main window.");
    const main = windows[0];
    assert.ok(main !== undefined && /^\d+$/u.test(main));
    assert.equal(x11(["getwindowname", main]), "Talos Pilot");
    // Establish the OS input target once. Never set DOM/menu-item focus.
    x11(["windowfocus", "--sync", main]);
    await browser.tauri.execute(() => {
      const events: { key: string; trusted: boolean }[] = [];
      const controller = new AbortController();
      Reflect.set(globalThis, "__nativeMenuKeyboardEvents", events);
      Reflect.set(globalThis, "__nativeMenuKeyboardObserver", controller);
      document.addEventListener(
        "keydown",
        (event) => {
          if (events.length < 32) events.push({ key: event.key, trusted: event.isTrusted });
        },
        { capture: true, signal: controller.signal },
      );
    });
    try {
      x11(["key", "--clearmodifiers", "Tab"]);
      await expectFocus("menuitem", "View");
      x11(["key", "--clearmodifiers", "Return"]);
      await expectFocus("menuitemradio", "System");
      x11(["key", "--clearmodifiers", "Down"]);
      await expectFocus("menuitemradio", "Light");
      x11(["key", "--clearmodifiers", "Down"]);
      await expectFocus("menuitemradio", "Dark");
      x11(["key", "--clearmodifiers", "Return"]);
      await expectFocus("menuitem", "View");
      await browser.waitUntil(
        async () =>
          await browser.tauri.execute(() => document.documentElement.dataset.mode === "dark"),
      );
      assert.deepEqual(
        await browser.tauri.execute(({ core }) => core.invoke("get_appearance_settings")),
        { theme: "dark", density: "comfortable" },
      );
      assert.equal(
        await browser.tauri.execute(() => document.querySelector('[role="menu"]') === null),
        true,
      );

      x11(["key", "--clearmodifiers", "Down"]);
      await expectFocus("menuitemradio", "System");
      x11(["key", "--clearmodifiers", "Escape"]);
      await expectFocus("menuitem", "View");
      assert.deepEqual(
        await browser.tauri.execute(({ core }) => core.invoke("get_appearance_settings")),
        { theme: "dark", density: "comfortable" },
      );
      assert.equal(
        await browser.tauri.execute(() => document.querySelector('[role="menu"]') === null),
        true,
      );

      x11(["key", "--clearmodifiers", "Return"]);
      await expectFocus("menuitemradio", "System");
      x11(["key", "--clearmodifiers", "Return"]);
      await expectFocus("menuitem", "View");
      await browser.waitUntil(
        async () =>
          await browser.tauri.execute(() => document.documentElement.dataset.mode === undefined),
      );
      assert.deepEqual(
        await browser.tauri.execute(({ core }) => core.invoke("get_appearance_settings")),
        { theme: "system", density: "comfortable" },
      );
      const events = await browser.tauri.execute((): unknown =>
        Reflect.get(globalThis, "__nativeMenuKeyboardEvents"),
      );
      assert.deepEqual(
        events,
        [
          "Tab",
          "Enter",
          "ArrowDown",
          "ArrowDown",
          "Enter",
          "ArrowDown",
          "Escape",
          "Enter",
          "Enter",
        ].map((key) => ({ key, trusted: true })),
        "Every observed key must originate in native input, not dispatchEvent.",
      );
      console.info("Native menu: 9 trusted X11 keys; selection, Escape and focus return verified.");
    } finally {
      const evidence = await browser.tauri.execute(() => {
        const events: unknown = Reflect.get(globalThis, "__nativeMenuKeyboardEvents");
        return {
          events,
          activeRole: document.activeElement?.getAttribute("role"),
          activeText: document.activeElement?.textContent?.trim().slice(0, 80),
          menuPresent: document.querySelector('[role="menu"]') !== null,
          mode: document.documentElement.dataset.mode ?? "system",
        };
      });
      console.info("Native menu evidence:", JSON.stringify(evidence));
      await browser.tauri.execute(() => {
        const controller: unknown = Reflect.get(globalThis, "__nativeMenuKeyboardObserver");
        if (controller instanceof AbortController) controller.abort();
        Reflect.deleteProperty(globalThis, "__nativeMenuKeyboardObserver");
        Reflect.deleteProperty(globalThis, "__nativeMenuKeyboardEvents");
      });
    }
  });
});
