import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { test } from "./browser";

/*
 * Browser flows for the F7 specialized views. They exercise the real pinned
 * xterm.js and uPlot bundles in Chromium against the scripted IPC transport, so
 * they establish renderer behavior, lazy chunking, accessibility, and
 * offline/same-origin assets — not native Tauri or packaged-CSP behavior.
 */

test.describe.configure({ timeout: 120_000 });

/**
 * Scripts Tauri's IPC entry point before the renderer loads. Only appearance and
 * credential-storage commands are needed; the context is synthetic.
 */
async function scriptNativeResponses(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let appearance: unknown = { theme: "system", density: "comfortable" };
    const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
      switch (command) {
        case "get_appearance_settings":
          return appearance;
        case "set_appearance_settings":
          appearance = args?.["settings"] ?? appearance;
          return null;
        case "get_credential_storage_status":
          return { mode: "vault_unavailable" };
        default:
          throw new Error(`The browser test does not script ${command}.`);
      }
    };
    Object.assign(globalThis, { isTauri: true, __TAURI_INTERNALS__: { invoke } });
  });
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

function terminalRuntime(page: Page): Locator {
  return page.locator("[data-terminal-runtime]");
}

function terminalBuffers(page: Page): Locator {
  return page.locator("[data-terminal-buffers]");
}

function terminalEmulator(page: Page): Locator {
  return page.locator("[data-terminal-emulator]");
}

function parseCount(label: RegExp, text: string): number {
  const match = label.exec(text);
  if (match?.[1] === undefined) {
    throw new Error(`Could not read ${String(label)} from: ${text}`);
  }
  return Number(match[1].replaceAll(",", ""));
}

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the terminal loads lazily, replays synthetic text, and releases everything", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Open terminal", exact: true });
  await expect(toggle).toBeVisible();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
  expect(requests.some((url) => /xterm|TerminalSurface/u.test(url))).toBe(false);

  await toggle.click();
  await expect(page.getByRole("heading", { name: "Synthetic terminal output" })).toBeVisible({
    timeout: 30_000,
  });
  const rows = page.locator("[data-terminal-surface] .xterm-rows");
  await expect(rows).toContainText("synthetic-preview completed 24 steps", { timeout: 20_000 });
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed");
  await expect(terminalRuntime(page)).toContainText("Instances: 1");
  expect(requests.some((url) => /xterm/u.test(url))).toBe(true);
  expect(requests.some((url) => /YamlEditorSurface|monaco/u.test(url))).toBe(false);

  const buffers = await terminalBuffers(page).innerText();
  expect(buffers).toMatch(/Retained: [\d.]+ KiB/u);
  expect(buffers).toContain("Queue: 0");

  const emulatorRows = parseCount(
    /Emulator rows: ([\d,]+)/u,
    await terminalEmulator(page).innerText(),
  );
  expect(emulatorRows).toBeGreaterThan(0);
  expect(emulatorRows).toBeLessThanOrEqual(1_050);

  await expectNoAccessibilityViolations(page);

  // Selection and scrolling are keyboard-operable; the helper textarea owns focus.
  await page.locator("[data-terminal-surface] .xterm-helper-textarea").focus();
  await page.keyboard.press("Control+a");
  await page.keyboard.press("PageUp");
  await expect(page.locator("[data-terminal-surface] .xterm-helper-textarea")).toBeFocused();
  await page.keyboard.press("End");

  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic terminal output" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open terminal", exact: true })).toBeFocused();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
  await expect(terminalRuntime(page)).toContainText("Listeners: 0");
  await expect(terminalRuntime(page)).toContainText("Observers: 0");
  await expect(terminalBuffers(page)).toContainText("Retained: 0 B");
  await expect(terminalBuffers(page)).toContainText("Pending: 0 B");
  await expect(terminalBuffers(page)).toContainText("In flight: 0 B");
});

test("both ceilings evict the newest suffix inside the bounded emulator", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic terminal output" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Byte ceiling + 1" }).click();
  await expect(page.locator("[data-terminal-notice]")).toContainText("1.00 MiB", {
    timeout: 20_000,
  });
  await expect(page.locator("[data-terminal-notice]")).toContainText("evicted 1 B");
  await expect(terminalBuffers(page)).toContainText("Retained: 1.00 MiB");
  await expect(page.locator("[data-terminal-retained]")).toContainText("Admitted: 1 line");
  const byteRows = parseCount(/Emulator rows: ([\d,]+)/u, await terminalEmulator(page).innerText());
  expect(byteRows).toBeLessThanOrEqual(1_050);

  await page.getByRole("button", { name: "Line ceiling + 1" }).click();
  await expect(page.locator("[data-terminal-notice]")).toContainText("evicted 1 older line", {
    timeout: 20_000,
  });
  await expect(page.locator("[data-terminal-notice]")).toContainText("10,000 lines");
  await expect(terminalEmulator(page)).toContainText("line 010001", { timeout: 20_000 });
  await expect(page.locator("[data-terminal-retained]")).toContainText("Admitted: 10,000 lines");
  const lineRows = parseCount(/Emulator rows: ([\d,]+)/u, await terminalEmulator(page).innerText());
  expect(lineRows).toBeLessThanOrEqual(1_050);
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Burst 12,000 lines" }).click();
  await expect(page.locator("[data-terminal-notice]")).toContainText("evicted", {
    timeout: 20_000,
  });
  const burstRows = parseCount(
    /Emulator rows: ([\d,]+)/u,
    await terminalEmulator(page).innerText(),
  );
  expect(burstRows).toBeLessThanOrEqual(1_050);

  await page.getByRole("button", { name: "One oversized line" }).click();
  await expect(page.locator("[data-terminal-notice]")).toContainText("starts mid-line", {
    timeout: 20_000,
  });
  await expect(terminalEmulator(page)).toContainText("NEWEST-TAIL", { timeout: 20_000 });
  await expect(page.locator("[data-terminal-retained]")).toContainText("Admitted: 1 line");

  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
  await expect(terminalBuffers(page)).toContainText("Retained: 0 B");
});

test("a rejected control preserves accepted output, and empty clears then recovers", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "Try an escape sequence" }).click();
  const rejection = page.locator("[data-terminal-rejection]");
  await expect(rejection).toContainText("escape sequence");
  await expect(rejection).toContainText("Nothing was changed");
  // The accepted transcript is preserved: no reset and no new write happened.
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed");
  await expect(terminalBuffers(page)).toContainText("Queue: 0");

  await page.getByRole("button", { name: "Clear output" }).click();
  await expect(terminalEmulator(page)).toContainText("newest row: (empty)", { timeout: 20_000 });
  // The terminal never animates and never auto-produces output.
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(terminalRuntime(page)).toContainText("Frame: none");
  await expect(page.locator("[data-terminal-retained]")).toContainText("Admitted: 0 lines");
  await expect(page.locator("[data-terminal-rejection]")).toHaveCount(0);

  await page.getByRole("button", { name: "Next sample" }).click();
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed", {
    timeout: 20_000,
  });
  await expect(page.locator("[data-terminal-retained]")).toContainText("Admitted: 26 lines");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
});

test("theme, density, and resize changes keep the terminal data intact", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed", {
    timeout: 20_000,
  });

  const viewMenu = page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "View" });
  for (const [theme, density] of [
    ["Dark", "Compact"],
    ["Light", "Comfortable"],
    ["System", "Compact"],
  ] as const) {
    await viewMenu.click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    await viewMenu.click();
    await page.getByRole("menuitemradio", { name: density, exact: true }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(terminalEmulator(page)).toContainText("synthetic-preview completed");
    if (theme === "Dark") {
      await expectNoAccessibilityViolations(page);
    }
  }

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 700 },
    { width: 720, height: 480 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator("[data-terminal-host]")).toBeVisible();
    const rows = parseCount(/Emulator rows: ([\d,]+)/u, await terminalEmulator(page).innerText());
    expect(rows).toBeGreaterThan(0);
    expect(rows).toBeLessThanOrEqual(1_050);
    await expect(terminalEmulator(page)).toContainText("synthetic-preview completed");
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
  await expect(terminalRuntime(page)).toContainText("Frame: none");
  await expect(terminalRuntime(page)).toContainText("Deadline: none");

  await page.getByRole("button", { name: "Open terminal", exact: true }).click();
  await expect(terminalEmulator(page)).toContainText("newest row: synthetic-preview completed", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "Close terminal", exact: true }).click();
  await expect(terminalRuntime(page)).toContainText("Instances: 0");
});

async function paintedPixels(page: Page): Promise<number> {
  return page.evaluate(() => {
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
    return painted;
  });
}

function chartSummary(page: Page): Locator {
  return page.locator("[data-chart-summary]");
}

function chartRuntime(page: Page): Locator {
  return page.locator("[data-chart-runtime]");
}

function chartEmulatorState(page: Page): Locator {
  return page.locator("[data-chart-retained]");
}

/** The renderer's controllable animation-frame scheduler, installed per test. */
interface ChartFrameGate {
  /** Callbacks held instead of dispatched. */
  held(): number;
  /** Dispatches every held callback in one real animation frame. */
  release(): Promise<void>;
  /** Restores the native scheduler and dispatches anything still held. */
  restore(): Promise<void>;
}

declare global {
  interface Window {
    __chartFrameGate?: ChartFrameGate;
  }
}

/**
 * Holds the page's animation-frame callbacks until the test releases them.
 *
 * The chart attachment owns at most one frame, so holding dispatch makes both
 * coalescing orders deterministic: either an admitted replacement or a real
 * ResizeObserver delivery requests the frame first, and the other request is
 * dropped by the owner. ResizeObserver delivery belongs to the browser's
 * rendering update, so it still happens while these callbacks are held.
 */
async function holdAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(() => {
    const nativeRequest = window.requestAnimationFrame.bind(window);
    const nativeCancel = window.cancelAnimationFrame.bind(window);
    const held = new Map<number, FrameRequestCallback>();
    let nextId = 1;

    const release = (): Promise<void> =>
      new Promise<void>((resolve) => {
        nativeRequest(() => {
          const callbacks = [...held.values()];
          held.clear();
          const timestamp = performance.now();
          for (const callback of callbacks) {
            callback(timestamp);
          }
          resolve();
        });
      });

    window.requestAnimationFrame = (callback: FrameRequestCallback): number => {
      const id = nextId;
      nextId += 1;
      held.set(id, callback);
      return id;
    };
    window.cancelAnimationFrame = (id: number): void => {
      held.delete(id);
    };
    window.__chartFrameGate = {
      held: () => held.size,
      release,
      restore: async () => {
        window.requestAnimationFrame = nativeRequest;
        window.cancelAnimationFrame = nativeCancel;
        await release();
      },
    };
  });
}

async function heldFrameCallbacks(page: Page): Promise<number> {
  return page.evaluate(() => window.__chartFrameGate?.held() ?? -1);
}

async function releaseHeldFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__chartFrameGate?.release();
  });
}

async function restoreAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(async () => {
    await window.__chartFrameGate?.restore();
  });
}

/** Waits for two native frames so a dispatched callback has fully settled. */
async function settleAnimationFrames(page: Page): Promise<void> {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

/**
 * Sets the chart host's width and waits for the browser's ResizeObserver
 * delivery for the new box, rather than assuming when it happens.
 */
async function setChartHostWidth(page: Page, width: number): Promise<void> {
  await page.evaluate(
    (nextWidth) =>
      new Promise<void>((resolve, reject) => {
        const host = document.querySelector<HTMLElement>("[data-chart-host]");
        if (host === null) {
          reject(new Error("The chart host is missing."));
          return;
        }
        const reached = (): boolean =>
          Math.abs(host.getBoundingClientRect().width - nextWidth) <= 1;
        if (reached()) {
          resolve();
          return;
        }
        const probe = new ResizeObserver(() => {
          if (!reached()) return;
          probe.disconnect();
          resolve();
        });
        probe.observe(host);
        host.style.width = `${String(nextWidth)}px`;
      }),
    width,
  );
}

interface ChartGeometry {
  /** Border-box host width the attachment measures. */
  hostWidth: number;
  /** Rendered canvas width uPlot actually drew with. */
  canvasWidth: number;
}

async function chartGeometry(page: Page): Promise<ChartGeometry> {
  return page.evaluate(() => {
    const host = document.querySelector<HTMLElement>("[data-chart-host]");
    const canvas = host?.querySelector<HTMLCanvasElement>("canvas") ?? null;
    if (host === null || canvas === null) {
      throw new Error("The chart host or its canvas is missing.");
    }
    return {
      hostWidth: host.getBoundingClientRect().width,
      canvasWidth: canvas.getBoundingClientRect().width,
    };
  });
}

/**
 * Digests the painted chart canvases so identical geometry can be compared for
 * a data change, instead of treating any painted pixel as proof.
 */
async function chartPixelDigest(page: Page): Promise<string> {
  return page.evaluate(() => {
    const canvases = [...document.querySelectorAll<HTMLCanvasElement>("[data-chart-host] canvas")];
    let hash = 2_166_136_261;
    for (const canvas of canvases) {
      const context = canvas.getContext("2d");
      if (context === null || canvas.width === 0 || canvas.height === 0) {
        continue;
      }
      const { data } = context.getImageData(0, 0, canvas.width, canvas.height);
      for (let index = 0; index < data.length; index += 4) {
        hash = Math.imul(hash ^ (data[index] ?? 0), 16_777_619);
        hash = Math.imul(hash ^ (data[index + 1] ?? 0), 16_777_619);
        hash = Math.imul(hash ^ (data[index + 2] ?? 0), 16_777_619);
        hash = Math.imul(hash ^ (data[index + 3] ?? 0), 16_777_619);
      }
    }
    return (hash >>> 0).toString(16);
  });
}

/**
 * Clicks “Next sample” with real pointer input while frame dispatch is held.
 * Playwright's own click waits for animation frames, so the pointer is placed
 * at the button's measured box and no actionability frame check is involved.
 */
async function clickNextSample(page: Page): Promise<void> {
  const box = await page.getByRole("button", { name: "Next sample" }).boundingBox();
  if (box === null) {
    throw new Error("The Next sample button has no layout box.");
  }
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
}

test("the chart loads lazily, paints real values, and releases its instance", async ({ page }) => {
  await scriptNativeResponses(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  const toggle = page.getByRole("button", { name: "Open chart", exact: true });
  await expect(toggle).toBeVisible();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
  expect(requests.some((url) => /uplot|ChartSurface/u.test(url))).toBe(false);

  await toggle.click();
  await expect(page.getByRole("heading", { name: "Synthetic metric chart" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });
  expect(requests.some((url) => /uplot/u.test(url))).toBe(true);
  expect(requests.some((url) => /xterm|TerminalSurface|YamlEditorSurface|monaco/u.test(url))).toBe(
    false,
  );
  await expect(chartSummary(page).locator("tbody tr")).toHaveCount(2);
  await expect(chartSummary(page)).toContainText("Synthetic series 1");
  await expect(chartRuntime(page)).toContainText("Instances: 1");
  await expect
    .poll(async () => paintedPixels(page), { message: "the chart canvas never painted" })
    .toBeGreaterThan(1_000);

  await expectNoAccessibilityViolations(page);

  // The numeric summary is an ordinary disclosure and keyboard-operable.
  const summary = page.locator("[data-chart-summary-region] summary");
  await summary.focus();
  await expect(summary).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(chartSummary(page)).toBeHidden();
  await page.keyboard.press("Enter");
  await expect(chartSummary(page)).toBeVisible();

  await page.getByRole("button", { name: "Close chart", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Synthetic metric chart" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open chart", exact: true })).toBeFocused();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
  await expect(chartRuntime(page)).toContainText("Observers: 0");
  await expect(chartRuntime(page)).toContainText("Frame: none");
  await expect(page.locator("[data-chart-buffers]")).toContainText("Rendered: 0 B");
  await expect(page.locator("[data-chart-buffers]")).toContainText("Scheduled: 0 B");
  await expect(page.locator("[data-chart-buffers]")).toContainText("Queue: 0");
});

test("chart limits stay aligned and every malformed replacement preserves the chart", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open chart", exact: true }).click();
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });

  await page.getByRole("button", { name: "8 series × 2,000" }).click();
  await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples", {
    timeout: 20_000,
  });
  await expect(chartSummary(page).locator("tbody tr")).toHaveCount(8);
  await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);

  await page.getByRole("button", { name: "Sample limit + 1" }).click();
  await expect(page.locator("[data-chart-notice]")).toContainText("evicted 1 older sample", {
    timeout: 20_000,
  });
  await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples");

  for (const [button, expected] of [
    ["Add ninth series", "at most 8 value series"],
    ["Break alignment", "aligned time and value arrays"],
    ["Non-finite value", "requires finite values"],
    ["Oversized label", "80 characters"],
  ] as const) {
    await page.getByRole("button", { name: button }).click();
    const rejection = page.locator("[data-chart-rejection]");
    await expect(rejection).toContainText(expected, { timeout: 20_000 });
    await expect(rejection).toContainText("previous chart is unchanged");
    await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples");
    await expect(chartSummary(page).locator("tbody tr")).toHaveCount(8);
    await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
  }

  await page.getByRole("button", { name: "Next sample" }).click();
  await expect(page.locator("[data-chart-rejection]")).toHaveCount(0);
  // No update animation and no auto-running producer: reduced motion is the
  // page policy, and the settled chart has no active animation and no pending
  // owned frame.
  expect(await page.evaluate(() => document.getAnimations().length)).toBe(0);
  await expect(chartRuntime(page)).toContainText("Frame: none");
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });
  await expect(chartSummary(page).locator("tbody tr")).toHaveCount(2);

  await page.getByRole("button", { name: "Clear chart" }).click();
  await expect(page.locator("[data-chart-empty]")).toBeVisible({ timeout: 20_000 });
  await expect(chartEmulatorState(page)).toContainText("0 series × 0 aligned samples");
  await expect(chartSummary(page)).toContainText("No admitted series");
  expect(await paintedPixels(page)).toBe(0);
  await expect(chartRuntime(page)).toContainText("Instances: 0");
  await expect(page.locator("[data-chart-buffers]")).toContainText("Rendered: 0 B");

  await page.getByRole("button", { name: "Next sample" }).click();
  await expect(page.locator("[data-chart-empty]")).toHaveCount(0);
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });
  await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);

  await page.getByRole("button", { name: "Close chart", exact: true }).click();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
});

test("chart theme, density, resize, and reopen preserve the accepted window", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open chart", exact: true }).click();
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });
  await page.getByRole("button", { name: "8 series × 2,000" }).click();
  await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples", {
    timeout: 20_000,
  });

  const viewMenu = page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "View" });
  for (const [theme, density] of [
    ["Dark", "Compact"],
    ["Light", "Comfortable"],
    ["System", "Compact"],
  ] as const) {
    await viewMenu.click();
    await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    await viewMenu.click();
    await page.getByRole("menuitemradio", { name: density, exact: true }).click();
    await expect(page.getByRole("menu")).toBeHidden();
    await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples");
    await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
    if (theme === "Dark") {
      await expectNoAccessibilityViolations(page);
    }
  }

  // A replacement immediately after a resize must still reach the canvas: the
  // resize and the admitted snapshot share one coalesced frame.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Sample limit + 1" }).click();
  await expect(page.locator("[data-chart-notice]")).toContainText("evicted 1 older sample", {
    timeout: 20_000,
  });
  await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples");
  await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
  await expect(page.locator("[data-chart-buffers]")).toContainText("Queue: 0");

  for (const size of [
    { width: 1280, height: 800 },
    { width: 1024, height: 700 },
    { width: 720, height: 480 },
  ]) {
    await page.setViewportSize(size);
    await expect(page.locator("[data-chart-host]")).toBeVisible();
    await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
    await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples");
  }

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.getByRole("button", { name: "Close chart", exact: true }).click();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
  await expect(chartRuntime(page)).toContainText("Observers: 0");
  await expect(chartRuntime(page)).toContainText("Frame: none");
  await expect(page.locator("[data-chart-buffers]")).toContainText("Rendered: 0 B");

  await page.getByRole("button", { name: "Open chart", exact: true }).click();
  await expect(chartEmulatorState(page)).toContainText("8 series × 2,000 aligned samples", {
    timeout: 20_000,
  });
  await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
  await page.getByRole("button", { name: "Close chart", exact: true }).click();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
});

test("one coalesced chart frame applies a replacement and a resize in either order", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open chart", exact: true }).click();
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples", {
    timeout: 20_000,
  });
  await expect.poll(async () => paintedPixels(page)).toBeGreaterThan(1_000);
  // Real pointer input needs the button inside the viewport; the content area
  // scrolls, and scrolling changes neither the host width nor the canvas.
  await page.getByRole("button", { name: "Next sample" }).scrollIntoViewIfNeeded();

  const settled = await chartGeometry(page);
  expect(Math.abs(settled.canvasWidth - (settled.hostWidth - 8))).toBeLessThanOrEqual(1);
  const settledPixels = await chartPixelDigest(page);
  const buffers = page.locator("[data-chart-buffers]");

  // Ordering 1: the admitted replacement owns the frame, so the ResizeObserver
  // delivery that follows cannot schedule its own callback.
  await holdAnimationFrames(page);
  try {
    await clickNextSample(page);
    await expect.poll(async () => heldFrameCallbacks(page)).toBe(1);
    await expect(buffers).toContainText("Queue: 1");
    await setChartHostWidth(page, 300);
    expect(await heldFrameCallbacks(page)).toBe(1);
    await releaseHeldFrames(page);
  } finally {
    await restoreAnimationFrames(page);
  }
  await settleAnimationFrames(page);
  const dataFirst = await chartGeometry(page);
  expect(dataFirst.hostWidth).toBeCloseTo(300, 0);
  expect(dataFirst.canvasWidth).toBeCloseTo(292, 0);
  await expect(buffers).toContainText("Queue: 0");
  await expect(buffers).toContainText("Scheduled: 0 B");

  // Back at the original geometry, the replacement's shifted timestamps must
  // change the painted pixels; an unrendered window would leave them identical.
  await setChartHostWidth(page, settled.hostWidth);
  await settleAnimationFrames(page);
  const restored = await chartGeometry(page);
  expect(Math.abs(restored.canvasWidth - settled.canvasWidth)).toBeLessThanOrEqual(1);
  expect(await chartPixelDigest(page)).not.toBe(settledPixels);

  // Ordering 2: the ResizeObserver delivery owns the frame and the replacement
  // admitted after it is dropped as a frame request but still drained.
  await holdAnimationFrames(page);
  await setChartHostWidth(page, 420);
  await expect.poll(async () => heldFrameCallbacks(page)).toBe(1);
  await clickNextSample(page);
  await expect(buffers).toContainText("Queue: 1");
  expect(await heldFrameCallbacks(page)).toBe(1);
  await releaseHeldFrames(page);
  await restoreAnimationFrames(page);
  await settleAnimationFrames(page);
  const resizeFirst = await chartGeometry(page);
  expect(resizeFirst.hostWidth).toBeCloseTo(420, 0);
  expect(resizeFirst.canvasWidth).toBeCloseTo(412, 0);
  await expect(buffers).toContainText("Queue: 0");
  await expect(buffers).toContainText("Scheduled: 0 B");
  await expect(chartEmulatorState(page)).toContainText("2 series × 300 aligned samples");

  await page.getByRole("button", { name: "Close chart", exact: true }).click();
  await expect(chartRuntime(page)).toContainText("Instances: 0");
  await expect(chartRuntime(page)).toContainText("Frame: none");
  await expect(buffers).toContainText("Rendered: 0 B");
});
