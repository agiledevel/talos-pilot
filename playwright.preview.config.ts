import { defineConfig } from "@playwright/test";

/**
 * Diagnostic Playwright configuration that serves the production build through
 * `vite preview` instead of the development server.
 *
 * The required browser gate stays `pnpm test:e2e` against Vite development mode.
 * This configuration exists only to separate development-tooling effects
 * (dependency prebundling, HMR, Svelte development checks) from application
 * behavior when a browser flow fails, by running the identical instrumented
 * specs against the optimized bundle. It is not a packaging, CSP, offline or
 * native claim: it still runs Chromium with the scripted mock IPC transport, so
 * it cannot establish Tauri command registration, capability enforcement or the
 * installed WebView. Record its results as a diagnostic comparison, never as a
 * requirement pass.
 *
 * @example
 * ```sh
 * pnpm test:e2e:preview
 * ```
 */
export default defineConfig({
  testDir: "./tests/e2e",
  use: { baseURL: "http://127.0.0.1:1420", trace: "retain-on-failure" },
  webServer: {
    // `vite preview` serves `dist/`, so build first and keep the diagnostic port
    // identical to the development gate for a controlled comparison.
    command: "pnpm build && pnpm exec vite preview --host 127.0.0.1 --port 1420 --strictPort",
    url: "http://127.0.0.1:1420",
    reuseExistingServer: false,
  },
});
