import { isRecord } from "./validation.ts";

/** Owner-approved, build-only scope for decision 0021; never a patched-version claim. */
export const NPM_EXCEPTION = {
  advisory: "GHSA-gcqx-w48m-w2h4",
  dependency: "deepmerge",
  version: "4.3.1",
  plugin: "@sveltejs/vite-plugin-svelte",
  pluginVersion: "7.3.1",
  expires: "2026-11-11T00:00:00Z",
  path: ".>@sveltejs/vite-plugin-svelte>deepmerge",
} as const;

/** Reviewed config/lock hashes; any change requires re-review, not silent reuse. */
export const NPM_EXCEPTION_INPUTS: Readonly<Record<string, string>> = {
  "package.json": "f9aa95a56f8d5e32a548ad9cd7cc2527cff2f49a6a2a6a6162c30528a29774a4",
  "pnpm-lock.yaml": "0ab7f895fd8c559cb8febdcfd9b05ae16cec4fbf025df44e187e83845b9f5e12",
  "pnpm-workspace.yaml": "2f10d9589b1611269824c77b4eb1555ff3b2d92ab235b08549d83ec39e474d8d",
  ".npmrc": "cde76ca04e048c3eba070a2c0dfcf5b723cf6014eab177157096b924f24ec4ca",
  "svelte.config.js": "a457fa1bd3081e23284d0e32a141b61879f2f4039436ab56b22eb40816c113db",
  "vite.config.ts": "bb4972013060cb3ca4c5844c0d784d8accd8d5bbf3f043a5cd018283ad83ed1f",
  "vite.native-test.config.ts": "ec9ef75060388214ab511758612ad2518b994a4b3ef14bfcaac612ce377c769e",
};

function requireScope(condition: boolean, detail: string): asserts condition {
  if (!condition)
    throw new Error(`npm applicability exception refused: ${detail}; re-review decision 0021.`);
}

/** Fails at the UTC expiry instant, including invalid clocks. */
export function requireNpmExceptionCurrent(now = new Date()): void {
  requireScope(
    Number.isFinite(now.getTime()) && now.getTime() < Date.parse(NPM_EXCEPTION.expires),
    "expired or invalid clock",
  );
}

/**
 * Decodes bounded process output without attaching raw stdout/stderr to errors.
 * The active exception requires audit exit 1 (findings); other queries need exit 0.
 */
export function decodeNpmCommand(
  label: string,
  output: string,
  status: number | null,
  processFailed = false,
  audit = false,
): unknown {
  requireScope(!processFailed && status === (audit ? 1 : 0), `${label} command failed`);
  try {
    return JSON.parse(output) as unknown;
  } catch {
    throw new Error(`npm applicability exception refused: ${label} returned malformed JSON.`);
  }
}

/**
 * Validates the complete live audit and dependency placement against the only
 * owner-approved finding. Missing/stale findings, unknown errors and any extra
 * advisory/count/path fail closed. Actual renderer absence is independently
 * enforced by the mandatory Vite main/worker graph guard, not claimed here.
 */
export function assertNpmAdvisoryScope(
  audit: unknown,
  why: unknown,
  production: unknown,
  hashes: Readonly<Record<string, string>>,
  now = new Date(),
): void {
  requireNpmExceptionCurrent(now);
  requireScope(
    Object.keys(hashes).length === Object.keys(NPM_EXCEPTION_INPUTS).length &&
      Object.entries(NPM_EXCEPTION_INPUTS).every(([path, hash]) => hashes[path] === hash),
    "reviewed build/audit inputs changed",
  );
  requireScope(
    isRecord(audit) &&
      Object.keys(audit).length === 2 &&
      isRecord(audit.advisories) &&
      isRecord(audit.metadata),
    "invalid audit report or registry error",
  );
  const advisories = Object.values(audit.advisories);
  requireScope(advisories.length === 1, "unexpected or disappearing advisories");
  const item = advisories[0];
  requireScope(
    isRecord(item) &&
      item.github_advisory_id === NPM_EXCEPTION.advisory &&
      item.module_name === NPM_EXCEPTION.dependency &&
      item.severity === "low" &&
      item.vulnerable_versions === ">=4.2.0 <=4.3.1" &&
      item.patched_versions === null &&
      item.patched_versions_unpublished === true,
    "advisory identity/severity/remediation changed",
  );
  requireScope(Array.isArray(item.findings) && item.findings.length === 1, "unexpected findings");
  const finding: unknown = item.findings[0];
  requireScope(
    isRecord(finding) &&
      finding.version === NPM_EXCEPTION.version &&
      finding.dev === true &&
      finding.optional === false &&
      finding.bundled === false &&
      Array.isArray(finding.paths) &&
      finding.paths.length === 1 &&
      finding.paths[0] === NPM_EXCEPTION.path,
    "finding version or dependency path changed",
  );
  const counts = audit.metadata.vulnerabilities;
  requireScope(
    isRecord(counts) &&
      Object.keys(counts).length === 5 &&
      ["info", "moderate", "high", "critical"].every((key) => counts[key] === 0) &&
      counts.low === 1,
    "unapproved vulnerability counts",
  );
  requireScope(Array.isArray(why) && why.length === 1, "dependency placement changed");
  const dependency: unknown = why[0];
  requireScope(
    isRecord(dependency) &&
      dependency.name === NPM_EXCEPTION.dependency &&
      dependency.version === NPM_EXCEPTION.version &&
      Array.isArray(dependency.dependents) &&
      dependency.dependents.length === 1,
    "dependency identity or consumers changed",
  );
  const plugin: unknown = dependency.dependents[0];
  requireScope(
    isRecord(plugin) &&
      plugin.name === NPM_EXCEPTION.plugin &&
      plugin.version === NPM_EXCEPTION.pluginVersion &&
      Array.isArray(plugin.dependents) &&
      plugin.dependents.length === 1,
    "plugin identity or consumers changed",
  );
  const root: unknown = plugin.dependents[0];
  requireScope(
    isRecord(root) && root.name === "talos-pilot" && root.depField === "devDependencies",
    "dependency is not dev-only",
  );
  requireScope(
    Array.isArray(production) && production.length === 1,
    "invalid production dependency report",
  );
  const prodRoot: unknown = production[0];
  requireScope(
    isRecord(prodRoot) &&
      prodRoot.name === "talos-pilot" &&
      prodRoot.private === true &&
      typeof prodRoot.version === "string" &&
      typeof prodRoot.path === "string" &&
      Object.keys(prodRoot).every((key) => ["name", "version", "path", "private"].includes(key)),
    "deepmerge entered the production dependency graph",
  );
}

/** Rejects the excepted package in actual renderer/worker module graphs, including Windows/proxy IDs. */
export function assertNoExceptedRuntimeModules(ids: Iterable<string>): void {
  for (const id of ids) {
    if (/\/node_modules\/deepmerge(?:\/|\?|$)/iu.test(id.replaceAll("\\", "/")))
      throw new Error(
        "Owner-excepted deepmerge must not enter renderer or worker modules (decision 0021).",
      );
  }
}
