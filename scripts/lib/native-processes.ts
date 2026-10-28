import { execFileSync } from "node:child_process";

/** Process-list executor boundary, injectable without launching a native app. */
export type ProcessListCommand = (
  command: string,
  args: readonly string[],
  options: { readonly encoding: "utf8"; readonly maxBuffer: number; readonly timeout: number },
) => string;

/** Busy development hosts can exceed Node's default 1 MiB process-list buffer. */
export const PROCESS_LIST_MAX_BYTES = 8 * 1024 * 1024;

const execute: ProcessListCommand = (command, args, options) =>
  execFileSync(command, [...args], options);

/**
 * Counts actual Talos Pilot helper rows for native cleanup verification. Uses
 * the same strict process-name matching on each OS and a bounded 8 MiB / 5 s capture.
 * Process arguments are inspected only in memory, never logged. Exceptions
 * preserve only a safe OS error code, not child stdout/stderr/cause objects,
 * because unrelated process arguments can contain credentials.
 * @throws When process inspection fails or exceeds the explicit buffer bound.
 */
export function helperProcessCount(windows = process.platform === "win32", run = execute): number {
  try {
    const output = run(
      windows ? "tasklist" : "ps",
      windows
        ? ["/FI", "IMAGENAME eq talos-pilot-helper.exe", "/FO", "CSV", "/NH"]
        : ["-A", "-o", "args="],
      { encoding: "utf8", maxBuffer: PROCESS_LIST_MAX_BYTES, timeout: 5_000 },
    );
    return output
      .split(/\r?\n/u)
      .filter((line) =>
        windows
          ? line.startsWith('"talos-pilot-helper.exe"')
          : /(?:^|\/)talos-pilot-helper(?:\s|$)/u.test(line.trim()),
      ).length;
  } catch (error) {
    const code =
      error instanceof Error &&
      "code" in error &&
      typeof error.code === "string" &&
      /^[A-Z0-9_]{1,32}$/u.test(error.code)
        ? error.code
        : "command failed";
    throw new Error(`Could not inspect helper process cleanup after the native test (${code}).`);
  }
}
