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

A helper that exits between a request and its response closes its end of the
request pipe. The parent reports that as one exited-helper class, whether it
observes the exit as a failed request write or as end of file on the matching
read, so the same failure never carries two different stable codes. The helper
itself never closes its standard input while it remains alive: it reads requests
until end of file and returns on that end of file.

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
`MachineStatus` snapshot as generation 1. Subsequent `TALOS_STATUS_EVENT`
frames use the probe request ID and strictly increasing sequence values. They
carry only stage, ready, deletion state, the snapshot generation, and whether
the frame is a snapshot. `TALOS_CANCEL_REQUEST` identifies the active probe
by request ID; the helper acknowledges cancellation and ends that stream with
`TALOS_STREAM_ENDED`. The event queue is capped at 16 and applies backpressure
to the COSI watch. Rust forwards at most 256 status updates on one native
channel before requesting cancellation, which bounds Tauri's queued channel
data even if a view stops consuming callbacks. After Rust sends
`TALOS_CANCEL_REQUEST` it waits at most two seconds for both the subscription's
terminal frame (`TALOS_STREAM_ENDED`, or an `ERROR` for the probe request) and
the cancel reply, in either order. A natural stream end can cross the cancel on
the pipe, so the reply is `TALOS_CANCEL_RESPONSE` or, when the helper already
dropped the subscription, `ERROR` with `unknown_subscription`; Rust consumes
that reply so no stale frame remains. Any other frame for the cancel request ID
is a protocol fault. A helper that misses the deadline is terminated and
reaped rather than awaited. The parent owns cancellation on
view close, session close, and application shutdown, and cancels only the
subscription whose backend session issued the request. The helper shares one
12-second startup budget between the Talos version read and the first
`MachineStatus` snapshot and answers an exhausted budget with the retryable
`talos_probe_timeout` error, which Rust projects as `TALOS_UNAVAILABLE`. The
parent's own startup deadline is 15 seconds, so the helper's classified answer
always precedes a parent-side kill. A probe cancelled before the helper sends
its `TALOS_PROBE_RESPONSE` ends silently: the helper sends the cancel reply and
no frame for the probe request, whichever startup step the cancellation
interrupted. Rust does not cancel during startup; it bounds that phase with its
own deadline. The helper does not automatically retry credential or
authorization failures.

## Mid-stream reconnection and resync

A watch that fails mid-flight invalidates the previously delivered projection.
The helper then emits one `TALOS_STREAM_STALE` marker and reconnects through
the official Talos client on the same node-pinned session, so subscription,
node, and credential identity never change (see
[decision 0007](../decisions/0007-pin-talos-streams-to-the-node-api.md)). The
marker carries no data and consumes no sequence: its envelope sequence repeats
the sequence of the projection it invalidates, which is 0 when that projection
is the bootstrap `TALOS_PROBE_RESPONSE`. Until a valid replacement snapshot
arrives, no projection on the stream may be presented as current.

Silence alone is not a failure: `MachineStatus` events are change-driven, so a
healthy quiet node emits nothing. The helper measures silence from the last
delivered data frame (the bootstrap `TALOS_PROBE_RESPONSE` is generation 1's
projection) and, after 30 seconds without one, performs exactly one bounded
liveness check: a unary `Version` read on the same node-pinned stream
connection, answered by the selected node's own apid. The read connection is
deliberately not used, because a control-plane endpoint could answer it and
would say nothing about the node ([decision
0013](../decisions/0013-talos-stream-stall-detection.md)). Any delivered data
frame resets the window, the check is bounded by the same 15-second attempt
deadline, at most one check runs at a time, and cancelling the subscription
ends the check promptly. A failed check is an interruption exactly like a
failed watch: the helper stops the watch, emits the stale marker, and spends
the same three-attempt budget below. Stopping the watch is itself bounded by a
5-second join window; a callback still blocked on an undrained output pipe
after it means no frame can be delivered safely, so the helper emits nothing
further and ends, the same disposition the existing cancellation join timeout
uses. A check failing with `talos_unauthorized` or `talos_certificate_invalid`
is terminal and is never retried. For a stream whose pipe is being drained, the
documented bounds are a stale marker within 30 s + 15 s = 45 s of the last
delivered projection and terminal `talos_unavailable` within about 92 s, while
an idle healthy stream stays current across any number of windows. An outage
that outlasts the stale bound plus the budget, which an ordinary node reboot
usually does, ends the subscription with terminal `talos_unavailable`; the
official client's own watch retry keeps a broken connection silent to the
helper, so the check is what bounds it. Stall
detection changes no message kind, field, sequence rule, generation rule, or
event cap.

The reconnection follows the foundation plan's bounded policy. One subscription
allows **at most three reconnect attempts in total**: the first attempt starts
immediately after the interruption, the helper waits 0.5 s before the second
and 1 s before the third, each wait scaled by jitter of at most ±20%, and each
attempt is bounded by a 15-second deadline covering watch re-establishment and
the replacement snapshot. An established watch is never cut by that deadline.
Permission (`talos_unauthorized`), TLS (`talos_certificate_invalid`), and input
(`talos_config_invalid`, `talos_invalid_target`) failures never retry: the
subscription ends at once with that terminal class. An exhausted budget ends
the subscription with a terminal `talos_unavailable` error, which is an
outcome the parent must not present as current. The 256-event cap counts
replacement snapshots and is never raised.

A replacement snapshot is a `TALOS_STATUS_EVENT` frame with `snapshot` set and
`generation` incremented by one; it is the only frame allowed to advance the
generation, and it must be the first status frame after a stale marker. The
subscription's sequence stays continuous across generations and is never reset
by a reconnect. Events of a generation carry that generation and no snapshot
flag. Rust rejects a stale or foreign generation, a duplicate or skipped
sequence, a second stale marker before a replacement snapshot, and any data
frame after a stale marker that is not a replacement snapshot, as a protocol
fault. Cancellation during a backoff wait or a reconnect attempt is
acknowledged within the same two-second bound and ends the stream cleanly; the
helper never leaves a reconnect task or session behind.

One probe holds two authenticated connections, and the wire contract does not
expose that split. `Version` is read on a connection across the supplied
endpoint allowlist with the node target applied, so the read keeps ordinary
endpoint failover. The `MachineStatus` watch runs on a second connection whose
only endpoint is the selected node, because Talos rejects a node-proxied watch
(`one-2-many proxying is not supported for method /cosi.resource.State/Watch`)
and an endpoint-wide watch cannot attribute an event to a machine. The stall
liveness check reissues `Version` on that same node-pinned connection, and is
never a wire-visible exchange. See
[decision 0007](../decisions/0007-pin-talos-streams-to-the-node-api.md).

The Tauri command `get_helper_status` starts the helper lazily and returns only
the validated build identity, protocol major, and accepted status capability.
Tauri's generated app ACL enables this command only in the `main` capability.
The command accepts no path or process arguments from the renderer. Rust starts
the executable from the resolved app resource directory in packaged builds and
from the generated `src-tauri/binaries/` directory in development. Application
exit requests graceful shutdown and awaits child reaping; failed exchanges
terminate and reap the child before returning a structured safe error.

The helper has one pipe and one in-flight exchange, so a `get_helper_status`
request issued while a Talos probe stream is active waits until that stream
ends, bounded by the 256-event cap or the two-second cancellation deadline.
No renderer feature polls helper status today; one that does must first resolve
the follow-up recorded in the milestone 1 ledger.

## Bounds and ownership

The maximum frame payload is 1 MiB. Talos probe config is separately limited
to 64 KiB, endpoint allowlists to eight unique IP identities, the helper's COSI
event queue to 16, each native channel to 256 status updates, and stall
detection to one in-flight liveness check per subscription after a 30-second
silence window. Chunked data, when introduced, is limited to 64 KiB per chunk
with transfer identity, sequence, and total bounds. The application owns the
helper process and all pending requests and subscriptions. The helper event
queue, configuration, endpoint identities, and projected event fields have
explicit bounds before exposure. C1 transfers only the helper status identity;
C4 adds only the bounded Talos probe response and events described above.

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
`export_ipc_types` example into `src/lib/ipc/generated/`; those declarations
are formatted with the pinned Oxfmt tool and are never edited by hand. The
generator is a Cargo example, not a `src/bin` target, so the bundler cannot
install the maintainer tool in a package payload.

The generator requires the Go toolchain recorded in `helper/go.mod` (1.27.3) and `protoc` 36.2 on `PATH`. The helper
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
page](https://github.com/protocolbuffers/protobuf/releases/tag/v36.2). CI
installs the matching archive through the local
[`install-protoc`](../../.github/actions/install-protoc/action.yml) action,
which verifies its digest, so `prost-build` compiles the schema on every
desktop and release runner.

`pnpm helper:build` uses the target triple supplied by the Tauri CLI to
cross-compile the helper with `CGO_ENABLED=0` for the four declared desktop
targets. It writes one generated executable under `src-tauri/binaries/`, which
is ignored by Git and bundled under the app resource directory. The Go linker
embeds the same build identity as the Rust application; startup rejects a
helper whose identity or protocol capability does not match. `pnpm desktop:dev`
and `pnpm desktop:build` invoke this step through Tauri's build hooks.

The renderer command contract and runtime DTO validation are documented in
[application IPC](application-ipc.md).
