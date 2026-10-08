# Foundation generators and native test harness

Date: 2026-10-08. Status: accepted for milestone 1 implementation.

## Context

Milestone 1 needs reproducible TypeScript DTOs generated from Rust Serde contracts, one private Protobuf schema consumed by Rust and Go, and an actual Tauri WebDriver harness on all declared desktop platforms. Dependency versions and platform support must be verified before the implementation depends on them.

## Decision

- Use `ts-rs` **12.0.1** with its `serde-compat` feature for TypeScript declarations. Rust Serde DTOs remain authoritative. The initial application DTO source is `src-tauri/src/ipc/dto.rs`; committed generated declarations go under `src/lib/ipc/generated/`. Generated files are checked by regeneration in C1.
- Use the Google Protocol Buffers compiler **protoc 36.2**, Rust `prost` and `prost-build` **0.14.4**, Go `google.golang.org/protobuf` and `protoc-gen-go` **1.36.12**. The schema source is `proto/helper/v1/envelope.proto`; checked-in generated Rust and Go are owned by their respective C1 generation scripts under `src-tauri/src/helper/protocol/generated/` and `helper/internal/protocol/generated/`. Tool downloads must be checksum verified. The Go runtime pin matches Talos machinery v1.14.1's module requirement.
- Use Go **1.27.1** with Talos machinery **v1.14.1** for the helper baseline. Go's official release history lists 1.27.1 as the latest 1.27 patch on the research date. Talos machinery declares Go 1.26.5 and its v1.14.1 release was built with Go 1.26.8.
- Use `@wdio/tauri-service` and `@wdio/tauri-plugin` **1.5.0**, with Rust crates `tauri-plugin-wdio` and `tauri-plugin-wdio-webdriver` **1.5.0**, for the native harness. Enable these only in an explicit test build. Select the embedded provider so the same path can run on Linux, Windows, and macOS; keep production registration and capabilities absent.

The C1 source layout and scripts must implement independent deterministic regeneration, detect missing/untracked outputs, and retain output-to-source provenance. The generated files are not handwritten. Dependency manifests and lockfiles are added when the corresponding implementation packet lands, after reviewing complete transitive dependencies and licenses.

## Alternatives considered

- Handwritten TypeScript wire types: rejected because they can drift from Rust Serde behavior.
- Separate independently maintained Rust and Go protocol structs: rejected because a single `.proto` source and cross-language fixture provide a stronger wire contract.
- External `tauri-driver` as the only native route: rejected because Tauri documents that it does not support macOS; its embedded WebDriver service does.
- Updating dependencies to a newer discovered release during a later packet: allowed only after compatibility and security review; exact versions remain explicit in committed manifests rather than floating ranges.

## Consequences

The Rust DTO annotations must accurately match Serde's tag/content, optional, and integer serialization. Application IPC uses decimal strings for 64-bit sequence values. Protobuf maintains native `uint64` and `bytes` wire types. Tool provisioning must supply exact compiler/plugin builds on supported CI hosts. Test-only plugin registration and runtime permissions require negative production-artifact checks; compile success does not establish exclusion.

## Verification

On 2026-10-08, isolated probes on Linux x86_64 established:

- Go 1.27.1 imported and compiled against Talos machinery v1.14.1's `client` package. The module source declares Go 1.26.5; this is compile compatibility, not a packaged helper or cross-target result.
- `ts-rs` 12.0.1 with `serde-compat` generated a tagged Serde enum matching serialized JSON and kept an unsigned 64-bit sequence as a decimal string when the DTO field is a string.
- `protoc` 36.2, Rust `prost-build`/`prost` 0.14.4, Go `protoc-gen-go`/protobuf 1.36.12 generated and compiled the same optional `uint64`/`bytes` message. A Rust-encoded message containing `u64::MAX` was decoded successfully by the generated Go type; Go's generated type also round-tripped the message.
- Both Tauri WebDriver plugins 1.5.0 compile with Tauri 2.12.1 on the current Linux x86_64 host under Rust 1.99.0. A real Tauri app launch, embedded listener, allowed/denied command flow, production exclusion, and macOS/Windows behavior remain C2/C8 acceptance requirements.

Primary references: [Go release history](https://go.dev/doc/devel/release), [Talos v1.14.1 release](https://github.com/siderolabs/talos/releases/tag/v1.14.1), [Talos machinery v1.14.1 go.mod](https://raw.githubusercontent.com/siderolabs/talos/v1.14.1/pkg/machinery/go.mod), [Protocol Buffers v36.2 release](https://github.com/protocolbuffers/protobuf/releases/tag/v36.2), [prost 0.14.4](https://docs.rs/prost/0.14.4), [prost-build 0.14.4](https://docs.rs/prost-build/0.14.4), [ts-rs 12.0.1](https://docs.rs/ts-rs/12.0.1), [Tauri WebDriver guide](https://v2.tauri.app/develop/tests/webdriver/), and [WebdriverIO Tauri service](https://www.npmjs.com/package/@wdio/tauri-service).
