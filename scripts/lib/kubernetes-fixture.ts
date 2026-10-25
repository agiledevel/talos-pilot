import { realpathSync, statSync } from "node:fs";
import { isAbsolute, relative, resolve, sep } from "node:path";

import { isRecord } from "./validation.ts";

const FIXTURE_ID = "talos-pilot-c4-20261009";
const EXPECTED_VERSION = "v1.36.5";
const EXPECTED_ENDPOINT = "https://10.79.0.1:6443";
const MAX_CREDENTIAL_BYTES = 4 * 1024 * 1024;
const SETUP_SCOPE = [
  "get_named_namespace",
  "create_namespace",
  "create_service_account",
  "create_namespaced_role",
  "create_namespaced_role_binding",
  "create_201_named_pods",
  "request_service_account_token",
  "create_watch_probe_primary",
  "update_watch_probe_status",
  "delete_watch_probe_primary",
  "recreate_watch_probe_primary",
  "create_watch_probe_after_resume",
] as const;
const CLEANUP_SCOPE = [
  "delete_named_pods",
  "delete_named_watch_probe_pods",
  "delete_namespaced_role_binding",
  "delete_namespaced_role",
  "delete_service_account",
  "delete_namespace_after_uid_match",
] as const;

/** Checked identity and exact mutation scope for the one Kubernetes fixture. */
export interface KubernetesFixtureManifest {
  readonly schemaVersion: 1;
  readonly fixtureId: typeof FIXTURE_ID;
  readonly talosVersion: "v1.14.2";
  readonly kubernetesVersion: typeof EXPECTED_VERSION;
  readonly contextName: typeof FIXTURE_ID;
  readonly stateDir: "/tmp/tpc4/state";
  readonly clusterCidr: "10.79.0.0/24";
  readonly allowedNodes: readonly string[];
  readonly kubernetes: {
    readonly endpoint: typeof EXPECTED_ENDPOINT;
    readonly expectedServerVersion: typeof EXPECTED_VERSION;
    readonly certificateAuthoritySha256: string;
    readonly contextName: "admin@talos-pilot-c4-20261009";
    readonly namespace: "talos-pilot-list-probe";
    readonly serviceAccount: "list-reader";
    readonly role: "list-reader";
    readonly roleBinding: "list-reader";
    readonly podNamePrefix: "list-probe-";
    readonly podCount: 201;
    readonly setupScope: typeof SETUP_SCOPE;
    readonly cleanupScope: typeof CLEANUP_SCOPE;
  };
}

/** File references accepted by the Kubernetes fixture command. */
export interface KubernetesFixtureArguments {
  readonly manifestPath: string;
  readonly adminKubeconfigPath: string;
}

/**
 * Validates the fixture manifest against the reviewed fixture identity and
 * mutation scope. A manifest cannot expand the API endpoint, version, namespace,
 * resource names, or setup/cleanup authority.
 *
 * @param value Untrusted JSON parsed from the checked fixture manifest.
 * @throws {Error} When an identity, bound, or allowlisted action differs.
 */
export function parseKubernetesFixtureManifest(value: unknown): KubernetesFixtureManifest {
  if (
    !isRecord(value) ||
    value.schemaVersion !== 1 ||
    value.fixtureId !== FIXTURE_ID ||
    value.talosVersion !== "v1.14.2" ||
    value.kubernetesVersion !== EXPECTED_VERSION ||
    value.contextName !== FIXTURE_ID ||
    value.stateDir !== "/tmp/tpc4/state" ||
    value.clusterCidr !== "10.79.0.0/24" ||
    !isLiteralAddressList(value.allowedNodes)
  ) {
    throw new Error("The Kubernetes fixture manifest identity does not match the allowlist.");
  }

  const kube = value.kubernetes;
  if (
    !isRecord(kube) ||
    kube.endpoint !== EXPECTED_ENDPOINT ||
    kube.expectedServerVersion !== EXPECTED_VERSION ||
    !isFingerprint(kube.certificateAuthoritySha256) ||
    kube.contextName !== "admin@talos-pilot-c4-20261009" ||
    kube.namespace !== "talos-pilot-list-probe" ||
    kube.serviceAccount !== "list-reader" ||
    kube.role !== "list-reader" ||
    kube.roleBinding !== "list-reader" ||
    kube.podNamePrefix !== "list-probe-" ||
    kube.podCount !== 201 ||
    !isExactScope(kube.setupScope, SETUP_SCOPE) ||
    !isExactScope(kube.cleanupScope, CLEANUP_SCOPE)
  ) {
    throw new Error("The Kubernetes fixture manifest has an invalid endpoint, identity, or scope.");
  }

  return {
    schemaVersion: 1,
    fixtureId: FIXTURE_ID,
    talosVersion: "v1.14.2",
    kubernetesVersion: EXPECTED_VERSION,
    contextName: FIXTURE_ID,
    stateDir: "/tmp/tpc4/state",
    clusterCidr: "10.79.0.0/24",
    allowedNodes: value.allowedNodes,
    kubernetes: {
      endpoint: EXPECTED_ENDPOINT,
      expectedServerVersion: EXPECTED_VERSION,
      certificateAuthoritySha256: kube.certificateAuthoritySha256,
      contextName: "admin@talos-pilot-c4-20261009",
      namespace: "talos-pilot-list-probe",
      serviceAccount: "list-reader",
      role: "list-reader",
      roleBinding: "list-reader",
      podNamePrefix: "list-probe-",
      podCount: 201,
      setupScope: SETUP_SCOPE,
      cleanupScope: CLEANUP_SCOPE,
    },
  };
}

/**
 * Resolves the strict CLI contract and refuses ambient Kubernetes selection.
 *
 * @param argv Process arguments, including the script path.
 * @param repositoryRoot Absolute repository root.
 * @param environment Process environment, injected to make rejection testable.
 * @throws {Error} When arguments, paths, file sizes, or ambient context are unsafe.
 */
export function parseKubernetesFixtureArguments(
  argv: readonly string[],
  repositoryRoot: string,
  environment: NodeJS.ProcessEnv,
): KubernetesFixtureArguments {
  if (environment.KUBECONFIG !== undefined && environment.KUBECONFIG.length > 0) {
    throw new Error(
      "Unset KUBECONFIG; the fixture harness accepts explicit credential files only.",
    );
  }

  const options = new Map<string, string>();
  const args = argv.slice(argv.indexOf("--") >= 0 ? argv.indexOf("--") + 1 : 2);
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    const value = args[index + 1];
    if (
      (key !== "--manifest" && key !== "--admin-kubeconfig") ||
      value === undefined ||
      value.startsWith("--") ||
      options.has(key)
    ) {
      throw new Error("Use --manifest <checked-file> --admin-kubeconfig <external-file>.");
    }
    options.set(key, value);
    index += 1;
  }

  const root = realpathSync(repositoryRoot);
  const manifestPath = resolveFile(options.get("--manifest"), root, "--manifest");
  if (!isWithinRoot(root, manifestPath)) {
    throw new Error("--manifest must reference a checked file inside this repository.");
  }
  if (manifestPath !== resolve(root, "tests", "fixtures", "talos-c4.json")) {
    throw new Error("--manifest must reference tests/fixtures/talos-c4.json.");
  }
  const adminKubeconfigPath = resolveFile(
    options.get("--admin-kubeconfig"),
    root,
    "--admin-kubeconfig",
  );
  if (isWithinRoot(root, adminKubeconfigPath)) {
    throw new Error("--admin-kubeconfig must reference a file outside this repository.");
  }
  const credential = statSync(adminKubeconfigPath);
  if (!credential.isFile() || credential.size === 0 || credential.size > MAX_CREDENTIAL_BYTES) {
    throw new Error(
      `--admin-kubeconfig must be a regular file of at most ${MAX_CREDENTIAL_BYTES} bytes.`,
    );
  }

  return { manifestPath, adminKubeconfigPath };
}

function resolveFile(value: string | undefined, root: string, flag: string): string {
  if (value === undefined || value.length === 0) {
    throw new Error(`${flag} is required and must reference a file.`);
  }
  const candidate = isAbsolute(value) ? value : resolve(root, value);
  const path = realpathSync(candidate);
  if (!statSync(path).isFile()) {
    throw new Error(`${flag} must reference a regular file.`);
  }
  return path;
}

function isWithinRoot(root: string, path: string): boolean {
  const pathFromRoot = relative(root, path);
  return pathFromRoot === "" || (pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`));
}

function isLiteralAddressList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length === 4 &&
    value.every((item: unknown) => typeof item === "string" && /^10\.79\.0\.[2-5]$/u.test(item)) &&
    new Set(value).size === value.length
  );
}

function isFingerprint(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/u.test(value);
}

function isExactScope(value: unknown, expected: readonly string[]): boolean {
  return (
    Array.isArray(value) &&
    value.length === expected.length &&
    value.every((item: unknown, index: number) => item === expected[index])
  );
}
