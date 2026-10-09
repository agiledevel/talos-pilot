import { isRecord } from "./validation.ts";

/** One cargo-audit result reduced to the fields this repository gates on. */
export interface AdvisoryFinding {
  readonly id: string;
  readonly crate: string;
  readonly version: string;
  readonly kind: string;
}

/** A recorded advisory with the evidence that keeps the record true. */
export interface AdvisoryExpectation {
  readonly id: string;
  readonly crate: string;
  readonly version: string;
  readonly kind: string;
  /**
   * Substrings that must stay absent from the linked executable's demangled
   * symbols. An empty entry means the record relies only on the dependency
   * path, which the caller must still confirm separately.
   */
  readonly forbiddenSymbols: readonly string[];
  /** Requires every reverse dependency to be a compile-time proc-macro crate. */
  readonly procMacroOnly: boolean;
  readonly rationale: string;
}

/**
 * Accepted foundation advisories with no compatible remediation. Any change to
 * this set is a deliberate contract revision, so an unlisted finding, a drifted
 * version, or a resolved entry all fail the gate. See
 * `docs/decisions/0006-gtk3-advisory-applicability.md`.
 */
export const FOUNDATION_ADVISORIES: readonly AdvisoryExpectation[] = [
  {
    id: "RUSTSEC-2024-0370",
    crate: "proc-macro-error",
    version: "1.0.4",
    kind: "unmaintained",
    forbiddenSymbols: ["proc_macro_error"],
    procMacroOnly: true,
    rationale:
      "Compile-time-only dependency of glib-macros, pinned by Tauri's GTK3 stack; no patched release exists.",
  },
  {
    id: "RUSTSEC-2024-0429",
    crate: "glib",
    version: "0.18.5",
    kind: "unsound",
    forbiddenSymbols: ["VariantStrIter"],
    procMacroOnly: false,
    rationale:
      "Affected only in glib::VariantStrIter iterator methods, which are not linked into the executable; the patched 0.20 line is incompatible with the gtk 0.18 bindings Tauri 2.12.1 requires.",
  },
];

/** Extracts the gated fields from a `cargo audit --json` report. */
export function parseAuditReport(value: unknown): readonly AdvisoryFinding[] {
  if (!isRecord(value) || !isRecord(value.vulnerabilities)) {
    throw new Error("Unexpected cargo-audit report shape.");
  }
  const findings: AdvisoryFinding[] = [];
  const collect = (entry: unknown, section: string): void => {
    if (!isRecord(entry) || !isRecord(entry.package) || !isRecord(entry.advisory)) {
      throw new Error(`Unexpected ${section} advisory shape.`);
    }
    const crate = entry.package.name;
    const version = entry.package.version;
    const id = entry.advisory.id;
    if (typeof crate !== "string" || typeof version !== "string" || typeof id !== "string") {
      throw new Error(`Unexpected ${section} advisory identity.`);
    }
    findings.push({
      id,
      crate,
      version,
      kind: typeof entry.kind === "string" ? entry.kind : section,
    });
  };

  for (const section of [value.vulnerabilities, value.warnings]) {
    if (!isRecord(section)) {
      throw new Error("Unexpected cargo-audit report section.");
    }
    for (const [kind, entries] of Object.entries(section)) {
      if (kind === "found" || kind === "count") {
        continue;
      }
      if (!Array.isArray(entries)) {
        throw new Error(`Unexpected cargo-audit ${kind} list.`);
      }
      for (const entry of entries) {
        collect(entry, kind);
      }
    }
  }
  return findings;
}

/** Compares scanner findings against the recorded baseline. */
export function reviewAdvisoryBaseline(
  actual: readonly AdvisoryFinding[],
  expected: readonly AdvisoryExpectation[] = FOUNDATION_ADVISORIES,
): readonly string[] {
  const failures: string[] = [];
  const actualIds = new Set(actual.map((finding) => finding.id));

  for (const finding of actual) {
    const recorded = expected.find((entry) => entry.id === finding.id);
    if (recorded === undefined) {
      failures.push(
        `Unrecorded advisory ${finding.id} in ${finding.crate} ${finding.version} (${finding.kind}).`,
      );
      continue;
    }
    if (
      recorded.crate !== finding.crate ||
      recorded.version !== finding.version ||
      recorded.kind !== finding.kind
    ) {
      failures.push(
        `Advisory ${finding.id} drifted to ${finding.crate} ${finding.version} (${finding.kind}); the record expects ${recorded.crate} ${recorded.version} (${recorded.kind}).`,
      );
    }
  }
  for (const entry of expected) {
    if (!actualIds.has(entry.id)) {
      failures.push(
        `Recorded advisory ${entry.id} (${entry.crate} ${entry.version}) is no longer reported; revise the record deliberately.`,
      );
    }
  }
  return failures;
}

/**
 * Requires each direct reverse dependency of the recorded crate to be a
 * proc-macro, so an unmaintained macro helper cannot become linked runtime code.
 * Deeper tree levels are ancestors of those dependents, not dependents of the
 * recorded crate, so only depth-one entries are inspected.
 */
export function reviewProcMacroDependents(
  cargoTreeOutput: string,
  expectation: AdvisoryExpectation,
): readonly string[] {
  if (!expectation.procMacroOnly) {
    return [];
  }
  const dependents = cargoTreeOutput
    .split("\n")
    .map((line) => /^[├└]── (.*)$/u.exec(line)?.[1]?.trim())
    .filter((line): line is string => line !== undefined && line.length > 0);
  if (dependents.length === 0) {
    return [`No reverse dependency path was reported for ${expectation.crate}.`];
  }
  return dependents
    .filter((line) => !line.includes("(proc-macro)"))
    .map((line) => `${expectation.id} reaches runtime code through ${line}`);
}

/** Requires the advisory's affected symbols to stay absent from the binary. */
export function reviewBinarySymbols(
  demangledSymbols: string,
  expectations: readonly AdvisoryExpectation[] = FOUNDATION_ADVISORIES,
): readonly string[] {
  const failures: string[] = [];
  for (const expectation of expectations) {
    for (const symbol of expectation.forbiddenSymbols) {
      if (demangledSymbols.includes(symbol)) {
        failures.push(
          `${expectation.id} affected symbol ${symbol} is linked into the executable; the recorded applicability decision no longer holds.`,
        );
      }
    }
  }
  return failures;
}
