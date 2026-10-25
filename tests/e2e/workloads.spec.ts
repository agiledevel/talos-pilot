import AxeBuilder from "@axe-core/playwright";
import { expect } from "@playwright/test";
import { test } from "./browser";
import type { Page } from "@playwright/test";

const WINDOW_SIZES = [
  { width: 1280, height: 800 },
  { width: 1024, height: 700 },
  { width: 720, height: 480 },
] as const;

async function expectNoAccessibilityViolations(page: Page): Promise<void> {
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
}

async function selectWorkloads(page: Page): Promise<void> {
  await page
    .getByRole("navigation", { name: "Primary" })
    .getByRole("button", {
      name: "Workloads",
    })
    .click();
}

test("the native transport lists scoped Pod summaries and keeps context visible", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const invoke = async (
      command: string,
      args: Record<string, unknown> = {},
    ): Promise<unknown> => {
      switch (command) {
        case "get_appearance_settings":
          return { theme: "system", density: "comfortable" };
        case "get_credential_storage_status":
          return { mode: "session_only" };
        case "list_kubernetes_credentials":
          return [
            {
              credential_handle: "kubecred-AAAAAAAAAAAAAAAAAAAAAA",
              context_label: "synthetic-workloads",
              storage_mode: "session_only",
            },
          ];
        case "open_kubernetes_session":
          return {
            session_id: "kube-session-15",
            context_label: "synthetic-workloads",
            storage_mode: "session_only",
          };
        case "list_kubernetes_pods": {
          if (args.namespace === "forbidden") {
            throw {
              code: "KUBERNETES_FORBIDDEN",
              action: "list_kubernetes_pods",
              target: null,
              retryable: false,
              message: "The Kubernetes API server denied the request for this credential.",
            };
          }
          return {
            session_id: "kube-session-15",
            namespace: args.namespace,
            resource_version: "rv-105",
            complete: true,
            items: [
              {
                name: "api-0",
                namespace: args.namespace,
                uid: "uid-api-0",
                resource_version: "rv-105",
                phase: "Running",
                readiness: "ready",
              },
            ],
          };
        }
        case "close_kubernetes_session":
          return true;
        default:
          return null;
      }
    };
    Object.assign(globalThis, { isTauri: true, __TAURI_INTERNALS__: { invoke } });
  });

  await page.goto("/");
  await selectWorkloads(page);
  await page.getByRole("button", { name: "Load saved contexts" }).click();
  await page.getByRole("button", { name: "Open Kubernetes session" }).click();
  await expect(page.getByText("(kube-session-15)")).toBeVisible();
  await page.getByRole("button", { name: "List Pods" }).click();
  await expect(page.getByRole("row", { name: /api-0 Running ready/u })).toBeVisible();

  const statusBar = page.getByRole("contentinfo", { name: "Status bar" });
  await expect(statusBar).toContainText(
    "Kubernetes: synthetic-workloads · kube-session-15 · namespace default",
  );

  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    for (const size of WINDOW_SIZES) {
      await page.setViewportSize(size);
      await expect(page.getByRole("row", { name: /api-0 Running ready/u })).toBeVisible();
      const layout = await page.evaluate(() => {
        const shell = document.querySelector("#root > div");
        const main = document.querySelector("main");
        const footer = document.querySelector("footer[aria-label='Status bar']");
        return {
          horizontalOverflow:
            document.documentElement.scrollWidth - document.documentElement.clientWidth,
          shellBottom: shell?.getBoundingClientRect().bottom,
          mainOverflowY: main === null ? "visible" : getComputedStyle(main).overflowY,
          mainCanScroll: main !== null && main.scrollHeight > main.clientHeight,
          footerBottom: footer?.getBoundingClientRect().bottom,
          viewportHeight: innerHeight,
        };
      });
      expect(layout.horizontalOverflow).toBe(0);
      expect(layout.shellBottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.footerBottom).toBeLessThanOrEqual(layout.viewportHeight);
      expect(layout.mainOverflowY).toBe("auto");
      if (layout.viewportHeight < 600) {
        expect(layout.mainCanScroll).toBe(true);
      }
      await expectNoAccessibilityViolations(page);
    }
  }

  await page.getByRole("textbox", { name: "Namespace" }).fill("forbidden");
  await page.getByRole("button", { name: "List Pods" }).click();
  await expect(page.getByRole("alert")).toHaveText(/Forbidden:/u);
  await expectNoAccessibilityViolations(page);
});
