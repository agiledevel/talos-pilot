import { describe, expect, it } from "vitest";
import type { AdvisoryExpectation } from "./advisories";
import {
  FOUNDATION_ADVISORIES,
  parseAuditReport,
  reviewAdvisoryBaseline,
  reviewBinarySymbols,
  reviewProcMacroDependents,
} from "./advisories";

const glib = {
  kind: "unsound",
  package: { name: "glib", version: "0.18.5" },
  advisory: { id: "RUSTSEC-2024-0429", title: "Unsoundness in VariantStrIter" },
};
const procMacroError = {
  kind: "unmaintained",
  package: { name: "proc-macro-error", version: "1.0.4" },
  advisory: { id: "RUSTSEC-2024-0370", title: "proc-macro-error is unmaintained" },
};

const recordedReport = {
  vulnerabilities: { found: false, count: 0, list: [] },
  warnings: { unsound: [glib], unmaintained: [procMacroError] },
};

describe("advisory baseline review", () => {
  it("reads both advisory sections from the scanner report", () => {
    expect(parseAuditReport(recordedReport)).toEqual([
      { id: "RUSTSEC-2024-0429", crate: "glib", version: "0.18.5", kind: "unsound" },
      {
        id: "RUSTSEC-2024-0370",
        crate: "proc-macro-error",
        version: "1.0.4",
        kind: "unmaintained",
      },
    ]);
  });

  it("fails on malformed, partial, or differently shaped scanner output", () => {
    expect(() => parseAuditReport(null)).toThrow("report shape");
    expect(() => parseAuditReport({ vulnerabilities: [] })).toThrow("report shape");
    expect(() =>
      parseAuditReport({ vulnerabilities: { list: [] }, warnings: { unsound: 4 } }),
    ).toThrow("unsound list");
    expect(() =>
      parseAuditReport({
        vulnerabilities: { list: [{ package: { name: "x" }, advisory: { id: "RUSTSEC-1" } }] },
      }),
    ).toThrow("list advisory identity");
    expect(() =>
      parseAuditReport({
        vulnerabilities: { list: ["not-an-advisory"] },
        warnings: {},
      }),
    ).toThrow("list advisory shape");
    expect(() =>
      parseAuditReport({
        vulnerabilities: { list: [] },
        warnings: null,
      }),
    ).toThrow("report section");
  });

  it("demands a deliberate revision when a recorded advisory disappears", () => {
    expect(
      reviewAdvisoryBaseline([
        {
          id: "RUSTSEC-2024-0429",
          crate: "glib",
          version: "0.18.5",
          kind: "unsound",
        },
      ]),
    ).toEqual([
      "Recorded advisory RUSTSEC-2024-0370 (proc-macro-error 1.0.4) is no longer reported; revise the record deliberately.",
    ]);
  });

  it("accepts exactly the recorded baseline", () => {
    expect(reviewAdvisoryBaseline(parseAuditReport(recordedReport))).toEqual([]);
  });

  it("rejects an unrecorded advisory instead of suppressing it", () => {
    const report = {
      vulnerabilities: {
        list: [
          {
            kind: "info",
            package: { name: "openssl", version: "0.10.0" },
            advisory: { id: "RUSTSEC-2099-0001" },
          },
        ],
      },
      warnings: { unsound: [glib], unmaintained: [procMacroError] },
    };
    expect(reviewAdvisoryBaseline(parseAuditReport(report))).toEqual([
      "Unrecorded advisory RUSTSEC-2099-0001 in openssl 0.10.0 (info).",
    ]);
  });

  it("rejects a recorded version drift and demands a deliberate revision", () => {
    const report = {
      vulnerabilities: { list: [] },
      warnings: {
        unsound: [
          {
            kind: "unsound",
            package: { name: "glib", version: "0.18.6" },
            advisory: { id: "RUSTSEC-2024-0429" },
          },
        ],
        unmaintained: [procMacroError],
      },
    };
    expect(reviewAdvisoryBaseline(parseAuditReport(report))).toEqual([
      "Advisory RUSTSEC-2024-0429 drifted to glib 0.18.6 (unsound); the record expects glib 0.18.5 (unsound).",
    ]);
  });

  it("flags affected symbols that appear in the linked executable", () => {
    const clean = "glib::variant::Variant\nsqlite3_open\ntalos_pilot::run";
    expect(reviewBinarySymbols(clean)).toEqual([]);
    expect(
      reviewBinarySymbols("core::iter::adapters::map<glib::VariantStrIter>").concat(
        reviewBinarySymbols("proc_macro_error::diagnostics"),
      ),
    ).toEqual([
      "RUSTSEC-2024-0429 affected symbol VariantStrIter is linked into the executable; the recorded applicability decision no longer holds.",
      "RUSTSEC-2024-0370 affected symbol proc_macro_error is linked into the executable; the recorded applicability decision no longer holds.",
    ]);
  });

  it("accepts a proc-macro-only path and rejects a runtime path", () => {
    const expectation = expectationFor("RUSTSEC-2024-0370");
    expect(
      reviewProcMacroDependents(
        "proc-macro-error v1.0.4\n├── glib-macros v0.18.5 (proc-macro)\n│   └── glib v0.18.5",
        expectation,
      ),
    ).toEqual([]);
    expect(
      reviewProcMacroDependents(
        "proc-macro-error v1.0.4\n├── some-runtime-crate v1.0.0\n│   └── glib v0.18.5",
        expectation,
      ),
    ).toEqual(["RUSTSEC-2024-0370 reaches runtime code through some-runtime-crate v1.0.0"]);
    expect(reviewProcMacroDependents("proc-macro-error v1.0.4", expectation)).toEqual([
      "No reverse dependency path was reported for proc-macro-error.",
    ]);
    expect(
      reviewProcMacroDependents(
        "glib v0.18.5\n├── atk v0.18.2",
        expectationFor("RUSTSEC-2024-0429"),
      ),
    ).toEqual([]);
  });
});

function expectationFor(id: string): AdvisoryExpectation {
  const entry = FOUNDATION_ADVISORIES.find((item) => item.id === id);
  if (entry === undefined) {
    throw new Error(`the advisory record has no ${id} entry`);
  }
  return entry;
}
