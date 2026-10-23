import { execFileSync } from "node:child_process";
import process from "node:process";
import { activeRunRefs, cachesToDelete, parseCaches } from "./lib/ci-cache.ts";

const repository = process.env.GITHUB_REPOSITORY;
if (repository === undefined || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/u.test(repository)) {
  throw new Error("Set GITHUB_REPOSITORY to owner/repository.");
}
const args = process.argv.slice(2);
if (args.some((arg) => arg !== "--apply" && arg !== "--retire-probes")) {
  throw new Error("Usage: ci-cache-maintenance.ts [--apply] [--retire-probes]");
}

function api(path: string, remove = false): unknown {
  const text = execFileSync(
    "gh",
    [
      "api",
      ...(remove ? ["--method", "DELETE"] : ["--paginate", "--slurp"]),
      `repos/${repository ?? ""}${path}`,
    ],
    {
      encoding: "utf8",
      timeout: 60_000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );
  return remove ? undefined : (JSON.parse(text) as unknown);
}

const pages = api("/actions/caches?per_page=100");
if (!Array.isArray(pages)) {
  throw new Error("Expected cache pages.");
}
const cachePages: unknown[] = pages;
const caches = cachePages.flatMap(parseCaches);
const activeRefs = new Set<string>();
// Preserve both a PR's head ref and its merge-ref cache namespace. Any unreadable
// status page aborts before deletion. Never run PR code or download artifacts.
for (const status of ["queued", "in_progress", "waiting", "pending", "requested"]) {
  const runPages = api(`/actions/runs?status=${status}&per_page=100`);
  if (!Array.isArray(runPages)) {
    throw new Error("Expected workflow run pages.");
  }
  const values: unknown[] = runPages;
  for (const page of values) {
    for (const ref of activeRunRefs(
      page,
      process.env.GITHUB_RUN_ID === undefined ? undefined : Number(process.env.GITHUB_RUN_ID),
    )) {
      activeRefs.add(ref);
    }
  }
}
const retiredRefs = new Set(
  args.includes("--retire-probes")
    ? ["refs/heads/a2-native-probe", "refs/heads/a2-defect-probe"]
    : [],
);
const removals = cachesToDelete(caches, activeRefs, retiredRefs);
if (removals.length > 50) {
  throw new Error("More than 50 deletions proposed; review the inventory manually.");
}
for (const cache of removals) {
  console.info(
    `${args.includes("--apply") ? "DELETE" : "DRY RUN"} ${String(cache.id)} ${cache.ref} ${cache.key}`,
  );
  if (args.includes("--apply")) {
    api(`/actions/caches/${String(cache.id)}`, true);
  }
}
console.info(
  `${String(caches.length)} caches inspected; ${String(removals.length)} ${args.includes("--apply") ? "deleted" : "proposed"}.`,
);
