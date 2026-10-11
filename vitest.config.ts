import { svelte } from "@sveltejs/vite-plugin-svelte";
import { svelteTesting } from "@testing-library/svelte/vite";
import { defineConfig } from "vitest/config";

export default defineConfig({
  // svelteTesting resolves Svelte's browser build under jsdom and unmounts
  // rendered components after each test.
  plugins: [svelte(), svelteTesting()],
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      include: [
        "src/components/**/*.svelte",
        "src/components/ui/menu.ts",
        "src/features/**/*.svelte",
        "src/lib/format/**/*.ts",
        "src/lib/state/**/*.svelte.ts",
        "src/lib/ipc/transport.ts",
        "src/lib/ipc/validation.ts",
        "scripts/lib/**/*.ts",
      ],
    },
  },
});
