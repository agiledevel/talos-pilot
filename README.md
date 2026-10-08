# Talos Pilot

A planned Tauri desktop application for the full Talos Linux cluster lifecycle and Kubernetes management, supporting Linux, macOS, and Windows.

The application will use React and TypeScript with Ant Design in Tauri's WebView, a Rust application backend, and a bundled Go helper for Talos API and lifecycle workflows. Frontend development uses the Oxc stack: Oxlint for linting and type diagnostics, Oxfmt for formatting, and Oxc-powered Vite for development and builds.

Start with the [locked product and technical design](docs/design.md). It defines the stack, v1 features, design guidelines, platform targets, and milestone order.

Development must follow [AGENTS.md](AGENTS.md), the [mandatory quality standards](docs/quality.md), and the project skills under [.agents/skills](.agents/skills). These cover Rust, React, Tauri, and strict TypeScript development, including Oxc and Ant Design requirements.

Current stage: design baseline complete. Next is milestone 1, feasibility and foundation. Application code and CI checks have not been implemented yet.
