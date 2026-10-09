import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

import {
  FOUNDATION_ADVISORIES,
  parseAuditReport,
  reviewAdvisoryBaseline,
  reviewBinarySymbols,
  reviewProcMacroDependents,
} from "./lib/advisories.ts";
import { isRecord } from "./lib/validation.ts";

const root = process.cwd();
const lockfile = join(root, "src-tauri", "Cargo.lock");
const manifest = join(root, "src-tauri", "Cargo.toml");
const isWindows = process.platform === "win32";
const executable = join(
  root,
  "src-tauri",
  "target",
  "release",
  isWindows ? "talos-pilot.exe" : "talos-pilot",
);

/** Runs a pinned cargo command, keeping the first failure line for the report. */
function cargo(args: readonly string[]): string {
  try {
    return execFileSync("cargo", [...args], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `cargo ${args.join(" ")} failed: ${detail.split("\n")[0] ?? detail}. Install the pinned cargo-audit 0.22.2 and build the release executable first.`,
      { cause: error },
    );
  }
}

function databaseField(report: unknown, field: string): string {
  if (!isRecord(report) || !isRecord(report.database)) {
    return "unknown";
  }
  const value: unknown = report.database[field];
  return typeof value === "string" || typeof value === "number" ? String(value) : "unknown";
}

const report = JSON.parse(cargo(["audit", "--json", "--file", lockfile])) as unknown;
const findings = parseAuditReport(report);
console.log(
  `cargo-audit reported ${findings.length} advisory result(s) from database ${databaseField(report, "last-commit")} (${databaseField(report, "advisory-count")} entries).`,
);

const failures: string[] = [...reviewAdvisoryBaseline(findings)];

for (const expectation of FOUNDATION_ADVISORIES) {
  if (!expectation.procMacroOnly) {
    continue;
  }
  const reverseTree = cargo([
    "tree",
    "--manifest-path",
    manifest,
    "--locked",
    "-i",
    `${expectation.crate}@${expectation.version}`,
    "-e",
    "normal",
  ]);
  failures.push(...reviewProcMacroDependents(reverseTree, expectation));
}

if (process.platform === "linux") {
  if (!existsSync(executable)) {
    throw new Error(
      `The linked-executable scan needs ${executable}; run pnpm desktop:build first.`,
    );
  }
  let symbols: string;
  try {
    symbols = execFileSync("nm", ["-C", executable], {
      cwd: root,
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    });
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`nm could not read the release executable: ${detail.split("\n")[0] ?? detail}`);
  }
  if (symbols.trim().length === 0) {
    throw new Error(
      "nm returned no symbols, so the executable is stripped and cannot confirm the recorded applicability decision.",
    );
  }
  failures.push(...reviewBinarySymbols(symbols));
  console.log(
    `Scanned ${symbols.split("\n").length} demangled executable symbols against ${FOUNDATION_ADVISORIES.length} recorded advisories.`,
  );
} else {
  console.log(
    "Executable symbol scan covers the Linux ELF artifact only; the Linux CI job runs it, so this platform's result is unexecuted rather than a pass.",
  );
}

if (failures.length > 0) {
  for (const failure of failures) {
    process.stderr.write(`${failure}\n`);
  }
  process.stderr.write(
    "The recorded advisory baseline no longer matches reality; revise the dependency path or docs/decisions/0006-gtk3-advisory-applicability.md deliberately.\n",
  );
  process.exitCode = 1;
} else {
  for (const expectation of FOUNDATION_ADVISORIES) {
    console.log(`${expectation.id}: ${expectation.rationale}`);
  }
  console.log(
    "Recorded advisories still match the scanner report, dependency path, and linked executable.",
  );
}
