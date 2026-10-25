import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./browser";
import type { Locator, Page } from "@playwright/test";

/**
 * Scripts Tauri's IPC entry point before the application loads, so the real
 * transport adapter and its runtime validation run in Chromium against fixed,
 * synthetic responses. The session-only context is fabricated and carries no
 * credential material.
 *
 * This covers renderer behaviour only. It cannot establish command
 * registration, capability enforcement, or rendering under the packaged CSP;
 * those remain the native suite's responsibility.
 */
async function scriptNativeResponses(page: Page): Promise<void> {
  await page.addInitScript(() => {
    let appearance: unknown = { theme: "system", density: "comfortable" };
    const invoke = async (command: string, args?: Record<string, unknown>): Promise<unknown> => {
      switch (command) {
        case "get_appearance_settings":
          return appearance;
        case "set_appearance_settings":
          appearance = args?.["settings"];
          return null;
        case "get_credential_storage_status":
          return { mode: "vault_unavailable" };
        case "use_session_only_storage":
          return { mode: "session_only" };
        case "import_talosconfig":
          return {
            session_id: "talos-session-1",
            context_name: "synthetic-demo",
            endpoints: ["10.79.0.2"],
            nodes: ["10.79.0.4", "10.79.0.5", "10.79.0.6"],
            storage_mode: "session_only",
          };
        case "close_talos_session":
          return true;
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

function viewMenu(page: Page): Locator {
  return page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "View" });
}

/** Chooses one item of the View menu with the pointer; choosing closes the menu. */
async function chooseFromViewMenu(page: Page, option: string): Promise<void> {
  await viewMenu(page).click();
  await page.getByRole("menuitemradio", { name: option }).click();
  await expect(page.getByRole("menu")).toBeHidden();
}

async function openView(page: Page, name: string): Promise<void> {
  await page.getByRole("navigation", { name: "Primary" }).getByRole("button", { name }).click();
  await expect(page.getByRole("heading", { level: 1, name })).toBeVisible();
}

test.beforeEach(async ({ page }) => {
  await scriptNativeResponses(page);
  // The stylesheet removes transitions under this preference, so colours are final when scanned.
  await page.emulateMedia({ reducedMotion: "reduce" });
});

test("themes follow the system until one is chosen and stay accessible", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark", reducedMotion: "reduce" });
  await page.goto("/");
  const root = page.locator("html");
  const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
  await expect(statusBar).toContainText("Credentials: vault unavailable");

  // "System" records no explicit mode and resolves from the emulated preference.
  await viewMenu(page).click();
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  await expect(root).not.toHaveAttribute("data-mode");
  await expect(root).toHaveCSS("color-scheme", "dark");
  const darkBackground = await root.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );
  await expectNoAccessibilityViolations(page);

  await page.getByRole("menuitemradio", { name: "Light" }).click();
  await expect(root).toHaveAttribute("data-mode", "light");
  await expect(root).toHaveCSS("color-scheme", "light");
  await expect(root).not.toHaveCSS("background-color", darkBackground);
  await expectNoAccessibilityViolations(page);

  // An explicit dark choice must win over a light system preference.
  await page.emulateMedia({ colorScheme: "light", reducedMotion: "reduce" });
  await chooseFromViewMenu(page, "Dark");
  await expect(root).toHaveAttribute("data-mode", "dark");
  await expect(root).toHaveCSS("color-scheme", "dark");
  await expect(root).toHaveCSS("background-color", darkBackground);
  await expectNoAccessibilityViolations(page);

  await viewMenu(page).click();
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeChecked();
  await expect(page.getByRole("menuitemradio", { name: "System" })).not.toBeChecked();
  await expectNoAccessibilityViolations(page);
});

test("the View menu works from the keyboard and returns focus to its trigger", async ({ page }) => {
  await page.goto("/");
  const root = page.locator("html");
  await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText(
    "Credentials: vault unavailable",
  );

  // Open with the keyboard; focus lands on the first item, then moves down to
  // "Dark". The intermediate assertions make the menu's roving focus observable
  // on a slower two-worker hosted run instead of racing two key presses.
  await viewMenu(page).focus();
  await expect(viewMenu(page)).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("menuitemradio", { name: "System" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Light" })).toBeFocused();
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menuitemradio", { name: "Dark" })).toBeFocused();
  await page.keyboard.press("Enter");

  await expect(root).toHaveAttribute("data-mode", "dark");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(viewMenu(page)).toBeFocused();

  // Escape dismisses without a change.
  await page.keyboard.press("ArrowDown");
  await expect(page.getByRole("menu")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("menu")).toBeHidden();
  await expect(viewMenu(page)).toBeFocused();
  await expect(root).toHaveAttribute("data-mode", "dark");
});

test("compact density tightens controls without losing accessibility", async ({ page }) => {
  await page.goto("/");
  await openView(page, "Settings");
  const importButton = page.getByRole("button", { name: "Import kubeconfig" });
  await expect(page.getByText(/operating system vault is unavailable/i)).toBeVisible();
  const height = async (): Promise<number> => (await importButton.boundingBox())?.height ?? 0;
  const comfortable = await height();
  expect(comfortable).toBeGreaterThan(0);

  await chooseFromViewMenu(page, "Compact");
  await expect(page.locator("html")).toHaveAttribute("data-density", "compact");
  await expect.poll(height).toBeLessThan(comfortable);
  await expect.poll(height).toBeGreaterThan(0);
  await expectNoAccessibilityViolations(page);
});

test("the Talos node picker works with pointer and keyboard in both themes", async ({ page }) => {
  await page.goto("/");
  await openView(page, "Talos");
  await page.getByRole("button", { name: "Import Talos config" }).click();
  await expect(page.getByText(/Session-only context “synthetic-demo”/u)).toBeVisible();
  await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText(
    "Talos: synthetic-demo (session-only)",
  );
  const picker = page.getByRole("combobox", { name: "Talos node target" });
  await expect(picker).toHaveText(/10\.79\.0\.4/u);

  await picker.click();
  const list = page.getByRole("listbox");
  await expect(list).toBeVisible();
  await expect(list.getByRole("option")).toHaveCount(3);
  await expectNoAccessibilityViolations(page);

  await list.getByRole("option", { name: "10.79.0.5" }).click();
  await expect(list).toBeHidden();
  await expect(picker).toHaveText(/10\.79\.0\.5/u);

  // Keyboard: open, move to the next option, select, and keep focus on the trigger.
  await picker.focus();
  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Enter");
  await expect(list).toBeHidden();
  await expect(picker).toHaveText(/10\.79\.0\.6/u);
  await expect(picker).toBeFocused();

  await page.keyboard.press("Enter");
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toBeHidden();
  await expect(picker).toHaveText(/10\.79\.0\.6/u);

  await chooseFromViewMenu(page, "Dark");
  await expect(page.locator("html")).toHaveAttribute("data-mode", "dark");
  await picker.click();
  await expect(list).toBeVisible();
  await expectNoAccessibilityViolations(page);
});
