import { resolve } from "node:path";

import type { Options } from "@wdio/types";
import type { TauriCapabilities } from "@wdio/tauri-service";

const executableName = process.platform === "win32" ? "talos-pilot.exe" : "talos-pilot";
const application = resolve("src-tauri/target/release", executableName);
const capabilities: TauriCapabilities[] = [
  {
    browserName: "tauri",
    "tauri:options": { application },
  },
];

export const config = {
  runner: "local",
  specs: ["./tests/native/**/*.spec.ts"],
  maxInstances: 1,
  logLevel: "warn",
  capabilities,
  services: [
    [
      "@wdio/tauri-service",
      {
        appBinaryPath: application,
        driverProvider: "embedded",
        captureBackendLogs: false,
        captureFrontendLogs: false,
      },
    ],
  ],
  framework: "mocha",
  reporters: ["spec"],
  mochaOpts: {
    timeout: 30_000,
  },
} satisfies Options.Testrunner & { capabilities: TauriCapabilities[] };
