import assert from "node:assert/strict";

import { browser } from "@wdio/globals";

/*
 * Shared helpers for the F7 native specs.
 *
 * These run against the release-mode test executable built by `pnpm test:native`
 * with the embedded production assets and packaged CSP. Every `browser.tauri.execute`
 * callback is serialised into the WebView and is self-contained: it may not call
 * a helper defined in this module.
 */

/** Bounded observation of both F7 surfaces and the app's resources. */
export interface AppSnapshot {
  readonly terminalSurface: boolean;
  readonly chartSurface: boolean;
  readonly terminalRuntime: string;
  readonly terminalBuffers: string;
  readonly terminalEmulator: string;
  readonly terminalRetained: string;
  readonly terminalNotice: string;
  readonly terminalRejection: string;
  readonly terminalFailure: string;
  readonly chartRuntime: string;
  readonly chartBuffers: string;
  readonly chartRetained: string;
  readonly chartNotice: string;
  readonly chartRejection: string;
  readonly chartEmpty: boolean;
  readonly chartSummaryRows: number;
  readonly chartPainted: number;
  readonly terminalChunk: string;
  readonly chartChunk: string;
  readonly resources: readonly string[];
  readonly stylesheets: readonly string[];
  readonly scripts: readonly string[];
  readonly origin: string;
  readonly activeRole: string;
  readonly activeLabel: string;
}

/** Resource counters parsed from a surface's rendered diagnostics. */
export interface Counters {
  readonly instances: number;
  readonly listeners: number;
  readonly observers: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

/**
 * Collapses rendered whitespace so substring assertions do not depend on how a
 * template happened to wrap its text in the WebView.
 */
function normalized(value: string): string {
  return value.replace(/\s+/gu, " ").trim();
}

export function toSnapshot(value: unknown): AppSnapshot {
  assert.ok(isRecord(value), "The WebView snapshot was not an object.");
  return {
    terminalSurface: value["terminalSurface"] === true,
    chartSurface: value["chartSurface"] === true,
    terminalRuntime: normalized(asString(value["terminalRuntime"])),
    terminalBuffers: normalized(asString(value["terminalBuffers"])),
    terminalEmulator: normalized(asString(value["terminalEmulator"])),
    terminalRetained: normalized(asString(value["terminalRetained"])),
    terminalNotice: normalized(asString(value["terminalNotice"])),
    terminalRejection: normalized(asString(value["terminalRejection"])),
    terminalFailure: normalized(asString(value["terminalFailure"])),
    chartRuntime: normalized(asString(value["chartRuntime"])),
    chartBuffers: normalized(asString(value["chartBuffers"])),
    chartRetained: normalized(asString(value["chartRetained"])),
    chartNotice: normalized(asString(value["chartNotice"])),
    chartRejection: normalized(asString(value["chartRejection"])),
    chartEmpty: value["chartEmpty"] === true,
    chartSummaryRows:
      typeof value["chartSummaryRows"] === "number" ? value["chartSummaryRows"] : -1,
    chartPainted: typeof value["chartPainted"] === "number" ? value["chartPainted"] : -1,
    terminalChunk: normalized(asString(value["terminalChunk"])),
    chartChunk: normalized(asString(value["chartChunk"])),
    resources: asStringArray(value["resources"]),
    stylesheets: asStringArray(value["stylesheets"]),
    scripts: asStringArray(value["scripts"]),
    origin: asString(value["origin"]),
    activeRole: asString(value["activeRole"]),
    activeLabel: normalized(asString(value["activeLabel"])),
  };
}

/** Reads one bounded snapshot of the current renderer state. */
export async function readSnapshot(): Promise<AppSnapshot> {
  const value: unknown = await browser.tauri.execute(() => {
    // The WebdriverIO Tauri service serialises this callback into the WebView,
    // so it must stay self-contained and avoid named nested helper functions.
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
    const active = document.activeElement;
    return {
      terminalSurface: document.querySelector("[data-terminal-surface]") !== null,
      chartSurface: document.querySelector("[data-chart-surface]") !== null,
      terminalRuntime:
        document.querySelector("[data-terminal-runtime]")?.textContent?.trim().slice(0, 400) ?? "",
      terminalBuffers:
        document.querySelector("[data-terminal-buffers]")?.textContent?.trim().slice(0, 400) ?? "",
      terminalEmulator:
        document.querySelector("[data-terminal-emulator]")?.textContent?.trim().slice(0, 400) ?? "",
      terminalRetained:
        document.querySelector("[data-terminal-retained]")?.textContent?.trim().slice(0, 400) ?? "",
      terminalNotice:
        document.querySelector("[data-terminal-notice]")?.textContent?.trim().slice(0, 400) ?? "",
      terminalRejection:
        document.querySelector("[data-terminal-rejection]")?.textContent?.trim().slice(0, 400) ??
        "",
      terminalFailure:
        document.querySelector("[data-terminal-failure]")?.textContent?.trim().slice(0, 400) ?? "",
      chartRuntime:
        document.querySelector("[data-chart-runtime]")?.textContent?.trim().slice(0, 400) ?? "",
      chartBuffers:
        document.querySelector("[data-chart-buffers]")?.textContent?.trim().slice(0, 400) ?? "",
      chartRetained:
        document.querySelector("[data-chart-retained]")?.textContent?.trim().slice(0, 400) ?? "",
      chartNotice:
        document.querySelector("[data-chart-notice]")?.textContent?.trim().slice(0, 400) ?? "",
      chartRejection:
        document.querySelector("[data-chart-rejection]")?.textContent?.trim().slice(0, 400) ?? "",
      chartEmpty: document.querySelector("[data-chart-empty]") !== null,
      chartSummaryRows: document.querySelectorAll("[data-chart-summary] tbody tr").length,
      chartPainted: painted,
      terminalChunk:
        document.querySelector("[data-terminal-chunk]")?.textContent?.trim().slice(0, 400) ?? "",
      chartChunk:
        document.querySelector("[data-chart-chunk]")?.textContent?.trim().slice(0, 400) ?? "",
      resources: performance.getEntriesByType("resource").map((entry) => entry.name),
      stylesheets: [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')].map(
        (link) => link.href,
      ),
      scripts: [...document.querySelectorAll<HTMLScriptElement>("script[src]")].map(
        (script) => script.src,
      ),
      origin: location.origin,
      activeRole: active?.getAttribute("role") ?? "",
      activeLabel: (active?.textContent ?? "").trim().slice(0, 120),
    };
  });
  return toSnapshot(value);
}

/** Clicks the first visible button with the exact label. */
export async function clickButton(label: string): Promise<void> {
  const clicked: unknown = await browser.tauri.execute((_tauri, wanted) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === wanted && candidate.offsetParent !== null,
    );
    if (button === undefined) {
      return false;
    }
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `The "${label}" button was not found.`);
}

/**
 * Reloads the packaged document, then navigates to Home and closes any surface.
 *
 * The intentional reload gives each native case a fresh JavaScript context and
 * DOM, so lazy-chunk, stylesheet and ownership observations cannot inherit a
 * previous case's loaded assets. It discards only this synthetic test state.
 * `location.reload()` is used because the WebDriver navigation command does not
 * reload the custom `tauri://` document in this service; a transient execute
 * error during the navigation is tolerated by the bounded wait below.
 */
export async function openHome(): Promise<void> {
  await browser.tauri.execute(() => {
    location.reload();
  });
  await browser.waitUntil(
    async () => {
      try {
        const snapshot = await readSnapshot();
        return snapshot.terminalRuntime.length > 0 && snapshot.chartRuntime.length > 0;
      } catch {
        // The execution context can be replaced while the document reloads.
        return false;
      }
    },
    { timeout: 20_000, timeoutMsg: "The reloaded application did not render Home." },
  );
  await browser.tauri.execute(() => {
    const home = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
      (button) => button.textContent?.trim() === "Home",
    );
    home?.click();
  });
  const loaded = await waitFor(
    (snapshot) => snapshot.terminalRuntime.length > 0 && snapshot.chartRuntime.length > 0,
    "The application did not render Home.",
  );
  if (loaded.terminalSurface) {
    await clickButton("Close terminal surface");
    await waitFor(
      (snapshot) => !snapshot.terminalSurface && counts(snapshot.terminalRuntime).instances === 0,
      "The previous terminal surface did not close.",
    );
  }
  if (loaded.chartSurface) {
    await clickButton("Close chart surface");
    await waitFor(
      (snapshot) => !snapshot.chartSurface && counts(snapshot.chartRuntime).instances === 0,
      "The previous chart surface did not close.",
    );
  }
}

/** Waits for an observable predicate with a bounded deadline. */
export async function waitFor(
  predicate: (snapshot: AppSnapshot) => boolean,
  timeoutMsg: string,
  timeout = 30_000,
): Promise<AppSnapshot> {
  let latest = await readSnapshot();
  await browser.waitUntil(
    async () => {
      latest = await readSnapshot();
      return predicate(latest);
    },
    { timeout, timeoutMsg },
  );
  return latest;
}

/** Parses the instance/listener/observer counters of one surface. */
export function counts(runtime: string): Counters {
  const match = /Instances:\s*(\d+)\s*·\s*Listeners:\s*(\d+)\s*·\s*Observers:\s*(\d+)/u.exec(
    runtime,
  );
  assert.ok(match !== null, `Unexpected specialized-view counter text: ${runtime}`);
  return {
    instances: Number(match[1] ?? "-1"),
    listeners: Number(match[2] ?? "-1"),
    observers: Number(match[3] ?? "-1"),
  };
}

/** Asserts that a closed surface released its instance, listeners and observers. */
export function expectBaseline(runtime: string): void {
  assert.deepEqual(counts(runtime), { instances: 0, listeners: 0, observers: 0 });
}

/**
 * Asserts that every observable asset came from the application origin.
 *
 * WebKitGTK exposes no Resource Timing entries, so the injected stylesheet and
 * script elements plus the recorded lazy-chunk URLs are the native asset
 * evidence. All are checked; none may be a blob or another origin.
 */
export function expectLocalResources(snapshot: AppSnapshot): void {
  // The packaged app is served from a custom `tauri://` scheme, whose URL
  // `.origin` is the string "null"; compare protocol and host explicitly.
  const base = new URL(snapshot.origin);
  for (const resource of [...snapshot.resources, ...snapshot.stylesheets, ...snapshot.scripts]) {
    assert.equal(resource.startsWith("blob:"), false, `Unexpected blob asset: ${resource}`);
    const parsed = new URL(resource, snapshot.origin);
    assert.equal(
      `${parsed.protocol}//${parsed.host}`,
      `${base.protocol}//${base.host}`,
      `The surface resolved a non-application resource: ${resource}`,
    );
  }
  for (const chunk of [snapshot.terminalChunk, snapshot.chartChunk]) {
    const match = /loaded \((.+)\)/u.exec(chunk);
    if (match?.[1] !== undefined) {
      const parsed = new URL(match[1], snapshot.origin);
      assert.equal(
        `${parsed.protocol}//${parsed.host}`,
        `${base.protocol}//${base.host}`,
        `The lazy chunk resolved outside the application origin: ${match[1]}`,
      );
    }
  }
}

/** Installs a bounded CSP and cross-origin network probe in the WebView. */
export async function installOfflineProbe(): Promise<string> {
  const origin: unknown = await browser.tauri.execute(() => {
    const violations: string[] = [];
    const attempts: string[] = [];
    Reflect.set(globalThis, "__talosF7CspViolations", violations);
    Reflect.set(globalThis, "__talosF7NetworkAttempts", attempts);
    document.addEventListener("securitypolicyviolation", (event) => {
      const directive: unknown = Reflect.get(event, "violatedDirective");
      if (typeof directive === "string" && violations.length < 32) {
        violations.push(directive);
      }
    });
    const originalFetch = globalThis.fetch.bind(globalThis);
    globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const parsed = new URL(url, location.href);
      if (parsed.origin === location.origin) {
        return originalFetch(input, init);
      }
      if (attempts.length < 32) {
        attempts.push(`fetch:${url}`);
      }
      return Promise.reject(new Error("network unavailable for the offline specialized-view test"));
    };
    return location.origin;
  });
  if (typeof origin !== "string") {
    throw new Error("The WebView did not report an application origin.");
  }
  return origin;
}

/**
 * Injects an inline and an unauthorized-origin script and waits for the CSP
 * denial, without accepting a successful load as a pass.
 */
export async function expectCspDenial(): Promise<void> {
  await browser.tauri.execute(() => {
    const inline = document.createElement("script");
    inline.textContent = "globalThis.__talosF7InlineRan = true";
    document.body.append(inline);
    const remote = document.createElement("script");
    remote.addEventListener("load", () => {
      Reflect.set(globalThis, "__talosF7RemoteRan", true);
    });
    remote.src = "https://example.invalid/talos-pilot-f7-csp.js";
    document.body.append(remote);
    inline.remove();
    remote.remove();
  });
  await browser.waitUntil(
    async () =>
      await browser.tauri.execute(() => {
        const violations: unknown = Reflect.get(globalThis, "__talosF7CspViolations");
        return Array.isArray(violations) && violations.length > 0;
      }),
    { timeout: 5_000, timeoutMsg: "No packaged-CSP violation was observed." },
  );
  const result: unknown = await browser.tauri.execute(() => {
    const violations: unknown = Reflect.get(globalThis, "__talosF7CspViolations");
    return {
      inlineRan: Reflect.get(globalThis, "__talosF7InlineRan") === true,
      remoteRan: Reflect.get(globalThis, "__talosF7RemoteRan") === true,
      violations,
    };
  });
  assert.ok(isRecord(result));
  assert.equal(result["inlineRan"], false, "An inline script executed under the packaged CSP.");
  assert.equal(result["remoteRan"], false, "An unauthorized script origin executed.");
  const violations = asStringArray(result["violations"]);
  assert.ok(
    violations.some((directive) => directive.startsWith("script-src")),
    "No script-src security-policy violation was observed.",
  );
}

/** Reads the recorded cross-origin network attempts. */
export async function readNetworkAttempts(): Promise<string[]> {
  const value: unknown = await browser.tauri.execute(() => {
    const recorded: unknown = Reflect.get(globalThis, "__talosF7NetworkAttempts");
    return recorded;
  });
  return asStringArray(value);
}
