import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { build, mergeConfig } from "vite";
import { afterEach, describe, expect, it } from "vitest";

import baseConfig from "../../vite.config";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true });
});

/** Synthetic modules only: tests neither execute nor repackage the real vulnerable dependency. */
async function fixtureBuild(
  worker: boolean,
  forbidden: boolean,
  format = "module",
): Promise<unknown> {
  const root = mkdtempSync(join(tmpdir(), "talos-npm-runtime-guard-"));
  roots.push(root);
  mkdirSync(join(root, "node_modules/deepmerge"), { recursive: true });
  writeFileSync(
    join(root, "node_modules/deepmerge/package.json"),
    JSON.stringify({
      name: "deepmerge",
      version: "0.0.0-fixture",
      type: format,
      exports: "./index.js",
    }),
  );
  writeFileSync(
    join(root, "node_modules/deepmerge/index.js"),
    format === "module" ? "export const value = 1;" : "exports.value = 1;",
  );
  const source = forbidden
    ? 'import { value } from "deepmerge"; console.log(value);'
    : "console.log(1);";
  writeFileSync(
    join(root, "entry.js"),
    worker
      ? 'export const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });'
      : source,
  );
  writeFileSync(join(root, "worker.js"), source);
  // Exercise the actual production wiring, not a separately assembled plugin list.
  return build(
    mergeConfig(baseConfig, {
      configFile: false,
      root,
      logLevel: "silent",
      build: { write: false, lib: { entry: join(root, "entry.js"), formats: ["es"] } },
    }),
  );
}

describe("actual Vite main/worker graph enforcement", () => {
  it.each([
    [false, "module"],
    [true, "module"],
    [false, "commonjs"],
    [true, "commonjs"],
  ] as const)(
    "rejects a real synthetic package import (worker=%s, format=%s)",
    async (worker, format) => {
      await expect(fixtureBuild(worker, true, format)).rejects.toThrow(
        "must not enter renderer or worker",
      );
    },
  );
  it.each([false, true])("permits clean main and worker builds (worker=%s)", async (worker) => {
    await expect(fixtureBuild(worker, false)).resolves.toBeDefined();
  });
});
