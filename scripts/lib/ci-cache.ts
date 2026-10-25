import { isRecord } from "./validation.ts";

/** Cache metadata only; cache contents are never downloaded by maintenance. */
export interface CiCache {
  readonly id: number;
  readonly key: string;
  readonly ref: string;
  readonly lastAccessedAt: string;
}

/** Validates a GitHub cache-list page before considering any deletion. */
export function parseCaches(payload: unknown): CiCache[] {
  if (!isRecord(payload) || !Array.isArray(payload.actions_caches)) {
    throw new Error("Expected an actions_caches list.");
  }
  const caches: unknown[] = payload.actions_caches;
  return caches.map((cache) => {
    if (
      !isRecord(cache) ||
      typeof cache.id !== "number" ||
      !Number.isSafeInteger(cache.id) ||
      cache.id < 1 ||
      typeof cache.key !== "string" ||
      typeof cache.ref !== "string" ||
      typeof cache.last_accessed_at !== "string" ||
      !Number.isFinite(Date.parse(cache.last_accessed_at))
    ) {
      throw new Error("Malformed cache metadata; refusing maintenance.");
    }
    return { id: cache.id, key: cache.key, ref: cache.ref, lastAccessedAt: cache.last_accessed_at };
  });
}

/** Reads active cache namespaces, excluding only this maintenance run itself. */
export function activeRunRefs(payload: unknown, maintenanceRunId: number | undefined): string[] {
  if (!isRecord(payload) || !Array.isArray(payload.workflow_runs)) {
    throw new Error("Expected workflow_runs.");
  }
  const refs: string[] = [];
  const runs: unknown[] = payload.workflow_runs;
  for (const run of runs) {
    if (
      !isRecord(run) ||
      typeof run.id !== "number" ||
      !Number.isSafeInteger(run.id) ||
      typeof run.head_branch !== "string" ||
      !Array.isArray(run.pull_requests)
    ) {
      throw new Error("Malformed active run; refusing maintenance.");
    }
    if (run.id === maintenanceRunId) {
      continue;
    }
    refs.push(`refs/heads/${run.head_branch}`);
    const pulls: unknown[] = run.pull_requests;
    for (const pull of pulls) {
      if (
        !isRecord(pull) ||
        typeof pull.number !== "number" ||
        !Number.isSafeInteger(pull.number) ||
        pull.number < 1
      ) {
        throw new Error("Malformed active pull request.");
      }
      refs.push(`refs/pull/${String(pull.number)}/merge`);
    }
  }
  return refs;
}

/**
 * Bounds Cargo cache growth to two recent entries per family/runner/ref.
 * Legacy entries are dropped only after a v2 entry for that runner/ref exists.
 * Explicitly retired probe refs may be removed; active refs are always exempt.
 * Unrecognised cache namespaces are not touched.
 */
export function cachesToDelete(
  caches: readonly CiCache[],
  activeRefs: ReadonlySet<string>,
  retiredRefs: ReadonlySet<string>,
): CiCache[] {
  const removals: CiCache[] = [];
  const groups = new Map<string, CiCache[]>();
  for (const cache of caches) {
    if (activeRefs.has(cache.ref)) {
      continue;
    }
    if (retiredRefs.has(cache.ref)) {
      removals.push(cache);
      continue;
    }
    const match =
      /^(cargo|native)-v([12])-(ubuntu-22\.04|macos-15-intel|macos-15|windows-2022)-/u.exec(
        cache.key,
      );
    if (match === null) {
      continue;
    }
    const [, family, version, runner] = match;
    const group = `${cache.ref}:${family}:${runner}`;
    if (version === "1") {
      if (
        caches.some(
          (candidate) =>
            candidate.ref === cache.ref &&
            candidate.key.startsWith(`${family ?? ""}-v2-${runner ?? ""}-`),
        )
      ) {
        removals.push(cache);
      }
      continue;
    }
    const entries = groups.get(group) ?? [];
    entries.push(cache);
    groups.set(group, entries);
  }
  for (const entries of groups.values()) {
    entries.sort(
      (a, b) => Date.parse(b.lastAccessedAt) - Date.parse(a.lastAccessedAt) || b.id - a.id,
    );
    removals.push(...entries.slice(2));
  }
  return removals;
}
