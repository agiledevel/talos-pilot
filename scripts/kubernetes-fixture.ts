import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import {
  parseKubernetesFixtureArguments,
  parseKubernetesFixtureManifest,
} from "./lib/kubernetes-fixture.ts";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Runs the allowlisted real Kubernetes fixture test with file references only. */
function main(): void {
  const args = parseKubernetesFixtureArguments(process.argv, repositoryRoot, process.env);
  const rawManifest: unknown = JSON.parse(readFileSync(args.manifestPath, "utf8"));
  const manifest = parseKubernetesFixtureManifest(rawManifest);

  process.stdout.write(
    `Kubernetes fixture ${manifest.fixtureId}: expected ${manifest.kubernetes.expectedServerVersion} at ${manifest.kubernetes.endpoint}; validating identity before requests.\n`,
  );
  const childEnvironment = { ...process.env };
  delete childEnvironment.KUBECONFIG;
  const result = spawnSync(
    "cargo",
    [
      "test",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--locked",
      "--features",
      "native-test",
      "--test",
      "kubernetes_fixture",
      "--",
      "--ignored",
      "--nocapture",
    ],
    {
      cwd: repositoryRoot,
      env: {
        ...childEnvironment,
        TALOS_PILOT_KUBERNETES_FIXTURE_MANIFEST: args.manifestPath,
        TALOS_PILOT_KUBERNETES_FIXTURE_ADMIN_KUBECONFIG: args.adminKubeconfigPath,
      },
      stdio: "inherit",
      shell: false,
    },
  );
  if (result.error !== undefined) {
    throw new Error(`Could not start the Kubernetes fixture test: ${result.error.message}`);
  }
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
  }
}

try {
  main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : "unknown validation failure";
  process.stderr.write(`Kubernetes fixture stopped: ${message}\n`);
  process.exitCode = 1;
}
