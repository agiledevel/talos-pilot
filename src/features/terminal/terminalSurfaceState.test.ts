import { describe, expect, it } from "vitest";

import { admitTerminalSnapshot } from "./terminalSnapshot";
import { TerminalSurfaceState } from "./terminalSurfaceState.svelte";

function admitted(text: string) {
  const result = admitTerminalSnapshot(text);
  if (!result.accepted) throw new Error(result.message);
  return result;
}

describe("terminal surface state", () => {
  it("starts idle and resets every projection field", () => {
    const state = new TerminalSurfaceState();
    expect(state.status).toBe("idle");
    state.accepted(admitted("line\n"));
    state.progress(true);
    state.observeEmulator({ rows: 2, firstLine: "line", lastLine: "line" });
    state.rejected("no");
    state.reset();
    expect(state.status).toBe("idle");
    expect(state.notice).toBeNull();
    expect(state.rejection).toBeNull();
    expect(state.failure).toBeNull();
    expect(state.retainedBytes).toBe(0);
    expect(state.retainedLines).toBe(0);
    expect(state.replaying).toBe(false);
    expect(state.emulatorRows).toBe(0);
    expect(state.emulatorFirstLine).toBe("");
    expect(state.emulatorLastLine).toBe("");
  });

  it("publishes admitted size and an eviction notice only when data was dropped", () => {
    const state = new TerminalSurfaceState();
    state.accepted(admitted("first\nsecond\n"));
    expect(state.status).toBe("ready");
    expect(state.notice).toBeNull();
    expect(state.retainedLines).toBe(2);
    expect(state.retainedBytes).toBe(13);

    const over = admitted(`${"x\n".repeat(10_000)}last\n`);
    state.accepted(over);
    expect(state.notice).toContain("Retained the newest 10,000 lines");
    expect(state.notice).toContain("evicted 1 older line");
    expect(state.notice).not.toContain("mid-line");
    expect(state.retainedLines).toBe(10_000);

    const partial = admitted("z".repeat(1_048_577));
    state.accepted(partial);
    expect(state.notice).toContain("starts mid-line");
    expect(state.notice).toContain("evicted 1 B");
  });

  it("keeps accepted data across a rejection and reports a failure", () => {
    const state = new TerminalSurfaceState();
    state.accepted(admitted("accepted\n"));
    state.rejected("The synthetic terminal rejects an escape sequence. Nothing was changed.");
    expect(state.status).toBe("ready");
    expect(state.retainedLines).toBe(1);
    expect(state.rejection).toContain("escape sequence");

    state.accepted(admitted("accepted again\n"));
    expect(state.rejection).toBeNull();

    state.fail("The terminal stopped accepting output for five seconds.");
    expect(state.status).toBe("failed");
    expect(state.failure).toContain("five seconds");
    expect(state.notice).toBeNull();
    expect(state.replaying).toBe(false);
  });

  it("bounds emulator boundary text", () => {
    const state = new TerminalSurfaceState();
    state.observeEmulator({ rows: 1050, firstLine: "a".repeat(500), lastLine: "b".repeat(500) });
    expect(state.emulatorRows).toBe(1050);
    expect(state.emulatorFirstLine).toHaveLength(120);
    expect(state.emulatorLastLine).toHaveLength(120);
  });
});
