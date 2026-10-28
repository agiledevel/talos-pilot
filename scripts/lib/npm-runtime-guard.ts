import type { Plugin } from "vite";

import { assertNoExceptedRuntimeModules, requireNpmExceptionCurrent } from "./npm-advisory.ts";

/**
 * Mandatory production main/worker graph check for decision 0021. This is build
 * tooling only and is never imported into the renderer. Keep it registered in
 * both Vite plugin lists; reviewed config hashes also enforce that wiring.
 */
export function npmRuntimeGuard(): Plugin {
  return {
    name: "talos-npm-applicability-guard",
    apply: "build",
    generateBundle() {
      requireNpmExceptionCurrent();
      assertNoExceptedRuntimeModules(this.getModuleIds());
    },
  };
}
