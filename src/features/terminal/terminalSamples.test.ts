import { describe, expect, it } from "vitest";

import {
  admitTerminalSnapshot,
  TERMINAL_BYTE_LIMIT,
  TERMINAL_LINE_LIMIT,
} from "./terminalSnapshot";
import {
  TERMINAL_CELL_LIMIT,
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_SCROLLBACK_ROWS,
  clampTerminalGeometry,
} from "./terminalGeometry";
import {
  TERMINAL_BURST_LINE_COUNT,
  TERMINAL_SAMPLE_LINE_COUNT,
  syntheticTerminalText,
} from "./terminalSamples";

describe("terminal geometry clamps", () => {
  it("clamps to the declared finite columns and rows", () => {
    expect(clampTerminalGeometry(1, 1)).toEqual({ cols: 20, rows: 5 });
    expect(clampTerminalGeometry(10_000, 10_000)).toEqual({ cols: 200, rows: 50 });
    expect(clampTerminalGeometry(Number.NaN, Number.POSITIVE_INFINITY)).toEqual({
      cols: 20,
      rows: 5,
    });
    expect(clampTerminalGeometry(-4, -4)).toEqual({ cols: 20, rows: 5 });
    expect(clampTerminalGeometry(80.9, 24.9)).toEqual({ cols: 80, rows: 24 });
  });

  it("bounds the emulator cell count including scrollback", () => {
    expect(TERMINAL_CELL_LIMIT).toBe(
      TERMINAL_MAX_COLS * (TERMINAL_MAX_ROWS + TERMINAL_SCROLLBACK_ROWS),
    );
    expect(TERMINAL_CELL_LIMIT).toBe(210_000);
  });
});

describe("synthetic terminal snapshots", () => {
  it("generates a bounded ordinary sample with a visible sequence", () => {
    const text = syntheticTerminalText("sample", 3);
    const admission = admitTerminalSnapshot(text);
    expect(admission.accepted).toBe(true);
    if (!admission.accepted) return;
    expect(admission.lines).toBeGreaterThan(TERMINAL_SAMPLE_LINE_COUNT);
    expect(admission.bytes).toBeLessThan(64 * 1024);
    expect(admission.text).toContain("run 3");
    expect(admission.text).not.toMatch(/password|token|secret/iu);
  });

  it("generates exactly one byte beyond the byte ceiling", () => {
    const text = syntheticTerminalText("byte-over", 0);
    expect(new TextEncoder().encode(text)).toHaveLength(TERMINAL_BYTE_LIMIT + 1);
    const admission = admitTerminalSnapshot(text);
    expect(admission.accepted).toBe(true);
    if (!admission.accepted) return;
    expect(admission.bytes).toBe(TERMINAL_BYTE_LIMIT);
    expect(admission.evictedBytes).toBe(1);
    expect(admission.partialLine).toBe(true);
  });

  it("generates exactly one line beyond the line ceiling", () => {
    const text = syntheticTerminalText("line-over", 0);
    const admission = admitTerminalSnapshot(text);
    expect(admission.accepted).toBe(true);
    if (!admission.accepted) return;
    expect(admission.lines).toBe(TERMINAL_LINE_LIMIT);
    expect(admission.evictedLines).toBe(1);
    expect(admission.text.startsWith("line 000002")).toBe(true);
    expect(admission.text).not.toContain("line 000001");
  });

  it("generates a burst and a single oversized line", () => {
    const burst = syntheticTerminalText("burst", 0);
    expect(burst.split("\n").length - 1).toBe(TERMINAL_BURST_LINE_COUNT);
    const admittedBurst = admitTerminalSnapshot(burst);
    expect(admittedBurst.accepted).toBe(true);
    if (!admittedBurst.accepted) return;
    expect(admittedBurst.bytes).toBeLessThanOrEqual(TERMINAL_BYTE_LIMIT);
    expect(admittedBurst.evictedLines).toBeGreaterThan(0);

    const longLine = syntheticTerminalText("long-line", 0);
    expect(new TextEncoder().encode(longLine).length).toBeGreaterThan(TERMINAL_BYTE_LIMIT);
    const admittedLine = admitTerminalSnapshot(longLine);
    expect(admittedLine.accepted).toBe(true);
    if (!admittedLine.accepted) return;
    expect(admittedLine.partialLine).toBe(true);
    expect(admittedLine.text.endsWith(" NEWEST-TAIL")).toBe(true);
    expect(admittedLine.text).not.toContain("BEGIN-OF-LONG-LINE");
  });

  it("generates an empty snapshot and a rejected control snapshot", () => {
    expect(syntheticTerminalText("empty", 0)).toBe("");
    const rejection = admitTerminalSnapshot(syntheticTerminalText("control", 1));
    expect(rejection.accepted).toBe(false);
    if (rejection.accepted) return;
    expect(rejection.message).toMatch(/escape sequence/u);
  });
});
