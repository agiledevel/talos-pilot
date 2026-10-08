---
name: talos-pilot-tauri
description: "Develop and review Talos Pilot Tauri 2 commands, channels, capability scopes, CSP, native integrations, bundled Go sidecars, packaging, and native tests. Pair with the Rust or TypeScript skill for the affected implementation; renderer-only component work is outside this skill."
---

# Talos Pilot Tauri

## Map the desktop boundary

Read [AGENTS.md](../../../AGENTS.md), the runtime/helper/security boundaries in [design.md](../../../docs/design.md), and native/IPC gates in [quality.md](../../../docs/quality.md). Apply the Rust and/or TypeScript skill for implementation. Inspect command registration, capability configuration, frontend adapters, and build targets before editing.

Use Tauri 2 as the desktop host and rendering integration. Serve bundled React assets in the native WebView. Rust owns application services; commands adapt typed requests to those services rather than embedding lifecycle logic.

## Make IPC explicit

- Define typed request/response DTOs and structured application errors. Generate TypeScript definitions from the chosen source and verify the serialization contract with real IPC.
- Validate cluster/session identity, target scope, paths, sizes, and operation state in Rust. Renderer validation helps UX and cannot authorize a mutation.
- Use commands for requests, channels for ordered high-volume streams, and small events for global state notifications. Bound/batch data, carry subscription identity/sequence information, and release resources on closure.
- Scope capabilities and plugin permissions to required windows/actions. Review application-command permissions explicitly; plugin restrictions alone do not establish that every custom command is protected. Verify both allowed and rejected calls. Consult [Tauri capabilities](https://v2.tauri.app/security/capabilities/).
- Keep process execution and broad filesystem primitives private. Native dialogs return only the paths needed for a validated application operation; errors and logs must redact secrets.

## Supervise the bundled helper

Package a Go helper for each target using Tauri external-binary support, following [the sidecar guide](https://v2.tauri.app/develop/sidecar/). Launch only the packaged binary from Rust without a shell. Built-in workflows must not depend on globally installed Talos, Kubernetes, or Helm CLIs.

Use the versioned length-framed Protobuf contract on private stdio. Validate handshake, frame bounds, request/session/operation IDs, and sequence behavior. Keep diagnostic text on redacted stderr and credentials out of arguments/environment variables. Chunk large outputs within fixed limits.

Own helper lifetime through shutdown/crash cleanup. An interrupted mutation is journaled and reconciled; restarting the helper may restore reads but cannot automatically replay an uncertain write. Test partial frames, helper exits, stalled consumers, cancellation, and packaged-path handling.

## Preserve production security and portability

- Keep a restrictive CSP for bundled content. Verify Ant Design dynamic styles, Monaco workers, terminal rendering, fonts, and asset paths without broad wildcard grants or blanket security bypasses.
- Keep credentials in the Rust/helper boundary and approved vault/encrypted storage. Test unavailable-vault behavior on the affected platform; never silently fall back to plaintext.
- Use cross-platform path/process APIs and platform-aware shortcuts. Verify target-specific helper names, permissions, architectures, asset resolution, installer runtime dependencies, and cleanup.
- Keep WebDriver listeners, mock transports, test commands, and bypass capabilities exclusive to explicit test builds. Inspect production artifacts/configuration for their exclusion.
- Preserve owner-supplied signing material outside the repository. Verify bundle/helper integrity and configured updater signatures during release qualification.

## Verify and document

Run the affected Rust/frontend/helper gates, then launch an actual Tauri test build and run native flows. A browser test with mocked `invoke` cannot verify command registration, capability denial, sidecar packaging, CSP, vault access, or process cleanup.

Build and smoke-test affected OS/architecture targets according to the milestone matrix. Report unavailable target runners as unexecuted verification rather than claiming portability. Keep test-runner setup documented using the [official Tauri testing guide](https://v2.tauri.app/develop/tests/webdriver/).

Document command/channel contracts, capability rationale, helper protocol compatibility, cleanup, and platform requirements. Review the final diff and report actual native/build evidence and remaining limitations.
