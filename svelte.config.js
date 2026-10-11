/**
 * Shared Svelte compiler configuration for Vite, Vitest, and svelte-check.
 *
 * Application components always compile in runes mode. Published packages keep
 * the mode inferred from their own source, so a dependency that still ships
 * legacy syntax is not broken by this project's choice.
 *
 * @type {import("@sveltejs/vite-plugin-svelte").SvelteConfig}
 */
const config = {
  compilerOptions: {
    runes: ({ filename }) => (filename.split(/[/\\]/u).includes("node_modules") ? undefined : true),
  },
};

export default config;
