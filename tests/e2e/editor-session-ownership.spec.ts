import { expect } from "@playwright/test";
import { test } from "./browser";

/**
 * Required browser gate's source-level ownership and model-bounds probes. Vite
 * compiles the real rune/session classes; no mocked Monaco or production test
 * hook is installed. These are not bundled-UI flows: production preview has no
 * source-module URLs.
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
    // should be collected. This proves the sessions do not retain the source
    // options object itself, not that no string copy could exist elsewhere.
    // Unattached recovery creates no model or worker and submits no validation:
    // mounting an admitted document is what starts the queue's debounce timer.
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

/** Checks the projection against the pinned Monaco implementation, including BOM stripping. */
test("model admission matches real Monaco newline normalization", async ({ page }) => {
  await page.goto("/");
  const mismatches = await page.evaluate(async () => {
    const { monaco } = await import("../../src/features/editor/editorMonaco.ts");
    const { admitDocument } = await import("../../src/features/editor/documentBounds.ts");
    const encoder = new TextEncoder();
    const mismatches: string[] = [];
    const endings = ["\n", "\r", "\r\n"];
    // All four-ending combinations exercise CR/LF majorities, ties, adjacent
    // CR+LF pairs and trailing CR. Prefixes add BOM and UTF-8 edge cases.
    for (const prefix of ["", "\ufeff", "é😀\ud800"]) {
      for (const a of endings)
        for (const b of endings)
          for (const c of endings)
            for (const d of endings) {
              const source = `${prefix}a${a}b${b}c${c}d${d}`;
              const model = monaco.editor.createModel(source);
              try {
                const sourceBytes = encoder.encode(source).byteLength;
                const modelBytes = encoder.encode(model.getValue()).byteLength;
                const exact = Math.max(sourceBytes, modelBytes);
                if (
                  !admitDocument(source, exact).accepted ||
                  admitDocument(source, exact - 1).accepted
                ) {
                  mismatches.push(JSON.stringify({ source, sourceBytes, modelBytes }));
                }
              } finally {
                model.dispose();
              }
            }
    }
    return mismatches;
  });
  expect(mismatches).toEqual([]);
});

/** Real Monaco integration for the raw-byte admission / model-normalization boundary. */
test("editor and both diff sides reject newline expansion before creating or replacing models", async ({
  page,
}) => {
  await page.goto("/");
  const observed = await page.evaluate(async () => {
    const { YamlEditorSession } = await import("../../src/lib/state/yamlEditorSession.svelte.ts");
    const { YamlDiffSession } = await import("../../src/lib/state/yamlDiffSession.svelte.ts");
    const { monaco } = await import("../../src/features/editor/editorMonaco.ts");
    const over = `#${"x".repeat(65_530)}\r\n\r\n\n`;
    const exact = `#${"x".repeat(65_529)}\r\n\r\n\n`;
    const small = "a: 1\n";
    const editor = new YamlEditorSession({ label: "Normalized editor", value: over });
    const original = new YamlDiffSession({
      label: "Normalized original",
      originalLabel: "Before",
      modifiedLabel: "After",
      original: over,
      modified: small,
    });
    const modified = new YamlDiffSession({
      label: "Normalized modified",
      originalLabel: "Before",
      modifiedLabel: "After",
      original: small,
      modified: over,
    });
    const sessions = [editor, original, modified];
    const hosts = sessions.map(() => {
      const host = document.createElement("div");
      host.style.cssText = "height:200px;width:600px";
      document.body.append(host);
      return host;
    });
    try {
      for (const [index, session] of sessions.entries()) {
        const host = hosts[index];
        if (host === undefined) throw new Error("Missing model-bounds host.");
        session.createAttachment()(host);
      }
      const initial = {
        errors: sessions.map((session) => session.documentError),
        models: monaco.editor.getModels().length,
      };
      editor.setValue(exact);
      original.setDocuments(exact, small);
      modified.setDocuments(small, exact);
      const accepted = {
        errors: sessions.map((session) => session.documentError),
        values: monaco.editor.getModels().map((model) => model.getValue()),
      };
      editor.setValue(over);
      // Attempt a change to the other side as well: pair rejection must be atomic.
      original.setDocuments(over, "a: 2\n");
      modified.setDocuments("a: 2\n", over);
      const replaced = {
        errors: sessions.map((session) => session.documentError),
        values: monaco.editor.getModels().map((model) => model.getValue()),
      };
      return {
        initial,
        accepted,
        replaced,
        sourceBytes: new TextEncoder().encode(over).byteLength,
        expectedModel: exact.replace(/\r\n|\r|\n/gu, "\r\n"),
      };
    } finally {
      for (const session of sessions) session.dispose();
      for (const host of hosts) host.remove();
    }
  });
  expect(observed.sourceBytes).toBe(65_536);
  expect(observed.initial.models).toBe(0);
  for (const message of observed.initial.errors) expect(message).toContain("editor limit");
  expect(observed.accepted.errors).toEqual([null, null, null]);
  expect(observed.accepted.values).toHaveLength(5);
  expect(observed.accepted.values.filter((value) => value === observed.expectedModel)).toHaveLength(
    3,
  );
  expect(new TextEncoder().encode(observed.expectedModel).byteLength).toBe(65_536);
  for (const message of observed.replaced.errors) expect(message).toContain("editor limit");
  expect(observed.replaced.values).toEqual(observed.accepted.values);
  await expect(page.locator("[data-editor-runtime]")).toHaveText(
    "Workers: 0 · Models: 0 · Listeners: 0",
  );
});
