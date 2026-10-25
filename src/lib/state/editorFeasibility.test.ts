import { describe, expect, it } from "vitest";
import {
  CORRECTED_YAML_SAMPLE,
  EditorFeasibilityState,
  MALFORMED_YAML_SAMPLE,
  oversizeYamlSample,
} from "./editorFeasibility.svelte";
import { isWithinDocumentLimit } from "../../features/editor/documentBounds";

describe("editor feasibility documents", () => {
  it("replaces and resets the synthetic document without holding secrets", () => {
    const feasibility = new EditorFeasibilityState();
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    feasibility.correct();
    expect(feasibility.value).toBe(CORRECTED_YAML_SAMPLE);
    feasibility.reset();
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    expect(MALFORMED_YAML_SAMPLE).not.toBe(CORRECTED_YAML_SAMPLE);
  });

  it("builds a benign oversized draft that the byte guard rejects", () => {
    const oversize = oversizeYamlSample();
    expect(oversize.length).toBeGreaterThan(64 * 1024);
    expect(isWithinDocumentLimit(oversize)).toBe(false);
    expect(oversize).toContain("release:");
    expect(oversize).not.toMatch(/password|token|secret/iu);
  });

  it("keeps an accepted edit across a rejected attempt and close", () => {
    const feasibility = new EditorFeasibilityState();
    const edited = `${CORRECTED_YAML_SAMPLE}# accepted user edit\n`;
    feasibility.acceptEdit(edited);
    feasibility.oversize();
    expect(isWithinDocumentLimit(feasibility.readValue())).toBe(false);
    expect(feasibility.value).toBe(edited);

    feasibility.close();
    expect(feasibility.value).toBe(edited);
    expect(feasibility.readValue()).toBe(edited);
  });

  it("clears an oversized intent when a bounded sample or user edit is accepted", () => {
    const feasibility = new EditorFeasibilityState();
    feasibility.oversize();
    feasibility.reset();
    expect(feasibility.readValue()).toBe(MALFORMED_YAML_SAMPLE);
    feasibility.oversize();
    feasibility.correct();
    expect(feasibility.readValue()).toBe(CORRECTED_YAML_SAMPLE);
    feasibility.oversize();
    feasibility.acceptEdit("# bounded user edit\n");
    expect(feasibility.readValue()).toBe("# bounded user edit\n");
  });

  it("does not admit an oversized edit into the owner's accepted draft", () => {
    const feasibility = new EditorFeasibilityState();
    feasibility.acceptEdit(oversizeYamlSample());
    expect(feasibility.value).toBe(MALFORMED_YAML_SAMPLE);
    expect(feasibility.readValue()).toBe(MALFORMED_YAML_SAMPLE);
  });
});
