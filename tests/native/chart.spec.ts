import assert from "node:assert/strict";

import { browser } from "@wdio/globals";
import { describe, it } from "mocha";

import {
  clickButton,
  counts,
  expectBaseline,
  expectCspDenial,
  expectLocalResources,
  installOfflineProbe,
  openHome,
  readNetworkAttempts,
  readSnapshot,
  waitFor,
} from "./support";

/*
 * Native chart rows for F7. The release-mode test executable embeds the
 * production chart chunk and stylesheet, so canvas pixels come from the real
 * pinned uPlot bundle inside the actual Linux WebKitGTK WebView.
 */

describe("native synthetic chart under the packaged CSP", () => {
  it("loads lazily, paints real values, and enforces the bounded window", async () => {
    await openHome();
    const before = await readSnapshot();
    expectBaseline(before.chartRuntime);
    assert.equal(before.chartSurface, false);
    assert.match(before.chartChunk, /not loaded/u);
    assert.equal(
      before.stylesheets.some((url) => /ChartSurface.*\.css/u.test(url)),
      false,
      "Home loaded the chart stylesheet before first use.",
    );
    const terminalChunkBefore = before.terminalChunk;
    const terminalSheetBefore = before.stylesheets.some((url) =>
      /TerminalSurface.*\.css/u.test(url),
    );

    await clickButton("Open chart");
    // Admission publishes the bounded projection before the scheduled frame
    // creates the instance, so wait for the painted canvas as well.
    const opened = await waitFor(
      (snapshot) =>
        snapshot.chartSurface &&
        snapshot.chartRetained.includes("2 series × 300 aligned samples") &&
        snapshot.chartPainted > 1_000 &&
        counts(snapshot.chartRuntime).instances === 1,
      "The native chart did not accept and paint its synthetic sample.",
    );
    assert.ok(counts(opened.chartRuntime).observers >= 1, "No owned observer was counted.");
    assert.match(opened.chartChunk, /loaded \(.*ChartSurface/u);
    assert.equal(
      opened.terminalChunk,
      terminalChunkBefore,
      "Opening the chart imported the terminal library.",
    );
    assert.equal(
      opened.stylesheets.some((url) => /ChartSurface.*\.css/u.test(url)),
      true,
      "The lazy chart stylesheet was not loaded from the application.",
    );
    assert.equal(
      opened.stylesheets.some((url) => /TerminalSurface.*\.css/u.test(url)),
      terminalSheetBefore,
      "Opening the chart imported the terminal stylesheet.",
    );
    assert.equal(opened.chartSummaryRows, 2);
    expectLocalResources(opened);

    await clickButton("8 series × 2,000");
    const full = await waitFor(
      (snapshot) => snapshot.chartRetained.includes("8 series × 2,000 aligned samples"),
      "The chart did not render the full bounded window.",
    );
    assert.equal(full.chartSummaryRows, 8);
    await waitFor(
      (snapshot) => snapshot.chartPainted > 1_000,
      "The full chart window did not paint.",
    );

    await clickButton("Sample limit + 1");
    const trimmed = await waitFor(
      (snapshot) => snapshot.chartNotice.includes("evicted 1 older sample"),
      "The chart did not evict the oldest aligned sample.",
    );
    assert.match(trimmed.chartRetained, /8 series × 2,000 aligned samples/u);
    assert.equal(trimmed.chartSummaryRows, 8);
  });

  it("rejects every malformed replacement, preserves the chart, clears and recovers", async () => {
    await openHome();
    await clickButton("Open chart");
    await waitFor((snapshot) => snapshot.chartPainted > 1_000, "The native chart did not paint.");
    await clickButton("8 series × 2,000");
    await waitFor(
      (snapshot) => snapshot.chartRetained.includes("8 series × 2,000 aligned samples"),
      "The native chart did not accept the full window.",
    );

    for (const [button, expected] of [
      ["Add ninth series", "at most 8 value series"],
      ["Break alignment", "aligned time and value arrays"],
      ["Non-finite value", "requires finite values"],
      ["Oversized label", "80 characters"],
    ] as const) {
      await clickButton(button);
      const rejected = await waitFor(
        (snapshot) => snapshot.chartRejection.includes(expected),
        `The "${button}" replacement was not rejected visibly.`,
      );
      assert.match(rejected.chartRejection, /previous chart is unchanged/u);
      assert.match(rejected.chartRetained, /8 series × 2,000 aligned samples/u);
      assert.equal(rejected.chartSummaryRows, 8);
      await waitFor(
        (snapshot) => snapshot.chartPainted > 1_000,
        "A rejected replacement removed the accepted chart.",
      );
    }

    await clickButton("Clear chart");
    const cleared = await waitFor(
      (snapshot) => snapshot.chartEmpty && counts(snapshot.chartRuntime).instances === 0,
      "Clearing the chart did not release the plotted data.",
    );
    assert.match(cleared.chartRetained, /0 series × 0 aligned samples/u);
    const paintedAfterClear: unknown = await browser.tauri.execute(() => {
      const canvases = document.querySelectorAll("[data-chart-host] canvas");
      return canvases.length;
    });
    assert.equal(paintedAfterClear, 0, "The cleared chart still owns a canvas.");
    assert.match(cleared.chartBuffers, /Rendered: 0 B/u);

    await clickButton("Next sample");
    const recovered = await waitFor(
      (snapshot) => snapshot.chartRetained.includes("2 series × 300 aligned samples"),
      "A valid proposal did not recover the native chart.",
    );
    assert.equal(recovered.chartEmpty, false);
    await waitFor(
      (snapshot) => snapshot.chartPainted > 1_000,
      "The recovered chart did not paint.",
    );
  });

  it("follows appearance and resize, exposes the numeric summary, and cleans up", async () => {
    await openHome();
    await clickButton("Open chart");
    await waitFor(
      (snapshot) => snapshot.chartRetained.includes("2 series × 300 aligned samples"),
      "The native chart did not open.",
    );
    await clickButton("8 series × 2,000");
    await waitFor(
      (snapshot) => snapshot.chartRetained.includes("8 series × 2,000 aligned samples"),
      "The native chart did not accept the full window.",
    );

    await browser.tauri.execute(() => {
      document.documentElement.dataset.mode = "dark";
      document.documentElement.dataset.density = "compact";
    });
    const dark = await waitFor(
      (snapshot) => snapshot.chartPainted > 1_000,
      "The dark compact chart did not paint.",
    );
    assert.match(dark.chartRetained, /8 series × 2,000 aligned samples/u);
    assert.equal(dark.chartSummaryRows, 8);

    await browser.tauri.execute(() => {
      const host = document.querySelector<HTMLElement>("[data-chart-host]");
      if (host !== null) {
        host.style.height = "220px";
        host.style.width = "60%";
      }
      document.documentElement.dataset.mode = "light";
      document.documentElement.dataset.density = "comfortable";
    });
    const resized = await waitFor(
      (snapshot) => snapshot.chartPainted > 1_000,
      "The resized chart did not repaint.",
    );
    assert.match(resized.chartRetained, /8 series × 2,000 aligned samples/u);

    await browser.tauri.execute(() => {
      const host = document.querySelector<HTMLElement>("[data-chart-host]");
      if (host !== null) {
        host.style.removeProperty("height");
        host.style.removeProperty("width");
      }
      delete document.documentElement.dataset.mode;
      delete document.documentElement.dataset.density;
    });

    await clickButton("Close chart");
    const closed = await waitFor(
      (snapshot) => !snapshot.chartSurface && counts(snapshot.chartRuntime).instances === 0,
      "Closing the chart did not release its instance.",
    );
    expectBaseline(closed.chartRuntime);
    assert.match(closed.chartBuffers, /Rendered: 0 B/u);
    assert.match(closed.chartBuffers, /Scheduled: 0 B/u);
    assert.match(closed.chartRuntime, /Frame: none/u);
    assert.equal(closed.activeLabel, "Open chart");
  });

  it("renders offline from application assets and blocks unauthorized scripts", async () => {
    await openHome();
    await installOfflineProbe();
    await clickButton("Open chart");
    const opened = await waitFor(
      (snapshot) => snapshot.chartPainted > 1_000,
      "The offline native chart did not paint.",
    );
    await clickButton("Next sample");
    await waitFor(
      (snapshot) => snapshot.chartRetained.includes("2 series × 300 aligned samples"),
      "The offline chart did not accept its next sample.",
    );

    assert.deepEqual(await readNetworkAttempts(), [], "The chart attempted a remote request.");
    expectLocalResources(opened);
    await expectCspDenial();

    await clickButton("Close chart");
    const closed = await waitFor(
      (snapshot) => !snapshot.chartSurface && counts(snapshot.chartRuntime).instances === 0,
      "The offline native chart did not release its instance.",
    );
    expectLocalResources(closed);
    assert.equal(
      closed.resources.some((url) => url.startsWith("blob:")),
      false,
      "A blob asset appeared in the native resource entries.",
    );
  });
});
