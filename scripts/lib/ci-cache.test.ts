import { describe, expect, it } from "vitest";
import { activeRunRefs, cachesToDelete, parseCaches } from "./ci-cache";
import type { CiCache } from "./ci-cache";

function cache(id: number, key: string, ref = "refs/pull/2/merge"): CiCache {
  return { id, key, ref, lastAccessedAt: `2026-10-${String(id).padStart(2, "0")}T12:00:00Z` };
}

describe("Cargo cache retention", () => {
  it("protects active PR/head refs without letting maintenance exempt all main caches", () => {
    const page = {
      workflow_runs: [
        { id: 9, head_branch: "main", pull_requests: [] },
        { id: 10, head_branch: "feature", pull_requests: [{ number: 2 }] },
      ],
    };
    expect(activeRunRefs(page, 9)).toEqual(["refs/heads/feature", "refs/pull/2/merge"]);
    expect(activeRunRefs(page, undefined)).toContain("refs/heads/main");
    expect(() =>
      activeRunRefs(
        { workflow_runs: [{ id: 1, head_branch: "x", pull_requests: [{ number: "2" }] }] },
        undefined,
      ),
    ).toThrow("Malformed active pull");
    expect(() => activeRunRefs({ workflow_runs: [null] }, undefined)).toThrow(
      "Malformed active run",
    );
  });
  it("retains two most recently accessed entries per runner, family and ref", () => {
    const caches = [
      cache(1, "cargo-v2-ubuntu-22.04-a"),
      cache(2, "cargo-v2-ubuntu-22.04-b"),
      cache(3, "cargo-v2-ubuntu-22.04-c"),
      cache(4, "native-v2-ubuntu-22.04-a"),
      cache(5, "cargo-v2-macos-15-a"),
      cache(6, "cargo-v2-ubuntu-22.04-a", "refs/heads/main"),
    ];
    expect(cachesToDelete(caches, new Set(), new Set()).map((entry) => entry.id)).toEqual([1]);
    expect(cachesToDelete(caches, new Set(["refs/pull/2/merge"]), new Set())).toEqual([]);
  });

  it("does not remove a legacy cache until that runner/ref has a replacement", () => {
    const old = cache(1, "cargo-v1-windows-2022-old");
    expect(cachesToDelete([old, cache(2, "cargo-v2-macos-15-new")], new Set(), new Set())).toEqual(
      [],
    );
    expect(
      cachesToDelete([old, cache(2, "cargo-v2-windows-2022-new")], new Set(), new Set()),
    ).toEqual([old]);
  });

  it("removes explicitly retired probe caches but never active refs or unrelated namespaces", () => {
    const probe = cache(1, "setup-go-old", "refs/heads/a2-native-probe");
    const regular = cache(2, "setup-go-old", "refs/heads/main");
    expect(cachesToDelete([probe, regular], new Set(), new Set([probe.ref]))).toEqual([probe]);
    expect(cachesToDelete([probe], new Set([probe.ref]), new Set([probe.ref]))).toEqual([]);
  });

  it("validates metadata before deletion planning", () => {
    expect(
      parseCaches({
        actions_caches: [
          {
            id: 1,
            key: "cargo-v2-x",
            ref: "refs/heads/main",
            last_accessed_at: "2026-10-22T12:00:00Z",
          },
        ],
      }),
    ).toHaveLength(1);
    expect(() => parseCaches({ actions_caches: [{ id: "1" }] })).toThrow("Malformed");
    expect(() =>
      parseCaches({
        actions_caches: [{ id: 1, key: "x", ref: "main", last_accessed_at: "not-a-date" }],
      }),
    ).toThrow("Malformed");
    expect(() => parseCaches({ message: "Not Found" })).toThrow("actions_caches");
  });
});
