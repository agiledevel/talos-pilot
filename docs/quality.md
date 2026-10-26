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
| TypeScript or Svelte behavior | Oxfmt; Oxlint including type checking; `svelte-check` with warnings as errors; meaningful renderer tests; frontend production build; accessibility and relevant UI flow checks |
| Rust backend | rustfmt; Clippy with warnings denied; affected unit/integration tests; rustdoc checks and relevant examples; affected build |
| Go helper | gofmt with empty difference; go vet; unit/integration tests; race checks on supported test targets; affected helper build |
| IPC or generated contracts | Both producer and consumer gates; deterministic regeneration; malformed/versioned-message tests; actual Tauri/helper integration |
| Tauri configuration, plugins, capabilities, sidecars, packaging | Affected native builds and runtime smoke tests through the manual/nightly native tier or a recorded local equivalent; allowed and rejected IPC behavior; packaged resource/helper checks |
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
| Svelte diagnostics | `pnpm lint:svelte` runs `svelte-check --tsgo --tsconfig ./tsconfig.svelte.json --fail-on-warnings`: types in Svelte scripts, templates, and component props, and Svelte compiler warnings including accessibility, all as errors |
| Frontend tests | `pnpm test:run` runs Vitest once with Testing Library for Svelte where applicable; coverage collection is available for review |
| Frontend build | `pnpm build` runs the production Vite build, including specialized editor workers |
| Frontend aggregate | `pnpm check` executes format, lint/types, Svelte diagnostics, renderer tests, and build, failing on any failed command. `pnpm check:ci` is the same aggregate with the one test execution collecting coverage; use it locally to reproduce CI without immediately rerunning the non-coverage suite |
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
| Advisory baseline | `pnpm advisories:check` compares the cargo-audit report, each recorded advisory's reverse dependency path, and the linked Linux executable against the accepted applicability record; a new, drifted, vanished, or newly linked finding fails, and a stripped or unreadable executable is an error rather than a pass |
| Go vulnerabilities | `pnpm audit:go` installs the pinned `govulncheck` into a private `GOBIN`, runs it over `helper/`, and fails on any finding in the linked call graph |
| Dependency inventory | `pnpm inventory:check` regenerates `docs/verification/dependency-inventory.json` from the lockfiles, `cargo metadata`, `pnpm licenses`, and the Go module graph, and fails on any difference; `pnpm inventory:generate` writes it. Generated inventories are never hand-edited |
| Release and qualification artifacts | The reusable `build-assets.yml` workflow is the only packaging recipe; `release.yml` and the tag-free `qualification.yml` call it with a validated commit and version. `pnpm release:assets` requires `RELEASE_MODE`, `RELEASE_TARGET`, a full-SHA `RELEASE_REVISION`, a matching `RELEASE_VERSION` and workflow-run identity; release mode additionally requires a tag naming that version and qualification mode rejects a tag. It clears `release-assets/` before writing exactly one installer per declared format plus a target `SHA256SUMS.txt` and provenance sidecar, rejecting missing, duplicate and stale output. `pnpm release:verify --directory <downloaded> --mode <release\|qualification> --revision <sha> --version <version> --targets <list>` independently enforces the target's required formats and target-prefixed names, and fails on missing, duplicated, foreign-format, unexpected, swapped or mismatched artifact bytes and provenance. `pnpm payload:check` rejects undeclared programs and maintainer/test tools in an extracted payload or a target's release output; required platform programs (including both AppImage launchers) are declared explicitly. Execute-bit AppImage copyright/schema data is exempt only after bounded byte-for-byte proof against a private read-only reference captured from the trusted build OS's regular non-executable original **before bundling**, not the live OS tree after it; names alone, changed data and missing/escaping sources fail, and no installer permissions are rewritten. Regression coverage: `scripts/release-assets.test.ts`, `scripts/lib/{release,artifacts,payload,appimage-system-data}.test.ts`. A failed Linux payload job may retain one separately named diagnostic AppImage (256 MiB maximum, one-day retention), never qualified release assets; the job still fails. A hosted build is not installed-runtime evidence |
| Third-party notices | `pnpm notices:check` regenerates `legal/THIRD-PARTY-NOTICES.txt` and `legal/third-party-manifest.json` from the live production npm graph, the Cargo closures of all declared targets and the linked Go modules, and fails nonzero on stale, missing, unexpected or malformed output, unknown terms, a drifted curated override, or a bound violation; `pnpm notices:generate` rewrites them and `pnpm notices:check-packaged -- <payload-root>` compares an extracted installed payload byte for byte. Generated artifacts are never hand-edited; the contract is decision 0020 |

**CI tiers (decision 0016).** Required pull-request CI runs deterministic formatting, lint/type, Svelte, renderer unit, production-build, Playwright mock, Go, Rust, contract, inventory, advisory, and security checks. `pnpm test:native` is assigned to a manual and weekly reusable workflow on the desktop matrix and to release qualification; it is not a required pull-request check. The split is implementation work under the accepted decision, not a deletion of the gate. Live Talos and Kubernetes fixtures, clean-VM package smoke, and performance measurement run locally or in explicit manual workflows. A change that touches a native, fixture, packaging, or performance boundary is not complete until its tier has run and the result is recorded. Moving a gate out of required CI does not remove it or change its command.

**Feedback and evidence reuse (decision 0018).** Only PRs may reuse unchanged inputs from compatible, actually executed ancestor evidence. Desktop scope remains documentation-only; full renderer/CodeQL executions are distinguished from format-only/reused green jobs. Trivy and npm advisories still refresh on documentation pushes. Missing/malformed evidence and unknown inputs request fresh checks; main, manual, scheduled and release runs remain full. This is not permission to omit applicable final native/fixture/package evidence. Follow [FLASH pace](flash-pace.md) to overlap independent work and avoid duplicate runs, without relabelling unexecuted checks as passes.

The TypeScript compiler configuration is strict, including unchecked indexed access and exact optional-property behavior. Enable relevant Oxlint correctness, TypeScript, promise, import, and test rules supported by the pinned tools. Vite and Svelte compilation do not replace type checking. Oxlint's type-aware rules and type check apply to `.ts` and `.svelte.ts` files; inside `.svelte` files only its syntactic rules run, on the script block. `svelte-check` therefore owns type diagnostics for Svelte scripts, templates, and component props. It type-checks a separate program, `tsconfig.svelte.json`, that differs from `tsconfig.json` only by skipping third-party declaration files, whose mutual conflicts Oxlint never reported. Keep promise handling and other logic that depends on type-aware lint rules in `.svelte.ts` modules, and do not silence a Svelte compiler warning with `svelte-ignore` without the justification required for any local suppression. Do not add a parallel default ESLint/Prettier stack. Verify the selected Oxc engine's TypeScript requirements against its [official guide](https://oxc.rs/docs/guide/usage/linter/type-aware.html).

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

Use Skeleton components and theme tokens, and Bits UI primitives wrapped in `src/components/ui/` for components Skeleton does not provide. Review light/dark themes, compact density, high data volume, resizing, keyboard shortcuts, and target visibility. Check the [desktop shell layout](design.md#desktop-shell-layout) at 1280×800, 1024×700, and the 720×480 minimum window size: the menu bar, navigation bar, and status bar stay in place, the window does not scroll, and the status bar names the context a change affects. Test keyboard navigation, including the menu bar, visible focus, dialog and menu focus return, screen-reader labels, error association, and status conveyed through text as well as color.

Run automated accessibility checks in renderer flows and manually exercise the main keyboard paths. Treat component-library defaults as a starting point, not proof of accessibility. Validate Monaco, xterm.js, charts, the bundled stylesheet, the inline style attributes applied by Skeleton and Bits UI, and fonts/workers under the packaged CSP.

Browser tests exercise UI behavior with a named mock boundary. Native tests exercise real IPC, channels, helper supervision, persistence/vault handling, file workflows, and shutdown. Keep results distinct in verification records.

Use backend pagination and bounded data projections with virtualized resource lists. Measure the design's initial performance fixture on declared hardware. Record startup, interaction latency, idle CPU/memory, and sustained-stream growth; set regression budgets from the measured foundation baseline and enforce them for releases. Do not invent performance claims from fixture sizes.

## 7. Cluster and release qualification

Lifecycle tests run against explicitly allowlisted disposable Talos fixtures. Before dispatch, the harness verifies fixture identity and intended destructive scope. Cleanup must be safe after partial failure. Real clusters owned by the operator are never an implicit test environment.

Use Kubernetes 1.36 as the primary development fixture, core qualification on 1.35–1.37, and separate legacy browsing/migration tests on 1.33/1.34. Test latest selected Talos 1.14 patches with the pinned helper modules. Include a three-control-plane topology for quorum, upgrades, node retirement, and recovery. A Kubernetes-only cluster cannot qualify Talos lifecycle workflows.

For each milestone, record its acceptance criteria and linked evidence under `docs/verification/` when implementation begins. For release, maintain a feature matrix mapping every v1 design row to evidence, versions, platforms, dependencies, and any supported limitation. An unavailable optional cluster API must show its specified UI state, rather than silently excluding the feature.

A release requires:

1. All applicable static, type, unit, integration, renderer, native, and cluster gates pass on the final candidate. This includes the manual/nightly native workflow result and the recorded local fixture evidence; a green required-CI run alone is not sufficient.
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
