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
 * These specs run against the Tauri release executable built by
 * `pnpm test:native`: its embedded production assets use the packaged CSP, and
 * the pinned xterm.js bundle renders in the actual Linux WebKitGTK WebView. They
 * therefore establish the native terminal rows that a Chromium mock cannot.
 */

function emulatorRows(snapshotText: string): number {
  const match = /Emulator rows:\s*([\d,]+)/u.exec(snapshotText);
  assert.ok(match?.[1] !== undefined, `No emulator row count in: ${snapshotText}`);
  return Number(match[1].replaceAll(",", ""));
}

describe("native synthetic terminal under the packaged CSP", () => {
  it("loads lazily, renders bounded output, and enforces both ceilings", async () => {
    await openHome();
    const before = await readSnapshot();
    expectBaseline(before.terminalRuntime);
    assert.equal(before.terminalSurface, false);
    assert.match(before.terminalChunk, /not loaded/u);
    const chartChunkBefore = before.chartChunk;
    const chartSheetBefore = before.stylesheets.some((url) => /ChartSurface.*\.css/u.test(url));
    assert.equal(
      before.stylesheets.some((url) => /TerminalSurface.*\.css/u.test(url)),
      false,
      "Home loaded the terminal stylesheet before first use.",
    );

    await clickButton("Open terminal");
    const opened = await waitFor(
      (snapshot) =>
        snapshot.terminalSurface &&
        snapshot.terminalEmulator.includes("newest row: synthetic-preview completed"),
      "The native terminal did not render its synthetic sample.",
    );
    assert.equal(counts(opened.terminalRuntime).instances, 1);
    assert.ok(counts(opened.terminalRuntime).observers >= 1, "No owned observer was counted.");
    assert.ok(counts(opened.terminalRuntime).listeners >= 1, "No owned listener was counted.");
    assert.match(opened.terminalRuntime, /Deadline: none/u);
    assert.match(opened.terminalChunk, /loaded \(.*TerminalSurface/u);
    assert.equal(
      opened.chartChunk,
      chartChunkBefore,
      "Opening the terminal imported the chart library.",
    );
    assert.equal(
      opened.stylesheets.some((url) => /ChartSurface.*\.css/u.test(url)),
      chartSheetBefore,
      "Opening the terminal loaded the chart stylesheet.",
    );
    assert.equal(
      opened.stylesheets.some((url) => /TerminalSurface.*\.css/u.test(url)),
      true,
      "The lazy terminal stylesheet was not loaded from the application.",
    );
    expectLocalResources(opened);

    await clickButton("Byte ceiling + 1");
    const byteOver = await waitFor(
      (snapshot) => snapshot.terminalNotice.includes("1.00 MiB"),
      "The byte-ceiling replacement was not admitted with its visible notice.",
    );
    assert.match(byteOver.terminalBuffers, /Retained: 1\.00 MiB/u);
    assert.match(byteOver.terminalNotice, /evicted 1 B/u);
    assert.match(byteOver.terminalNotice, /starts mid-line/u);
    assert.equal(emulatorRows(byteOver.terminalEmulator) <= 1_050, true);

    await clickButton("Line ceiling + 1");
    const lineOver = await waitFor(
      (snapshot) =>
        snapshot.terminalNotice.includes("evicted 1 older line") &&
        snapshot.terminalEmulator.includes("line 010001"),
      "The line-ceiling replacement did not retain the newest 10,000 lines.",
    );
    assert.match(lineOver.terminalNotice, /Retained the newest 10,000 lines/u);
    assert.equal(emulatorRows(lineOver.terminalEmulator) <= 1_050, true);

    await clickButton("Burst 12,000 lines");
    await waitFor(
      (snapshot) => snapshot.terminalNotice.includes("evicted"),
      "The burst snapshot did not report eviction.",
    );
    const burst = await readSnapshot();
    assert.equal(emulatorRows(burst.terminalEmulator) <= 1_050, true);

    await clickButton("One oversized line");
    const longLine = await waitFor(
      (snapshot) =>
        snapshot.terminalEmulator.includes("NEWEST-TAIL") &&
        snapshot.terminalNotice.includes("starts mid-line"),
      "The single oversized line did not retain its newest suffix.",
    );
    assert.match(longLine.terminalRetained, /Admitted: 1 line/u);
    assert.equal(longLine.terminalRejection, "");
  });

  it("rejects a control, clears, recovers, follows appearance and resize, and cleans up", async () => {
    await openHome();
    await clickButton("Open terminal");
    await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("newest row: synthetic-preview completed"),
      "The native terminal did not open.",
    );

    await clickButton("Try an escape sequence");
    const rejected = await waitFor(
      (snapshot) => snapshot.terminalRejection.includes("escape sequence"),
      "The unsupported control was not rejected visibly.",
    );
    assert.match(rejected.terminalRejection, /Nothing was changed/u);
    assert.match(
      rejected.terminalEmulator,
      /newest row: synthetic-preview completed/u,
      "A rejected control replaced the accepted transcript.",
    );
    assert.match(rejected.terminalBuffers, /Queue: 0/u);

    await clickButton("Clear output");
    const cleared = await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("newest row: (empty)"),
      "Clearing the terminal did not release the accepted output.",
    );
    assert.match(cleared.terminalRetained, /Admitted: 0 lines/u);

    await clickButton("Next sample");
    const recovered = await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("newest row: synthetic-preview completed"),
      "A bounded sample did not recover the native terminal.",
    );
    assert.match(recovered.terminalRetained, /Admitted: 26 lines/u);

    await browser.tauri.execute(() => {
      const host = document.querySelector<HTMLElement>("[data-terminal-host]");
      if (host !== null) {
        host.style.height = "190px";
        host.style.width = "70%";
      }
      document.documentElement.dataset.mode = "dark";
      document.documentElement.dataset.density = "compact";
    });
    const changed = await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("synthetic-preview completed"),
      "A theme, density, or resize change disturbed the terminal.",
    );
    assert.equal(emulatorRows(changed.terminalEmulator) > 0, true);
    assert.equal(changed.terminalFailure, "");

    await browser.tauri.execute(() => {
      const host = document.querySelector<HTMLElement>("[data-terminal-host]");
      if (host !== null) {
        host.style.removeProperty("height");
        host.style.removeProperty("width");
      }
      delete document.documentElement.dataset.mode;
      delete document.documentElement.dataset.density;
    });
    await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("synthetic-preview completed"),
      "Restoring the appearance did not keep the terminal data.",
    );

    await clickButton("Close terminal");
    const closed = await waitFor(
      (snapshot) => !snapshot.terminalSurface && counts(snapshot.terminalRuntime).instances === 0,
      "Closing the terminal did not release its instance.",
    );
    expectBaseline(closed.terminalRuntime);
    assert.match(closed.terminalBuffers, /Retained: 0 B/u);
    assert.match(closed.terminalBuffers, /Pending: 0 B/u);
    assert.match(closed.terminalBuffers, /In flight: 0 B/u);
    assert.match(closed.terminalRuntime, /Frame: none/u);
    assert.match(closed.terminalRuntime, /Deadline: none/u);
    assert.equal(closed.activeLabel, "Open terminal");
  });

  it("renders offline from application assets and blocks unauthorized scripts", async () => {
    await openHome();
    await installOfflineProbe();
    await clickButton("Open terminal");
    const opened = await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("newest row: synthetic-preview completed"),
      "The offline native terminal did not render.",
    );
    await clickButton("Next sample");
    await waitFor(
      (snapshot) => snapshot.terminalEmulator.includes("synthetic-preview completed"),
      "The offline terminal did not accept its next sample.",
    );

    assert.deepEqual(await readNetworkAttempts(), [], "The terminal attempted a remote request.");
    expectLocalResources(opened);

    await expectCspDenial();

    await clickButton("Close terminal");
    const closed = await waitFor(
      (snapshot) => !snapshot.terminalSurface && counts(snapshot.terminalRuntime).instances === 0,
      "The offline native terminal did not release its instance.",
    );
    expectLocalResources(closed);
    assert.equal(
      closed.resources.some((url) => url.startsWith("blob:")),
      false,
      "A blob asset appeared in the native resource entries.",
    );
  });
});
