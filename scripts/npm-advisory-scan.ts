import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  assertNpmAdvisoryScope,
  decodeNpmCommand,
  NPM_EXCEPTION,
  NPM_EXCEPTION_INPUTS,
  requireNpmExceptionCurrent,
} from "./lib/npm-advisory.ts";

const root = resolve(import.meta.dirname, "..");
const pnpm = process.env.npm_execpath;

function query(label: string, args: string[], audit = false): unknown {
  if (!pnpm) throw new Error("Invoke the npm applicability scan through pnpm audit:npm.");
  // Invoking pnpm 12's native binary avoids a Windows shell and owns the query
  // process on timeout; no shell child is left behind when the capture fails.
  const result = spawnSync(pnpm, args, {
    cwd: root,
    encoding: "utf8",
    timeout: 90_000,
    maxBuffer: 4 * 1024 * 1024,
  });
  // Child output can contain registry credentials on errors. Only the decoder's
  // fixed action/target message reaches stderr, never the raw child error/cause.
  return decodeNpmCommand(
    label,
    result.stdout ?? "",
    result.status,
    result.error !== undefined,
    audit,
  );
}

try {
  if (process.argv.length !== 2)
    throw new Error("Usage: pnpm audit:npm (no bypass or date options).");
  requireNpmExceptionCurrent();
  const hashes: Record<string, string> = {};
  for (const path of Object.keys(NPM_EXCEPTION_INPUTS)) {
    const file = join(root, path);
    const info = lstatSync(file);
    if (!info.isFile() || info.size > 1024 * 1024)
      throw new Error(`Cannot verify reviewed npm input ${path}.`);
    hashes[path] = createHash("sha256").update(readFileSync(file)).digest("hex");
  }
  const report = query("npm audit", ["audit", "--audit-level=low", "--json"], true);
  const why = query("dependency placement", ["why", "deepmerge", "--json"]);
  const production = query("production placement", [
    "list",
    "deepmerge",
    "--prod",
    "--json",
    "--depth",
    "Infinity",
  ]);
  assertNpmAdvisoryScope(report, why, production, hashes);
  console.info(
    `npm audit: only owner-approved build-only ${NPM_EXCEPTION.advisory} (${NPM_EXCEPTION.version} via plugin ${NPM_EXCEPTION.pluginVersion}); expires ${NPM_EXCEPTION.expires}. Main/worker graph guard remains mandatory.`,
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "npm applicability scan failed.");
  process.exitCode = 1;
}
