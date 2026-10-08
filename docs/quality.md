# Mandatory engineering and quality standards

This document is normative through [AGENTS.md](../AGENTS.md). It defines how contributors demonstrate the behavior in the [locked design](design.md). Apply the gates relevant to a change; every milestone and release must also satisfy its wider acceptance criteria.

At baseline creation on 2026-10-08, the repository contains design and guidance only. The commands below are required foundation contracts, not a claim that application tooling or CI already exists. Implement these checks alongside the first code in each domain and update the current stage in README.md. Determine applicability from the actual change; this historical note cannot justify skipping checks after implementation exists. Missing required infrastructure is remaining work, and must never be replaced with an always-successful script.

## 1. Before implementation

For a behavioral change, record the trigger, expected result, affected boundaries, acceptance criteria, and verification approach in the task or review description. For an operation that changes cluster state, include target identity, preconditions, disruption, failure outcomes, and cancellation/recovery behavior.

Inspect existing contracts and tests before changing behavior. Build the smallest coherent increment that satisfies its acceptance criteria. Feature work must include usable loading, empty, stale, unauthorized, unsupported, and failure states where those states can occur.

Pin tools and dependencies, commit lockfiles, and use reproducible installation (`pnpm install --frozen-lockfile`, locked Cargo builds, and checked Go module sums). Add a new dependency only for a concrete capability; review its maintenance, licensing, platform compatibility, and security implications.

## 2. Change gates

| Changed area | Required evidence before completion |
| --- | --- |
| Documentation or skills only | Consistent design/instructions; valid local links; valid skill frontmatter and UI metadata when changed; no placeholders; `git diff --check` |
| TypeScript or React behavior | Oxfmt; Oxlint including type checking; meaningful renderer tests; frontend production build; accessibility and relevant UI flow checks |
| Rust backend | rustfmt; Clippy with warnings denied; affected unit/integration tests; rustdoc checks and relevant examples; affected build |
| Go helper | gofmt with empty difference; go vet; unit/integration tests; race checks on supported test targets; affected helper build |
| IPC or generated contracts | Both producer and consumer gates; deterministic regeneration; malformed/versioned-message tests; actual Tauri/helper integration |
| Tauri configuration, plugins, capabilities, sidecars, packaging | Affected native builds and runtime smoke tests; allowed and rejected IPC behavior; packaged resource/helper checks |
| Credential, encryption, migration, or operation engine | Explicit invariant and failure-path tests; restart/interruption coverage where relevant; redaction and persistence checks |
| Talos/Kubernetes lifecycle behavior | Disposable real-cluster scenario for the affected action and its safety conditions; fault-injection coverage; appropriate version/topology fixture |
| Dependency/toolchain changes | Reproducible install; affected builds/tests; advisory and license review; contract generation check when relevant |

For minor copy/layout changes, verify formatting, static checks, build, and the affected rendered state; add automated behavioral tests only when behavior or a meaningful regression warrants them. Broadening or repeating a passing suite requires a new change, failure, or unresolved concern.

## 3. Required command contracts

The foundation milestone must provide the following scripts and document exact native/cluster harness commands. Resolve compatible tool versions before writing configuration. Commands execute from the repository root unless noted; implement scripts with real exit-code propagation.

| Domain | Commands / required behavior |
| --- | --- |
| Frontend format | `pnpm format:check` runs `oxfmt --check` |
| Frontend lint and types | `pnpm lint` runs `oxlint --type-aware --type-check --deny-warnings` with the matching `oxlint-tsgolint` engine |
| Frontend tests | `pnpm test:run` runs Vitest once with React Testing Library where applicable; coverage collection is available for review |
| Frontend build | `pnpm build` runs the production Vite build, including specialized editor workers |
| Frontend aggregate | `pnpm check` executes format, lint/types, renderer tests, and build, failing on any failed command |
| Browser flows | `pnpm test:e2e` runs Playwright against the explicit mock-transport harness |
| Native flows | `pnpm test:native` runs WebdriverIO with the Tauri service against an actual test-built application |
| Rust format | `pnpm format:rust:check` runs `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check` using `src-tauri/rustfmt.toml`; `pnpm format:rust` applies it |
| Rust lint | `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings` for the supported feature configurations |
| Rust tests | `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets` and `cargo test --manifest-path src-tauri/Cargo.toml --locked --doc` for crates exposing examples |
| Rust documentation | `cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps` with `RUSTDOCFLAGS="-D warnings"`; deny broken links and require documentation on public application APIs |
| Rust build | `cargo build --manifest-path src-tauri/Cargo.toml --locked`; packaged release builds also use the Tauri build command established in foundation |
| Go format | In `helper/`, assert that `gofmt -l` over maintained Go source prints no paths; a plain `gofmt -l` invocation alone does not fail on formatting changes |
| Go lint/tests | In `helper/`, `go vet ./...`, `go test ./...`, and `go test -race ./...` on supported race-detector targets |
| Go build | In `helper/`, `go build ./...`; package the correct OS/architecture binary in native builds |
| Contracts | `pnpm contracts:check` regenerates DTOs/Protobuf outputs deterministically and fails on differences, including missing or untracked generated outputs |

The TypeScript compiler configuration is strict, including unchecked indexed access and exact optional-property behavior. Enable relevant Oxlint correctness, React/Hooks, TypeScript, promise, import, accessibility, and test rules supported by the pinned tools. Vite transpilation does not replace type checking. Do not add a parallel default ESLint/Prettier stack. Verify the selected Oxc engine's TypeScript requirements against its [official guide](https://oxc.rs/docs/guide/usage/linter/type-aware.html).

Enable `missing_docs` diagnostics for maintained Rust application crates and fail rustdoc warnings in CI. Generated code may have a narrow generated-module exemption with its source identified. Review TypeScript/Go documentation contracts with the implementation; do not satisfy documentation gates with repetitive or empty comments.

Test-only native WebDriver support must be excluded from production artifacts. Use an explicit test configuration/feature, and verify production builds contain no test command, driver listener, mock transport, or bypass capability. Native harness details follow the [official Tauri testing guide](https://v2.tauri.app/develop/tests/webdriver/).

Use CI on Linux, macOS, and Windows from the foundation milestone. Test the supported Rust feature combinations explicitly; do not blindly enable mutually exclusive features. Run race detection where supported and record target limitations. A build on one host cannot establish another platform's runtime compatibility.

## 4. Meaningful test design

- Test public behavior and domain invariants. Prefer real serialization, database migrations, state transitions, and resource cleanup over mocks of the code being tested.
- Cover normal use, invalid input, denied permissions, relevant boundary values, and external failures. Add cancellation, concurrency, retry, and restart cases when the feature owns them.
- Reproduce a meaningful bug and add regression coverage that would fail without the fix. Use deterministic scheduling, fake clocks, observable signals, and bounded deadlines; avoid arbitrary sleeps.
- Mock external cluster/process boundaries where useful, preserving realistic failure semantics. Keep at least one real integration path for every critical boundary.
- Use semantic UI queries and user interactions. Assert the target, result, focus, accessible feedback, and available actions. Avoid fragile snapshots or tests tied to private implementation details.
- Use synthetic or sanitized fixtures with declared versions and provenance. Never commit real kubeconfigs, private keys, cluster secrets, or snapshots.
- Do not add tests that restate an implementation, verify formatting/copy alone, or inflate coverage without exercising a failure mode.

Collect coverage to locate gaps, especially error branches. A percentage is not a substitute for the critical scenarios below. Safety-critical behavior cannot ship with an untested failure path merely because aggregate coverage is high.

## 5. Safety-critical scenarios

Each implemented scenario needs automated coverage at its applicable boundaries and, for cluster mutations, a disposable integration fixture before the capability is accepted.

| Boundary | Required scenarios |
| --- | --- |
| Identity and permissions | Cluster/namespace/node/resource identity preserved across tabs and context changes; stale review rejected; RBAC denial; certificate expiry/mismatch; no silent downgrade to maintenance access |
| Configuration and resource edits | Upstream Talos validation/patch behavior; shared cluster secrets preserved; Kubernetes resource-version conflict; deletion/recreation detected through UID; diff/target review matches dispatched change |
| Operation engine | Durable state before dispatch; conflicting jobs blocked; partial per-target success; cancellation at defined checkpoints; timeout/network loss; uncertain result recorded without automatic replay |
| Restart and helper failure | Helper exit before/during/after mutation; incomplete pipe/frame; application restart; reconciliation from observed state; recovery of reads without replaying a mutation |
| Upgrade/drain/reset | Control-plane serialization; quorum checks; disruption constraints; health checkpoint failure stops progression; force options explicit; only owned cordon state restored; reviewed wipe scope enforced |
| Backup and recovery | Integrity failure; wrong secret/config material; interrupted export; encrypted bundle import on a fresh profile; recovery of a broken three-control-plane fixture and verification of members/workloads |
| Secret storage | No plaintext credential rows/files; vault unavailable/locked; explicit fallback/session-only path; redacted errors/history; sensitive IPC excluded from logging; reveal/export does not persist in UI storage |
| Streams and sessions | Watch expiry/relist; disconnect/reconnect; context isolation; bounded queues; slow consumers; unmount/logout/shutdown cleanup; terminal exit; loopback port forwarding and port release |
| IPC and helper protocol | Invalid/oversized frames; incompatible handshake; unknown request/session IDs; out-of-order/stale events; cancellation cleanup; constrained command/path validation |
| Database and contracts | Fresh schema and upgrades from supported prior schemas; rollback/error handling; no credential loss; missing fields/unknown variants rejected or handled under the documented compatibility policy |

Test cleanup on failure as well as success. Confirm resources are released by observing closed tasks/processes/listeners or usable ports, rather than only checking that a cleanup function was called.

## 6. Frontend and native UX quality

Use Ant Design through the application's ConfigProvider/App foundation and shared tokens. Review light/dark themes, compact density, high data volume, resizing, keyboard shortcuts, and target visibility. Test keyboard navigation, visible focus, dialog focus return, screen-reader labels, error association, and status conveyed through text as well as color.

Run automated accessibility checks in renderer flows and manually exercise the main keyboard paths. Treat component-library defaults as a starting point, not proof of accessibility. Validate Monaco, xterm.js, charts, dynamic Ant Design styles, and fonts/workers under the packaged CSP.

Browser tests exercise UI behavior with a named mock boundary. Native tests exercise real IPC, channels, helper supervision, persistence/vault handling, file workflows, and shutdown. Keep results distinct in verification records.

Use backend pagination and bounded data projections with virtualized resource lists. Measure the design's initial performance fixture on declared hardware. Record startup, interaction latency, idle CPU/memory, and sustained-stream growth; set regression budgets from the measured foundation baseline and enforce them for releases. Do not invent performance claims from fixture sizes.

## 7. Cluster and release qualification

Lifecycle tests run against explicitly allowlisted disposable Talos fixtures. Before dispatch, the harness verifies fixture identity and intended destructive scope. Cleanup must be safe after partial failure. Real clusters owned by the operator are never an implicit test environment.

Use Kubernetes 1.36 as the primary development fixture, core qualification on 1.35–1.37, and separate legacy browsing/migration tests on 1.33/1.34. Test latest selected Talos 1.14 patches with the pinned helper modules. Include a three-control-plane topology for quorum, upgrades, node retirement, and recovery. A Kubernetes-only cluster cannot qualify Talos lifecycle workflows.

For each milestone, record its acceptance criteria and linked evidence under `docs/verification/` when implementation begins. For release, maintain a feature matrix mapping every v1 design row to evidence, versions, platforms, dependencies, and any supported limitation. An unavailable optional cluster API must show its specified UI state, rather than silently excluding the feature.

A release requires:

1. All applicable static, type, unit, integration, renderer, native, and cluster gates pass on the final candidate.
2. Install, launch, helper handshake, secret storage, upgrade, and uninstall are exercised on clean declared targets: Linux x86_64, macOS Intel/Apple Silicon, and Windows x86_64. Runtime requirements and tested OS minimums are recorded.
3. Each v1 feature is qualified on the declared version matrix; recovery and interrupted-operation handling have real fixture evidence.
4. Accessibility and measured performance budgets pass; production artifacts exclude all test bypasses.
5. Dependencies, advisories, licenses, and a dependency inventory are reviewed. Unresolved findings require a recorded applicability/remediation decision; do not silently ignore a scanner result or change dependencies without qualification.
6. Installer/helper integrity, production signing/notarization where required, and signed updates when configured are verified. Owner-supplied release credentials are never committed.
7. Setup, supported versions/platforms, credential handling, lifecycle/recovery instructions, and known limitations are accurate. A fresh-user setup/import flow is exercised.

The owner may direct an explicit scope or release decision. Contributors must record its consequences and keep failed/unexecuted evidence visible; it must never be relabeled as a passing check.

## 8. Documentation and review gates

Public APIs need useful rustdoc, TSDoc, or Go documentation describing behavior, significant invariants, errors, ownership, cancellation, and sensitive data handling as applicable. Explain non-obvious internal reasoning. Avoid boilerplate that paraphrases identifiers. Rust examples should compile in doctests; broken documentation links are failures. See the [rustdoc guidance](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html).

Keep architecture, protocol versioning, operation state machines, migrations, configuration, and user instructions current in the same change. Record a material decision's context, chosen approach, alternatives, consequences, and verification. A future session must be able to understand the contract without reading chat history.

After implementation and checks, perform a separate review pass over the final diff. Inspect correctness, domain separation, unnecessary complexity/dependencies, resource ownership, error handling, secret exposure, generated artifacts, meaningful test coverage, and documentation accuracy. Resolve findings and rerun affected checks after corrections.

## 9. Definition of done and evidence

A change is complete when its acceptance criteria are implemented, applicable gates pass, relevant documentation/contracts are updated, and the final review has no unresolved defect within scope. A milestone additionally requires its design acceptance criteria; a release additionally requires section 7.

The handoff records the final change, the commands and environments actually executed, their results, and any failed or unexecuted verification with its practical limit. Distinguish automated tests, manual checks, mocks, and real-cluster/native qualification. Never claim a pass from an absent harness, stale result, unsupported platform, or test that was disabled.
