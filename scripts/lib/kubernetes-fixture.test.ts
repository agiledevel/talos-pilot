import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import { describe, expect, it } from "vitest";

import {
  parseKubernetesFixtureArguments,
  parseKubernetesFixtureManifest,
} from "./kubernetes-fixture";

const setupScope = [
  "get_named_namespace",
  "create_namespace",
  "create_service_account",
  "create_namespaced_role",
  "create_namespaced_role_binding",
  "create_201_named_pods",
  "request_service_account_token",
] as const;
const cleanupScope = [
  "delete_named_pods",
  "delete_namespaced_role_binding",
  "delete_namespaced_role",
  "delete_service_account",
  "delete_namespace_after_uid_match",
] as const;

function manifest(): Record<string, unknown> {
  return {
    schemaVersion: 1,
    fixtureId: "talos-pilot-c4-20261009",
    talosVersion: "v1.14.2",
    kubernetesVersion: "v1.36.5",
    contextName: "talos-pilot-c4-20261009",
    stateDir: "/tmp/tpc4/state",
    clusterCidr: "10.79.0.0/24",
    allowedNodes: ["10.79.0.2", "10.79.0.3", "10.79.0.4", "10.79.0.5"],
    kubernetes: {
      endpoint: "https://10.79.0.1:6443",
      expectedServerVersion: "v1.36.5",
      certificateAuthoritySha256: "a".repeat(64),
      contextName: "admin@talos-pilot-c4-20261009",
      namespace: "talos-pilot-list-probe",
      serviceAccount: "list-reader",
      role: "list-reader",
      roleBinding: "list-reader",
      podNamePrefix: "list-probe-",
      podCount: 201,
      setupScope,
      cleanupScope,
    },
    topology: { controlPlanes: 3, workers: 1 },
  };
}

describe("Kubernetes fixture manifest validation", () => {
  it("accepts only the checked fixture identity and bounded synthetic scope", () => {
    const parsed = parseKubernetesFixtureManifest(manifest());
    expect(parsed.fixtureId).toBe("talos-pilot-c4-20261009");
    expect(parsed.kubernetes.podCount).toBe(201);
    expect(parsed.kubernetes.setupScope).toEqual(setupScope);
  });

  it.each([
    ["fixture ID", (value: Record<string, unknown>) => (value.fixtureId = "owner-cluster")],
    ["server version", (value: Record<string, unknown>) => (value.kubernetesVersion = "v1.37.0")],
    [
      "endpoint",
      (value: Record<string, unknown>) => {
        (value.kubernetes as Record<string, unknown>).endpoint = "https://10.0.0.1:6443";
      },
    ],
    [
      "CA fingerprint",
      (value: Record<string, unknown>) => {
        (value.kubernetes as Record<string, unknown>).certificateAuthoritySha256 = "pending";
      },
    ],
    [
      "namespace",
      (value: Record<string, unknown>) => {
        (value.kubernetes as Record<string, unknown>).namespace = "default";
      },
    ],
    [
      "setup authority",
      (value: Record<string, unknown>) => {
        (value.kubernetes as Record<string, unknown>).setupScope = [...setupScope, "delete_nodes"];
      },
    ],
    [
      "cleanup authority",
      (value: Record<string, unknown>) => {
        (value.kubernetes as Record<string, unknown>).cleanupScope = ["delete_everything"];
      },
    ],
  ])("rejects a changed %s", (_name, mutate) => {
    const value = manifest();
    mutate(value);
    expect(() => parseKubernetesFixtureManifest(value)).toThrowError(/manifest/u);
  });
});

describe("Kubernetes fixture file references", () => {
  it("rejects ambient KUBECONFIG even when explicit file references are supplied", () => {
    const scratch = mkdtempSync(join(tmpdir(), "talos-pilot-kube-fixture-test-"));
    const repository = join(scratch, "repo");
    const fixtures = join(repository, "tests", "fixtures");
    const outside = join(scratch, "admin.yaml");
    try {
      mkdirSync(fixtures, { recursive: true });
      writeFileSync(join(fixtures, "talos-c4.json"), "{}");
      writeFileSync(outside, "external synthetic credential reference");
      expect(() =>
        parseKubernetesFixtureArguments(
          [
            "node",
            "script",
            "--manifest",
            join(fixtures, "talos-c4.json"),
            "--admin-kubeconfig",
            outside,
          ],
          repository,
          { KUBECONFIG: "/home/owner/.kube/config" },
        ),
      ).toThrow(/Unset KUBECONFIG/u);
    } finally {
      rmSync(scratch, { recursive: true, force: true });
    }
  });

  it("requires the external admin credential file and checked manifest", () => {
    const root = resolve(".");
    const credential = join(tmpdir(), `talos-pilot-admin-${String(process.pid)}.yaml`);
    writeFileSync(credential, "synthetic file reference");
    try {
      expect(() =>
        parseKubernetesFixtureArguments(
          [
            "node",
            "script",
            "--manifest",
            "tests/fixtures/talos-c4.json",
            "--admin-kubeconfig",
            credential,
          ],
          root,
          {},
        ),
      ).not.toThrow();
      expect(() =>
        parseKubernetesFixtureArguments(
          [
            "node",
            "script",
            "--manifest",
            "tests/fixtures/talos-c4.json",
            "--admin-kubeconfig",
            "tests/fixtures/talos-c4.json",
          ],
          root,
          {},
        ),
      ).toThrow(/outside this repository/u);
    } finally {
      rmSync(credential, { force: true });
    }
  });
});
