import { execFileSync, spawnSync } from "node:child_process";
import process from "node:process";

const isWindows = process.platform === "win32";
const packageManager = isWindows ? "pnpm.cmd" : "pnpm";

function run(command: string, args: string[]): number {
  const result = spawnSync(command, args, {
    env: process.env,
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
  const useVirtualDisplay = process.platform === "linux" && process.env.DISPLAY === undefined;
  const webdriverCommand = useVirtualDisplay ? "xvfb-run" : packageManager;
  const webdriverArgs = useVirtualDisplay
    ? ["-a", packageManager, "exec", "wdio", "run", "wdio.native.conf.ts"]
    : ["exec", "wdio", "run", "wdio.native.conf.ts"];
  const webdriverStatus = run(webdriverCommand, webdriverArgs);
  const cleaned = await waitForHelperCount(initialHelperCount, 10_000);
  if (!cleaned) {
    process.stderr.write(
      "The native test left a helper process running after application shutdown.\n",
    );
    process.exitCode = 1;
  } else {
    process.stdout.write("No additional helper process remained after native app shutdown.\n");
    process.exitCode = webdriverStatus;
  }
}
