import { describe, expect, it } from "vitest";
import {
  admitDocument,
  admitDocumentPair,
  documentLimitMessage,
  isWithinDocumentLimit,
  utf8ByteLengthAtMost,
  YAML_DOCUMENT_LIMIT_BYTES,
  type DocumentAdmission,
} from "./documentBounds";

const encoder = new TextEncoder();

function admDocumentPairRejectedHasNoText(admission: { readonly accepted: boolean }): boolean {
  return !admission.accepted && !("original" in admission) && !("modified" in admission);
}

function rejectionMessage(admission: DocumentAdmission): string {
  if (admission.accepted) {
    throw new Error("Expected the document to be rejected.");
  }
  return admission.message;
}

describe("UTF-8 document byte bounds", () => {
  it("accepts exactly the byte ceiling and rejects one byte more in ASCII", () => {
    const exact = "a".repeat(YAML_DOCUMENT_LIMIT_BYTES);
    expect(utf8ByteLengthAtMost(exact)).toBe(YAML_DOCUMENT_LIMIT_BYTES);
    expect(isWithinDocumentLimit(exact)).toBe(true);
    const over = admitDocument(`${exact}a`);
    expect(over.accepted).toBe(false);
    expect(rejectionMessage(over)).toContain("65536-byte UTF-8 editor limit");
    expect(rejectionMessage(over)).toContain("Nothing was changed");
    expect(admitDocument(exact)).toEqual({
      accepted: true,
      text: exact,
      bytes: YAML_DOCUMENT_LIMIT_BYTES,
    });
  });

  it("rejects source text that expands past the ceiling when Monaco selects CRLF", () => {
    const exactSource = `#${"x".repeat(65_530)}\r\n\r\n\n`;
    expect(utf8ByteLengthAtMost(exactSource)).toBe(YAML_DOCUMENT_LIMIT_BYTES);
    expect(admitDocument(exactSource).accepted).toBe(false);
    expect(admitDocumentPair(exactSource, "after\n").accepted).toBe(false);
    expect(admitDocumentPair("before\n", exactSource).accepted).toBe(false);

    const exactModel = `#${"x".repeat(65_529)}\r\n\r\n\n`;
    expect(admitDocument(exactModel)).toEqual({
      accepted: true,
      text: exactModel,
      bytes: YAML_DOCUMENT_LIMIT_BYTES - 1,
    });
  });

  it.each([
    { text: "a\r\nb\r\nc\n", limit: 8, accepted: false },
    { text: "a\r\nb\r\nc\n", limit: 9, accepted: true },
    { text: "a\nb\nc\n", limit: 6, accepted: true },
    { text: "a\r\nb\r\n", limit: 6, accepted: true },
    { text: "a\rb\rc\n", limit: 8, accepted: false },
    { text: "a\rb\rc\n", limit: 9, accepted: true },
    { text: "a\rb\r", limit: 5, accepted: false },
    { text: "a\rb\r", limit: 6, accepted: true },
    // A tie selects LF, not CRLF; source bytes must still fit as well.
    { text: "a\r\nb\n", limit: 5, accepted: true },
    { text: "a\r\nb\n", limit: 4, accepted: false },
    // Monaco strips a leading BOM from its stored text, but raw bytes still count.
    { text: "\ufeffa\rb\r", limit: 7, accepted: true },
    { text: "é\r\n😀\r\nx\n", limit: 12, accepted: false },
    { text: "é\r\n😀\r\nx\n", limit: 13, accepted: true },
    { text: "\ud800\r\n\udc00\r\nx\n", limit: 12, accepted: false },
  ])("admits $text with ceiling $limit: $accepted", ({ text, limit, accepted }) => {
    expect(admitDocument(text, limit).accepted).toBe(accepted);
  });

  it("counts two-byte characters rather than string length", () => {
    const exact = "é".repeat(YAML_DOCUMENT_LIMIT_BYTES / 2);
    expect(exact.length).toBe(YAML_DOCUMENT_LIMIT_BYTES / 2);
    expect(utf8ByteLengthAtMost(exact)).toBe(YAML_DOCUMENT_LIMIT_BYTES);
    expect(isWithinDocumentLimit(exact)).toBe(true);
    expect(isWithinDocumentLimit(`${exact}é`)).toBe(false);
    expect(admitDocument(`${exact}é`).accepted).toBe(false);
  });

  it("counts four-byte code points and surrogate pairs correctly", () => {
    const exact = "😀".repeat(YAML_DOCUMENT_LIMIT_BYTES / 4);
    expect(utf8ByteLengthAtMost(exact)).toBe(YAML_DOCUMENT_LIMIT_BYTES);
    expect(isWithinDocumentLimit(exact)).toBe(true);
    expect(isWithinDocumentLimit(`${exact}😀`)).toBe(false);
    expect(admitDocument(`${exact}😀`).accepted).toBe(false);
  });

  it("matches TextEncoder for mixed BMP, surrogate pairs and unpaired surrogates", () => {
    const samples = ["", "a", "é", "😀", "aé😀", "\ud800", "\udc00", "\ud800\udc00", "x\ud800y"];
    const measured = samples.map((sample) => utf8ByteLengthAtMost(sample));
    const expected = samples.map((sample) => encoder.encode(sample).byteLength);
    expect(measured).toEqual(expected);
  });

  it("stops at the first byte over the ceiling without parsing the rest", () => {
    const limit = 8;
    expect(utf8ByteLengthAtMost("abcdefgh", limit)).toBe(8);
    expect(utf8ByteLengthAtMost("abcdefghi", limit)).toBeNull();
    expect(utf8ByteLengthAtMost("😀😀a", limit)).toBeNull();
    expect(utf8ByteLengthAtMost("a".repeat(10_000), limit)).toBeNull();
  });

  it("admits a diff pair only when both sides fit, naming the rejected side", () => {
    const exact = "a".repeat(YAML_DOCUMENT_LIMIT_BYTES);
    const over = `${exact}a`;

    expect(admitDocumentPair("before\n", "after\n")).toEqual({
      accepted: true,
      original: "before\n",
      modified: "after\n",
    });

    const originalRejected = admitDocumentPair(over, "after\n");
    expect(originalRejected.accepted).toBe(false);
    if (originalRejected.accepted) {
      throw new Error("Expected the original side to be rejected.");
    }
    expect(originalRejected.message).toContain("original document was rejected");
    expect(originalRejected.message).toContain("65536-byte UTF-8 editor limit");

    const modifiedRejected = admitDocumentPair("before\n", over);
    expect(modifiedRejected.accepted).toBe(false);
    if (modifiedRejected.accepted) {
      throw new Error("Expected the modified side to be rejected.");
    }
    expect(modifiedRejected.message).toContain("modified document was rejected");
    expect(admDocumentPairRejectedHasNoText(modifiedRejected)).toBe(true);

    const bothRejected = admitDocumentPair(over, over);
    expect(bothRejected.accepted).toBe(false);
    if (bothRejected.accepted) {
      throw new Error("Expected both sides to be rejected.");
    }
    expect(bothRejected.message).toContain("original document was rejected");
  });

  it("uses one safe message for every rejected document", () => {
    expect(documentLimitMessage()).toBe(documentLimitMessage(YAML_DOCUMENT_LIMIT_BYTES));
    expect(documentLimitMessage(4)).toContain("4-byte");
  });
});
