import { expect } from "@playwright/test";
import { test } from "./browser";

/**
 * Required browser gate's source-level ownership probe. Vite compiles the real
 * rune/session classes; no mocked Monaco or production test hook is installed.
 * This is not a bundled-UI flow: production preview has no source-module URLs.
 */
test("recovered editor and diff sessions release rejected initial options", async ({ page }) => {
  await page.goto("/");
  const recovered = await page.evaluate(async () => {
    const { YamlEditorSession } = await import("../../src/lib/state/yamlEditorSession.svelte.ts");
    const { YamlDiffSession } = await import("../../src/lib/state/yamlDiffSession.svelte.ts");
    const editorOptions = { label: "Rejected initial editor", value: "x".repeat(66_000) };
    const diffOptions = {
      label: "Rejected initial diff",
      originalLabel: "Before",
      modifiedLabel: "After",
      original: "x".repeat(66_000),
      modified: "y".repeat(66_000),
    };
    const editor = new YamlEditorSession(editorOptions);
    const diff = new YamlDiffSession(diffOptions);
    const rejected = editor.documentError !== null && diff.documentError !== null;
    editor.setValue("a: 1\n");
    diff.setDocuments("a: 1\n", "a: 2\n");
    // Sessions remain strongly rooted across GC; only their source options
    // should be collected. Neither unattached session creates timers/workers.
    Reflect.set(globalThis, "__s1RetainedSessions", { editor, diff });
    Reflect.set(globalThis, "__s1SourceOptions", [
      new WeakRef(editorOptions),
      new WeakRef(diffOptions),
    ]);
    return rejected && editor.documentError === null && diff.documentError === null;
  });
  expect(recovered).toBe(true);
  await page.requestGC();
  const released = await page.evaluate(() => {
    const references: unknown = Reflect.get(globalThis, "__s1SourceOptions");
    return (
      Array.isArray(references) &&
      references.length === 2 &&
      references.every(
        (reference: unknown) => reference instanceof WeakRef && reference.deref() === undefined,
      )
    );
  });
  expect(released).toBe(true);
  await page.evaluate(async () => {
    const { YamlEditorSession } = await import("../../src/lib/state/yamlEditorSession.svelte.ts");
    const { YamlDiffSession } = await import("../../src/lib/state/yamlDiffSession.svelte.ts");
    const sessions: unknown = Reflect.get(globalThis, "__s1RetainedSessions");
    if (
      typeof sessions === "object" &&
      sessions !== null &&
      "editor" in sessions &&
      "diff" in sessions
    ) {
      if (sessions.editor instanceof YamlEditorSession) sessions.editor.dispose();
      if (sessions.diff instanceof YamlDiffSession) sessions.diff.dispose();
    }
    Reflect.deleteProperty(globalThis, "__s1RetainedSessions");
    Reflect.deleteProperty(globalThis, "__s1SourceOptions");
  });
  await expect(page.locator("[data-editor-runtime]")).toHaveText(
    "Workers: 0 · Models: 0 · Listeners: 0",
  );
});
