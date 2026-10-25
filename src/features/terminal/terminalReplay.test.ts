import { describe, expect, it, vi } from "vitest";

import { SpecializedViewDiagnostics } from "../../lib/state/specializedViewRuntime.svelte";
import { admitTerminalSnapshot } from "./terminalSnapshot";
import type { TerminalAdmission } from "./terminalSnapshot";
import {
  TERMINAL_STALL_DEADLINE_MS,
  TERMINAL_WRITE_CANONICAL_LIMIT,
  TERMINAL_WRITE_ENCODED_LIMIT,
  TerminalReplaySession,
  encodedWriteBytes,
} from "./terminalReplay";
import type { TerminalReplayScheduler, TerminalReplayWriter } from "./terminalReplay";

class FakeWriter implements TerminalReplayWriter {
  readonly writes: { data: string; callback: () => void; encoded: number }[] = [];
  resets = 0;

  write(data: string, callback: () => void): void {
    this.writes.push({ data, callback, encoded: encodedWriteBytes(data) });
  }

  reset(): void {
    this.resets += 1;
  }

  completeLast(): void {
    const last = this.writes.at(-1);
    if (last === undefined) throw new Error("No write is awaiting its callback.");
    last.callback();
  }
}

class FakeScheduler implements TerminalReplayScheduler {
  delay = -1;
  deadline: (() => void) | null = null;

  setDeadline(delayMs: number, callback: () => void): void {
    this.delay = delayMs;
    this.deadline = callback;
  }

  clearDeadline(): void {
    this.deadline = null;
  }

  fire(): void {
    const callback = this.deadline;
    this.deadline = null;
    if (callback !== null) callback();
  }
}

function admitted(text: string): TerminalAdmission {
  const result = admitTerminalSnapshot(text);
  if (!result.accepted) throw new Error(result.message);
  return result;
}

function session() {
  const writer = new FakeWriter();
  const scheduler = new FakeScheduler();
  const diagnostics = new SpecializedViewDiagnostics();
  const onStall = vi.fn<(message: string) => void>();
  const replay = new TerminalReplaySession({ writer, scheduler, diagnostics, onStall });
  return { writer, scheduler, diagnostics, onStall, replay };
}

describe("terminal replay session", () => {
  it("replays one bounded write at a time and waits for each callback", () => {
    const { writer, scheduler, replay } = session();
    const text = "a".repeat(TERMINAL_WRITE_CANONICAL_LIMIT * 2 + 10);
    replay.apply(admitted(text));

    expect(writer.resets).toBe(1);
    expect(writer.writes).toHaveLength(1);
    expect(writer.writes[0]?.encoded).toBeLessThanOrEqual(TERMINAL_WRITE_ENCODED_LIMIT);
    expect(scheduler.delay).toBe(TERMINAL_STALL_DEADLINE_MS);
    expect(scheduler.deadline).not.toBeNull();

    writer.completeLast();
    expect(writer.writes).toHaveLength(2);
    expect(scheduler.deadline).not.toBeNull();
    writer.completeLast();
    expect(writer.writes).toHaveLength(3);
    writer.completeLast();
    expect(writer.writes).toHaveLength(3);
    expect(scheduler.deadline).toBeNull();
    expect(writer.writes.map((entry) => entry.data).join("")).toBe(text);
    expect(replay.state.replaying).toBe(false);
    expect(replay.disposed).toBe(false);
  });

  it("splits writes at code-point boundaries and bounds newline expansion", () => {
    const { writer, replay } = session();
    const text = `${"😀".repeat(9_000)}${"\n".repeat(TERMINAL_WRITE_CANONICAL_LIMIT + 100)}`;
    const admission = admitted(text);
    // The line ceiling retains only the newest 10,000 newline lines here.
    expect(admission.text).toBe("\n".repeat(10_000));
    replay.apply(admission);
    // Each callback may append the next write, so index through the growing list.
    for (let index = 0; index < 200; index += 1) {
      const entry = writer.writes[index];
      if (entry === undefined) break;
      expect(entry.encoded).toBeLessThanOrEqual(TERMINAL_WRITE_ENCODED_LIMIT);
      const canonical = entry.data.replaceAll("\r\n", "\n");
      expect(new TextEncoder().encode(canonical).length).toBeLessThanOrEqual(
        TERMINAL_WRITE_CANONICAL_LIMIT,
      );
      expect(canonical.includes("\r")).toBe(false);
      entry.callback();
    }
    const rendered = writer.writes.map((entry) => entry.data).join("");
    expect(rendered.replaceAll("\r\n", "\n")).toBe(admission.text);
    expect(rendered.includes("\ud83d\r")).toBe(false);
  });

  it("coalesces rapid replacements into one latest pending snapshot", () => {
    const { writer, diagnostics, replay } = session();
    replay.apply(admitted("first\n"));
    expect(writer.writes).toHaveLength(1);
    expect(diagnostics.retainedBytes).toBe(6);

    replay.apply(admitted("second\n"));
    replay.apply(admitted("third\n"));
    expect(writer.writes).toHaveLength(1);
    expect(replay.pending?.text).toBe("third\n");
    expect(diagnostics.pendingBytes).toBe(6);
    expect(diagnostics.queueDepth).toBe(1);

    writer.completeLast();
    // The superseded "second" snapshot is never written; replay restarts at
    // "third" after resetting the emulator.
    expect(writer.resets).toBe(2);
    expect(writer.writes).toHaveLength(2);
    expect(writer.writes[1]?.data).toBe("third\r\n");
    expect(replay.pending).toBeNull();
    expect(diagnostics.pendingBytes).toBe(0);
    expect(diagnostics.queueDepth).toBe(0);

    writer.completeLast();
    expect(writer.writes).toHaveLength(2);
    expect(replay.retained?.text).toBe("third\n");
  });

  it("fails visibly after a five-second stall and drops pending data", () => {
    const { writer, scheduler, diagnostics, onStall, replay } = session();
    replay.apply(admitted("stalled"));
    replay.apply(admitted("pending replacement"));
    expect(diagnostics.inFlightBytes).toBeGreaterThan(0);

    scheduler.fire();
    expect(onStall).toHaveBeenCalledTimes(1);
    expect(onStall.mock.calls[0]?.[0]).toMatch(/five seconds/u);
    expect(replay.disposed).toBe(true);
    expect(replay.retained).toBeNull();
    expect(replay.pending).toBeNull();
    expect(diagnostics.retainedBytes).toBe(0);
    expect(diagnostics.pendingBytes).toBe(0);
    expect(diagnostics.inFlightBytes).toBe(0);
    expect(diagnostics.deadlinePending).toBe(false);
    expect(writer.resets).toBe(1);

    // A late callback cannot revive the failed session or write the pending data.
    writer.completeLast();
    expect(writer.writes).toHaveLength(1);
    expect(writer.resets).toBe(1);
    expect(onStall).toHaveBeenCalledTimes(1);
  });

  it("ignores a late callback and a duplicate callback after disposal", () => {
    const { writer, diagnostics, replay } = session();
    replay.apply(admitted("dispose me"));
    const first = writer.writes[0];
    expect(first).toBeDefined();

    replay.dispose();
    replay.dispose();
    expect(diagnostics.retainedBytes).toBe(0);
    expect(diagnostics.inFlightBytes).toBe(0);
    first?.callback();
    first?.callback();
    expect(writer.writes).toHaveLength(1);
    expect(writer.resets).toBe(1);
  });

  it("clears the emulator for an empty snapshot without writing", () => {
    const { writer, diagnostics, replay } = session();
    replay.apply(admitted("previous\n"));
    writer.completeLast();
    replay.apply(admitted(""));
    expect(writer.resets).toBe(2);
    expect(writer.writes).toHaveLength(1);
    expect(replay.retained?.bytes).toBe(0);
    expect(diagnostics.retainedBytes).toBe(0);
    expect(replay.state.replaying).toBe(false);
  });

  it("ignores a write token from an earlier write", () => {
    const { writer, replay } = session();
    replay.apply(admitted("abcdef"));
    const first = writer.writes[0];
    expect(first).toBeDefined();
    writer.completeLast();
    // Completing an already completed write again must not advance the replay.
    const writesAfterCompletion = writer.writes.length;
    first?.callback();
    expect(writer.writes).toHaveLength(writesAfterCompletion);
    expect(replay.state.replaying).toBe(false);
  });
});
