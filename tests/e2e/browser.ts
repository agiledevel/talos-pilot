import { expect, test as base } from "@playwright/test";

const RELOAD_SIGNAL = "browser-evidence: document reloaded";

/**
 * Keeps bounded lifecycle evidence for renderer flows and fails on page errors
 * or document reloads (including same-URL Vite optimizer reloads). Intentional
 * `goto` calls are allowed; these flows never intentionally reload a document.
 * Page/context disposal owns all listeners; only synthetic metadata is retained.
 */
export const test = base.extend<{ browserEvidence: void }>({
  browserEvidence: [
    async ({ page }, use, testInfo) => {
      const events: string[] = [];
      let pageErrors = 0;
      let reloads = 0;
      const record = (event: string): void => {
        if (events.length < 256) events.push(event.slice(0, 2048));
      };
      page.on("framenavigated", (frame) => {
        if (frame === page.mainFrame()) record(`navigation: ${frame.url()}`);
      });
      page.on("pageerror", (error) => {
        pageErrors += 1;
        record(`pageerror: ${error.message}`);
      });
      page.on("console", (message) => {
        if (message.text() === RELOAD_SIGNAL) reloads += 1;
        record(`console ${message.type()}: ${message.text()}`);
      });
      await page.addInitScript((signal) => {
        document.addEventListener("DOMContentLoaded", () => {
          if (
            performance
              .getEntriesByType("navigation")
              .some(
                (entry) => entry instanceof PerformanceNavigationTiming && entry.type === "reload",
              )
          )
            console.debug(signal);
        });
      }, RELOAD_SIGNAL);
      await page.addInitScript(() => {
        const input: string[] = [];
        Reflect.set(globalThis, "__browserInputEvidence", input);
        const identity = (element: Element | null): string =>
          element === null
            ? "none"
            : `${element.tagName}#${element.id}[${element.getAttribute("role")}]`;
        const record = (event: string): void => {
          if (input.length < 256) input.push(`${performance.now()}: ${event}`.slice(0, 2048));
        };
        for (const name of ["focusin", "keydown", "keyup"] as const) {
          document.addEventListener(
            name,
            (event) => {
              if (input.length >= 256) return;
              const target = event.target;
              if (target instanceof HTMLElement) {
                record(
                  `${name} ${event instanceof KeyboardEvent ? event.key : ""} target=${identity(target)} active=${identity(document.activeElement)} documentFocused=${document.hasFocus()} prevented=${event.defaultPrevented}`,
                );
              }
            },
            true,
          );
        }
        document.addEventListener("keydown", (event) => {
          record(
            `keydown-bubble ${event.key} active=${identity(document.activeElement)} prevented=${event.defaultPrevented}`,
          );
        });
      });
      try {
        await use();
        expect(pageErrors, "unexpected browser page errors").toBe(0);
        expect(reloads, "unexpected document reloads discard application state").toBe(0);
      } finally {
        // Preserve host-side evidence even if the page has crashed or a reload
        // destroys its execution context while input evidence is being read.
        await testInfo.attach("browser-lifecycle", {
          body: events.join("\n"),
          contentType: "text/plain",
        });
        let input = "Input evidence unavailable: the page was closed.";
        if (!page.isClosed()) {
          try {
            input = await page.evaluate(() => {
              const value: unknown = Reflect.get(globalThis, "__browserInputEvidence");
              return Array.isArray(value)
                ? value.filter((entry): entry is string => typeof entry === "string").join("\n")
                : "";
            });
          } catch {
            input = "Input evidence unavailable: the browser execution context was lost.";
          }
        }
        await testInfo.attach("browser-input", { body: input, contentType: "text/plain" });
      }
    },
    { auto: true },
  ],
});
