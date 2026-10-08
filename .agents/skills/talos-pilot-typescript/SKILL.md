---
name: talos-pilot-typescript
description: "Develop and review strict TypeScript in Talos Pilot, including application models, runtime validation, IPC adapters, generated DTO integration, asynchronous state, and Oxc tooling. Use for TS/TSX changes; pair with the React skill for UI and the Tauri skill for native contracts."
---

# Talos Pilot Typescript

## Locate the contract

Read [AGENTS.md](../../../AGENTS.md), the contracts/frontend boundaries in [design.md](../../../docs/design.md), and TypeScript/frontend gates in [quality.md](../../../docs/quality.md). Inspect the relevant generated DTOs, adapters, compiler/linter configuration, and tests before editing.

Keep strict compiler settings, unchecked indexed access, and exact optional-property behavior. Use the pinned pnpm/Vite/Oxc toolchain. Apply the React skill for components/hooks and the Tauri skill for native IPC changes.

## Model behavior precisely

- Prefer explicit domain models and discriminated unions over loosely shaped records, string flags, or overlapping booleans. Make operation and connection transitions exhaustive.
- Treat imported files, JSON/YAML, errors, persisted data, and IPC input as untrusted runtime values. Narrow from `unknown` with an actual validator; a type declaration or assertion does not validate data.
- Keep stable IDs and scope explicit. Do not mix cluster/session/node/resource identity or assume a selected tab follows the global context.
- Generate wire DTOs from the chosen Rust/schema source. Do not duplicate or hand-edit them. Check null/optional behavior, unknown variants, timestamps, byte encoding, and protocol versions at the adapter.
- Encode integers outside JavaScript's safe range using the documented string/byte representation, not an unchecked `number` cast. Separate UI models from wire models when conversion is needed.
- Avoid `any`, double casts, non-null assertions, and broad disables. Use `satisfies`, typed narrowing, or an explicit conversion when appropriate; justify the smallest unavoidable exception.

## Own asynchronous effects and errors

Handle every promise deliberately. Await work, return it to its owner, or attach an explicit error path to intentional background work. Do not use a bare fire-and-forget call to hide a rejection.

Carry context identity and cancellation through async adapters. Ignore stale results according to session/request identity, bound retained buffers, and release subscriptions on cleanup. An interrupted operation needs its own state; do not equate cancellation of a request with reversal of a cluster effect.

Expose structured safe errors with action/target/cause and an actionable next step. Keep credentials, full secret-bearing payloads, and terminal content out of logs or persisted UI state. Backend validation and authorization remain authoritative.

## Use the Oxc quality stack

Run the repository's Oxfmt, Oxlint/type, test, contract-generation, and production-build commands from quality.md. Use `oxlint --type-aware --type-check --deny-warnings` with the compatible `oxlint-tsgolint` package. Verify selected TypeScript/tool versions against [the Oxc type-aware guide](https://oxc.rs/docs/guide/usage/linter/type-aware.html); do not assume Vite transpilation checks types.

Keep lint and compiler settings identical locally and in CI, with correctness, hooks, promise, import, accessibility, and test checks supported by the pinned version. Do not weaken strictness or add a parallel default ESLint/Prettier pipeline to resolve a failure. Consult [TypeScript's strict configuration](https://www.typescriptlang.org/tsconfig/strict.html) for compiler behavior.

## Verify and document

Test behavioral transformations, validation failures, malformed contracts, exhaustive states, cancellation, and stale responses where relevant. A compile-only assertion does not establish runtime validation. Use synthetic payloads and real serializers/adapters rather than reproducing a function's implementation in its test.

Document exported APIs with TSDoc describing behavior and significant errors, ownership, cancellation, and sensitive-data handling. Comment non-obvious invariants and conversion decisions. Keep generated-source instructions and protocol documentation current.

Review the final diff, regenerate contracts when changed, run the applicable gates, and report executed commands plus remaining limitations. Use native integration evidence for claims about IPC rather than relying only on TypeScript typings.
