import { svelte } from "@sveltejs/vite-plugin-svelte";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";

export default defineConfig({
  // Tailwind must run before Svelte so component styles can use its directives.
  plugins: [tailwindcss(), svelte()],
  clearScreen: false,
  // The worker-only import is invisible to the initial dependency crawl. If it
  // is discovered on first editor use, Vite re-optimizes and reloads every open
  // page, discarding drafts and menu focus. Prebundle it, but keep browser
  // loading behind the existing lazy editor boundary. This is dev-only.
  optimizeDeps: { include: ["monaco-editor/editor/editor.worker"] },
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: {
    target: ["es2022", "chrome111", "safari16.4"],
    rollupOptions: {
      output: {
        // Keep the lazy editor's third-party code in a named chunk so the
        // initial shell cannot accidentally absorb it and tests can observe
        // first-use loading by URL.
        manualChunks(id) {
          if (id.includes("node_modules/monaco-editor")) {
            return "editor-monaco";
          }
          return undefined;
        },
      },
    },
  },
});
