# Milestone 1: FLASH LLM implementation plan

Date: 2026-10-08. Plan revision: 1. Status: ready for incremental implementation; milestone remains incomplete.

Audience: a fast LLM with limited reasoning, working in small, verifiable sessions. This document supplies repository context, task order, concrete starting contracts, research requirements, and stop conditions. It does not assume a particular model vendor. Creating this plan does not execute or qualify the planned features.

## 1. Objective and authority

Complete **milestone 1, feasibility and foundation**, from [design section 9](../design.md#9-development-course). Its deliverable is a Tauri/React/Ant Design shell, Oxc development checks, packaged Go helper, typed IPC, secure storage, and a test harness. Completion requires demonstrated launches on the declared platforms, themes/CSP, helper handshake, an authenticated Talos read/stream, a Rust Kubernetes read/watch, editor workers, and vault behavior.

The [locked design](../design.md) defines architecture and scope. [AGENTS.md](../../AGENTS.md) and [quality.md](../quality.md) define mandatory engineering gates. This plan decomposes those requirements; it cannot override them. If this plan and a newer owner instruction disagree, follow the owner instruction and update the affected task before implementation.

Read these sources at the beginning of a new session:

1. [README](../../README.md), [AGENTS.md](../../AGENTS.md), design sections 3–4 and 7–10, and quality sections 1–6 and 8–9. Also read quality section 7 before fixture or platform qualification.
2. [Dependency research](../dependencies.md), [initialization evidence](../verification/initialization.md), [automation evidence](../verification/automation.md), and [CI/release contract](../ci-release.md).
3. The skill for every affected domain: [Rust](../../.agents/skills/talos-pilot-rust/SKILL.md), [Tauri](../../.agents/skills/talos-pilot-tauri/SKILL.md), [TypeScript](../../.agents/skills/talos-pilot-typescript/SKILL.md), and [React](../../.agents/skills/talos-pilot-react/SKILL.md). React work also requires TypeScript; native backend work also requires Rust. Go follows the design and quality Go gates.
4. The current task's source files, contracts, tests, and evidence record. Do not rely on this plan's initial snapshot after the repository advances.

## 2. Starting point: reuse the existing foundation

The inspected source baseline is commit `8e22df6`, following initialization commit `b230a6e`. Treat these as orientation references, not instructions to reset the checkout. Inspect `git status --short` and the current files first; preserve unrelated user changes.

| Area                          | Present at this baseline                                                                                              | Implication for implementation                                                                                                                     |
| ----------------------------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Renderer                      | `src/components/PilotApp.tsx`, shared CSS, ConfigProvider/App, light/dark and compact controls, empty cluster view    | Extend the current shell. System appearance, persistent preferences, backend transport, and resource views are still absent.                       |
| Frontend gates                | Strict TS, Oxfmt, type-aware Oxlint, Vitest/Testing Library, Playwright/axe, production Vite build                    | Preserve the checks. Existing browser tests have no cluster transport; add the named mock boundary when introducing IPC.                           |
| Native host                   | `src-tauri/src/main.rs` is a minimal Tauri builder; no application services or commands                               | Add narrow modules and commands. Zero existing backend tests do not establish backend behavior.                                                    |
| Security configuration        | Empty main-window permissions, restrictive bundled-content CSP; inline styles allowed for Ant Design                  | Explicitly scope new application commands. Existing capability configuration does not establish permission enforcement for future custom commands. |
| Pins                          | Node 26.11.1, pnpm 12.10.1, Rust 1.99.0; exact frontend/Tauri dependency pins and committed pnpm/Cargo locks          | Use the manifests and lockfiles as the installed source of truth. Resolve additional dependencies when needed.                                     |
| Automation                    | Renderer/native build matrix, CodeQL/Trivy exact-commit security scans, draft preview packaging, icon reproducibility | Extend the existing workflows; preserve failure propagation, app/SHA validation, installer validation, and preview scope.                          |
| Missing foundation boundaries | No `helper/`, `proto/`, vault/database, Kubernetes adapter, generated DTOs, or native WebDriver suite                 | These are implementation work, not available APIs. Do not invent imports or report absent harnesses as passing.                                    |

The repository records prior Linux/openSUSE executable smoke and frontend/Rust checks. Those are historical evidence with stated limits; rerun applicable checks after the final implementation. Remote CI execution, macOS/Windows runtime behavior, vaults, real IPC, and cluster connections are not qualified by those records.

Carry forward these findings:

- **FND-006 packaging:** an openSUSE-built AppImage bundled but failed to render because WebKit helper processes were absent. `pnpm release:check-linux` enforces resource presence. Ubuntu-built packages and clean-target runtime checks remain required. Do not remove this gate or hand-patch an installer.
- **FND-007 advisories:** initialization recorded `RUSTSEC-2024-0370` for `proc-macro-error` and `RUSTSEC-2024-0429` for GLib iterator unsoundness. Refresh the scan and dependency paths. A recorded scanner finding needs a compatible remediation or verified applicability decision; do not add silent exclusions.
- **FND-006 performance:** the recorded shell chunk was 580.82 kB minified, 188.52 kB gzip. This is a previous build observation, not a budget or startup measurement. Keep the warning visible and measure the final foundation.
- **FND-008 automation:** configured CI/release jobs do not prove execution. Exact-commit CodeQL/Trivy scan evidence and real platform runs remain to be recorded. ICNS canonicalization is already implemented; preserve it rather than repeating the earlier icon investigation.

## 3. Scope and architectural rules

Milestone 1 establishes working boundaries with minimal feasibility views. Use backend-selected synthetic credentials and allowlisted disposable fixtures for connection probes. A small native file-import/settings surface may be built where needed to demonstrate storage and authenticated reads; complete context import/linking and resource browsing remain milestone 2 work.

| Responsibility    | Owner and permitted behavior                                                                                                                                                                                        |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Application state | Rust owns profiles, credential references, session identity, storage, subscriptions, limits, and helper lifetime. Tauri commands validate/adapt requests; application services implement behavior.                  |
| Talos             | The bundled Go helper uses official Talos client/COSI libraries. Milestone 1 exposes authenticated, nonsensitive read/stream probes only.                                                                           |
| Kubernetes        | Rust uses `kube-rs`/`k8s-openapi` for ordinary reads/watches. The helper does not acquire a second browsing cache.                                                                                                  |
| Renderer          | React receives bounded, runtime-validated application projections. Generated DTOs live behind `src/lib` adapters; SDK objects and raw errors stay in the backend.                                                   |
| Secrets           | Vault-protected encryption key and authenticated encrypted data; keys/config credentials remain in Rust/helper. Native import avoids sending private keys through the renderer.                                     |
| UI state          | Add TanStack Query for actual backend projections, Zustand for actual shared UI state, and React Router in hash mode when the feasibility pages need routing. Do not create duplicate caches or speculative stores. |
| Specialized views | Lazy-loaded Monaco/YAML, xterm.js, and uPlot verify bundled rendering, workers, and cleanup using synthetic data. Container exec, forwards, and metrics collection arrive in later milestones.                      |

Do not implement cluster bootstrap, configuration apply, upgrades, Helm mutations, reset, recovery, or generic Kubernetes mutations in this milestone. The operation journal/lock prerequisites must exist before the first mutation in milestone 3. Protocol operation IDs can be reserved now without exposing mutation commands. Maintenance access must never be a fallback for failed mTLS; its verified onboarding workflow belongs in milestone 3.

All assets must work without runtime downloads. No globally installed `talosctl`, `kubectl`, Helm, Go runtime, generic shell command, broad filesystem API, or direct WebView cluster connection may become a product dependency. Imported kubeconfig exec authentication must remain blocked until explicit executable/argument trust is implemented; do not let an SDK run it during a connection probe. Keep telemetry off and exclude secret-bearing payloads from traces and failure artifacts.

## 4. Operating instructions for the implementing LLM

Work on **one task packet at a time**, in the order below. A packet has a trigger, expected result, exact boundary, tests, and checkpoint. Finish its verification and handoff before starting an unrelated packet. A packet may need several sessions; split by observable behavior rather than leaving half of a security boundary exposed.

For every packet:

1. Inspect current source with `rg --files` and `rg`; read affected modules before editing. Record the actual base revision and working-tree state.
2. Write the acceptance cases and test approach before behavior changes. Identify who owns each task/process/subscription and how failure releases it.
3. Resolve unknown APIs and compatibility from pinned source or official documentation. Record dependency version, upstream symbol/path, license/advisory review, and a minimal build/runtime result. Verify current external facts rather than guessing from model memory.
4. Implement the smallest complete path, including reachable errors and cleanup. Add the corresponding real local/CI gate with the implementation. Do not add a command that always succeeds or a UI action backed only by a mock.
5. Run applicable commands on the final changed code, inspect outputs and exit codes, then perform a separate diff review. Correct findings and rerun affected checks.
6. Update the task evidence and handoff. Report passed, failed, blocked, and unexecuted checks separately. Stop dependent work if a required prerequisite has not been established; continue independent work when possible.

Do not guess dependency versions, Tauri permission semantics, WebDriver plugin names, vault behavior, upstream RPCs, generated field names, or numeric serialization. Look them up, prove a minimal path, and record the result. Do not weaken strict types, bypass CSP, suppress warnings broadly, add a second default lint/format stack, or replace the selected stack to make a probe pass.

Routine implementation and reversible fixes proceed autonomously. A material change to architecture, security boundaries, release scope, or OS targets needs an evidence-backed proposed resolution and an owner-directed decision recorded under `docs/`. Prepare the concrete result before seeking that decision. Missing hardware/signing credentials are evidence limitations, not grounds to invent successful checks.

### Research decisions to settle before dependent code

These are deliberate open implementation choices. Resolve each before its dependent checkpoint and record concrete results; C0/C1 begin with transport, generators, and native-harness compatibility. These research steps do not invite a change to the stack.

| Question                | Required resolution and proof                                                                                                                                                                                                                                                                                                           |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Go/Talos versions       | The dependency document previously researched Go 1.27.2 and Talos 1.14.2. Recheck the latest selected Talos 1.14 patch and its module/toolchain requirements; pin the compatible Go toolchain and modules, commit `go.mod`/`go.sum`, build on all target architectures. Do not present researched candidates as installed integrations. |
| Contract tooling        | Select exact Rust-to-TypeScript and Protobuf generator/runtime versions. Record Rust DTO source, `.proto` source, output directories, supported wire forms, generator command, and independent regeneration evidence.                                                                                                                   |
| Kubernetes adapter      | Select exact compatible `kube-rs`, `k8s-openapi`, Tokio, and TLS dependency pins; distinguish compile-time API feature selection from runtime discovery. Verify 1.35–1.37 fixture compatibility and do not silently move the 1.36 development baseline.                                                                                 |
| Vault/encryption/SQLite | Select maintained vault, AEAD, secret-memory, and `rusqlite` packages; verify Linux Secret Service, macOS Keychain, and Windows credential-vault paths. Prove locked/unavailable behavior and session-only access on actual platforms.                                                                                                  |
| Native harness          | Verify the official Tauri embedded WebDriver route and WebdriverIO Tauri service against the pinned Tauri version. Record exact packages/features, platform prerequisites, startup/teardown, and production exclusion.                                                                                                                  |
| UI integrations         | Pin Monaco/YAML, xterm.js, uPlot, router/query/state packages as their concrete capabilities land. Demonstrate production worker resolution and Oxc/TypeScript compatibility before accepting them.                                                                                                                                     |

Record consequential choices in `docs/decisions/` with context, choice, alternatives, consequences, and verification. Create specific files when the decision is made; do not add empty ADRs. Link them from the evidence record and update dependency/setup documentation in the same change.

## 5. Starting contracts and limits

The following are **planned implementation defaults**, not existing APIs or measured performance claims. Use them to avoid ad hoc choices across sessions. Change a default only with documented compatibility/resource evidence, updated producer/consumer tests, and an updated contract. These routine refinements do not require an architecture approval unless they alter a locked boundary.

### Application IPC

- Rust Serde DTOs are the application wire source; generated TypeScript is never edited by hand. Protobuf is the private Rust/helper source and is not the renderer contract.
- Use opaque string profile/session/subscription/request IDs. Sequence counters are unsigned 64-bit internally and decimal strings on application IPC; timestamps use UTC RFC 3339 strings; binary fields use documented bounded byte arrays. Never coerce integers outside JavaScript's safe range into `number`.
- Define required/null/optional behavior explicitly. Reject missing required fields, invalid IDs, invalid enum tags, excessive sizes, and invalid scope. Harmless additive fields may be ignored; unknown action/event variants fail with a safe structured error.
- Requests carry explicit identity, not an implicit global selection. Events carry session/subscription identity and sequence. Results for a closed/replaced session are discarded; an event gap marks data stale and triggers a bounded resync rather than displaying it as current.
- Use commands for requests and Tauri channels for ordered streams. Errors contain a stable code, action, safe target, retry classification, and safe message. Raw SDK errors, credential paths/contents, and IPC payloads must not enter UI logs.
- Implement only the commands needed by each checkpoint. Suggested service operations are import/probe, begin/end a read subscription, and safe settings/status reads. Final names and DTO fields must be documented from the implemented source; this list is not a claim those commands exist.

### Private helper protocol v1

- Frame: a four-byte unsigned big-endian length, followed by one Protobuf envelope. Accept payload sizes from 1 to 1,048,576 bytes inclusive; reject zero and oversized lengths before allocating payload memory.
- Envelope: protocol major, message kind, request/session IDs, optional operation ID, sequence, and a typed payload. Use explicit presence for optional values. Reject unknown message kinds or payload mismatch; tolerate harmless unknown Protobuf fields according to the documented v1 compatibility policy.
- The first exchange is a handshake with protocol major, helper build identity, and supported read capabilities. Require protocol major 1 and the expected packaged helper build identity; incompatible/missing capabilities disable the affected connection with an actionable error.
- Keep all credentials on private stdin/stdout transport. Stdout contains framed protocol data only; stderr contains sanitized diagnostic text only. No secret-bearing arguments or environment variables.
- Cancellation is idempotent, scoped to a known owned request/subscription, and acknowledged. Cancellation races with completion produce one terminal outcome. Late events cannot attach to a replacement session. Unknown IDs do not create work or affect another session.
- Chunked payloads are at most 64 KiB with transfer identity, sequence, and total bounds. Snapshot transfer behavior is reserved for later milestones; protocol framing tests can use synthetic chunks.

| Resource                  | Starting bound/behavior                                                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Helper process            | One supervised helper per application; backend resolves the bundled executable without a shell.                                                                                                                                                                                                                                                                                                            |
| Sessions/subscriptions    | At most 4 active cluster sessions and 8 active read subscriptions globally; exceeding a limit yields a structured error.                                                                                                                                                                                                                                                                                   |
| In-flight helper requests | At most 32, with bounded admission; no unbounded pending-request map.                                                                                                                                                                                                                                                                                                                                      |
| Queue per subscription    | At most 64 messages and 8 MiB; hitting either limit cannot grow memory. Resync resource projections; report a gap for diagnostic streams; never silently drop control/completion messages.                                                                                                                                                                                                                 |
| Diagnostic retention      | At most 64 KiB of redacted helper stderr; renderer synthetic terminal/log buffers have explicit byte/line caps.                                                                                                                                                                                                                                                                                            |
| Credential import         | At most 256 KiB for the feasibility import; reject oversize before decoding. Larger legitimate imports require an explicit contract revision.                                                                                                                                                                                                                                                              |
| Timeouts                  | Handshake 5 seconds; ordinary read 15 seconds; stream cancellation acknowledgement 2 seconds; shutdown allows 3 seconds for graceful exit, then termination and at most 2 seconds before forced kill and awaited reap. On platforms without a separate termination stage, force-kill after the graceful deadline. Streaming reads use cancellation/reconnect rules rather than a 15-second total lifetime. |
| Retry                     | Up to 3 total attempts for classified transient reads/reconnects, with 0.5/1-second backoff and jitter of at most ±20%. Authentication/permission/validation errors are not retried. No mutation replay path exists.                                                                                                                                                                                       |
| Reconnect                 | After retries exhaust, expose unavailable/stale and require explicit reconnect. No hidden infinite retry loop.                                                                                                                                                                                                                                                                                             |

Test at the limit and one beyond it. Inject time/transport dependencies for deterministic unit tests; use bounded observable waits in integration tests. The exact pinned upstream clients may require a different transport implementation, but must preserve these ownership, error, and memory guarantees.

### Storage contract

- Store profile metadata, credential references, and preferences in migrated SQLite. Encrypt every credential/configuration payload before it reaches SQL or a temporary file. Plaintext keys, Secret values, terminal output, and full logs are not persisted.
- Use a maintained authenticated-encryption library, starting with XChaCha20-Poly1305: a 32-byte random vault-protected key, a fresh 24-byte CSPRNG nonce per encryption, and authenticated record kind/profile identity/schema version. Confirm support during research; any alternative must document equivalent guarantees and tests. Do not implement primitives or invent a cipher format without a versioned library-backed envelope.
- The OS vault holds the encryption key, not raw cluster credential blobs. Backend secret types redact formatting/serialization. Sensitive buffers have the selected library's documented cleanup behavior; avoid unsupported claims of perfect memory erasure.
- Vault locked/unavailable means an explicit choice of session-only access or cancelling connection setup. Implement session-only for this milestone; an encrypted-file fallback is optional only if separately specified and fully verified. No automatic plaintext fallback, automatic promotion to persistent mode, or reuse of an ephemeral key for durable data.
- Existing encrypted data with a missing/wrong vault key remains recoverable data: return a safe locked/key-unavailable error, preserve bytes, and never replace the key or erase/re-encrypt the database automatically.
- Use bounded blocking work for database/crypto/filesystem tasks, transactions for migrations, restrictive data-file permissions, and explicit close/shutdown. Check database, WAL/SHM, temp files, diagnostic output, and test artifacts for synthetic secret markers.

## 6. Task sequence and checkpoints

Preserve the existing FND task IDs in [initialization](../verification/initialization.md#remaining-foundation-tasks). Checkpoint IDs below split those tasks into smaller execution units. Each checkpoint is pending until its required evidence is recorded. FND-001/FND-008 contain existing work; C0 reuses and checks that work instead of declaring it complete by assumption.

Sequence: **C0 → C1 → C2 → C3 → C4 → C5 → C6 → C7 → C8 → C9**. C7 advisory investigation may begin after C0 if a prerequisite is blocked. Final C9 qualification depends on every earlier checkpoint.

### Packet cuts for a fast model

Use these cuts within each checkpoint; the checkpoint's numbered steps describe the resulting behavior, not a requirement to implement everything in one session. Each packet inherits the relevant normal/failure/cleanup cases below. Define the exact cases before editing and keep the application runnable at each accepted cut.

| Checkpoint | Suggested packet order                                                                                                                                                                                                                                      |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C0         | C0.1: inspect/reproduce baseline and create evidence ledger; C0.2: resolve helper/generator/harness pins and record minimal compatibility probes.                                                                                                           |
| C1         | C1.1: schemas, generated DTOs, framed codecs and cross-language fixtures; C1.2: helper handshake and bounded Rust supervisor; C1.3: native status/permissions, target packaging, and CI gates.                                                              |
| C2         | C2.1: runtime-validated renderer adapter and explicit browser mock; C2.2: actual native driver/status/denial suite; C2.3: production exclusion build/runtime checks.                                                                                        |
| C3         | C3.1: SQLite and AEAD envelopes with real persistence/failure tests; C3.2: actual vault, encrypted restart and session-only choice; C3.3: native credential import and appearance settings. No persistent credential feature is exposed before C3.2 passes. |
| C4         | C4.1: allowlisted fixture and official authenticated read; C4.2: owned COSI stream, bounded delivery, cancel/reconnect and native evidence.                                                                                                                 |
| C5         | C5.1: Rust scoped/paginated read; C5.2: watch/relist and identity/cleanup faults; C5.3: real core-version matrix evidence.                                                                                                                                  |
| C6         | C6.1: shell/context/accessibility; C6.2: lazy Monaco/YAML workers and production CSP; C6.3: bounded terminal/chart wrappers and disposal.                                                                                                                   |
| C7         | C7.1: advisory investigation/remediation; C7.2: inventory/notices and final dependency/automation evidence.                                                                                                                                                 |
| C8         | C8.1: Linux packages and runtime; C8.2: both macOS architectures/minimums; C8.3: Windows 11; C8.4: signing/integrity feasibility and final production exclusion.                                                                                            |
| C9         | C9.1: declared workloads/measurements and enforced budgets; C9.2: final acceptance matrix, separate review and milestone handoff.                                                                                                                           |

Do not start a packet that depends on an unverified contract. For example, C3.1 may test encryption with a temporary test key, but that does not qualify vault storage or permit a plaintext credential feature. An unavailable platform can leave its packet pending while another platform is verified.

### C0 — Establish a reproducible baseline and task ledger

**Maps to:** FND-001, FND-008; prepares every remaining task. **Prerequisite:** current source inspection.

**Behavior:** a new contributor can reproduce the current shell and identify what remains unverified.

1. Confirm manifests/toolchain pins and the current native/renderer/release commands. Run the existing applicable baseline gates. Record failures as inherited findings with cause and next action.
2. Create `docs/verification/milestone-1.md` when implementation begins, linking this plan and existing evidence. Include C0–C9 status, environments, commands/results, final revision, open findings, ADRs, and next packet. Add concrete acceptance criteria for each unfinished finding.
3. Resolve the first helper/contract/native-harness dependency research decisions. Record exact primary sources and compatible pins; defer UI/storage/adapter packages until their packet needs them.
4. Ensure new `.ts` library tests will be discovered: current Vitest includes TSX component tests and script TS tests, not `src/**/*.test.ts`. Extend discovery/coverage when adapters are added, rather than leaving their tests unexecuted.

**Required checks:** frozen install; `pnpm check`, coverage, existing Playwright flow; Rust format/Clippy/tests/rustdoc/build; advisory scans; relevant workflow validation. A docs-only update uses documentation gates until behavior is added.

**Checkpoint:** current failures/limits are explicit, next task has exact dependencies and acceptance cases, and the ledger has no fabricated passes. A failed existing gate must be resolved before accepting dependent changes.

### C1 — Generate contracts and run a real helper handshake

**Maps to:** FND-002. **Prerequisite:** C0 dependency research.

**Behavior:** the native backend starts the correct bundled helper, validates its handshake, reports safe status, and shuts it down without a globally installed CLI.

**Work surface:** create `proto/`, `helper/`, Rust helper/DTO modules, generated outputs, generator scripts, and helper build/package configuration. Follow the design's source layout; use small modules rather than putting the supervisor in `main.rs`.

1. Write/document protocol v1 and application status DTOs. Pin Protobuf generators/runtime and Go toolchain/modules; commit sums/locks. Add deterministic generation and `pnpm contracts:check` with missing/untracked-output detection.
2. Implement framed codec, handshake, safe errors, bounded pending requests, cancellation primitives, and redacted stderr. Use real Rust/Go serializers in cross-language tests.
3. Implement the supervisor with a fixed bundled executable path, parent/pipe death behavior, startup deadline, bounded shutdown, and awaited child exit. EOF must stop the helper's owned tasks even if parent-death platform APIs differ.
4. Package the helper for each declared target triple. Add one narrow safe status command; verify custom-command permission scope explicitly. No read RPCs or credentials are needed for this first increment.
5. Add Go format/vet/test/race/build gates and contract regeneration to the existing CI. Verify helper build/resource checks run before native packaging.

**Required tests:** split header/payload; multiple frames per read; zero/excessive/truncated lengths; malformed Protobuf; unknown kind/payload mismatch; bad protocol/build identity; timeout; EOF; invalid/duplicate IDs; excessive requests; out-of-order messages; stalled readers; cancellation/completion race; helper exit at startup and during a read-like synthetic exchange. Test logs with synthetic secret markers.

**Checkpoint:** a built native app exchanges an actual Rust↔Go handshake, reports errors, and observes process cleanup. Target builds establish cross-compilation only; each target's packaged runtime handshake remains C8 evidence. Generator reruns are clean and deliberate schema drift is rejected.

### C2 — Establish native IPC testing and production exclusion

**Maps to:** FND-005, supporting FND-002. **Prerequisite:** C1 handshake/status contract.

**Behavior:** browser tests use a named mock transport; native tests use actual commands/channels/helper processes; production contains neither test transport nor driver access.

**Work surface:** `src/lib` IPC adapter/validators, test transport entry, `tests/native/`, WebdriverIO configuration, explicit native test feature/configuration, command permissions, package scripts, CI.

1. Generate/use TypeScript DTOs behind one transport interface; validate received data from `unknown`. Keep service/domain/UI models distinct when conversion is required.
2. Implement an explicitly selected browser mock boundary. Production must fail safely if native transport is absent; it must never silently return mock success. Avoid relying solely on a removable environment flag to exclude test code.
3. Add `pnpm test:native` with pinned WebdriverIO/Tauri service against a real test-built app. Document exact supported feature combinations and local/CI commands. Use the verified embedded driver route, not an assumed OS limitation from older model knowledge.
4. Verify allowed calls from `main` and rejected calls from an unauthorized test window/origin, including custom application commands. Restrict test-only windows/commands/capabilities to the test configuration.
5. Build production separately and inspect registered commands, capabilities, assets, and driver listener behavior. Pair artifact inspection with a runtime negative check for test endpoints.

**Required tests:** malformed/missing/unknown DTO variants; null/optional fields; large integer/timestamp/byte cases; oversize input; wrong session scope; denied custom command; stale/unknown channel IDs; sequence gap; unmount/Strict Mode cleanup; helper failure surfaced in UI; browser production without IPC; production driver/mock/test-command absence. Observe closed channels/tasks/processes on cleanup, not just cleanup callback invocation.

**Checkpoint:** real native handshake/status flow and permission rejection pass through Tauri. Mock/browser/native evidence is distinguishable. The production build rejects test entry points and has no driver listener. Run this harness on each available platform now; unavailable targets remain pending until C8.

### C3 — Implement encrypted storage and explicit vault failure behavior

**Maps to:** FND-003. **Prerequisite:** C2 real IPC/production boundary and storage research.

**Behavior:** a synthetic imported credential can be stored encrypted, read after restart with the vault key, or used only for the session after an explicit unavailable-vault choice.

**Work surface:** Rust `storage/` migrations/vault/AEAD modules, backend native import path, safe metadata DTOs, minimal accessible settings/status UI, test fixtures, storage documentation/CI.

1. Create a versioned minimal schema for profile metadata, credential references/envelopes, and appearance preferences. Do not prebuild the future operation engine. Keep SQL migrations and encryption envelopes independently versioned.
2. Implement vault and library-backed AEAD adapters with injected boundaries for deterministic failures. Implement the missing/wrong-key and session-only rules above.
3. Import synthetic fixture material through an authorized native file flow. Validate selected file/size/context in Rust; return only metadata. Reject kubeconfig exec authentication before any SDK can execute it. No generic file-read/write or credential-reveal command is introduced.
4. Persist nonsensitive appearance preferences through the backend; add system/light/dark selection and independent density while preserving accessibility. Session-only credential mode must remain visibly distinct after preference changes.
5. Document database location, file permissions, vault requirements, locked/unavailable recovery, and the limits of session-only mode. Avoid implementing portable recovery exports before milestone 6.

**Required tests:** fresh schema; each actually supported schema upgrade with synthetic data; failed migration rollback with data preserved; corrupted ciphertext/tag/nonce/AAD; wrong/missing key; locked/unavailable vault; key-creation/database-write failure; concurrent initialization; restarted encrypted read; session-only teardown/restart absence; failed import/transaction leaves no orphan credential reference; read/import permission denial; oversize/malformed imports; exec-auth rejection; UI focus/error association; redacted errors/history. When only schema v1 exists, test fresh migration/failure atomicity and add an upgrade fixture with the first real schema upgrade; do not invent legacy schemas. Search SQL/WAL/temp/log artifacts for synthetic secret sentinels on success and failure.

**Checkpoint:** actual native persistence/restart and actual vault behavior are demonstrated on the development host; other OS vault rows remain pending for C8. Injected vault tests prove application decisions but do not qualify an OS vault. No sensitive material persists in plaintext or browser storage, and key failure preserves encrypted records.

### C4 — Prove authenticated Talos read and stream

**Maps to:** Talos portion of FND-004. **Prerequisite:** C1–C3 and an identified disposable fixture.

**Behavior:** the Go helper uses backend-held credentials to perform one nonsensitive authenticated Talos read and resource stream; cancellation closes the upstream subscription.

**Work surface:** Go official-client/COSI adapter, Rust Talos session/projection adapter, fixture harness, minimal feasibility result view, protocol docs.

1. Prepare a disposable Talos 1.14 fixture with Kubernetes 1.36 and exact image/module pins. Record immutable fixture identity, endpoint allowlist, provenance, teardown, and synthetic credential issuance. Do not use the owner's existing clusters.
2. Document the exact upstream read and COSI resource type/sensitivity metadata selected from the pinned source. Use a nonsensitive version/health resource and bounded projection; raw resource dumping is not an acceptable shortcut.
3. Distinguish API endpoints, target nodes, and Kubernetes endpoint in backend models. Verify TLS and node routing/failover through the official client. Credentials move over private pipes only.
4. Expose read/subscription start/stop through scoped application services. Display connecting, healthy, stale, unauthorized/certificate-invalid, unavailable, and unsupported states where reachable. Talos failure cannot invalidate a separately healthy Kubernetes session.

**Required tests:** valid mTLS; expired/untrusted/mismatched certificate; denied role; unavailable node; endpoint failover; invalid target; prohibited sensitive resource; helper exit; network loss/retry exhaustion; slow consumer/queue caps; sequence/context isolation; repeated subscribe/cancel; reconnect; view close/application shutdown. Use deterministic faults for precise branches and real fixture read/stream/cancel for integration.

**Checkpoint:** an actual native app uses the packaged helper to read/stream from the allowlisted fixture with TLS verification. Observe subscription/helper resource counts return to baseline. No insecure fallback, secret projection, cluster mutation, or CLI dependency is present.

### C5 — Prove Rust Kubernetes read and watch

**Maps to:** Kubernetes portion of FND-004. **Prerequisite:** C2–C4 and compatible adapter pins.

**Behavior:** Rust lists a bounded set of nonsensitive resources and watches it with scope isolation, resource-version handling, relist, and cancellation.

**Work surface:** Rust `kubernetes/` session/read/watch modules, bounded DTO/query adapters, feasibility view, synthetic API faults, real fixture scenarios.

1. Load credentials only through the backend storage/session path. Block untrusted exec providers before SDK client construction; verify normal TLS validation.
2. Use a small namespace-scoped resource probe with pagination, server selectors, bounded projection, and resource versions. A limited discovery check supports the probe; full discovery/CRD browsing stays in milestone 2.
3. Key renderer query/subscription identity by cluster/session/namespace/resource/selectors/page. Talos and Kubernetes connection states remain independent. Do not copy server state into Zustand.
4. Handle expired watches by relisting and resuming; reconnect within the documented retry budget. Clear stale state only after a valid replacement snapshot. Stop work on view/session closure and shutdown.

**Required tests:** valid/restricted identity; 401/403; wrong/expired TLS credentials; empty list; paginated responses; invalid namespace/selector; 410/resource-version expiry and relist; disconnect/reconnect/exhaustion; deleted/recreated object UID; wrong/stale session events; global context change with an open view; slow consumer/queue cap; duplicate subscriptions; cleanup after success/error/cancel. Denied/absent APIs must not produce fake healthy empty data.

**Checkpoint:** native Rust read/watch works on Kubernetes 1.36 in the disposable Talos fixture. Run the affected core read/watch scenarios on 1.35 and 1.37 as well. If fixture provisioning cannot provide a declared version, record that version as unexecuted and keep qualification open; a Kubernetes-only fixture qualifies only the Kubernetes adapter. Legacy 1.33/1.34 browsing/migration remains a later feature/release gate.

### C6 — Qualify the shell, specialized views, workers, and CSP

**Maps to:** UI portion of FND-005. **Prerequisite:** C2 harness; C3 preferences; C4/C5 safe feasibility states.

**Behavior:** the packaged app renders system/light/dark themes, compact density, and lazily loaded YAML/diff, terminal, and chart surfaces without runtime downloads, while releasing their resources on closure.

**Work surface:** existing shell/shared tokens, `src/components/` specialized wrappers, feasibility/settings routes, workers/assets, CSP, browser/native flows.

1. Reuse ConfigProvider/App, context-aware feedback, tokens, and CSS Modules. Keep the displayed cluster/namespace attached to the original view when global selection changes.
2. Integrate Monaco with YAML language support and required workers; verify a benign syntax diagnostic and diff. Synthetic examples contain no real secret values. YAML/schema validation behavior must come from the selected integration, not an asserted type cast.
3. Render synthetic bounded terminal output and a bounded uPlot series; test resize/theme changes and dispose on closure. These probes do not claim actual container exec, port forwarding, or historical metrics.
4. Lazy-load specialized integrations. Verify asset/worker URLs from installed production packages rather than only the Vite development server.
5. Assess nonce-based Ant Design styles with the packaged worker setup. Permit only the minimum documented CSP sources needed. Preserve script/remote-content restrictions; do not add wildcard allowances or disable security to fix loading.

**Required tests:** theme/system preference changes; independent density; persisted preferences; keyboard navigation/visible focus/dialog return; contrast/axe; 1280×800 and 1024×700 layouts plus scaling; invalid YAML worker feedback; offline editor/terminal/chart assets; no remote requests; CSP denial of unauthorized script/origin; repeated open/close and Strict Mode cycles without leaked workers/listeners/instances; explicit connection failure/retry states; original target identity preserved.

**Checkpoint:** browser flows and actual packaged native flows pass under the production CSP, including workers and dynamic Ant Design styles. Record rendered evidence on the target WebViews. CSP/native claims cannot be accepted from Chromium mocks alone.

### C7 — Resolve advisories and record dependency obligations

**Maps to:** FND-007 plus dependency portions of FND-006/FND-008. **Prerequisite:** C0; final scans follow C1–C6 dependency changes.

**Behavior:** the foundation has a reviewed dependency inventory and no unexplained security findings hidden by configuration.

1. Run current frontend/Cargo/Go advisory tools with pinned scanner versions where available. Record scanner/database versions, resolved package paths, and applicable target/features.
2. Investigate the recorded GLib and macro findings against the actual final dependency graph. Obtain a compatible upstream/backported fix or a verified applicability decision with affected symbol/path analysis and review evidence. A newer incompatible GLib major/minor is not a drop-in substitution for the GTK3 tree.
3. Add meaningful regression/runtime checks for a remediation. Rerun native builds/flows on affected targets and all relevant feature combinations; a green scanner alone does not establish compatibility.
4. Refresh generated dependency/license inventories from source manifests/metadata. Document reproducible generation and redistributed notices, including transitive helper libraries. Do not hand-edit generated inventories.
5. Preserve the CodeQL zero-result and Trivy any-finding failure semantics on the exact SHA; Trivy exceptions stay single-ID, path-scoped, justified, and expiring. Record a real successful analysis/run when repository access makes it possible; missing external integration remains open.

**Required checks:** reproducible installs/builds; advisory/license scans; affected producer/consumer/native gates; inventory regeneration; workflow validation if CI changes. Deliberately failed contract/helper/test commands must fail their CI wrapper in an isolated test fixture.

**Checkpoint:** each finding has linked remediation/applicability evidence and residual risk. No unexplained audit suppression or disabled gate exists. Required failing checks remain failing until resolved; the milestone cannot be accepted with an unexplained unsafe baseline.

### C8 — Qualify packaged targets and shutdown

**Maps to:** platform/packaging portions of FND-002/FND-003/FND-005/FND-006/FND-008. **Prerequisite:** C1–C7.

**Behavior:** clean target systems install and launch the foundation, locate/handshake with their helper, access the OS vault, render bundled workers/themes, and close all owned resources.

| Target              | Required runtime/package evidence                                                                                                                                                                 |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux x86_64        | Ubuntu 22.04 reference and a recorded current Fedora version; AppImage, DEB, RPM; native WebView rendering; WebKit helper/resource checks; Secret Service unavailable/locked/available paths.     |
| macOS Apple Silicon | macOS 13 minimum and a declared current test version; arm64 app/DMG; correct helper architecture/path; Keychain and worker/CSP behavior.                                                          |
| macOS Intel         | macOS 13 minimum and a declared current test version; x86_64 app/DMG; same native, vault, and helper checks on actual Intel hardware/runner.                                                      |
| Windows x86_64      | Windows 11; NSIS install/uninstall, WebView2 setup, credential vault, helper lifetime/path/architecture. Windows 10 remains an explicitly recorded investigation, not a required claimed minimum. |

The existing Ubuntu/macOS 15/Windows Server CI build runners do not replace minimum-OS and Windows 11 runtime tests. Additional architectures are subsequent work under the locked design.

1. Build/install actual packages using the existing preview/release configuration extended for the helper. Check target naming, permissions, packaged resources, asset hashes, path spaces/non-ASCII, and absence of global CLIs.
2. Exercise native IPC permission denial, helper handshake, encrypted restart, unavailable vault, editor workers, safe read/stream if fixture connectivity is available, and graceful shutdown. Crash/kill the parent and observe child/tasks/pipes cleanup too.
3. Run `pnpm release:check-linux` and rendered AppImage smoke on clean declared targets; verify DEB/RPM install/uninstall as actual packages. Fix bundler/resource configuration at source when necessary.
4. Demonstrate helper signing/integrity feasibility and document how each platform signs/packages the helper with the app. Preview/ad-hoc signing and hash verification must be described accurately. Production signing/notarization and signed updates remain release gates requiring owner-supplied credentials; never simulate publisher authentication.
5. Verify package update/reinstall preserves encrypted profile data as documented and uninstall handles user data according to the documented policy. Inspect final production artifacts again for test-only endpoints/capabilities/assets.

**Required tests:** clean install/launch/close/uninstall; wrong/missing helper; mismatched architecture/build identity; startup timeout; locked vault; encrypted persistence after restart; app/helper crash; streaming shutdown; packaged offline rendering; AppImage WebKit resource regression; production test exclusion. Record build host separately from runtime host.

**Checkpoint:** every required OS/architecture/runtime row has actual evidence. An unavailable runner, unexecuted minimum OS, or render failure keeps the corresponding row and milestone incomplete. Local successes remain useful evidence without a portability claim.

### C9 — Measure foundation budgets and perform milestone review

**Maps to:** performance portion of FND-006 and milestone acceptance. **Prerequisite:** C0–C8 accepted.

**Behavior:** the foundation has measured resource/latency limits, complete evidence, and an honest handoff into milestone 2.

1. Build a declared synthetic performance harness reflecting the design target: 20 saved profiles, 3 active clusters, 100 nodes in one cluster, and 10,000 discovered objects. Clearly label synthetic backend/transport data; full resource-browser UX is not implemented yet. Verify pagination/projection/queue limits without claiming later feature completion.
2. Record hardware, OS, display/WebView, artifact revision, cold/warm startup, interaction latency, idle CPU/memory, and sustained stream growth. Use repeatable workload/duration/sampling and multiple runs; include actual native stream measurements from the disposable fixture separately from synthetic load.
3. Derive numeric regression budgets from those measurements, document rationale, and add enforceable gates for measured capabilities. Do not invent a target latency or increase warnings merely to pass.
4. Run the final applicable gates on the reviewed revision. Check all FND task acceptance rows and the milestone matrix below; link evidence for each. Inspect public docs, protocol/source generation, migrations, platform prerequisites, permissions, logs, cleanup, and every recorded failure-path test.
5. Update README/current stage only to reflect demonstrated behavior. Keep milestone 1 in progress if any required row is failed/unexecuted. Prepare an owner-readable milestone UX/tradeoff review with concrete results and remaining decisions; milestone 2 work follows the design order.

**Required checks:** final applicable renderer, Rust, Go, contract, browser, native, fixture/version, and package/platform gates; reproducible performance measurements and budget checks, including a deliberate budget overrun that fails the gate; documentation links/contracts and diff whitespace. Record native and synthetic measurements separately and retain the final review evidence.

**Checkpoint:** the final review has no unresolved in-scope defect, every required row has current evidence, measured budgets are enforced, and all limitations remain visible. A runnable preview or configured CI matrix alone cannot satisfy this checkpoint.

## 7. Commands and CI enforcement

### Existing commands to preserve

Run from the repository root with the pinned toolchains:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm exec playwright install chromium
pnpm test:e2e
pnpm icons:check
pnpm audit --audit-level=low
cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps
cargo build --manifest-path src-tauri/Cargo.toml --locked
pnpm desktop:build
cargo audit --file src-tauri/Cargo.lock
pnpm advisories:check
git diff --check
```

`pnpm desktop:build` currently builds the release executable with `--no-bundle`; it does not qualify installers. Packaging uses the target-specific Tauri command/configuration in [CI/release setup](../ci-release.md). `pnpm release:check-linux` requires generated Linux package resources. Run package/hash gates against actual build outputs, not empty directories or invented fixtures labeled as packages. `pnpm test:native` builds the same release executable path with the test feature, so rerun `pnpm desktop:build` before `pnpm production:check` or `pnpm advisories:check`; both inspect that artifact.

Validate changed workflows with the pinned actionlint command in CI. Regenerate icons/changelog/inventories only through their source workflow when changed. Do not manufacture a tag/release just to test documentation or a local packet.

### Commands to implement alongside real harnesses

These are required deliverables, **absent at the inspected baseline**:

| Checkpoint | Command contract                                                                                                                                                                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1         | `pnpm contracts:check`: regenerate Rust/TS/Go contract outputs independently and fail on modified, missing, unexpected, or untracked generated files. Test deliberate source drift.                                                                            |
| C1         | In `helper/`: Go format assertion, `go vet ./...`, `go test ./...`, `go test -race ./...` on supported targets, `go mod verify`, and `go build ./...`. Record exact cross-build/package commands.                                                              |
| C2         | `pnpm test:native`: build/launch the explicit test-feature application, run WebdriverIO/Tauri tests, and tear down on test failure as well as success.                                                                                                         |
| C3         | Supported-schema migration, encryption, vault failure/redaction, and native restart suites; runnable through documented Rust/native gates.                                                                                                                     |
| C4/C5      | A documented exact disposable-fixture harness command, taking a backend credential file reference plus a verified fixture manifest; it must fail if identity/allowlist is absent or mismatched. Credentials cannot be command arguments or environment values. |
| C8         | Target-specific package runtime/install/uninstall harness commands and production-exclusion checks.                                                                                                                                                            |
| C9         | A reproducible performance command and numeric regression-budget check, derived from actual measurements.                                                                                                                                                      |

Add Rust doctests when a library target/public examples exist, using `cargo test --manifest-path src-tauri/Cargo.toml --locked --doc`; the current binary-only wrapper is not evidence of doctest coverage. Maintain `missing_docs` and rustdoc warnings/broken-link gates. Run explicit production/test feature combinations rather than blindly using `--all-features`.

The Go formatting wrapper must fail if `gofmt -l` returns any maintained source path; printing paths alone is not a failing check. Go race checks and native harness prerequisites need a documented target matrix; unexecuted checks are not passes. Add a pinned Go vulnerability scan and license inventory when the helper dependencies land.

Keep CI and local commands identical. Preserve Linux/macOS/Windows jobs, bounded job deadlines, failure artifact redaction, and exact-revision release inputs. Wire producer/consumer/contract/native/helper gates when their code lands. Never use `continue-on-error`, broad exclusions, a fake success script, or a browser substitute to satisfy a required native/cluster check.

## 8. Milestone acceptance matrix

Use this as the final C9 review checklist. Each row needs links to implementation and recorded results for the final reviewed code, including failures/unexecuted targets. Historical evidence may supply context, not a pass after later changes.

| Required result                        | Evidence needed                                                                                                                                                  | Primary checkpoint |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| Reproducible stack and quality tooling | Exact compatible pins/lockfiles, frozen/locked installs, Oxfmt/Oxlint type checks, tests/builds, identical enforced CI commands                                  | C0, C7             |
| Typed application IPC                  | Generated DTOs, runtime validation, malformed/identity/sequence/permission tests, actual Tauri commands/channels                                                 | C1, C2             |
| Bundled helper                         | Versioned bounded Protobuf, real handshake, correct target binary, no external CLI/runtime, failure/cancellation/process cleanup                                 | C1, C8             |
| Secure storage                         | Fresh/upgrade/rollback schema, AEAD integrity, no plaintext sentinels, actual OS vault success/failure, restart and session-only behavior                        | C3, C8             |
| Talos feasibility                      | Official authenticated read/resource stream, nonsensitive projections, TLS/role failures, bounded cancellation/reconnect, allowlisted disposable Talos fixture   | C4                 |
| Kubernetes feasibility                 | Rust read/watch, pagination/410 relist, scope/RBAC/TLS isolation, cleanup, primary 1.36 and affected core 1.35/1.37 evidence                                     | C5                 |
| UI/CSP/worker feasibility              | Themes/density/system preferences, keyboard/accessibility, lazy editor/YAML workers/terminal/charts, packaged/offline CSP and cleanup                            | C6, C8             |
| Native test infrastructure             | Actual WebdriverIO/Tauri flow, allowed/rejected custom IPC, explicit mock/browser boundary, production test exclusion                                            | C2, C8             |
| Platform launch and packages           | Ubuntu/current Fedora, macOS minimum/current on both architectures, Windows 11, installer/resources/helper/vault/shutdown evidence                               | C8                 |
| Dependency and integrity feasibility   | Advisory resolutions/applicability, notices/inventory, helper signing/integrity design, preserved CodeQL/Trivy exact-commit gate and recorded automation results | C7, C8             |
| Measured performance                   | Declared fixture/hardware, native vs synthetic measurements, startup/latency/CPU/memory/stream growth, enforced measured budgets                                 | C9                 |
| Review and documentation               | Separate final review, current setup/protocol/storage/recovery guidance, accurate README, complete FND task ledger with no unexplained failed/skipped gates      | C9                 |

Full Talos lifecycle, Kubernetes management, recovery, legacy migrations, and production release qualification are later milestones. Keep them in the v1 feature/release matrix; accepting foundation probes does not remove those commitments.

## 9. Session packet and durable handoff

Use the following short template in the evidence/task record for every packet. Replace the fields with observed facts; do not commit an empty copy as completion evidence.

```text
Task: Cx / FND-00x, packet name
Base revision and working-tree state:
Trigger and expected observable result:
Sources/skills read and existing code inspected:
Prerequisites accepted; unresolved research questions:
Contract/API/schema changes and generation source:
Owner of each resource; bounds, cancellation, shutdown:
Acceptance cases: normal, invalid, denied, external failure, cleanup/restart
Implementation and documentation files:
Commands/environments executed on final code; exit codes/results:
Real native/cluster/platform evidence vs mock/synthetic evidence:
Separate review findings and corrections:
Failed/unexecuted checks, practical limit, task and acceptance for resolution:
Checkpoint status; next smallest independent packet:
```

For a new fast-model session, use this instruction:

> Read AGENTS.md, docs/plans/milestone-1-flash.md, and the current milestone evidence. Select the first pending packet within the first pending checkpoint whose prerequisites have evidence. Read its relevant skills and source. State the packet's observable behavior and failure tests, resolve unknown pinned APIs from primary sources, then implement and verify that packet. Preserve unrelated changes and the locked architecture. Update evidence with actual results and the next packet. Do not claim milestone completion while required rows are failed or unexecuted.

**First implementation packet:** C0.1, baseline inspection and evidence ledger. Continue with C0.2 dependency research, then C1.1 contracts/codecs and C1.2 helper handshake/supervision. This plan does not authorize treating mocks, compilation, configured runners, or unavailable environments as successful integration evidence.
