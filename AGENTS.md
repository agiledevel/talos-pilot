# Talos Pilot development instructions

These instructions apply to the entire repository and every human or automated contributor. Follow the latest owner instructions and any applicable higher-priority instructions. Nested guidance may add domain details; it must preserve the project standards below.

## Design authority and scope

- Read [docs/design.md](docs/design.md) before architecture or feature work. It is the locked implementation baseline.
- Follow its milestone order. The design baseline is complete; feasibility and foundation are next. Internal previews do not reduce the complete Talos and Kubernetes v1 scope.
- Use Tauri 2, Rust, a bundled Go Talos/Helm helper, React, strict TypeScript, Vite, pnpm, Oxc, and Ant Design as specified. Use the Rust Kubernetes adapter for ordinary Kubernetes management.
- Keep cluster credentials and API clients in the backend/helper. The renderer uses typed application IPC and bounded projections.
- Proceed autonomously with implementation, fixes, documentation, and verification within the agreed scope. Routine choices do not need renewed confirmation.
- Do not silently change the selected stack, release scope, security boundaries, or platform targets. For a material design change, prepare evidence and a concrete proposed resolution for the owner, then record the owner-directed decision in the design or a linked architecture decision record.
- Establish exact compatible dependency/toolchain pins in the foundation milestone and commit lockfiles. Use upstream Talos APIs and libraries rather than reproducing their lifecycle or configuration semantics.

## Required development skills

Read and apply each relevant skill before changing its domain. For work crossing domains, use all relevant skills. These repository skills are mandatory development guidance, not optional substitutes for this file.

| Domain | Skill | Location |
| --- | --- | --- |
| Rust services, adapters, concurrency, storage | `$talos-pilot-rust` | [.agents/skills/talos-pilot-rust/SKILL.md](.agents/skills/talos-pilot-rust/SKILL.md) |
| React components, hooks, Ant Design, accessibility | `$talos-pilot-react` | [.agents/skills/talos-pilot-react/SKILL.md](.agents/skills/talos-pilot-react/SKILL.md) |
| Tauri commands, channels, capabilities, sidecars, packaging | `$talos-pilot-tauri` | [.agents/skills/talos-pilot-tauri/SKILL.md](.agents/skills/talos-pilot-tauri/SKILL.md) |
| TypeScript models, runtime validation, IPC types, Oxc | `$talos-pilot-typescript` | [.agents/skills/talos-pilot-typescript/SKILL.md](.agents/skills/talos-pilot-typescript/SKILL.md) |

React implementation normally also requires the TypeScript skill. Tauri backend implementation normally also requires the Rust skill. Go work follows the same architecture, documentation, and QA rules, including the Go gates in [docs/quality.md](docs/quality.md).

## Clean code requirements

- Write small, cohesive modules with clear domain ownership and meaningful names. Keep views, application services, transport adapters, and persistence separate.
- Prefer a straightforward implementation. Introduce abstractions for a demonstrated contract or shared behavior; avoid speculative frameworks, duplicate state, and unrelated refactoring.
- Validate untrusted data at runtime boundaries. Use explicit domain types, exhaustive state machines, structured errors, and documented retry/cancellation semantics.
- Handle expected failures without panics, ignored errors, or silent fallback. Preserve action, target, and cause in errors while redacting sensitive data.
- Bound buffers, task concurrency, retained data, retries, and timeouts. Every watch, terminal, port forward, helper process, and background task needs an explicit owner and cleanup path.
- Keep functions testable through narrow boundaries and injectable external dependencies. Do not move business logic into React components or Tauri command wrappers.
- Avoid `any`, unchecked casts, non-null assertions, production `unwrap`/`expect`, and `unsafe`. A necessary exception must be narrow, explain its invariant, and receive suitable verification.
- Never disable quality checks, weaken strict types, or add broad lint suppressions to make a change pass. A justified local suppression must explain the tool limitation and retain equivalent verification.
- Keep secrets out of logs, telemetry, browser persistence, fixtures, process arguments, environment variables, and plaintext storage. Preserve the explicit reveal/export flows in the design.
- Do not expose generic shell execution or broad filesystem access to the renderer. Conflicting mutations require backend operation locks and durable state before dispatch.
- Keep generated artifacts reproducible. Edit their source definitions, regenerate them, and verify consistency; do not hand-edit generated code.
- Remove dead code and abandoned implementations. Do not present placeholders, mock-only behavior, or unfinished integrations as completed features.

## Code and product documentation

- Document public Rust APIs with rustdoc, TypeScript module APIs and reusable hooks/components with TSDoc, and exported Go APIs with Go doc comments. Explain purpose and behavior; do not merely repeat a signature.
- Document significant internal invariants, state transitions, resource ownership, cancellation, error behavior, and sensitive fields. Comments should explain decisions that the code alone cannot express.
- Include Rust `Errors`, `Panics`, and `Safety` sections where applicable, and executable examples when they help a caller use the API correctly.
- Update API/protocol, migration, setup, user workflow, and recovery documentation in the same change as the behavior. Mark generated documentation and its source.
- Record consequential architecture decisions under `docs/` with context, chosen behavior, alternatives, consequences, and verification. Keep the design and actual implementation consistent.
- Track unfinished work with a concrete issue or task and acceptance criteria. Do not scatter unexplained TODOs or stale comments through the code.

## Mandatory quality gates

[docs/quality.md](docs/quality.md) is normative. Read its applicable sections and satisfy every relevant gate before declaring work complete.

- Define the intended behavior and acceptance criteria before implementing a behavioral change. Test observable outcomes, failure paths, and domain invariants.
- Run formatting, lint/type diagnostics, relevant tests, and affected production builds. Rust, Go, IPC, renderer, native desktop, and real-cluster checks apply according to the changed boundary.
- Add regression coverage for meaningful bug fixes and safety-critical changes. Pure documentation, formatting, and low-impact visual edits do not require artificial unit tests.
- Keep local and CI commands identical. Add enforceable CI gates with the corresponding code/harness in the foundation milestone; a prose requirement alone is not evidence of enforcement.
- Native IPC and packaging changes require actual Tauri verification. Talos lifecycle claims require disposable Talos integration fixtures. Browser mocks cannot establish either claim.
- Test all declared OS targets and the version matrix at the milestones/release gates in the design. State exactly which environments were executed.
- Do not use existing owner clusters as implicit mutation fixtures. Use identified disposable fixtures with synthetic credentials and an explicit test allowlist.
- Perform a separate review pass over the final diff for correctness, maintainability, security boundaries, documentation, and missing failure-path coverage.
- Report failed or unexecuted checks, their reason, and their practical limit. A skipped check is not a pass. If a required gate cannot run, describe the work as unverified or incomplete.

## Task completion and handoff

Before handing off, inspect the final diff, validate applicable documentation links/contracts, and run the appropriate checks. Report what changed, why, the commands/environments and results, and any remaining limitation. Do not claim tested behavior based only on compilation, mocks, or a previous run before the final changes.

At baseline creation on 2026-10-08, the repository contains design and development guidance only. Application manifests, test harnesses, and CI are foundation deliverables. Keep the current stage in README.md updated as implementation advances; determine applicable checks from the actual code and contracts, not this historical note. For documentation/skill changes, validate document consistency, local links, skill structure/metadata, and diff whitespace; application checks apply when affected application code exists. Do not create dummy scripts or tests that always pass to simulate enforcement.
