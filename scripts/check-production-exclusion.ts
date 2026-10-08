import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { createServer, Socket } from "node:net";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import process from "node:process";

const root = process.cwd();
const isWindows = process.platform === "win32";
const executableName = isWindows ? "talos-pilot.exe" : "talos-pilot";
const application = resolve(root, "src-tauri/target/release", executableName);
const forbiddenMarkers = [
  "TAURI_WEBDRIVER_PORT",
  "tauri-plugin-wdio",
  "wdio-webdriver",
  "plugin:wdio|execute",
  "window.wdioTauri",
  "__wdio_mocks__",
  "native-test-unauthorized",
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readJson(path: string): Record<string, unknown> {
  const value: unknown = JSON.parse(readFileSync(path, "utf8"));
  if (!isRecord(value)) {
    throw new Error(`Expected an object in ${path}.`);
  }
  return value;
}

function assertProductionConfig(): void {
  const config = readJson(resolve(root, "src-tauri/tauri.conf.json"));
  const app = config.app;
  if (!isRecord(app) || app.withGlobalTauri === true || !isRecord(app.security)) {
    throw new Error("Production Tauri config enables a test-only API surface.");
  }
  const windows = app.windows;
  if (
    !Array.isArray(windows) ||
    windows.length !== 1 ||
    !isRecord(windows[0]) ||
    windows[0].label !== "main"
  ) {
    throw new Error("Production Tauri config contains a test-only window.");
  }
  const capabilities = app.security.capabilities;
  if (!Array.isArray(capabilities) || capabilities.length !== 1 || capabilities[0] !== "main") {
    throw new Error("Production Tauri config references a non-production capability.");
  }

  const mainCapability = readJson(resolve(root, "src-tauri/capabilities/main.json"));
  if (!isProductionPermissions(mainCapability.permissions)) {
    throw new Error("The production main capability contains an unexpected permission.");
  }
}

const PRODUCTION_PERMISSIONS = [
  "allow-get-helper-status",
  "allow-get-appearance-settings",
  "allow-set-appearance-settings",
  "allow-get-credential-storage-status",
  "allow-use-session-only-storage",
  "allow-retry-persistent-storage",
  "allow-import-kubeconfig",
] as const;

function isProductionPermissions(value: unknown): value is typeof PRODUCTION_PERMISSIONS {
  return (
    Array.isArray(value) &&
    value.length === PRODUCTION_PERMISSIONS.length &&
    PRODUCTION_PERMISSIONS.every((permission, index) => value[index] === permission)
  );
}

function assertDefaultCargoGraph(): void {
  const tree = execFileSync(
    "cargo",
    [
      "tree",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--locked",
      "--no-default-features",
      "--edges",
      "normal",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (tree.includes("tauri-plugin-wdio")) {
    throw new Error("The default Cargo feature graph contains a WebDriver plugin.");
  }
  const testTree = execFileSync(
    "cargo",
    [
      "tree",
      "--manifest-path",
      "src-tauri/Cargo.toml",
      "--locked",
      "--features",
      "native-test",
      "--edges",
      "normal",
    ],
    { cwd: root, encoding: "utf8" },
  );
  if (
    !testTree.includes("tauri-plugin-wdio") ||
    !testTree.includes("tauri-plugin-wdio-webdriver")
  ) {
    throw new Error("The native-test feature does not include both WDIO plugins.");
  }
}

function assertAssetsExcludeTestCode(): void {
  const assets = resolve(root, "dist");
  const files = readdirSync(join(assets, "assets"));
  const content = files
    .filter((file) => file.endsWith(".js"))
    .map((file) => readFileSync(join(assets, "assets", file), "utf8"))
    .join("\n");
  if (forbiddenMarkers.some((marker) => content.includes(marker))) {
    throw new Error("The production renderer bundle contains native test code.");
  }
}

function assertExecutableExcludesTestCode(): void {
  const content = readFileSync(application).toString("latin1");
  if (forbiddenMarkers.some((marker) => content.includes(marker))) {
    throw new Error("The default native executable contains a test-only WebDriver marker.");
  }
}

async function availablePort(): Promise<number> {
  const server = createServer();
  return new Promise((resolvePort, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address === null || typeof address === "string") {
        server.close();
        reject(new Error("Could not allocate a loopback port for the runtime check."));
        return;
      }
      server.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolvePort(address.port);
      });
    });
  });
}

function connectToPort(port: number): Promise<boolean> {
  return new Promise((resolveConnection) => {
    const socket = new Socket();
    let settled = false;
    const finish = (connected: boolean): void => {
      if (!settled) {
        settled = true;
        socket.destroy();
        resolveConnection(connected);
      }
    };
    socket.setTimeout(250, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("error", () => finish(false));
    socket.connect(port, "127.0.0.1");
  });
}

function processAlive(applicationProcess: ReturnType<typeof spawn>): boolean {
  return (
    applicationProcess.pid !== undefined &&
    applicationProcess.exitCode === null &&
    applicationProcess.signalCode === null
  );
}

async function assertNoDriverListener(port: number): Promise<void> {
  const useVirtualDisplay = process.platform === "linux" && process.env.DISPLAY === undefined;
  const command = useVirtualDisplay ? "xvfb-run" : application;
  const args = useVirtualDisplay ? ["-a", application] : [];
  const isolatedHome = mkdtempSync(join(tmpdir(), "talos-pilot-production-check-"));
  const isolatedAppData = join(isolatedHome, "app-data");
  const applicationProcess = spawn(command, args, {
    detached: !isWindows,
    env: {
      ...process.env,
      TAURI_WEBDRIVER_PORT: String(port),
      XDG_DATA_HOME: isolatedAppData,
      XDG_CONFIG_HOME: join(isolatedHome, "config"),
      HOME: isolatedHome,
      APPDATA: join(isolatedHome, "roaming"),
      LOCALAPPDATA: join(isolatedHome, "local"),
    },
    stdio: "ignore",
  });
  const spawned = new Promise<void>((resolveSpawn, rejectSpawn) => {
    applicationProcess.once("spawn", () => resolveSpawn());
    applicationProcess.once("error", () =>
      rejectSpawn(new Error("Could not launch the production app.")),
    );
  });

  try {
    await spawned;
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (!processAlive(applicationProcess)) {
        throw new Error("The production app exited during the WebDriver exclusion check.");
      }
      if (await connectToPort(port)) {
        throw new Error("The production app exposed an embedded WebDriver listener.");
      }
      await new Promise<void>((resolveDelay) => setTimeout(resolveDelay, 100));
    }
  } finally {
    try {
      await terminateApplication(applicationProcess);
    } finally {
      rmSync(isolatedHome, { recursive: true, force: true });
    }
  }
}

async function terminateApplication(applicationProcess: ReturnType<typeof spawn>): Promise<void> {
  if (processAlive(applicationProcess)) {
    try {
      if (isWindows && applicationProcess.pid !== undefined) {
        execFileSync("taskkill", ["/PID", String(applicationProcess.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else if (applicationProcess.pid !== undefined) {
        process.kill(-applicationProcess.pid, "SIGTERM");
      }
    } catch {
      if (processAlive(applicationProcess)) {
        throw new Error("Could not stop the production app after the runtime check.");
      }
    }
  }

  if (!(await waitForExit(applicationProcess, 5_000))) {
    if (applicationProcess.pid !== undefined) {
      if (isWindows) {
        execFileSync("taskkill", ["/PID", String(applicationProcess.pid), "/T", "/F"], {
          stdio: "ignore",
        });
      } else {
        process.kill(-applicationProcess.pid, "SIGKILL");
      }
    }
    throw new Error("The production app did not exit after the runtime check.");
  }
}

function waitForExit(
  applicationProcess: ReturnType<typeof spawn>,
  timeoutMs: number,
): Promise<boolean> {
  if (!processAlive(applicationProcess)) {
    return Promise.resolve(true);
  }
  return new Promise((resolveExit) => {
    const timer = setTimeout(() => finish(false), timeoutMs);
    const finish = (exited: boolean): void => {
      clearTimeout(timer);
      resolveExit(exited);
    };
    applicationProcess.once("exit", () => finish(true));
  });
}

assertProductionConfig();
assertDefaultCargoGraph();
assertAssetsExcludeTestCode();
assertExecutableExcludesTestCode();
await assertNoDriverListener(await availablePort());
process.stdout.write(
  "Production artifacts exclude WebDriver, and runtime exposes no driver listener.\n",
);
