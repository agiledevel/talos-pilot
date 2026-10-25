import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./browser";
import type { Page } from "@playwright/test";

const THEME_OPTIONS = ["System", "Light", "Dark"] as const;
const DENSITY_OPTIONS = ["Comfortable", "Compact"] as const;
const VIEWS = ["Home", "Talos", "Workloads", "Settings"] as const;

/** The design's comfortable workspace, its lower adaptation bound, and the minimum window size. */
const WINDOW_SIZES = [
  { width: 1280, height: 800 },
  { width: 1024, height: 700 },
  { width: 720, height: 480 },
] as const;

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

test("the browser shell stays accessible and fails closed without native transport", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  const statusBar = page.getByRole("contentinfo", { name: "Status bar" });

  await expect(page.getByRole("heading", { level: 1, name: "Home" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clusters" })).toBeVisible();
  await expect(page.getByText("No clusters connected")).toBeVisible();
  await expect(navigation.getByRole("button", { name: "Home" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  await expect(statusBar).toContainText("Cluster: none connected");
  await expect(statusBar).toContainText("Talos: no context");
  await expect(statusBar).toContainText("Kubernetes: no session");
  await expect(statusBar).toContainText("Credentials: desktop application only");
  await expectNoAccessibilityViolations(page);

  // The menu opens so the choices stay readable, but none can be changed.
  const viewMenu = page
    .getByRole("menubar", { name: "Application menu" })
    .getByRole("menuitem", { name: "View" });
  await viewMenu.click();
  const theme = page.getByRole("group", { name: "Theme" });
  const density = page.getByRole("group", { name: "Density" });
  for (const option of THEME_OPTIONS) {
    await expect(theme.getByRole("menuitemradio", { name: option })).toBeDisabled();
  }
  for (const option of DENSITY_OPTIONS) {
    await expect(density.getByRole("menuitemradio", { name: option })).toBeDisabled();
  }
  await expect(theme.getByRole("menuitemradio", { name: "System" })).toBeChecked();
  await expectNoAccessibilityViolations(page);
  await page.keyboard.press("Escape");
  await expect(theme).toBeHidden();
  await expect(viewMenu).toBeFocused();

  await navigation.getByRole("button", { name: "Talos" }).click();
  await expect(page.getByRole("heading", { name: "Talos read probe" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Import Talos config" })).toBeDisabled();
  await expectNoAccessibilityViolations(page);

  await navigation.getByRole("button", { name: "Workloads" }).click();
  await expect(page.getByRole("button", { name: "Load saved contexts" })).toBeDisabled();
  await expect(page.getByRole("heading", { name: "Kubernetes workloads" })).toBeVisible();
  await expectNoAccessibilityViolations(page);

  await navigation.getByRole("button", { name: "Settings" }).click();
  await expect(page.getByRole("button", { name: "Import kubeconfig" })).toBeDisabled();
  await expect(
    page.getByText("Credential storage is available in the native desktop application."),
  ).toBeVisible();
  await expect(page.getByText(/operating system vault is unavailable/i)).toHaveCount(0);
  await expectNoAccessibilityViolations(page);
});

test("the shell fills the window and keeps its bars in place at every supported size", async ({
  page,
}) => {
  await page.goto("/");
  const navigation = page.getByRole("navigation", { name: "Primary" });
  const menuBar = page.getByRole("menubar", { name: "Application menu" });
  const statusBar = page.getByRole("contentinfo", { name: "Status bar" });

  for (const size of WINDOW_SIZES) {
    await page.setViewportSize(size);
    for (const view of VIEWS) {
      await navigation.getByRole("button", { name: view }).click();
      await expect(page.getByRole("heading", { level: 1, name: view })).toBeVisible();

      // Only the content area scrolls: the window itself never does.
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow).toEqual({ x: 0, y: 0 });

      const menuBox = await menuBar.boundingBox();
      const navigationBox = await navigation.boundingBox();
      const statusBox = await statusBar.boundingBox();
      expect(menuBox?.y).toBe(0);
      expect(navigationBox?.x).toBe(0);
      expect((statusBox?.y ?? 0) + (statusBox?.height ?? 0)).toBe(size.height);
      expect(statusBox?.width).toBe(size.width);

      await expectNoAccessibilityViolations(page);
    }
  }
});

test("a failed settings load is reported from every view in both themes", async ({ page }) => {
  // Scripts Tauri's IPC entry point so the real transport adapter maps a structured failure.
  await page.addInitScript(() => {
    const invoke = async (command: string): Promise<unknown> => {
      throw {
        code: "STORAGE_UNAVAILABLE",
        action: command,
        target: null,
        retryable: true,
        message: "Local storage is unavailable.",
      };
    };
    Object.assign(globalThis, { isTauri: true, __TAURI_INTERNALS__: { invoke } });
  });
  const navigation = page.getByRole("navigation", { name: "Primary" });

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await page.goto("/");
    for (const view of VIEWS) {
      await navigation.getByRole("button", { name: view }).click();
      await expect(page.getByRole("heading", { level: 1, name: view })).toBeVisible();
      await expect(page.getByRole("alert")).toHaveText(/Local storage is unavailable\./u);
    }
    await expect(page.getByRole("contentinfo", { name: "Status bar" })).toContainText(
      "Credentials: status not loaded",
    );
    await expectNoAccessibilityViolations(page);
  }
});
