import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import { runNoticeCli } from "./lib/notices/cli.ts";

/**
 * CLI entry point for `pnpm notices:generate`, `pnpm notices:check` and
 * `pnpm notices:check-packaged -- <payload-root>`.
 *
 * The command decides its own exit status: a failure prints an actionable
 * message to standard error and exits 1, so a build or CI step fails instead of
 * continuing with stale legal material.
 */
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

try {
  const result = runNoticeCli(process.argv.slice(2), {
    log: (message) => {
      console.info(message);
    },
    root,
  });
  console.info(result.message);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`notices: ${message}\n`);
  process.exitCode = 1;
}
