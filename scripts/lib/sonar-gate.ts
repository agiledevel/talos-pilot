import { isRecord } from "./validation.ts";

/** A bounded projection of a GitHub App check; source identity remains explicit. */
export interface AppCheck {
  /** Monotonic GitHub check ID, used to choose the latest rerun. */
  id: number;
  /** Check name reported by the installed SonarCloud app. */
  name: string;
  /** GitHub App slug, independent of the user-controlled check name. */
  app: string;
  /** Commit actually analyzed by the app. */
  revision: string;
  /** GitHub execution state. */
  status: string;
  /** Terminal result; only success permits progress. */
  conclusion: string | null;
}

/** The gate never treats a missing, skipped, stale, or pending analysis as a pass. */
export type GateState =
  | { status: "pending" }
  | { status: "passed" }
  | { status: "failed"; reason: string };

/** Validates the GitHub check projection and rejects incomplete/malformed responses. */
export function parseChecks(value: unknown): AppCheck[] {
  if (!isRecord(value) || !Array.isArray(value.check_runs)) {
    throw new Error("GitHub returned an invalid check response.");
  }
  return value.check_runs.map((item: unknown) => {
    if (
      !isRecord(item) ||
      !isRecord(item.app) ||
      typeof item.id !== "number" ||
      !Number.isSafeInteger(item.id) ||
      item.id < 0 ||
      typeof item.name !== "string" ||
      typeof item.app.slug !== "string" ||
      typeof item.head_sha !== "string" ||
      !/^[a-f0-9]{40}$/.test(item.head_sha) ||
      typeof item.status !== "string" ||
      !["queued", "in_progress", "completed", "waiting", "requested", "pending"].includes(
        item.status,
      ) ||
      !(item.conclusion === null || typeof item.conclusion === "string")
    ) {
      throw new Error("GitHub returned an invalid check identity or result.");
    }
    return {
      id: item.id,
      name: item.name,
      app: item.app.slug,
      revision: item.head_sha,
      status: item.status,
      conclusion: item.conclusion,
    };
  });
}

/** Requires a successful latest check from the official app on the requested commit. */
export function evaluateGate(
  checks: readonly AppCheck[],
  revision: string,
  name: string,
): GateState {
  const matching = checks.filter(
    (check) =>
      check.revision === revision &&
      check.name === name &&
      ["sonarqubecloud", "sonarcloud"].includes(check.app),
  );
  const latest = matching.reduce<AppCheck | undefined>(
    (previous, check) => (previous === undefined || check.id > previous.id ? check : previous),
    undefined,
  );
  if (latest === undefined || latest.status !== "completed") return { status: "pending" };
  if (latest.conclusion === "success") return { status: "passed" };
  return {
    status: "failed",
    reason: `SonarCloud reported ${latest.conclusion ?? "no conclusion"}.`,
  };
}

/** Polls with an injected clock until success, failure, or the fixed deadline; errors propagate. */
export async function waitForGate(
  read: () => Promise<readonly AppCheck[]>,
  options: {
    revision: string;
    name: string;
    timeoutMs: number;
    intervalMs: number;
    now: () => number;
    wait: (milliseconds: number) => Promise<void>;
  },
): Promise<void> {
  if (options.timeoutMs <= 0 || options.intervalMs <= 0)
    throw new Error("Gate deadlines must be positive.");
  const deadline = options.now() + options.timeoutMs;
  while (options.now() < deadline) {
    const state = evaluateGate(await read(), options.revision, options.name);
    if (options.now() >= deadline) break;
    if (state.status === "passed") return;
    if (state.status === "failed") throw new Error(state.reason);
    await options.wait(Math.min(options.intervalMs, deadline - options.now()));
  }
  throw new Error(
    "SonarCloud did not report a successful analysis before the deadline. Check the app's repository binding and analysis method.",
  );
}
