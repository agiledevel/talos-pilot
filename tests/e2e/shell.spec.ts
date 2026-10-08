import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("appearance controls remain accessible at desktop and narrow widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Talos Pilot" })).toBeVisible();
  await page.getByRole("switch", { name: "Dark theme" }).click();
  await page.getByRole("switch", { name: "Compact density" }).click();
  await expect(page.getByRole("switch", { name: "Dark theme" })).toBeChecked();
  await expect(page.getByRole("switch", { name: "Compact density" })).toBeChecked();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("switch", { name: "Dark theme" })).toBeVisible();
  await page.getByRole("switch", { name: "Dark theme" }).click();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
