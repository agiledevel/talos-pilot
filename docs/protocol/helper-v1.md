# Private helper protocol v1

This protocol is the private Rust-to-Go process boundary. It is carried only
over the supervised helper's stdin/stdout pipes. It is not the renderer IPC
contract and must never contain Talos credentials in command arguments or
environment variables. Diagnostics on stderr are sanitized and bounded by the
Rust supervisor.

## Framing

Each message is a four-byte unsigned big-endian length followed by exactly one
serialized `Envelope` from [`envelope.proto`](../../proto/helper/v1/envelope.proto).
Lengths 1 through 1,048,576 bytes are accepted. Zero and larger lengths are
rejected before payload allocation. Readers must handle split headers, split
bodies, consecutive frames, EOF, and truncated input. A malformed Protobuf
message, unknown message kind, or kind/payload mismatch is a protocol error.

The v1 receiver ignores unknown Protobuf fields, as required for additive field
evolution, but rejects unknown enum values and unknown `oneof` payloads when
they make the message kind unsupported. Required strings and protocol major
must be validated by the receiver; Protobuf's default zero values do not imply
valid presence.

## Handshake and commands

The parent sends `HANDSHAKE_REQUEST` first, with protocol major 1 and the exact
expected helper build identity. The helper replies with `HANDSHAKE_RESPONSE`,
protocol major 1, its compiled build identity, and supported capabilities. The
parent accepts only a matching identity and the required `status` capability.
C4 also negotiates `talos_probe`. No other request is valid before handshake
succeeds. `SHUTDOWN_REQUEST` receives one acknowledgement before the helper
exits. EOF cancels all helper-owned subscriptions and stops their tasks.

Every request has a nonempty opaque request ID. IDs are not reused while an
exchange is active. Optional session and operation IDs have explicit Protobuf
presence. Sequence values are unsigned 64-bit integers in the helper protocol;
application IPC serializes sequence values as decimal strings.

The helper emits no stdout text outside framed Protobuf. Errors use stable
codes, safe messages, and retry classification; raw causes stay in the
backend. Unknown or mismatched message variants fail closed. No operation
payload is logged.

`TALOS_PROBE_REQUEST` contains the in-memory talosconfig bytes, a bounded
allowlist of API endpoints, and exactly one IP node target. The configuration
is limited to 64 KiB and is accepted only from the private pipe; Rust must not
put it in renderer DTOs, command arguments, environment variables, or logs.
The helper clears its input byte buffer after parsing. A matching
`TALOS_PROBE_RESPONSE` returns the Talos version and the first projected
`MachineStatus` snapshot. Subsequent `TALOS_STATUS_EVENT` frames use the probe
request ID and strictly increasing sequence values. They carry only stage,
ready, and deletion state. `TALOS_CANCEL_REQUEST` identifies the active probe
by request ID; the helper acknowledges cancellation and ends that stream with
`TALOS_STREAM_ENDED`. The event queue is capped at 16 and applies backpressure
to the COSI watch. Rust forwards at most 256 status updates on one native
channel before requesting cancellation, which bounds Tauri's queued channel
data even if a view stops consuming callbacks. After Rust sends
`TALOS_CANCEL_REQUEST` it waits at most two seconds for the acknowledgement and
the matching `TALOS_STREAM_ENDED`; a helper that misses that deadline is
terminated and reaped rather than awaited. The parent owns cancellation on
view close, session close, and application shutdown, and cancels only the
subscription whose backend session issued the request. The helper has a
15-second initial read deadline; it does not automatically retry credential
or authorization failures.

The Tauri command `get_helper_status` starts the helper lazily and returns only
the validated build identity, protocol major, and accepted status capability.
Tauri's generated app ACL enables this command only in the `main` capability.
The command accepts no path or process arguments from the renderer. Rust starts
the executable from the resolved app resource directory in packaged builds and
from the generated `src-tauri/binaries/` directory in development. Application
exit requests graceful shutdown and awaits child reaping; failed exchanges
terminate and reap the child before returning a structured safe error.

## Bounds and ownership

The maximum frame payload is 1 MiB. Talos probe config is separately limited
to 64 KiB, endpoint allowlists to eight unique IP identities, the helper's COSI
event queue to 16, and each native channel to 256 status updates. Chunked data,
when introduced, is limited to 64 KiB per chunk with transfer identity,
sequence, and total bounds. The application owns the helper process and all
pending requests and subscriptions. The helper event queue, configuration,
endpoint identities, and projected event fields have explicit bounds before
exposure. C1 transfers only the helper status identity; C4 adds only the
bounded Talos probe response and events described above.

## Compatibility

Protocol major mismatch is fatal and disables helper-dependent features.
Compatible additive fields are tolerated. A new message kind or payload
requires explicit receiver support; unknown kinds do not fall back to a
generic success. The build identity is supplied when the helper binary is
built and is checked on every startup.

## Generation and verification

`proto/helper/v1/envelope.proto` is the only wire schema. Rust uses pinned
`prost-build` 0.14.4 and generates into Cargo's `OUT_DIR`; generated Rust is a
build artifact, not committed source. Go output is committed under
`helper/internal/protocol/helper/v1/` and uses `protoc-gen-go` 1.36.12. Rust
SerDe application DTOs in `src-tauri/src/contracts.rs` are exported by the
`export_ipc_types` binary into `src/lib/ipc/generated/`; those declarations
are formatted with the pinned Oxfmt tool and are never edited by hand.

The generator requires Go 1.27.1 and `protoc` 36.2 on `PATH`. The helper
module's `go.mod` pins the tool directive and protobuf runtime. The generator
installs the exact Go plugin into a temporary directory, checks all tool
versions, generates Go into a temporary directory, and compares generated
files byte-for-byte. It generates TypeScript into a temporary directory,
formats it, and compares the complete generated file set. The Rust generation
is verified by compiling the schema through locked `prost-build`.

```sh
pnpm contracts:generate
pnpm contracts:check
cd helper
go test ./...
go test -race ./...
go vet ./...
go mod verify
go build ./...
```

The exact `protoc` archives and SHA-256 digests for Linux x86_64/arm64, macOS
Intel/Apple Silicon, and Windows x86_64 are published on the [v36.2 release
page](https://github.com/protocolbuffers/protobuf/releases/tag/v36.2). The
foundation CI packet installs the matching archive and verifies its digest
before running the same local generation command.

`pnpm helper:build` uses the target triple supplied by the Tauri CLI to
cross-compile the helper with `CGO_ENABLED=0` for the four declared desktop
targets. It writes one generated executable under `src-tauri/binaries/`, which
is ignored by Git and bundled under the app resource directory. The Go linker
embeds the same build identity as the Rust application; startup rejects a
helper whose identity or protocol capability does not match. `pnpm desktop:dev`
and `pnpm desktop:build` invoke this step through Tauri's build hooks.

The renderer command contract and runtime DTO validation are documented in
[application IPC](application-ipc.md).
