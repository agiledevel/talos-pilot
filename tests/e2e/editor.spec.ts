import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./browser";
import type { Locator, Page } from "@playwright/test";

// Monaco and its workers take materially longer to settle on the two-worker
// hosted runner than in a local single-worker run. The generous timeout covers
// real first-load latency; every assertion still waits for its observable
// state instead of sleeping.
test.describe.configure({ timeout: 120_000 });

/**
 * Scripts Tauri's IPC entry point before the renderer loads. The editor tests
 * need the appearance commands only; the session-only context is synthetic and
 * carries no credential material. This is renderer evidence, not native IPC or
 * packaged-CSP evidence.
 */
async function scriptNativeResponses(page: Page, rejectDark = false): Promise<void> {
  await page.addInitScript(
    ({ rejectDarkTheme }) => {
      let appearance: unknown = { theme: "system", density: "comfortable" };
      const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
        switch (command) {
          case "get_appearance_settings":
            return appearance;
          case "set_appearance_settings": {
            const requested = args?.["settings"];
            const theme =
              typeof requested === "object" && requested !== null && "theme" in requested
                ? requested.theme
                : undefined;
            if (rejectDarkTheme && theme === "dark") {
              throw {
                code: "SETTINGS_WRITE_FAILED",
                action: command,
                target: null,
                retryable: true,
                message: "Appearance settings could not be written.",
              };
            }
            appearance = requested;
            Reflect.set(globalThis, "__storedAppearanceJson", JSON.stringify(appearance));
            return null;
          }
          case "get_credential_storage_status":
            return { mode: "vault_unavailable" };
          default:
            throw new Error(`The browser test does not script ${command}.`);
        }
      };
      Reflect.set(globalThis, "__storedAppearanceJson", JSON.stringify(appearance));
      Object.assign(globalThis, { isTauri: true, __TAURI_INTERNALS__: { invoke } });
    },
    { rejectDarkTheme: rejectDark },
  );
}

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

function viewMenu(page: Page): Locator {
  return page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "View" });
}

async function chooseFromViewMenu(page: Page, option: string): Promise<void> {
  await viewMenu(page).click();
  await page.getByRole("menuitemradio", { name: option }).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

const WINDOW_SIZES = [
  { width: 1280, height: 800 },
  { width: 1024, height: 700 },
  { width: 720, height: 480 },
] as const;

test.beforeEach(async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("the editor and its worker load lazily and produce a real diagnostic", async ({ page }) => {
  await scriptNativeResponses(page);
  const requests: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  await page.goto("/");

  const runtime = page.locator("[data-editor-runtime]");
  const toggle = page.getByRole("button", { name: "Open YAML editor" });
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0");
  expect(requests.some((url) => /YamlEditorSurface|editor-monaco/u.test(url))).toBe(false);

  await toggle.click();
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await expect(page.getByText("No YAML diagnostics")).toHaveCount(0);

  expect(requests.some((url) => /YamlEditorSurface/u.test(url))).toBe(true);
  expect(requests.some((url) => /monaco/u.test(url))).toBe(true);
  expect(requests.some((url) => /yamlDiagnostics\.worker/u.test(url))).toBe(true);
  await expect(runtime).not.toHaveText("Workers: 0 · Models: 0 · Listeners: 0");

  await expect(
    page.getByText("Synthetic release preview (offline, no cluster)").first(),
  ).toBeVisible();
  const diffText = await page.locator("[data-yaml-diff]").innerText();
  expect(diffText.match(/batches:/gu)?.length ?? 0).toBeGreaterThanOrEqual(2);
  expect(diffText).toContain("Malformed sample");
  expect(diffText).toContain("Corrected sample");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.getByText("No YAML diagnostics")).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText(/YAML diagnostic:/u)).toHaveCount(0);
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Reset malformed sample" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open YAML editor" })).toBeFocused();
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0", { timeout: 10_000 });
});

test("the editor surface stays accessible in both themes and densities at all sizes", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const root = page.locator("html");
  const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
  const runtime = page.locator("[data-editor-runtime]");
  const toggle = page.getByRole("button", { name: "Open YAML editor" });
  await expect(statusBar).toContainText("Credentials: vault unavailable");

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await chooseFromViewMenu(page, colorScheme === "dark" ? "Dark" : "Light");
    await expect(root).toHaveAttribute("data-mode", colorScheme);

    for (const density of ["Comfortable", "Compact"] as const) {
      await chooseFromViewMenu(page, density);
      if (density === "Compact") {
        await expect(root).toHaveAttribute("data-density", "compact");
      } else {
        await expect(root).not.toHaveAttribute("data-density");
      }

      for (const size of WINDOW_SIZES) {
        await page.setViewportSize(size);
        await toggle.click();
        await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
        await expectNoAccessibilityViolations(page);

        const overflow = await page.evaluate(() => ({
          x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        }));
        expect(overflow).toEqual({ x: 0, y: 0 });
        await expect(statusBar).toContainText("Cluster: none connected");

        await page.getByRole("button", { name: "Close editor" }).click();
        await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toHaveCount(0);
        await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0", {
          timeout: 10_000,
        });
      }
    }
  }
});

test("keyboard activation focuses the editor and close restores focus", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const toggle = page.getByRole("button", { name: "Open YAML editor" });
  await toggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toBeVisible({
    timeout: 30_000,
  });
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.closest(".monaco-editor") !== null))
    .toBe(true);

  await page.getByRole("button", { name: "Close editor" }).focus();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open YAML editor" })).toBeFocused();
});

test("a rejected appearance save keeps the visible and stored state consistent", async ({
  page,
}) => {
  await scriptNativeResponses(page, true);
  await page.goto("/");
  const root = page.locator("html");
  await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText(
    "Credentials: vault unavailable",
  );

  await chooseFromViewMenu(page, "Dark");
  await expect(page.getByRole("alert")).toContainText(/appearance settings could not be saved/iu);
  await expect(root).not.toHaveAttribute("data-mode");
  await viewMenu(page).click();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).not.toBeChecked();
  await page.keyboard.press("Escape");

  const stored = await page.evaluate((): string => {
    const value: unknown = Reflect.get(globalThis, "__storedAppearanceJson");
    return typeof value === "string" ? value : "";
  });
  expect(JSON.parse(stored)).toEqual({ theme: "system", density: "comfortable" });
  await expectNoAccessibilityViolations(page);
});

test("the editor works with external requests unavailable and makes no remote request", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  const remote: string[] = [];
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === "http://127.0.0.1:1420") {
      await route.continue();
      return;
    }
    remote.push(url.href);
    await route.abort("internetdisconnected");
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Open YAML editor" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(page.getByText("No YAML diagnostics")).toBeVisible({ timeout: 10_000 });
  expect(remote).toEqual([]);
});

test("a cancelled lazy import leaves no surface or owned resources", async ({ page }) => {
  await scriptNativeResponses(page);
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/YamlEditorSurface.svelte*", async (route) => {
    await gate;
    await route.continue();
  });
  await page.goto("/");
  const runtime = page.locator("[data-editor-runtime]");
  await page.getByRole("button", { name: "Open YAML editor" }).click();
  await expect(page.getByText(/Loading the offline editor/u)).toBeVisible();
  await page.getByRole("button", { name: "Cancel loading editor" }).click();
  await expect(page.getByText(/Loading the offline editor/u)).toHaveCount(0);
  release();
  await page.waitForTimeout(500);
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toHaveCount(0);
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0");
});

test("the browser CSP meta blocks inline and unauthorized scripts", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const result = await page.evaluate(
    async (): Promise<{
      inlineRan: boolean;
      remoteRan: boolean;
      violations: readonly string[];
    }> => {
      const violations: string[] = [];
      document.addEventListener("securitypolicyviolation", (event) => {
        violations.push(event.violatedDirective);
      });
      const meta = document.createElement("meta");
      meta.httpEquiv = "Content-Security-Policy";
      meta.content = "script-src 'self'";
      document.head.append(meta);

      const inline = document.createElement("script");
      inline.textContent = "window.__inlineCspRan = true";
      document.body.append(inline);
      const remote = document.createElement("script");
      remote.addEventListener("load", () => {
        Reflect.set(globalThis, "__remoteCspRan", true);
      });
      remote.src = "https://example.invalid/talos-pilot-csp.js";
      document.body.append(remote);
      await new Promise((resolve) => {
        setTimeout(resolve, 150);
      });
      return {
        inlineRan: Reflect.get(globalThis, "__inlineCspRan") === true,
        remoteRan: Reflect.get(globalThis, "__remoteCspRan") === true,
        violations,
      };
    },
  );
  expect(result.inlineRan).toBe(false);
  expect(result.remoteRan).toBe(false);
  expect(result.violations.some((directive) => directive.startsWith("script-src"))).toBe(true);
});

test("an oversized replacement is rejected visibly and keeps the accepted document", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const runtime = page.locator("[data-editor-runtime]");
  const alert = page.locator("[data-yaml-editor] [role='alert']");
  await page.getByRole("button", { name: "Open YAML editor" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await expect(runtime).toContainText("Models: 3");

  await page.getByRole("button", { name: "Try oversized replacement" }).click();
  await expect(alert).toContainText("65536-byte UTF-8 editor limit");
  await expect(alert).toContainText("Nothing was changed");
  // The accepted document, its model and its worker-produced diagnostic stay.
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible();
  await expect(runtime).toContainText("Models: 3");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Apply correction" }).click();
  await expect(alert).toHaveCount(0);
  await expect(page.getByText("No YAML diagnostics")).toBeVisible({ timeout: 10_000 });
  await page.getByRole("button", { name: "Reset malformed sample" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0", { timeout: 10_000 });
});

test("an oversized initial draft creates no editor model and recovers from a bounded sample", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const runtime = page.locator("[data-editor-runtime]");
  await page.getByRole("button", { name: "Open with oversized draft" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.locator("[data-yaml-editor] [role='alert']")).toContainText(
    "65536-byte UTF-8 editor limit",
  );
  // The editor never created its own model; only the diff pair's two models exist.
  await expect(page.locator("[data-yaml-editor] .monaco-editor")).toHaveCount(0);
  await expect(runtime).toContainText("Models: 2");
  await expectNoAccessibilityViolations(page);

  await page.getByRole("button", { name: "Reset malformed sample" }).click();
  await expect(page.locator("[data-yaml-editor] .monaco-editor")).toHaveCount(1);
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await expect(runtime).toContainText("Models: 3");

  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0", { timeout: 10_000 });
});

test("an oversized paste is rejected and the editor stays usable", async ({ page }) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Open YAML editor" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  const alert = page.locator("[data-yaml-editor] [role='alert']");
  await page.locator("[data-yaml-editor] .monaco-editor").click();

  // Monaco 0.57 uses the EditContext API here. A real paste event carries the
  // whole oversized draft in one edit, unlike character input; the session must
  // reject and revert it synchronously.
  const pasted = await page.evaluate((text) => {
    const target = document.querySelector("[data-yaml-editor] .native-edit-context");
    if (!(target instanceof HTMLElement)) return false;
    const data = new DataTransfer();
    data.setData("text/plain", text);
    const event = new ClipboardEvent("paste", {
      clipboardData: data,
      bubbles: true,
      cancelable: true,
    });
    return target.dispatchEvent(event);
  }, "x".repeat(66_000));
  expect(pasted).toBe(false);
  await expect(alert).toContainText("65536-byte UTF-8 editor limit");
  // The rejected text was reverted rather than left in the model or sent to the
  // worker, so the accepted document's diagnostic is still what is shown.
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible();

  await page.keyboard.insertText("\n# bounded edit\n");
  await expect(alert).toHaveCount(0);
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 10_000 });

  await page.getByRole("button", { name: "Reset malformed sample" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await page.getByRole("button", { name: "Close editor" }).click();
  await expect(page.locator("[data-editor-runtime]")).toHaveText(
    "Workers: 0 · Models: 0 · Listeners: 0",
    { timeout: 10_000 },
  );
});

test("navigating away disposes an open editor and a return starts from baseline", async ({
  page,
}) => {
  await scriptNativeResponses(page);
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  const runtime = page.locator("[data-editor-runtime]");

  await page.getByRole("button", { name: "Open YAML editor" }).click();
  await expect(page.getByText(/YAML diagnostic:/u)).toBeVisible({ timeout: 45_000 });
  await expect(runtime).not.toHaveText("Workers: 0 · Models: 0 · Listeners: 0");

  await navigation.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  await navigation.getByRole("button", { name: "Home" }).click();
  await expect(page.getByRole("heading", { name: "Synthetic YAML editor" })).toHaveCount(0);
  await expect(runtime).toHaveText("Workers: 0 · Models: 0 · Listeners: 0", { timeout: 10_000 });
  await expect(page.locator("[data-editor-chunk]")).toContainText("Editor chunk: loaded");
});
