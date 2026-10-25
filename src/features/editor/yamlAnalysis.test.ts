import { describe, expect, it } from "vitest";
import {
  analyzeYaml,
  isYamlWorkerRequest,
  isYamlWorkerResponse,
  YAML_DIAGNOSTIC_LIMIT,
  YAML_DOCUMENT_LIMIT_BYTES,
} from "./yamlAnalysis";

describe("YAML worker analysis", () => {
  it("produces a real parser diagnostic for the malformed synthetic sample", () => {
    const analysis = analyzeYaml(`release:\n  rollout:\n    batches: [1, 2, 3\n`);
    expect(analysis.diagnostics.length).toBeGreaterThan(0);
    const first = analysis.diagnostics[0];
    expect(first).toBeDefined();
    expect(first?.message).toMatch(/flow sequence|unexpected|expected/iu);
    expect(first?.line).toBeGreaterThanOrEqual(1);
    expect(first?.column).toBeGreaterThanOrEqual(1);
    expect(first?.endColumn).toBeGreaterThan(first?.column ?? 0);
  });

  it("clears the diagnostic when the same document is corrected", () => {
    const malformed = analyzeYaml(`release:\n  rollout:\n    batches: [1, 2, 3\n`);
    const corrected = analyzeYaml(`release:\n  rollout:\n    batches: [1, 2, 3]\n`);
    expect(malformed.diagnostics.length).toBeGreaterThan(0);
    expect(corrected.diagnostics).toEqual([]);
  });

  it("rejects a document above the byte limit without parsing it", () => {
    const analysis = analyzeYaml("a".repeat(YAML_DOCUMENT_LIMIT_BYTES + 1));
    expect(analysis.diagnostics).toHaveLength(1);
    expect(analysis.diagnostics[0]?.message).toMatch(/editor limit/u);
  });

  it("bounds the number of returned diagnostics", () => {
    const text = Array.from(
      { length: YAML_DIAGNOSTIC_LIMIT + 5 },
      (_, index) => `- [${index}`,
    ).join("\n");
    expect(analyzeYaml(text).diagnostics.length).toBeLessThanOrEqual(YAML_DIAGNOSTIC_LIMIT);
  });
});

describe("YAML worker message validation", () => {
  const validResponse = {
    requestId: 3,
    diagnostics: [{ message: "bad", line: 1, column: 1, endLine: 1, endColumn: 2 }],
  };

  it("accepts a complete bounded response", () => {
    expect(isYamlWorkerResponse(validResponse)).toBe(true);
  });

  it("rejects malformed, negative, and unbounded diagnostics", () => {
    expect(isYamlWorkerResponse({ requestId: 0, diagnostics: [] })).toBe(false);
    expect(isYamlWorkerResponse({ requestId: 1, diagnostics: "bad" })).toBe(false);
    expect(
      isYamlWorkerResponse({
        requestId: 1,
        diagnostics: [{ message: "", line: 1, column: 1, endLine: 1, endColumn: 2 }],
      }),
    ).toBe(false);
    expect(
      isYamlWorkerResponse({
        requestId: 1,
        diagnostics: [{ message: "bad", line: 0, column: 1, endLine: 1, endColumn: 2 }],
      }),
    ).toBe(false);
  });

  it("accepts only requests with a positive request id and text", () => {
    expect(isYamlWorkerRequest({ requestId: 1, text: "ok" })).toBe(true);
    expect(isYamlWorkerRequest({ requestId: -1, text: "ok" })).toBe(false);
    expect(isYamlWorkerRequest({ requestId: 1, text: 3 })).toBe(false);
    expect(isYamlWorkerRequest(null)).toBe(false);
  });
});
