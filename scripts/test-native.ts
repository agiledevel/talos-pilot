import { execFileSync, spawn, spawnSync } from "node:child_process";
import type { ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const isWindows = process.platform === "win32";
const packageManager = isWindows ? "pnpm.cmd" : "pnpm";
const syntheticServerName = isWindows
  ? "kubernetes-synthetic-apiserver.exe"
  : "kubernetes-synthetic-apiserver";
const syntheticServer = resolve("src-tauri/target/release/examples", syntheticServerName);
/** Bound on the synthetic endpoint's startup, so a stuck build cannot hang the suite. */
const SYNTHETIC_READY_TIMEOUT_MS = 30_000;

function run(command: string, args: string[], env = process.env): number {
  const result = spawnSync(command, args, {
    env,
    shell: isWindows,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    process.stderr.write(`Could not start the native test command: ${result.error.message}\n`);
    return 1;
  }
  return result.status ?? 1;
}

function helperProcessCount(): number {
  try {
    const output = isWindows
      ? execFileSync(
          "tasklist",
          ["/FI", "IMAGENAME eq talos-pilot-helper.exe", "/FO", "CSV", "/NH"],
          {
            encoding: "utf8",
          },
        )
      : execFileSync("ps", ["-A", "-o", "args="], { encoding: "utf8" });
    return output
      .split(/\r?\n/u)
      .filter((line) =>
        isWindows
          ? line.startsWith('"talos-pilot-helper.exe"')
          : /(?:^|\/)talos-pilot-helper(?:\s|$)/u.test(line.trim()),
      ).length;
  } catch {
    throw new Error("Could not inspect helper process cleanup after the native test.");
  }
}

async function waitForHelperCount(expected: number, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (helperProcessCount() === expected) {
      return true;
    }
    await new Promise<void>((resolve) => setTimeout(resolve, 100));
  }
  return helperProcessCount() === expected;
}

/**
 * Starts the synthetic Kubernetes API server the native suite reads from.
 *
 * The server generates its own certificate authority and token for this run and
 * writes a synthetic kubeconfig into an isolated temporary directory. The
 * directory path reaches the application as test-only configuration, so no
 * credential, token, or kubeconfig crosses application IPC.
 *
 * @returns the temporary directory and the owned process, or null when the
 * example is missing so the caller can fail the run explicitly.
 */
async function startSyntheticApiserver(): Promise<{
  directory: string;
  child: ChildProcess;
} | null> {
  const directory = mkdtempSync(join(tmpdir(), "talos-pilot-native-kubernetes-"));
  const child = spawn(syntheticServer, ["--dir", directory], {
    stdio: ["ignore", "pipe", "inherit"],
  });
  const ready = new Promise<boolean>((resolveReady) => {
    let output = "";
    const timer = setTimeout(() => resolveReady(false), SYNTHETIC_READY_TIMEOUT_MS);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
      if (output.includes("READY ")) {
        clearTimeout(timer);
        resolveReady(true);
      }
    });
    child.once("error", () => {
      clearTimeout(timer);
      resolveReady(false);
    });
    child.once("exit", () => {
      clearTimeout(timer);
      resolveReady(false);
    });
  });
  const started = await ready;
  if (!started) {
    child.kill("SIGKILL");
    rmSync(directory, { recursive: true, force: true });
    return null;
  }
  return { directory, child };
}

/** Terminates the synthetic server and confirms the process actually exited. */
async function stopSyntheticApiserver(synthetic: {
  directory: string;
  child: ChildProcess;
}): Promise<boolean> {
  const { directory, child } = synthetic;
  child.kill("SIGTERM");
  const exited = await new Promise<boolean>((resolveExit) => {
    const timer = setTimeout(() => resolveExit(false), 10_000);
    child.once("exit", () => {
      clearTimeout(timer);
      resolveExit(true);
    });
  });
  if (!exited) {
    child.kill("SIGKILL");
  }
  rmSync(directory, { recursive: true, force: true });
  return exited || child.exitCode !== null || child.signalCode !== null;
}

const initialHelperCount = helperProcessCount();
const buildStatus = run(packageManager, [
  "tauri",
  "build",
  "--config",
  "src-tauri/tauri.native-test.conf.json",
  "--features",
  "native-test",
  "--no-bundle",
  "--",
  "--locked",
]);
if (buildStatus !== 0) {
  process.exitCode = buildStatus;
} else {
  const exampleStatus = run("cargo", [
    "build",
    "--locked",
    "--release",
    "--manifest-path",
    "src-tauri/Cargo.toml",
    "--features",
    "native-test",
    "--example",
    "kubernetes-synthetic-apiserver",
  ]);
  if (exampleStatus !== 0) {
    process.exitCode = exampleStatus;
  } else {
    const synthetic = await startSyntheticApiserver();
    if (synthetic === null) {
      process.stderr.write(
        `The synthetic Kubernetes endpoint did not start from ${syntheticServer}; the native Kubernetes suite cannot run.\n`,
      );
      process.exitCode = 1;
    } else {
      const useVirtualDisplay = process.platform === "linux" && process.env.DISPLAY === undefined;
      const webdriverCommand = useVirtualDisplay ? "xvfb-run" : packageManager;
      const webdriverArgs = useVirtualDisplay
        ? ["-a", packageManager, "exec", "wdio", "run", "wdio.native.conf.ts"]
        : ["exec", "wdio", "run", "wdio.native.conf.ts"];
      const webdriverStatus = run(webdriverCommand, webdriverArgs, {
        ...process.env,
        TALOS_PILOT_NATIVE_TEST_KUBERNETES_DIR: synthetic.directory,
      });
      const endpointStopped = await stopSyntheticApiserver(synthetic);
      if (!endpointStopped) {
        process.stderr.write("The synthetic Kubernetes endpoint did not exit.\n");
      }
      const cleaned = await waitForHelperCount(initialHelperCount, 10_000);
      if (!cleaned) {
        process.stderr.write(
          "The native test left a helper process running after application shutdown.\n",
        );
        process.exitCode = 1;
      } else if (!endpointStopped) {
        process.exitCode = 1;
      } else {
        process.stdout.write(
          "No helper process or synthetic endpoint remained after the native suite.\n",
        );
        process.exitCode = webdriverStatus;
      }
    }
  }
}
