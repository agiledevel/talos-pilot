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
  // No `manualChunks` rule: forcing Monaco into a named chunk also captured the
  // Vite preload helper, which the entry imports, so the built document
  // preloaded the whole 2.7 MB editor before first use (F6-B12). Vite's default
  // dynamic-import chunking keeps that boundary, and `pnpm production:check`
  // fails if the shell document preloads or names a lazy chunk again.
  build: {
    target: ["es2022", "chrome111", "safari16.4"],
  },
});
