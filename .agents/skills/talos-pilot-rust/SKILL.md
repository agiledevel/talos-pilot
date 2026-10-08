---
name: talos-pilot-rust
description: "Develop and review Rust services in Talos Pilot. Use for backend domain logic, Kubernetes adapters, Tokio concurrency, persistence, credentials, helper supervision, and Rust tests. Pair with talos-pilot-tauri for desktop IPC or packaging; Go helper implementation is outside this skill."
---

# Talos Pilot Rust

## Establish the contract

Read [AGENTS.md](../../../AGENTS.md), the affected boundaries in [design.md](../../../docs/design.md), and the Rust/change gates in [quality.md](../../../docs/quality.md). Inspect the existing service, errors, tests, and toolchain pins. State the observable behavior, failure cases, and ownership before implementation.

Rust owns application services, Kubernetes sessions, operation plans/journals, credentials, persistence, and helper supervision. Keep command wrappers thin. Talos lifecycle/configuration and Helm SDK semantics belong in the Go helper through its protocol.

## Implement within domain boundaries

- Separate domain models from Kubernetes SDK objects, database rows, IPC DTOs, and helper messages. Convert at narrow adapters; validate scope and identity before effects.
- Use typed `Result` errors with stable application codes and safe context. Preserve underlying causes internally without sending credentials or raw sensitive SDK errors to the renderer.
- Prefer borrowing and explicit ownership; avoid unnecessary cloning, shared mutable state, and generic abstractions. Keep visibility narrow.
- Handle external failures without production panics. A necessary `expect`, unchecked invariant, or `unsafe` block must explain why it is sound and be verified. Never use an assertion as validation of IPC or cluster data.
- Generate TypeScript contracts from the selected Rust DTO source; regenerate affected artifacts with the documented command. Use a documented wire representation for identifiers, timestamps, bytes, and integers outside JavaScript's safe range.

## Own asynchronous work and resources

- Give sessions, watches, streams, forwards, and jobs an explicit owner, cancellation path, bounded queue, and observable completion. Await shutdown when correctness depends on cleanup.
- Use Tokio for asynchronous I/O. Keep blocking SQLite/CPU/file work off the async executor with a bounded worker strategy; do not hold synchronous lock guards across `.await`.
- Make retries bounded and classify retryable failures. Only retry uncertain mutations after reconciliation establishes that continuation is safe.
- Implement operation conflicts, durable pre-dispatch journaling, per-target outcomes, and restart reconciliation in application services. Cancellation stops at a documented safe point rather than claiming rollback of a completed effect.
- Keep helper spawning constrained to the bundled executable and private framed pipes. Process exit, partial frames, slow consumers, and shutdown must release all owned resources.
- Keep keys in backend secret types with redacted formatting. Avoid deriving debug/serialization on secret-bearing structures indiscriminately; serialize only through intentional credential or reveal/export paths.

## Verify and document

Run the applicable Rust format, Clippy, unit/integration, doctest, rustdoc, and build gates in quality.md. Use the pinned toolchain and locked dependencies. Add tests for changed invariants and failures, including relevant concurrent/interrupted cases; prefer real serializers and temporary databases with injected external APIs.

For IPC, helper, storage, or lifecycle changes, also run the corresponding native/helper/cluster gates. Compilation alone does not establish cleanup or recovery behavior. Verify migrations with synthetic prior-version data, and exercise secret redaction on failure.

Document public APIs with rustdoc and significant internal invariants with concise comments. Explain ownership, cancellation, errors, and sensitive fields where relevant. Include `Errors`, `Panics`, and `Safety` sections when applicable; keep useful examples executable. Follow [official rustdoc guidance](https://doc.rust-lang.org/rustdoc/how-to-write-documentation.html).

Review the final diff separately, then report the commands/environments actually executed and remaining limitations. An absent required harness remains unfinished verification.
