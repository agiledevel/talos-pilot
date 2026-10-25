import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { join } from "node:path";

import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/*
 * Opt-in Linux/X11 acceptance check for the F7 specialized views, outside the
 * portable native suite's glob.
 *
 * Method: every key is delivered by `xdotool key` on an owned private Xvfb
 * display, which uses the XTEST extension (never `--window SendEvent` and never
 * a script-dispatched DOM KeyboardEvent). Focus is observed, never assigned
 * from script. Rendered visual evidence is captured from the exact main window
 * with ImageMagick `import -window`, then hashed. The embedded driver's own
 * keyboard actions are script-generated in the pinned 1.5.0 service and cannot
 * establish this contract.
 */

interface FocusDescriptor {
  readonly tag: string;
  readonly role: string;
  readonly label: string;
  readonly className: string;
}

interface TerminalObservation {
  readonly surface: boolean;
  readonly runtime: string;
  readonly emulator: string;
  readonly notice: string;
  readonly viewportRow: number;
  readonly baseRow: number;
  readonly failure: string;
  readonly rejection: string;
}

interface ChartObservation {
  readonly surface: boolean;
  readonly runtime: string;
  readonly painted: number;
  readonly retained: string;
  readonly summaryVisible: boolean;
  readonly failure: string;
}

/** Runs one bounded X11 test-host command; never the application or renderer. */
function x11(args: readonly string[]): string {
  return execFileSync("xdotool", [...args], {
    encoding: "utf8",
    timeout: 5_000,
    maxBuffer: 16_384,
  }).trim();
}

/** Captures the exact application window and returns its size and digest. */
function captureWindow(windowId: string, path: string): string {
  execFileSync("import", ["-window", windowId, `png:${path}`], {
    timeout: 15_000,
    stdio: "ignore",
  });
  const size = execFileSync("identify", ["-format", "%wx%h", path], {
    encoding: "utf8",
    timeout: 10_000,
  }).trim();
  const digest = createHash("sha256").update(readFileSync(path)).digest("hex");
  return `${size} sha256=${digest}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** Collapses rendered whitespace so substring assertions do not depend on wrapping. */
function normalized(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

function asNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : -1;
}

function asRow(value: unknown): number {
  const parsed = typeof value === "string" ? Number(value) : Number.NaN;
  return Number.isInteger(parsed) ? parsed : -1;
}

async function focusDescriptor(): Promise<FocusDescriptor> {
  const value: unknown = await browser.tauri.execute(() => {
    const active = document.activeElement;
    return {
      tag: active?.tagName ?? "",
      role: active?.getAttribute("role") ?? "",
      label: (active?.textContent ?? "").trim().slice(0, 200),
      className: typeof active?.className === "string" ? active.className.slice(0, 120) : "",
    };
  });
  assert.ok(isRecord(value), "The WebView did not report its active element.");
  return {
    tag: asString(value["tag"]),
    role: asString(value["role"]),
    label: asString(value["label"]),
    className: asString(value["className"]),
  };
}

async function terminalObservation(): Promise<TerminalObservation> {
  const value: unknown = await browser.tauri.execute(() => {
    const viewport = document.querySelector<HTMLElement>("[data-terminal-viewport]");
    return {
      surface: document.querySelector("[data-terminal-surface]") !== null,
      runtime:
        document.querySelector("[data-terminal-runtime]")?.textContent?.trim().slice(0, 400) ?? "",
      emulator:
        document.querySelector("[data-terminal-emulator]")?.textContent?.trim().slice(0, 400) ?? "",
      notice:
        document.querySelector("[data-terminal-notice]")?.textContent?.trim().slice(0, 400) ?? "",
      viewportRow: viewport?.dataset["viewportRow"] ?? "",
      baseRow: viewport?.dataset["baseRow"] ?? "",
      failure:
        document.querySelector("[data-terminal-failure]")?.textContent?.trim().slice(0, 400) ?? "",
      rejection:
        document.querySelector("[data-terminal-rejection]")?.textContent?.trim().slice(0, 400) ??
        "",
    };
  });
  assert.ok(isRecord(value), "The WebView did not report the terminal state.");
  return {
    surface: value["surface"] === true,
    runtime: normalized(asString(value["runtime"])),
    emulator: normalized(asString(value["emulator"])),
    notice: normalized(asString(value["notice"])),
    viewportRow: asRow(value["viewportRow"]),
    baseRow: asRow(value["baseRow"]),
    failure: normalized(asString(value["failure"])),
    rejection: normalized(asString(value["rejection"])),
  };
}

async function chartObservation(): Promise<ChartObservation> {
  const value: unknown = await browser.tauri.execute(() => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("[data-chart-host] canvas")];
    let painted = 0;
    for (const canvas of canvases) {
      const context = canvas.getContext("2d");
      if (context === null || canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 3; index < data.length; index += 4) {
        if (data[index] !== 0) {
          painted += 1;
        }
      }
    }
    const summary = document.querySelector<HTMLDetailsElement>("[data-chart-summary-region]");
    return {
      surface: document.querySelector("[data-chart-surface]") !== null,
      runtime:
        document.querySelector("[data-chart-runtime]")?.textContent?.trim().slice(0, 400) ?? "",
      painted,
      retained:
        document.querySelector("[data-chart-retained]")?.textContent?.trim().slice(0, 400) ?? "",
      summaryVisible: summary?.open === true,
      failure:
        document.querySelector("[data-chart-failure]")?.textContent?.trim().slice(0, 400) ?? "",
    };
  });
  assert.ok(isRecord(value), "The WebView did not report the chart state.");
  return {
    surface: value["surface"] === true,
    runtime: normalized(asString(value["runtime"])),
    painted: asNumber(value["painted"]),
    retained: normalized(asString(value["retained"])),
    summaryVisible: value["summaryVisible"] === true,
    failure: normalized(asString(value["failure"])),
  };
}

async function waitForFocus(label: string, timeoutMsg: string, timeout = 5_000): Promise<void> {
  await browser.waitUntil(
    async () => {
      const focused = await focusDescriptor();
      return focused.label === label;
    },
    { timeout, timeoutMsg },
  );
}

async function waitForTerminal(
  predicate: (observation: TerminalObservation) => boolean,
  timeoutMsg: string,
): Promise<TerminalObservation> {
  let latest = await terminalObservation();
  await browser.waitUntil(
    async () => {
      latest = await terminalObservation();
      return predicate(latest);
    },
    { timeout: 20_000, timeoutMsg },
  );
  return latest;
}

async function waitForChart(
  predicate: (observation: ChartObservation) => boolean,
  timeoutMsg: string,
): Promise<ChartObservation> {
  let latest = await chartObservation();
  await browser.waitUntil(
    async () => {
      latest = await chartObservation();
      return predicate(latest);
    },
    {
      timeout: 20_000,
      timeoutMsg: `${timeoutMsg} Last observation: ${JSON.stringify(latest)}`,
    },
  );
  return latest;
}

/** Tabs with trusted X11 input until the requested accessible label has focus. */
async function tabToLabel(label: string, backward: boolean, maxTabs = 40): Promise<number> {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    x11(["key", "--clearmodifiers", backward ? "shift+Tab" : "Tab"]);
    const focused = await focusDescriptor();
    if (focused.label === label) {
      return attempt + 1;
    }
  }
  throw new Error(`Trusted Tab input never focused “${label}” within ${String(maxTabs)} presses.`);
}

/** Tabs with trusted X11 input until the terminal's own textarea has focus. */
async function tabToTerminal(maxTabs = 40): Promise<number> {
  for (let attempt = 0; attempt < maxTabs; attempt += 1) {
    x11(["key", "--clearmodifiers", "Tab"]);
    const focused = await focusDescriptor();
    if (focused.className.includes("xterm-helper-textarea")) {
      return attempt + 1;
    }
  }
  throw new Error(
    `Trusted Tab input never focused the terminal within ${String(maxTabs)} presses.`,
  );
}

describe("native X11 specialized-view keyboard and rendered acceptance", () => {
  it("operates both surfaces with trusted input and captures rendered evidence", async () => {
    assert.equal(process.platform, "linux", "This explicit checkpoint requires Linux/X11.");
    const display = process.env["DISPLAY"];
    assert.ok(display?.startsWith(":"), "Run on a private local Xvfb display.");
    assert.equal(
      process.env["TALOS_PILOT_NATIVE_X11_DISPLAY"],
      display,
      "Explicitly identify the private display before sending native input.",
    );
    const shotsDirectory = process.env["TALOS_PILOT_NATIVE_X11_SHOTS"];
    assert.ok(
      shotsDirectory !== undefined && shotsDirectory.startsWith("/tmp/"),
      "Name an owned /tmp screenshot directory.",
    );
    mkdirSync(shotsDirectory, { recursive: true });

    await browser.tauri.switchWindow("main");
    const windows = x11(["search", "--onlyvisible", "--name", "^Talos Pilot$"]).split("\n");
    assert.equal(windows.length, 1, "The private display must have exactly one main window.");
    const main = windows[0];
    assert.ok(main !== undefined && /^\d+$/u.test(main));
    assert.equal(x11(["getwindowname", main]), "Talos Pilot");
    // Establish the OS input target once; never set DOM focus from script.
    x11(["windowfocus", "--sync", main]);

    await browser.tauri.execute(() => {
      const events: { key: string; trusted: boolean }[] = [];
      const controller = new AbortController();
      Reflect.set(globalThis, "__talosF7KeyEvents", events);
      Reflect.set(globalThis, "__talosF7KeyObserver", controller);
      document.addEventListener(
        "keydown",
        (event) => {
          if (events.length < 64) {
            events.push({ key: event.key, trusted: event.isTrusted });
          }
        },
        { capture: true, signal: controller.signal },
      );
    });

    try {
      // Terminal: trusted Tab to the opener, open it, and observe focus inside.
      const tabsToTerminal = await tabToLabel("Open terminal", false);
      x11(["key", "--clearmodifiers", "Return"]);
      const rendered = await waitForTerminal(
        (observation) =>
          observation.surface &&
          observation.emulator.includes("synthetic-preview completed") &&
          observation.failure === "",
        "The terminal never rendered its synthetic sample under trusted input.",
      );
      const focusedInTerminal = await focusDescriptor();
      assert.match(focusedInTerminal.className, /xterm-helper-textarea/u);

      // A larger scrollback through a trusted activation of the burst action.
      const tabsToBurst = await tabToLabel("Burst 12,000 lines", true);
      x11(["key", "--clearmodifiers", "Return"]);
      await waitForTerminal(
        (observation) => observation.notice.includes("evicted"),
        "The burst snapshot did not render after trusted input.",
      );

      // Return to the terminal and scroll with trusted PageUp/End input. The
      // viewport's scrollTop is 0 at the oldest scrollback row and grows toward
      // the newest output, where xterm keeps the view after writing.
      await tabToTerminal();
      const beforeScroll = await terminalObservation();
      assert.ok(beforeScroll.baseRow > 0, "The burst did not fill the terminal buffer.");
      assert.equal(
        beforeScroll.viewportRow,
        beforeScroll.baseRow,
        "The emulator was not showing the bottom of the burst.",
      );
      x11(["key", "--clearmodifiers", "Page_Up"]);
      await browser.waitUntil(
        async () => (await terminalObservation()).viewportRow < beforeScroll.viewportRow,
        { timeout: 5_000, timeoutMsg: "Trusted PageUp did not scroll the terminal." },
      );
      x11(["key", "--clearmodifiers", "End"]);
      await browser.waitUntil(
        async () => (await terminalObservation()).viewportRow === beforeScroll.viewportRow,
        { timeout: 5_000, timeoutMsg: "Trusted End did not return the terminal to the bottom." },
      );

      const terminalShot = join(shotsDirectory, "terminal.png");
      const terminalShotEvidence = captureWindow(main, terminalShot);
      assert.match(terminalShotEvidence, /^\d+x\d+ sha256=[0-9a-f]{64}$/u);
      assert.match(rendered.emulator, /synthetic-preview completed|line 012000/u);

      // Close from the panel toggle with trusted input and observe focus return.
      const tabsToCloseTerminal = await tabToLabel("Close terminal", true);
      x11(["key", "--clearmodifiers", "Return"]);
      await waitForFocus("Open terminal", "Focus did not return to the terminal opener.");
      await browser.waitUntil(
        async () => {
          const observation = await terminalObservation();
          return !observation.surface && observation.runtime.includes("Instances: 0");
        },
        { timeout: 10_000, timeoutMsg: "The terminal surface did not close." },
      );

      // Chart: trusted open, real canvas painting, and keyboard-operable summary.
      const tabsToChart = await tabToLabel("Open chart", false);
      x11(["key", "--clearmodifiers", "Return"]);
      const chart = await waitForChart(
        (observation) =>
          observation.surface &&
          observation.painted > 1_000 &&
          observation.retained.includes("2 series × 300 aligned samples") &&
          observation.failure === "",
        "The chart never painted its synthetic series under trusted input.",
      );
      assert.equal(chart.summaryVisible, true);

      const tabsToSummary = await tabToLabel(
        "Numeric equivalent of the synthetic chart (the canvas is decorative)",
        false,
      );
      x11(["key", "--clearmodifiers", "Return"]);
      await browser.waitUntil(async () => !(await chartObservation()).summaryVisible, {
        timeout: 5_000,
        timeoutMsg: "Trusted Return did not collapse the numeric summary.",
      });
      x11(["key", "--clearmodifiers", "Return"]);
      await browser.waitUntil(async () => (await chartObservation()).summaryVisible, {
        timeout: 5_000,
        timeoutMsg: "Trusted Return did not expand the numeric summary.",
      });

      const chartShot = join(shotsDirectory, "chart.png");
      const chartShotEvidence = captureWindow(main, chartShot);
      assert.match(chartShotEvidence, /^\d+x\d+ sha256=[0-9a-f]{64}$/u);

      const tabsToCloseChart = await tabToLabel("Close chart", true);
      x11(["key", "--clearmodifiers", "Return"]);
      await waitForFocus("Open chart", "Focus did not return to the chart opener.");
      await browser.waitUntil(
        async () => {
          const observation = await chartObservation();
          return !observation.surface && observation.runtime.includes("Instances: 0");
        },
        { timeout: 10_000, timeoutMsg: "The chart surface did not close." },
      );

      const events = await browser.tauri.execute((): unknown => {
        const recorded: unknown = Reflect.get(globalThis, "__talosF7KeyEvents");
        return recorded;
      });
      assert.ok(Array.isArray(events));
      const trusted = events.every(
        (event) => isRecord(event) && event["trusted"] === true && typeof event["key"] === "string",
      );
      assert.equal(trusted, true, "Every observed key must originate in native X11 input.");
      assert.ok(events.length >= tabsToTerminal + tabsToBurst + tabsToChart + tabsToSummary + 6);
      console.info(
        "Native F7: trusted X11 keys verified; terminal and chart rendered; screenshots",
        JSON.stringify({
          terminal: { path: terminalShot, evidence: terminalShotEvidence, tabsToCloseTerminal },
          chart: { path: chartShot, evidence: chartShotEvidence, tabsToCloseChart },
          tabs: { tabsToTerminal, tabsToBurst, tabsToChart, tabsToSummary },
          trustedKeys: events.length,
        }),
      );
    } finally {
      const evidence = await browser.tauri.execute(() => {
        const events: unknown = Reflect.get(globalThis, "__talosF7KeyEvents");
        return {
          events,
          activeTag: document.activeElement?.tagName ?? "",
          activeLabel: (document.activeElement?.textContent ?? "").trim().slice(0, 80),
          terminalSurface: document.querySelector("[data-terminal-surface]") !== null,
          chartSurface: document.querySelector("[data-chart-surface]") !== null,
        };
      });
      console.info("Native F7 evidence:", JSON.stringify(evidence));
      await browser.tauri.execute(() => {
        const controller: unknown = Reflect.get(globalThis, "__talosF7KeyObserver");
        if (controller instanceof AbortController) controller.abort();
        Reflect.deleteProperty(globalThis, "__talosF7KeyObserver");
        Reflect.deleteProperty(globalThis, "__talosF7KeyEvents");
      });
    }
  });
});
