# Talos Pilot

A Tauri desktop application in development for the full Talos Linux cluster lifecycle and Kubernetes management, targeting Linux, macOS, and Windows.

The application will use React and TypeScript with Ant Design in Tauri's WebView, a Rust application backend, and a bundled Go helper for Talos API and lifecycle workflows. Frontend development uses the Oxc stack: Oxlint for linting and type diagnostics, Oxfmt for formatting, and Oxc-powered Vite for development and builds.

Start with the [locked product and technical design](docs/design.md). It defines the stack, v1 features, design guidelines, platform targets, and milestone order.

Development must follow [AGENTS.md](AGENTS.md), the [mandatory quality standards](docs/quality.md), and the project skills under [.agents/skills](.agents/skills). These cover Rust, React, Tauri, and strict TypeScript development, including Oxc and Ant Design requirements.

Current stage: milestone 1 in progress. The repository now contains a React/Ant Design shell, strict TypeScript/Oxc checks, a minimal Tauri host, renderer tests, and platform build CI. Cluster connections and operations are not implemented. The complete foundation milestone remains open; see the [initialization record and remaining tasks](docs/verification/initialization.md).

Install Node **26.11.1**, pnpm **12.10.1**, Rust **1.99.0**, and the [Tauri native prerequisites](https://v2.tauri.app/start/prerequisites/). Node and Rust versions are recorded in `.node-version` and `rust-toolchain.toml`. Install pnpm with `npm install --global pnpm@12.10.1`.

```sh
pnpm install --frozen-lockfile
pnpm dev             # browser shell at http://127.0.0.1:1420
pnpm desktop:dev     # native desktop shell
pnpm check           # format, lint/types, renderer test, production frontend
pnpm exec playwright install chromium
pnpm test:e2e        # browser appearance and accessibility checks
pnpm desktop:build   # native executable; installers are later foundation work
```

The initial shell has no cluster transport or native application commands. Appearance settings live only in the current session. Browser tests cover the shell directly; an explicit mock transport will be introduced alongside the first IPC adapter. Test builds with native WebDriver support, helper packaging, generated contracts, and secure storage are tracked foundation work, not available commands.

See [dependency research](docs/dependencies.md) for primary sources, selected versions, licensing, and the update policy. Rust quality commands and the environments actually exercised are recorded in the [initialization verification record](docs/verification/initialization.md).
