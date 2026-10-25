import { describe, expect, it } from "vitest";

import {
  TERMINAL_BYTE_LIMIT,
  TERMINAL_LINE_LIMIT,
  admitTerminalSnapshot,
} from "./terminalSnapshot";

function admitted(proposal: string) {
  const result = admitTerminalSnapshot(proposal);
  if (!result.accepted) {
    throw new Error(`Expected admission to succeed: ${result.message}`);
  }
  return result;
}

describe("terminal snapshot admission", () => {
  it("treats empty text as an empty transcript with no lines", () => {
    const result = admitted("");
    expect(result).toMatchObject({
      text: "",
      bytes: 0,
      lines: 0,
      evictedLines: 0,
      evictedBytes: 0,
      partialLine: false,
    });
  });

  it("counts logical lines without adding a trailing empty line", () => {
    expect(admitted("a").lines).toBe(1);
    expect(admitted("a\n").lines).toBe(1);
    expect(admitted("a\nb").lines).toBe(2);
    expect(admitted("a\nb\n").lines).toBe(2);
    expect(admitted("\n").lines).toBe(1);
    expect(admitted("a\n\n").lines).toBe(2);
  });

  it("folds CRLF pairs into one canonical LF and one byte", () => {
    const result = admitted("first\r\nsecond\r\n");
    expect(result.text).toBe("first\nsecond\n");
    expect(result.bytes).toBe(13);
    expect(result.lines).toBe(2);
    expect(result.partialLine).toBe(false);
  });

  it("accepts exactly the UTF-8 byte ceiling and evicts one byte beyond it", () => {
    const exact = admitted("a".repeat(TERMINAL_BYTE_LIMIT));
    expect(exact.bytes).toBe(TERMINAL_BYTE_LIMIT);
    expect(exact.text.length).toBe(TERMINAL_BYTE_LIMIT);
    expect(exact.evictedBytes).toBe(0);
    expect(exact.partialLine).toBe(false);

    const over = admitted(`${"a".repeat(TERMINAL_BYTE_LIMIT)}b`);
    expect(over.bytes).toBe(TERMINAL_BYTE_LIMIT);
    expect(over.text.length).toBe(TERMINAL_BYTE_LIMIT);
    expect(over.text.endsWith("b")).toBe(true);
    expect(over.text.startsWith("a")).toBe(true);
    expect(over.evictedBytes).toBe(1);
    expect(over.partialLine).toBe(true);
  });

  it("accepts exactly the logical-line ceiling and evicts the oldest line", () => {
    const exact = admitted("x\n".repeat(TERMINAL_LINE_LIMIT));
    expect(exact.lines).toBe(TERMINAL_LINE_LIMIT);
    expect(exact.evictedLines).toBe(0);
    expect(exact.bytes).toBe(TERMINAL_LINE_LIMIT * 2);

    const over = admitted(`${"x\n".repeat(TERMINAL_LINE_LIMIT)}last\n`);
    expect(over.lines).toBe(TERMINAL_LINE_LIMIT);
    expect(over.evictedLines).toBe(1);
    expect(over.text.startsWith("x\n")).toBe(true);
    expect(over.text.endsWith("last\n")).toBe(true);
    // One oldest "x\n" line was dropped; the newest "last\n" line remains.
    expect(over.text.length).toBe((TERMINAL_LINE_LIMIT - 1) * 2 + "last\n".length);
  });

  it("applies both ceilings together and prefers the stricter one", () => {
    // Each line is 200 bytes, so 10,000 lines would be 2,000,000 bytes: the byte
    // ceiling must win while the line count stays below its own limit.
    const line = `${"y".repeat(199)}\n`;
    const result = admitted(line.repeat(TERMINAL_LINE_LIMIT));
    expect(result.bytes).toBeLessThanOrEqual(TERMINAL_BYTE_LIMIT);
    expect(result.lines).toBeLessThan(TERMINAL_LINE_LIMIT);
    expect(result.lines).toBe(Math.floor((TERMINAL_BYTE_LIMIT + 1) / 200));
    expect(result.evictedLines).toBe(TERMINAL_LINE_LIMIT - result.lines);
  });

  it("retains the newest suffix of a single oversized line", () => {
    const text = `prefix\n${"z".repeat(TERMINAL_BYTE_LIMIT)}tail`;
    const result = admitted(text);
    expect(result.partialLine).toBe(true);
    expect(result.lines).toBe(1);
    expect(result.bytes).toBe(TERMINAL_BYTE_LIMIT);
    expect(result.text.endsWith("tail")).toBe(true);
    expect(result.text.startsWith("z")).toBe(true);
    expect(result.text).not.toContain("prefix");
    expect(result.evictedLines).toBe(1);
  });

  it("cuts multibyte text at a code-point boundary", () => {
    const threeByte = "漢".repeat(Math.ceil(TERMINAL_BYTE_LIMIT / 3) + 1);
    const result = admitted(threeByte);
    expect(result.bytes).toBeLessThanOrEqual(TERMINAL_BYTE_LIMIT);
    expect(result.bytes % 3).toBe(0);
    expect(new TextEncoder().encode(result.text)).toHaveLength(result.bytes);
    expect(Array.from(result.text)).toHaveLength(result.bytes / 3);
  });

  it("keeps four-byte surrogate pairs whole when cutting", () => {
    const emoji = "😀".repeat(TERMINAL_BYTE_LIMIT / 4 + 1);
    const result = admitted(emoji);
    expect(result.bytes).toBe(TERMINAL_BYTE_LIMIT);
    expect(result.text.length).toBe(TERMINAL_BYTE_LIMIT / 2);
    const first = result.text.charCodeAt(0);
    expect(first).toBeGreaterThanOrEqual(0xd800);
    expect(first).toBeLessThanOrEqual(0xdbff);
    expect(new TextEncoder().encode(result.text)).toHaveLength(TERMINAL_BYTE_LIMIT);
  });

  it("counts a lone surrogate as the three bytes TextEncoder produces for it", () => {
    const result = admitted(`a\ud800b`);
    expect(result.bytes).toBe(5);
    expect(new TextEncoder().encode(result.text)).toHaveLength(5);
    expect(result.text).toBe("a\ud800b");
  });

  it("never splits a CRLF pair at the byte boundary", () => {
    const pairs = TERMINAL_BYTE_LIMIT + 10;
    const result = admitted(`head\n${"\r\n".repeat(pairs)}`);
    expect(result.text).not.toContain("\r");
    expect(result.bytes).toBeLessThanOrEqual(TERMINAL_BYTE_LIMIT);
    expect(result.lines).toBe(TERMINAL_LINE_LIMIT);
    expect(result.text).toBe("\n".repeat(TERMINAL_LINE_LIMIT));
  });

  it("drops the oldest complete line instead of keeping a fragment of it", () => {
    const text = `old\n${"x".repeat(TERMINAL_BYTE_LIMIT - 4)}y`;
    const result = admitted(text);
    expect(result.lines).toBe(1);
    expect(result.partialLine).toBe(false);
    expect(result.text.startsWith("old")).toBe(false);
    expect(result.text.endsWith("y")).toBe(true);
    expect(result.evictedLines).toBe(1);
  });

  it.each([
    ["an escape", "\u001b[31mred"],
    ["a bare carriage return", "line\rreturn"],
    ["a NUL control", "a\u0000b"],
    ["a backspace", "a\bb"],
    ["DEL", "a\u007fb"],
    ["a C1 control", "a\u009bb"],
  ])("rejects %s and returns no transcript", (_label, proposal) => {
    const result = admitTerminalSnapshot(proposal);
    expect(result.accepted).toBe(false);
    if (result.accepted) {
      throw new Error("unreachable");
    }
    expect(result.codeUnit).toBeGreaterThanOrEqual(0);
    expect(result.message).toMatch(/Nothing was changed/u);
    expect(result.message).not.toContain(proposal);
    expect("text" in result).toBe(false);
  });

  it("keeps a bounded canonical copy rather than the source backing string", () => {
    // The admitted text is a flat, canonical string: it contains no CR and its
    // length matches the admitted byte count for ASCII input.
    const source = `\r\n${"q".repeat(TERMINAL_BYTE_LIMIT + 5)}`;
    const result = admitted(source);
    expect(result.text).not.toContain("\r");
    expect(result.text.length).toBe(TERMINAL_BYTE_LIMIT);
    expect(result.evictedBytes).toBeGreaterThan(5);
  });
});
