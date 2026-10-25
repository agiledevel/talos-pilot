import assert from "node:assert/strict";

import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

/*
 * These specs run against the Tauri release executable built by
 * `pnpm test:native`: its embedded production assets use `src-tauri/tauri.conf.json`'s
 * packaged CSP, including the same-origin worker fallback. They therefore cover
 * the native rows that a Chromium mock cannot establish.
 *
 * Every `execute` callback is serialised into the WebView and is self-contained;
 * it may not call a helper defined in this module.
 */

interface EditorSnapshot {
  readonly surface: boolean;
  readonly editorMounted: boolean;
  readonly runtime: string;
  readonly diagnostic: string;
  readonly documentError: string;
  readonly diff: string;
  readonly target: string;
  readonly resources: readonly string[];
  readonly chunk: string;
  readonly workerAssets: string;
  readonly origin: string;
}

interface Counts {
  readonly workers: number;
  readonly models: number;
  readonly listeners: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function snapshot(value: unknown): EditorSnapshot {
  assert.ok(isRecord(value));
  return {
    surface: value["surface"] === true,
    editorMounted: value["editorMounted"] === true,
    runtime: asString(value["runtime"]),
    diagnostic: asString(value["diagnostic"]),
    documentError: asString(value["documentError"]),
    diff: asString(value["diff"]),
    target: asString(value["target"]),
    resources: asStringArray(value["resources"]),
    chunk: asString(value["chunk"]),
    workerAssets: asString(value["workerAssets"]),
    origin: asString(value["origin"]),
  };
}

function counts(runtime: string): Counts {
  const match = /Workers:\s*(\d+)\s*·\s*Models:\s*(\d+)\s*·\s*Listeners:\s*(\d+)/u.exec(runtime);
  assert.ok(match !== null, `Unexpected editor counter text: ${runtime}`);
  return {
    workers: Number(match[1] ?? "-1"),
    models: Number(match[2] ?? "-1"),
    listeners: Number(match[3] ?? "-1"),
  };
}

function expectBaseline(runtime: string): void {
  assert.deepEqual(counts(runtime), { workers: 0, models: 0, listeners: 0 });
}

async function readSnapshot(): Promise<EditorSnapshot> {
  const value: unknown = await browser.tauri.execute(() => {
    const surface = document.querySelector("[data-editor-surface]") !== null;
    const editorMounted = document.querySelector("[data-yaml-editor] .monaco-editor") !== null;
    const runtime = document.querySelector("[data-editor-runtime]")?.textContent ?? "";
    const diagnostic = [...document.querySelectorAll("[data-yaml-editor] [role='status']")]
      .map((element) => element.textContent ?? "")
      .join(" | ");
    const documentError = [
      ...document.querySelectorAll(
        "[data-yaml-editor] [role='alert'], [data-yaml-diff] [role='alert']",
      ),
    ]
      .map((element) => element.textContent ?? "")
      .join(" | ");
    const diff = document.querySelector("[data-yaml-diff]")?.textContent ?? "";
    const target = document.querySelector("[data-editor-feasibility]")?.textContent ?? "";
    const resources = performance.getEntriesByType("resource").map((entry) => entry.name);
    const chunk = document.querySelector("[data-editor-chunk]")?.textContent ?? "";
    const workerAssets = document.querySelector("[data-editor-worker-assets]")?.textContent ?? "";
    return {
      surface,
      editorMounted,
      runtime,
      diagnostic,
      documentError,
      diff,
      target,
      resources,
      chunk,
      workerAssets,
      origin: location.origin,
    };
  });
  return snapshot(value);
}

async function clickButton(label: string): Promise<void> {
  const clicked: unknown = await browser.tauri.execute((_tauri, wanted) => {
    const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
      (candidate) => candidate.textContent?.trim() === wanted,
    );
    if (button === undefined) {
      return false;
    }
    button.click();
    return true;
  }, label);
  assert.equal(clicked, true, `The "${label}" button was not found.`);
}

async function waitFor(
  predicate: (value: EditorSnapshot) => boolean,
  timeoutMsg: string,
  timeout = 20_000,
): Promise<EditorSnapshot> {
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

async function openHome(): Promise<void> {
  await browser.tauri.execute(() => {
    const home = [...document.querySelectorAll<HTMLButtonElement>("nav button")].find(
      (button) => button.textContent?.trim() === "Home",
    );
    home?.click();
  });
  const open = await waitFor(
    (value) => value.runtime.length > 0,
    "The Home editor feasibility panel never loaded.",
  );
  if (open.surface) {
    await clickButton("Close editor");
    await waitFor(
      (value) => !value.surface && counts(value.runtime).workers === 0,
      "The previous editor surface did not close.",
    );
  }
}

describe("native offline YAML editor under the packaged CSP", () => {
  it("loads lazily, reports a worker diagnostic, corrects it, and shows the diff", async () => {
    await openHome();
    const before = await readSnapshot();
    expectBaseline(before.runtime);
    assert.equal(before.surface, false);
    assert.match(before.chunk, /Editor chunk: not-loaded/u);
    assert.match(before.workerAssets, /not loaded/u);

    await browser.tauri.execute(() => {
      const violations: string[] = [];
      Reflect.set(globalThis, "__talosEditorCspViolations", violations);
      document.addEventListener("securitypolicyviolation", (event) => {
        const directive: unknown = Reflect.get(event, "violatedDirective");
        if (typeof directive === "string") {
          violations.push(directive);
        }
      });
    });

    await clickButton("Open YAML editor");
    const opened = await waitFor(
      (value) => value.surface && value.diagnostic.includes("YAML diagnostic:"),
      "The surface opened without a worker-produced YAML diagnostic.",
      30_000,
    );
    assert.match(opened.diagnostic, /YAML diagnostic:/u);
    assert.doesNotMatch(opened.diagnostic, /No YAML diagnostics/u);
    assert.ok(counts(opened.runtime).workers >= 1, "No worker was active after opening.");
    assert.equal(counts(opened.runtime).models, 3);
    assert.ok(counts(opened.runtime).listeners > 0, "No editor listeners were registered.");
    assert.match(opened.target, /Synthetic release preview \(offline, no cluster\)/u);

    assert.match(opened.chunk, /Editor chunk: loaded/u);
    assert.match(opened.chunk, /YamlEditorSurface/u);
    assert.match(opened.workerAssets, /yamlDiagnostics\.worker/u);
    assert.match(opened.workerAssets, /monacoEditor\.worker/u);
    assert.ok(opened.chunk.includes(opened.origin), "The editor chunk was not same-origin.");

    const diffCount = (opened.diff.match(/batches:/gu) ?? []).length;
    assert.ok(diffCount >= 2, "The diff did not render both documents.");
    assert.match(opened.diff, /Malformed sample/u);
    assert.match(opened.diff, /Corrected sample/u);
    assert.match(opened.diff, /Synthetic release preview/u);

    const beforeCorrection = counts(opened.runtime);
    await clickButton("Apply correction");
    const corrected = await waitFor(
      (value) => value.surface && value.diagnostic.includes("No YAML diagnostics"),
      "Correcting the sample did not clear the worker diagnostic.",
    );
    assert.doesNotMatch(corrected.diagnostic, /YAML diagnostic:/u);
    assert.deepEqual(counts(corrected.runtime), beforeCorrection);
    assert.equal(corrected.surface, true);

    await clickButton("Reset malformed sample");
    await waitFor(
      (value) => value.diagnostic.includes("YAML diagnostic:"),
      "Resetting the malformed sample did not produce a diagnostic.",
    );

    const violations: unknown = await browser.tauri.execute(() => {
      const value: unknown = Reflect.get(globalThis, "__talosEditorCspViolations");
      return value;
    });
    assert.deepEqual(asStringArray(violations), []);

    await clickButton("Close editor");
    const closed = await waitFor(
      (value) => !value.surface && counts(value.runtime).workers === 0,
      "Closing the editor did not release its worker.",
    );
    expectBaseline(closed.runtime);
    const focused = await browser.tauri.execute(
      () => document.activeElement?.textContent?.trim() ?? "",
    );
    assert.equal(focused, "Open YAML editor");
  });

  it("returns workers, models, and listeners to baseline across replacements, resize, and theme changes", async () => {
    await openHome();

    for (let cycle = 0; cycle < 3; cycle += 1) {
      await clickButton("Open YAML editor");
      await waitFor(
        (value) => value.surface && value.diagnostic.includes("YAML diagnostic:"),
        `Cycle ${String(cycle + 1)} never reached the diagnostic state.`,
        30_000,
      );
      const active = counts((await readSnapshot()).runtime);
      assert.ok(active.workers > 0);
      assert.equal(active.models, 3);
      assert.ok(active.listeners > 0);

      await clickButton("Apply correction");
      await waitFor(
        (value) => value.diagnostic.includes("No YAML diagnostics"),
        `Cycle ${String(cycle + 1)} did not clear the diagnostic.`,
      );
      await clickButton("Reset malformed sample");
      await waitFor(
        (value) => value.diagnostic.includes("YAML diagnostic:"),
        `Cycle ${String(cycle + 1)} did not restore the diagnostic.`,
      );

      await browser.tauri.execute(() => {
        const host = document.querySelector<HTMLElement>("[data-yaml-editor] > div");
        if (host !== null) {
          host.style.height = "220px";
          host.style.width = "82%";
        }
      });
      await browser.pause(100);

      await browser.tauri.execute(() => {
        document.documentElement.dataset.mode = "dark";
      });
      await browser.pause(100);
      await browser.tauri.execute(() => {
        document.documentElement.dataset.mode = "light";
      });
      await browser.pause(100);
      await browser.tauri.execute(() => {
        delete document.documentElement.dataset.mode;
        const host = document.querySelector<HTMLElement>("[data-yaml-editor] > div");
        if (host !== null) {
          host.style.removeProperty("height");
          host.style.removeProperty("width");
        }
      });

      await clickButton("Close editor");
      const closed = await waitFor(
        (value) => !value.surface && counts(value.runtime).workers === 0,
        `Cycle ${String(cycle + 1)} did not release its worker.`,
      );
      expectBaseline(closed.runtime);
      assert.doesNotMatch(closed.workerAssets, /blob:/u);
      assert.equal(
        closed.resources.some((url) => url.startsWith("blob:")),
        false,
        "A blob: asset appeared in the native resource entries.",
      );
    }
  });

  it("makes no remote request and resolves every editor asset from the application origin", async () => {
    await openHome();
    const origin: unknown = await browser.tauri.execute(() => {
      const attempts: string[] = [];
      Reflect.set(globalThis, "__talosEditorNetworkAttempts", attempts);
      const originalFetch = globalThis.fetch.bind(globalThis);
      globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
        const url =
          typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
        const parsed = new URL(url, location.href);
        if (parsed.origin === location.origin) {
          return originalFetch(input, init);
        }
        attempts.push(`fetch:${url}`);
        return Promise.reject(new Error("network unavailable for the offline editor test"));
      };
      return location.origin;
    });
    assert.equal(typeof origin, "string");

    await clickButton("Open YAML editor");
    const opened = await waitFor(
      (value) => value.surface && value.diagnostic.includes("YAML diagnostic:"),
      "The offline editor did not reach a worker diagnostic.",
      30_000,
    );
    await clickButton("Apply correction");
    await waitFor(
      (value) => value.diagnostic.includes("No YAML diagnostics"),
      "The offline editor did not clear its diagnostic.",
    );

    const attempts: unknown = await browser.tauri.execute(() => {
      const value: unknown = Reflect.get(globalThis, "__talosEditorNetworkAttempts");
      return value;
    });
    assert.ok(Array.isArray(attempts));
    for (const attempt of asStringArray(attempts)) {
      const url = attempt.slice(attempt.indexOf(":") + 1);
      assert.equal(new URL(url, String(origin)).origin, origin);
    }

    assert.match(opened.workerAssets, /yamlDiagnostics\.worker/u);
    assert.match(opened.workerAssets, /monacoEditor\.worker/u);
    assert.doesNotMatch(opened.workerAssets, /blob:/u);
    for (const resource of opened.resources) {
      assert.equal(resource.startsWith("blob:"), false, `Unexpected blob asset: ${resource}`);
      assert.equal(
        new URL(resource, String(origin)).origin,
        origin,
        `The editor resolved a non-application resource: ${resource}`,
      );
    }

    await clickButton("Close editor");
    await waitFor(
      (value) => !value.surface && counts(value.runtime).workers === 0,
      "The offline editor did not release its worker.",
    );
  });

  it("rejects oversized initial and replacement documents without growing owned editor resources", async () => {
    await openHome();
    await clickButton("Open with oversized draft");
    const rejectedInitial = await waitFor(
      (value) => value.surface && value.documentError.includes("65536-byte UTF-8 editor limit"),
      "The oversized initial draft was not rejected visibly.",
      30_000,
    );
    assert.equal(
      rejectedInitial.editorMounted,
      false,
      "The rejected initial draft created an editor.",
    );
    assert.match(rejectedInitial.documentError, /Nothing was changed/u);
    assert.equal(
      counts(rejectedInitial.runtime).models,
      2,
      "Only the bounded diff pair should have models while the editor rejects its draft.",
    );

    await clickButton("Reset malformed sample");
    const recovered = await waitFor(
      (value) => value.editorMounted && value.diagnostic.includes("YAML diagnostic:"),
      "A bounded sample did not recover the editor after the initial rejection.",
      30_000,
    );
    assert.equal(counts(recovered.runtime).models, 3);
    assert.doesNotMatch(recovered.documentError, /editor limit/u);

    await clickButton("Try oversized replacement");
    const rejectedReplacement = await waitFor(
      (value) => value.documentError.includes("65536-byte UTF-8 editor limit"),
      "The oversized replacement was not rejected visibly.",
    );
    assert.equal(rejectedReplacement.editorMounted, true);
    assert.equal(
      counts(rejectedReplacement.runtime).models,
      3,
      "The rejected replacement changed the editor's owned models.",
    );
    assert.match(
      rejectedReplacement.diagnostic,
      /YAML diagnostic:/u,
      "The accepted document's diagnostic disappeared after a rejected replacement.",
    );

    await clickButton("Apply correction");
    await waitFor(
      (value) => value.diagnostic.includes("No YAML diagnostics"),
      "The bounded correction did not clear the diagnostic after a rejection.",
    );
    await clickButton("Reset malformed sample");
    await waitFor(
      (value) => value.diagnostic.includes("YAML diagnostic:"),
      "Resetting after a rejected replacement did not restore the diagnostic.",
    );

    await clickButton("Close editor");
    const closed = await waitFor(
      (value) => !value.surface && counts(value.runtime).workers === 0,
      "Closing after the bound checks did not release the editor resources.",
    );
    expectBaseline(closed.runtime);
  });

  it("blocks an inline script and an unauthorized script origin under the packaged CSP", async () => {
    await openHome();
    const result: unknown = await browser.tauri.execute(async () => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        const directive: unknown = Reflect.get(event, "violatedDirective");
        if (typeof directive === "string") {
          violations.push(directive);
        }
      });
      const inline = document.createElement("script");
      inline.textContent = "globalThis.__talosInlineCspRan = true";
      document.body.append(inline);
      const remote = document.createElement("script");
      remote.addEventListener("load", () => {
        Reflect.set(globalThis, "__talosRemoteCspRan", true);
      });
      remote.src = "https://example.invalid/talos-pilot-csp.js";
      document.body.append(remote);
      await new Promise((resolve) => {
        setTimeout(resolve, 250);
      });
      inline.remove();
      remote.remove();
      return {
        inlineRan: Reflect.get(globalThis, "__talosInlineCspRan") === true,
        remoteRan: Reflect.get(globalThis, "__talosRemoteCspRan") === true,
        violations,
      };
    });
    assert.ok(isRecord(result));
    assert.equal(result["inlineRan"], false, "An inline script executed under the packaged CSP.");
    assert.equal(result["remoteRan"], false, "An unauthorized script origin executed.");
    assert.ok(asStringArray(result["violations"]).length > 0);
    assert.ok(
      asStringArray(result["violations"]).some((directive) => directive.startsWith("script-src")),
      "No script-src security-policy violation was observed.",
    );
  });
});
