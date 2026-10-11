---
name: svelte-tooling
description: "Use the Svelte toolchain: svelte-check diagnostics, the sv CLI (create, add, check, migrate), and the official Svelte AI tools (MCP server, autofixer, skills). Extracted from the official Svelte CLI and AI documentation. Use when checking Svelte code, changing Svelte build tooling, or looking up Svelte documentation from a terminal."
---

# Svelte tooling

Reference distilled from the Svelte CLI and Svelte AI documentation linked from [svelte.dev/llms.txt](https://svelte.dev/llms.txt). This project's commands and pins are defined in [package.json](../../../package.json) and [quality.md](../../../docs/quality.md); they take precedence over the generic commands below.

## `svelte-check`

`svelte-check` reports, for the whole project, TypeScript errors in `.svelte` scripts and templates and in `.ts` files, Svelte compiler errors and warnings (including accessibility warnings), and unused CSS. The Vite build performs none of these checks. It needs the whole project because a renamed prop is an error at every usage site, so there is no changed-files mode.

| Option | Effect |
| --- | --- |
| `--tsconfig <path>` | Check the files that config includes, and also report errors from `.ts`/`.js` files. |
| `--no-tsconfig` | Check only Svelte files below the workspace; use `--ignore "dist,build"` with it. |
| `--fail-on-warnings` | Exit non-zero on warnings as well as errors. |
| `--compiler-warnings "code:ignore,code:error"` | Change the severity of specific compiler warning codes. |
| `--diagnostic-sources "js,svelte,css"` | Limit which sources run. |
| `--threshold error` | Report errors only. |
| `--output machine` or `machine-verbose` | One record per line for CI; the run ends with a `COMPLETED ... ERRORS ... WARNINGS` summary. |
| `--tsgo` | Type-check with TypeScript's native implementation. Transpiled Svelte files are written to `.svelte-check/` (or `.svelte-kit/`); ignore that directory in version control, linters, and formatters. |
| `--watch` | Keep running and re-check on change. |

`svelte-check` loads `typescript` through its JavaScript API and supports TypeScript 5 and 6. With TypeScript 7 it requires `--tsgo` and both packages installed: `typescript` at 6 for the API and TypeScript 7 under the alias `@typescript/native`.

`sv check` runs the same tool when `svelte-check` is installed.

## The `sv` CLI

Run it without installing: `pnpm dlx sv <command>` (or `npx sv`). It downloads the current release, so review what it will change before running it in a repository that pins its dependencies.

| Command | Purpose |
| --- | --- |
| `sv create [path]` | Scaffold a SvelteKit project. `--template minimal\|demo\|library\|addon`, `--types ts\|jsdoc`, `--add <add-ons>`, `--no-install`. |
| `sv add [add-ons]` | Add functionality to an existing project and edit its configuration. Official add-ons: `ai-tools`, `better-auth`, `drizzle`, `enhanced-img`, `eslint`, `mdsvex`, `paraglide`, `playwright`, `prettier`, `storybook`, `sveltekit-adapter`, `tailwindcss`, `vitest`. Community add-ons are unreviewed third-party code. |
| `sv check` | Run `svelte-check`. |
| `sv migrate [migration]` | Apply a codemod: `sveltekit-3`, `app-state`, and the unmaintained legacy migrations `svelte-5`, `svelte-4`, `sveltekit-2`, `self-closing-tags`. Commit first and review the result; look for `@migration-task` comments. |

An add-on rewrites project files and installs unpinned dependencies. In a repository with pinned versions and its own lint and format stack, apply the equivalent change by hand instead of running `sv add eslint` or `sv add prettier`.

## Official AI tools

The Svelte team publishes tooling for coding agents in [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools).

- **MCP server.** Local: `npx -y @sveltejs/mcp` over stdio. Remote: `https://mcp.svelte.dev/mcp`. Tools: `list-sections` (documentation catalogue with use cases), `get-documentation` (full text of chosen sections), `svelte-autofixer` (static analysis of a component with suggested fixes), and `playground-link`.
- **CLI mode.** The same package runs single commands: `npx -y @sveltejs/mcp list-sections`, `get-documentation '$state,$derived'`, and `svelte-autofixer ./src/lib/Component.svelte [--svelte-version 4|5] [--async]`. Pass a file path instead of inline code, because shells expand `$`. The autofixer prints `issues`, `suggestions`, and whether another pass is needed.
- **Skills and subagent.** `svelte-code-writer` (how to call the CLI above), `svelte-core-bestpractices` (the guidance condensed in the [svelte](../svelte/SKILL.md) skill), and a `svelte-file-editor` subagent definition. They ship in plugins for Claude Code, Codex CLI, GitHub Copilot CLI, Cursor, and OpenCode.

These tools fetch and run an unpinned package and, in remote mode, send source code to an external service. They are optional aids, not project gates: use them only where running unpinned tooling is acceptable, and never as a substitute for `svelte-check`, the linter, or the tests.
