import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const THEME_OPTIONS = ["System", "Light", "Dark"] as const;
const DENSITY_OPTIONS = ["Comfortable", "Compact"] as const;

test("the browser shell stays accessible and fails closed without native transport", async ({
  page,
}) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Talos Pilot" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Clusters" })).toBeVisible();
  await expect(page.getByText("No clusters connected")).toBeVisible();

  const theme = page.getByRole("radiogroup", { name: "Theme" });
  const density = page.getByRole("radiogroup", { name: "Density" });
  await expect(theme).toBeVisible();
  await expect(density).toBeVisible();
  for (const option of THEME_OPTIONS) {
    await expect(theme.getByRole("radio", { name: option })).toBeDisabled();
  }
  for (const option of DENSITY_OPTIONS) {
    await expect(density.getByRole("radio", { name: option })).toBeDisabled();
  }
  await expect(page.getByRole("button", { name: "Import kubeconfig" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Import Talos config" })).toBeDisabled();
  await expect(
    page.getByText("Credential storage is available in the native desktop application."),
  ).toBeVisible();
  await expect(page.getByText(/operating system vault is unavailable/i)).toHaveCount(0);

  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 1024, height: 700 });
  await expect(theme).toBeVisible();
  await expect(page.getByRole("heading", { name: "Talos read probe" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByRole("heading", { name: "Talos read probe" })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
});
