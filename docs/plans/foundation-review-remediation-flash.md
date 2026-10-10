# Foundation branch review remediation: FLASH implementation plan

Date: 2026-10-10. Plan revision: 2. Status: implemented on `ft-foundation` (R1-R6 committed); R4 native-gate verification outstanding, tracked in the milestone 1 ledger follow-ups.

Audience: a fast LLM with limited reasoning, working in small verifiable sessions. This
document supplies repository context, exact task packets, concrete fix direction, required
tests, and verification commands. It does not assume a particular model vendor. Creating
this plan does not execute or qualify the fixes.

Revision 2 changes (second review at `367eccb`, 2026-10-10):

- R1 is now **reproduced**, not inferred (see [section 7](#7-review-evidence)). The
  preferred fix changed from a reader task to a stateful cancel-safe frame reader, because a
  reader task that owns `ChildStdout` cannot hand the pipe back to the supervisor after a
  stream ends.
- R2's test guidance was wrong: `kubeconfig.rs` has no test proving its secret type. The
  packet now extracts one shared secret module instead of duplicating it, and says what
  evidence is and is not possible.
- R3 is resolved as documentation plus a tracked follow-up: no renderer path calls
  `get_helper_status` today.
- R4's rationale was inverted. Non-`async` Tauri commands run on the **main thread**, and
  the fix direction in revision 1 conflicted with the immediate SQLite reservation required
  by [storage-v1.md](../storage/storage-v1.md). Both are corrected.
- R5 was understated: the helper's first-status wait starts a fresh 15-second timer, so the
  helper's effective budget is up to 30 seconds against the parent's 15.
- R6 is new: a cancellation that crosses a natural stream end kills a healthy helper.

## 1. Objective and authority

Resolve the defects found in the review of branch `ft-foundation` at revision `367eccb`
against `main` (`2926f4c`). The branch is otherwise sound and well tested; these are
targeted corrections, not a redesign. Each packet is independently implementable and
keeps the application runnable.

The [locked design](../design.md) defines architecture and scope. [AGENTS.md](../../AGENTS.md)
and [quality.md](../quality.md) define mandatory gates. The
[milestone 1 plan](milestone-1-flash.md) defines the surrounding foundation work; this
document only remediates reviewed defects and cannot override any of those sources. If a
newer owner instruction disagrees, follow it and update the affected packet first.

Read before editing:

1. [AGENTS.md](../../AGENTS.md), [quality.md](../quality.md) sections 3, 4, 5, 8, 9.
2. The skill for each affected domain: [Rust](../../.agents/skills/talos-pilot-rust/SKILL.md)
   (all packets), [Tauri](../../.agents/skills/talos-pilot-tauri/SKILL.md) (R3, R4).
   Go changes (R5, R6) follow the Go gates in quality.md section 3.
3. [helper-v1.md](../protocol/helper-v1.md) and
   [storage-v1.md](../storage/storage-v1.md) for the contracts these packets must keep.
4. The current source files named in each packet. Do not trust this plan's identifiers
   after the repository advances; re-locate the code with `rg` first.

## 2. Environment

The pinned toolchain exists on the review host but is not first on the default `PATH`
(`/usr/bin/rustc` is 1.98.1; [rust-toolchain.toml](../../rust-toolchain.toml) pins
1.99.0). The [milestone 1 ledger](../verification/milestone-1.md) records the same
condition. Prefix every command in this plan with:

```sh
export PATH=/home/kiss/.cargo/bin:/tmp/go/bin:/tmp/talos-pilot-proto/protoc/bin:$PATH
```

Confirm `rustc --version` reports 1.99.0, `go version` reports go1.27.1, and `protoc` is
found. `protoc` is required by [src-tauri/build.rs](../../src-tauri/build.rs); the
supervisor and service tests build the real Go helper, so Go must be on `PATH` for
`cargo test`. On another host, provision the same pins. A gate that cannot run is reported
as unexecuted, never as passed ([quality.md section 9](../quality.md)).

### Gate sets referenced by the packets

- **Rust gates:**
  `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`;
  `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`;
  `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets`;
  `RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps`;
  `cargo build --manifest-path src-tauri/Cargo.toml --locked`.
- **Go gates** (in `helper/`): `test -z "$(gofmt -l $(find . -name '*.go'))"`;
  `go vet ./...`; `go test ./...`; `go test -race ./...`; `go build ./...`.
- **Native gate:** `pnpm test:native` (actual Tauri WebdriverIO run). Required whenever a
  Tauri command signature or execution context changes.
- **Documentation gates:** `git diff --check`; every changed relative link resolves;
  [helper-v1.md](../protocol/helper-v1.md) and [storage-v1.md](../storage/storage-v1.md)
  match the code.

## 3. Findings summary

Severity is the reviewer's assessment. Do not lower a severity to skip work; if you
believe a finding is wrong, record evidence in the packet's ledger entry and stop.

| ID  | Severity | Area               | One-line summary                                                                                                    | Required outcome   |
| --- | -------- | ------------------ | ------------------------------------------------------------------------------------------------------------------- | ------------------ |
| R1  | High     | helper supervisor  | `read_exact` frame reads are not cancel safe; a cancel mid-frame desyncs the pipe and kills the helper (reproduced) | Fix                |
| R2  | Medium   | Talos config parse | parsed `ca`/`crt`/`key` and their base64 decode are not zeroized, unlike the kubeconfig parser                      | Fix                |
| R6  | Low      | helper stream end  | a cancel that crosses a natural `stream_complete` is reported as a protocol fault and kills the helper              | Fix or track       |
| R5  | Low      | helper deadlines   | the helper's startup budget (up to 30 s) exceeds the parent's 15 s, so the parent always kills a slow probe         | Fix or track       |
| R4  | Low      | storage commands   | sync storage commands lock the storage mutex on the main thread, where a pending vault prompt can freeze the window | Fix or track       |
| R3  | Low      | helper service     | `get_helper_status` waits for an active probe stream to end                                                         | Document and track |

## 4. Operating instructions

Work one packet at a time in the table order: R1 → R2 → R6 → R5 → R4 → R3. R6 edits the
same loop as R1, so it follows R1 directly. R1 and R2 are required; R3–R6 are fixed or
converted into tracked follow-ups (section 6). For every packet:

1. Inspect current source and record the actual base revision and working-tree state.
2. Write the acceptance tests **before** the behavior change. Run them and confirm they fail
   for the stated reason. Record the failing output.
3. Implement the smallest complete change, including reachable error and cleanup paths.
4. Run the packet's gate sets on the final code, inspect exit codes, then do a separate diff
   review ([quality.md section 8](../quality.md)). Correct findings and rerun.
5. Add a ledger entry to [milestone-1.md](../verification/milestone-1.md) under a heading
   `### Review remediation R<n>` that links this plan, names the revision, lists the
   commands with results, and lists unexecuted gates with reasons.
6. Commit one packet per commit (Conventional Commits, for example
   `fix(helper): make probe frame reads cancel safe`).

Do not weaken strict types, add broad lint suppressions, bypass CSP, replace the selected
stack, or turn a required gate into an always-passing script. No packet needs a new
dependency. If you believe one does, stop and record version, license, and advisory
review for the owner first. Keep generated artifacts regenerated, never hand-edited; no
packet changes the Protobuf schema or the IPC DTOs.

## 5. Task packets

### R1 — Make helper frame reads cancel safe (HIGH)

**Trigger:** in [supervisor.rs](../../src-tauri/src/helper/supervisor.rs),
`talos_probe_inner` races `cancellation.changed()` against `read_probe_envelope` in
`tokio::select!`. The read path `read_probe_envelope` → `read_envelope` →
`read_async_frame` makes two `read_exact` calls: the 4-byte header, then the body.

**Why it is a defect:** tokio 1.53.2 documents `AsyncReadExt::read_exact` as not cancel
safe, while `AsyncReadExt::read` is. When the cancel branch wins after the header was
consumed, the dropped future takes those bytes with it. The next loop iteration reads the
next 4 body bytes as a length and fails with `Frame`/`Decode`/`ResponseMismatch`;
`talos_probe` then calls `terminate()`. The window is real because the Go
`protocol.WriteFrame` writes the header and the body in **two separate `Write` calls**, and
the Go watcher goroutine writes status events concurrently with the cancel
acknowledgement. Section 7 records the reproduction.

**Exact boundary:** [supervisor.rs](../../src-tauri/src/helper/supervisor.rs): the
`stdout` field, `exchange`, `read_async_frame`, `read_envelope`, `read_probe_envelope`,
and the `talos_probe_inner` loop. Do not change the protocol, the DTOs, the Go helper, or
the 2-second cancellation acknowledgement deadline.

**Acceptance cases (write first):**

- `interrupted_frame_read_keeps_consumed_bytes`: write a valid 4-byte header to a
  `tokio::io::duplex(64)` writer, call the frame read under
  `tokio::time::timeout(Duration::from_millis(20), …)` and assert it times out (the body is
  pending). Write the body, read again, and assert the returned bytes equal the body.
  Against the current `read_async_frame` this fails with `Frame(InvalidLength)`.
- `interrupted_header_read_keeps_consumed_bytes`: the same, but write only 2 header bytes
  before the interrupted read, then the remaining 2 header bytes and the body.
- A clean EOF between frames still maps to `ChildExited`; a zero or over-limit length still
  maps to `Frame(InvalidLength)` before allocating the body.
- `streams_validated_status_and_cancels_the_helper_subscription` passes unchanged.
  `cancellation_acknowledgement_wait_is_bounded` keeps its assertions; only its reader
  argument changes to the new reader type.

The timeout here does not sleep to synchronize: the body is withheld until after the
timeout, so the interrupted read is deterministically mid-frame.

**Fix direction (no new dependency):** replace the stateless frame read with a stateful
reader whose progress lives in the struct, not in the future. Only cancel-safe `read` calls
are awaited, so dropping `read_frame()` at any `.await` loses no bytes.

```rust
/// Reads length-prefixed helper frames from a pipe.
///
/// Cancel safety: progress is stored in `self` and only the cancel-safe
/// `AsyncReadExt::read` is awaited, so dropping `read_frame` (for example in a
/// `select!` branch or under a timeout) loses no consumed bytes. The next call
/// resumes the same frame. After an error the reader must not be reused; the
/// supervisor always terminates the helper on a read error.
struct FrameReader<R> {
    inner: R,
    header: [u8; 4],
    header_filled: usize,
    body: Vec<u8>,
    body_filled: usize,
}
```

`read_frame(&mut self) -> Result<Vec<u8>, SupervisorError>`: loop `read` into
`header[header_filled..]` until 4 bytes; if `body` is empty, validate the length
(`0 < length <= MAX_FRAME_BYTES`) and allocate `vec![0; length]`; loop `read` into
`body[body_filled..]`; a `read` of 0 bytes maps to `ChildExited`, an I/O error to `Pipe`;
on completion reset both counters and return `std::mem::take(&mut self.body)`. The body
must not be allocated before the length is validated.

Then:

1. Change the field to `stdout: FrameReader<ChildStdout>` and construct it in `start`.
2. Make `exchange`, `read_envelope`, and `read_probe_envelope` use `FrameReader`.
3. Delete `read_async_frame`; no non-cancel-safe read path may remain.
4. Put the invariant comment above the `select!` loop: a frame read interrupted by
   cancellation must not lose bytes already consumed from the pipe.

Rejected alternatives (do not use): a dedicated reader task owning `ChildStdout` (aborting
it drops the pipe the supervisor needs for later `refresh_status`/`shutdown`, and a task
blocked in `read` cannot return it); `BufReader` (bytes already copied into the dropped
future are still lost); `tokio_util::codec::FramedRead` (new direct dependency); a pinned
future reused across iterations (it borrows `stdout` mutably for the whole loop).

**Verification:** Rust gates. Record the failing pre-fix output and the passing post-fix
output of both new tests. `rg -n "read_exact" src-tauri/src/helper` returns nothing.

### R2 — Zeroize parsed Talos mTLS material (MEDIUM)

**Trigger:** [talos.rs](../../src-tauri/src/talos.rs) deserializes `TalosConfigContext`
fields `ca`, `crt`, `key` as `Option<String>`. `valid_inline_material` decodes base64 into
a plain `Vec<u8>`. Neither is zeroized, so client-key material stays in ordinary heap
allocations after drop.

**Why it is a defect:** the sibling parser
[kubeconfig.rs](../../src-tauri/src/storage/kubeconfig.rs) wraps every secret field in
`SensitiveString(Zeroizing<String>)` and zeroizes its decode in `valid_base64`. The Rust
skill requires key material to live in backend secret types. The talosconfig holds the
same class of mTLS key material.

**Exact boundary:** a new crate-private module `src-tauri/src/secret.rs` (declared
`mod secret;` in [lib.rs](../../src-tauri/src/lib.rs)), [talos.rs](../../src-tauri/src/talos.rs)
(`TalosConfigContext`, `parse_config`, `valid_inline_material`), and the matching move in
[kubeconfig.rs](../../src-tauri/src/storage/kubeconfig.rs). Do not change accepted or
rejected config semantics, endpoint/node validation, the session DTO, the renderer
contract, or [helper-v1.md](../protocol/helper-v1.md). The helper still receives the
original `Zeroizing<Vec<u8>>` source unchanged.

**Fix direction (no new dependency):**

1. Move `SensitiveString` and its `Deserialize` impl from `kubeconfig.rs` into
   `secret.rs` as `pub(crate)`, with rustdoc stating it zeroizes on drop and deliberately
   implements neither `Debug` nor `Display`. Add `pub(crate) fn expose(&self) -> &str` and
   keep `is_empty`. Replace kubeconfig's `.0` accesses with `expose()`.
2. Move kubeconfig's `valid_base64` into `secret.rs` as
   `pub(crate) fn decodes_to_nonempty_base64(value: &str) -> bool`, keeping its
   `Zeroizing::new(decoded)` wrap. Both parsers call it; this removes the duplicate logic.
3. In `talos.rs`, change `ca`, `crt`, `key` to `Option<SensitiveString>`. Make
   `valid_inline_material(value: Option<&SensitiveString>)` return
   `value.is_some_and(|value| decodes_to_nonempty_base64(value.expose()))`. A filesystem
   path reference must still be rejected as `UnsupportedAuthentication`.
4. Keep `proxy_url`/`auth` as `IgnoredAny`; they are rejected, not retained.
5. Correct the `TalosSessionStore::insert` rustdoc: the parser does read the
   certificate/key values (to prove they are inline). Say they are held in zeroizing
   memory only for validation.

**Acceptance cases:**

- Every existing `talos.rs` and `kubeconfig.rs` test passes with identical outcomes
  (valid config, external auth/proxy rejection, path-reference and empty-material
  rejection, node allowlist, kubeconfig inline-credential rules).
- `secret.rs` tests cover behavior, not types: `decodes_to_nonempty_base64` accepts valid
  non-empty base64 and rejects an empty value, a decoded-empty value, and a path such as
  `/home/operator/ca.crt`; a deserialized `SensitiveString` round-trips its value through
  `expose()` and reports `is_empty` correctly. Use synthetic values only.
- Do not add a test that only restates a field type ([quality.md section 4](../quality.md)).
  Zeroization itself is not observable from safe Rust tests; the evidence is the type
  change plus review. State this limit in the ledger entry.

**Known residual limit (record, do not fix here):** `serde_saphyr` may hold transient
copies of scalar values while parsing. That applies equally to the kubeconfig parser and
is outside this packet.

**Verification:** Rust gates. `rg -n "SensitiveString|valid_base64" src-tauri/src` shows
one definition in `secret.rs` and no duplicate. No new production `unwrap`/`expect` outside
`#[cfg(test)]`.

### R6 — Accept a cancellation that crosses a natural stream end (LOW)

**Trigger:** the Go helper's `WatchMachineStatus` returns `nil` when its COSI event channel
closes, and `runProbe` then writes `TALOS_STREAM_ENDED{stream_complete}`. If Rust sends
`TALOS_CANCEL_REQUEST` (user stop, session close, consumer close, or the 256-event cap)
while that end frame is in flight, one of two orders follows:

- The Go main loop still has the subscription in `active`: it writes
  `TALOS_CANCEL_RESPONSE` **after** the already-written `TALOS_STREAM_ENDED`. Rust reads
  the end frame with an unacknowledged cancel and returns `TalosStreamInvalid`.
- The Go main loop already processed `finished`: it answers the cancel with
  `ERROR{unknown_subscription}`. Rust reads an error for the cancel request ID and returns
  `ResponseMismatch`.

Both kill and restart a healthy helper and show `TALOS_PROBE_FAILED`. If Rust returned
before reading the cancel reply, that reply would be left in the pipe as a stale frame for
the next exchange, so the fix must consume it.

**Exact boundary:** the `talos_probe_inner` loop in
[supervisor.rs](../../src-tauri/src/helper/supervisor.rs), and the cancellation paragraph
of [helper-v1.md](../protocol/helper-v1.md). Do not change the Go helper or the protobuf
schema.

**Fix direction:** once a cancel is outstanding, the stream finishes only when **both**
of these arrived, in either order, before the existing 2-second cancel deadline:

1. the subscription's terminal frame (`TALOS_STREAM_ENDED` with a valid next sequence, or
   an `ERROR` for the subscription request ID), and
2. the cancel reply: `TALOS_CANCEL_RESPONSE`, or `ERROR` with code `unknown_subscription`
   for the cancel request ID.

Any other frame for the cancel request ID remains `ResponseMismatch`. Without an
outstanding cancel, `ERROR{unknown_subscription}` is never valid. Keep the outcome mapping
unchanged: `cancelled`/`stream_complete` → `Ok`, `stream_failed` or a subscription `ERROR`
→ the existing failure. Model the two flags as a small explicit state (for example
`terminal: Option<Result<(), SupervisorError>>` plus `cancel_replied: bool`) rather than
early `return`s. Update helper-v1.md to state the either-order rule.

**Acceptance cases:** add one deterministic Go fixture, `helper/testdata/endracehelper`,
modeled on [probehelper](../../helper/testdata/probehelper/main.go). On a probe request it
writes the probe response, event 1, and `TALOS_STREAM_ENDED{stream_complete}` with
sequence 2, then reads the next frame. It answers a cancel with either
`TALOS_CANCEL_RESPONSE` or `ERROR{unknown_subscription}`, selected by a counter that
alternates per probe request. Rust tests, with the consumer cancelling at sequence 1:

- both reply variants end the probe with `Ok(())`;
- a following `refresh_status` on the same supervisor succeeds, which proves no stale frame
  remains;
- a cancel reply that never arrives still ends in `Timeout` within the cancel deadline and
  reaps the helper (reuse `cancellation_acknowledgement_wait_is_bounded` semantics);
- the existing cancellation test passes unchanged.

Run the new tests against the pre-fix loop first and record the `TalosStreamInvalid` and
`ResponseMismatch` failures.

**Verification:** Rust gates, Go gates (new fixture), documentation gates.

### R5 — Bound the helper's whole startup inside the parent's deadline (LOW)

**Trigger:** in [main.go](../../helper/cmd/talos-pilot-helper/main.go), `runProbe` creates
`startupContext` with `probeStartDeadline` (15 s) for `ReadVersion`, then waits for the
first status with a **new** `time.After(probeStartDeadline)`. The helper may therefore
spend up to 30 s (plus a 5 s watcher drain) before answering. Rust's
`TALOS_PROBE_STARTUP_DEADLINE` in [service.rs](../../src-tauri/src/helper/service.rs) is
15 s from the same request.

**Why it matters:** on a slow-but-valid node the parent timeout always wins. Rust then
terminates and restarts the helper and reports a generic `TALOS_UNAVAILABLE`, even though
the helper would have produced a classified answer and survived. The helper's own
`talos_probe_timeout` code is also unmapped in Rust: `talos_probe_failure` turns it into
`General`, which is `TALOS_PROBE_FAILED`.

**Exact boundary:** `probeStartDeadline` and the first-status `select` in `runProbe`; the
`talos_probe_failure` mapping and `TALOS_PROBE_STARTUP_DEADLINE` in Rust; the deadline
sentence in [helper-v1.md](../protocol/helper-v1.md). Do not raise the parent deadline.

**Fix direction:**

1. Set `probeStartDeadline = 12 * time.Second`. That leaves 3 s for the helper to encode
   and send its answer before the parent's 15 s deadline.
2. Replace `case <-time.After(probeStartDeadline):` with `case <-startupContext.Done():`,
   so the version read and the first status share one budget. Because `startupContext`
   derives from `ctx`, check `ctx.Err() != nil` first in that branch and take the existing
   cancellation path (send nothing); otherwise send `talos_probe_timeout`.
3. In Rust, map `"talos_probe_timeout"` to `TalosProbeFailure::Unavailable`, matching the
   parent-timeout projection.
4. Add doc comments on both constants naming the other and the required ordering (helper
   strictly shorter than parent). Update helper-v1.md to state both values and their order.

**Acceptance cases:**

- A Go test drives `runProbe` through `serveWithProbe` with a fake `probeSession` whose
  `ReadVersion` takes most of the budget and whose `WatchMachineStatus` never emits. Assert
  that exactly one `talos_probe_timeout` error frame arrives, bounded by one startup
  deadline plus a small margin (the pre-fix code takes about two). The existing seam is `serveWithProbe` with `fakeProbeSession` in
  `main_test.go`, but `probeStartDeadline` is a `const`. Pass the startup deadline as a
  parameter of `serveWithProbe` and `runProbe` (`serve` passes `probeStartDeadline`), so
  the test can use, for example, 50 ms and finish quickly. Do not use a mutable
  package-level variable: it races under `go test -race` with parallel tests.
- A cancelled `ctx` during the first-status wait sends no timeout frame.
- A Rust unit test maps `talos_probe_timeout` to `TALOS_UNAVAILABLE`, retryable.

**Verification:** Go gates, Rust gates, documentation gates.

### R4 — Keep storage work off the main thread (LOW)

**Trigger:** in [lib.rs](../../src-tauri/src/lib.rs), `get_appearance_settings`,
`set_appearance_settings`, `get_credential_storage_status`, and `use_session_only_storage`
are non-`async` commands that lock `std::sync::Mutex<StorageRuntime>`.
`retry_persistent_storage` and `import_kubeconfig` lock the same mutex inside
`spawn_blocking` and hold it across `Database::load_or_create_master_key`, which calls the
OS vault and can wait on a Secret Service unlock or a Keychain prompt.

**Why it matters (corrected):** Tauri 2.12.1 runs non-`async` commands synchronously inside
the webview's IPC protocol handler, which is the **main thread**
(`tauri-macros` `body_blocking`, invoked from `Webview::on_message`). The vault call itself
already runs on the blocking pool. A sync storage command issued during a pending vault
prompt therefore blocks the main thread and freezes the window. Today the renderer's
shared `busy` flag disables the competing controls, so the defect is latent. The backend
must not depend on a renderer flag for responsiveness. Sync commands also perform SQLite
disk writes on the main thread.

**Do not** move the vault call outside the `StorageRuntime` lock. storage-v1.md requires
`load_or_create_master_key` to hold SQLite's immediate write reservation while it consults
the vault, so that instances sharing a database cannot race to create the first key.
Revision 1's "load the key before locking" direction breaks that contract.

**Exact boundary:** the six storage commands in [lib.rs](../../src-tauri/src/lib.rs). Do
not change `StorageRuntime`, `Database`, `VAULT_ACCESS`, the `import_gate`, the
profile+envelope transaction, the command names, arguments, DTOs, or ACL.

**Fix direction:** make the four sync storage commands `async` and run their lock and
storage work in `tauri::async_runtime::spawn_blocking`, as `retry_persistent_storage`
already does. Extract one private helper so all six commands share it, for example
`async fn run_storage<T>(runtime: Arc<Mutex<StorageRuntime>>, action: &'static str,
work: impl FnOnce(&mut StorageRuntime) -> Result<T, ApplicationErrorDto> + Send + 'static)
-> Result<T, ApplicationErrorDto>`, which maps a `JoinError` to the existing
`STORAGE_UNAVAILABLE` error for that action. The storage guard is then never taken on the
main thread or on an async worker.

**Acceptance cases:**

- Existing storage and runtime tests pass unchanged, including the plaintext sentinel
  scans over DB/WAL/SHM/journal.
- `rg -n "fn (get_appearance_settings|set_appearance_settings|get_credential_storage_status|use_session_only_storage)" src-tauri/src/lib.rs`
  shows only `async fn`.
- The native gate passes for the storage and appearance flows; a mock transport cannot
  establish this ([AGENTS.md](../../AGENTS.md)).

**Verification:** Rust gates, native gate, documentation gates (add one sentence to
storage-v1.md stating that storage commands run on the blocking pool, never on the main
thread).

### R3 — Document the status/probe coupling (LOW)

**Trigger:** in [service.rs](../../src-tauri/src/helper/service.rs), `status()` locks
`self.supervisor`, and `talos_probe()` holds that lock for the whole stream. A status
refresh waits until the probe ends, which is bounded by the 256-event cap or the
cancellation deadline. `HelperService::shutdown` waits on the same lock after it signals
cancellation, which is bounded by the 2-second acknowledgement deadline.

**Impact check (done in revision 2):** no renderer component calls `getHelperStatus`;
only [tests/native/helper-status.spec.ts](../../tests/native/helper-status.spec.ts) does,
with no concurrent probe. No user-visible stall exists today. The single helper pipe cannot
interleave a status exchange with a probe stream, so the mutex must not simply be dropped.

**Required outcome (documentation only):**

1. Add to [helper-v1.md](../protocol/helper-v1.md), next to the `get_helper_status`
   paragraph: a status request issued during an active probe waits until the stream ends,
   and why (one in-flight exchange on one pipe).
2. Add a follow-up row to the ledger's remediation table (section 6) with the acceptance
   case: a probe yielding several events is active, `status()` returns before the probe
   ends, the probe then completes normally, and no two exchanges touch the pipe
   concurrently. The probable design is a child-owning task that schedules pipe access
   from a request queue; that is a larger change for a later milestone. When a renderer
   feature polls helper status, that feature must resolve the follow-up first.

**Verification:** documentation gates.

## 6. Definition of done

A packet is complete when its acceptance cases pass, the applicable gate sets in
section 2 pass on the final changed revision, the contract documents match the code, and
[milestone-1.md](../verification/milestone-1.md) records the result with commands,
environment, and any unexecuted gate.

R1 and R2 must be fixed and verified before this remediation is done. R3 is done when its
documentation and follow-up exist. R4–R6 are each either fixed, or recorded as a follow-up
in a ledger table `### Review remediation follow-ups` (columns: ID, severity, acceptance
case copied from this plan, owner decision or reason deferred). Do not present a
compile-only or mock-only result as behavior verification, and do not relabel an unrun
gate as passing. When all packets are closed, set this plan's status line to
`complete` with the final revision.

## 7. Review evidence

Recorded 2026-10-10 on openSUSE Tumbleweed x86_64 with Rust 1.99.0, Go 1.27.1, and the
pinned `protoc`, in a temporary detached worktree at `367eccb` (removed afterwards; no
repository file was changed):

- **R1 reproduction:** a test wrote a 4-byte header to a `tokio::io::duplex`, interrupted
  `read_async_frame` with a 20 ms timeout, wrote the body, and read again. Result:
  `FAILED … next read desynchronized: Frame(InvalidLength)`. A prototype of the
  `FrameReader` in R1 passed the same test. This is mechanism evidence. The packet's tests
  and the full gate sets are still required on the real change.
- **tokio 1.53.2** `src/io/util/async_read_ext.rs`: `read` and `read_buf` are documented
  cancel safe; `read_exact` is documented not cancel safe.
- **Go framing:** `helper/internal/protocol/frame.go` `WriteFrame` calls `writeAll` for the
  header and then again for the payload.
- **Tauri 2.12.1 / tauri-macros 2.7.1:** a non-`async` command expands through
  `body_blocking`, which calls the function inline from `Webview::on_message`, invoked by
  the IPC URI-scheme handler on the webview (main) thread.
- **Not executed in this review:** Clippy, the full `cargo test` suite, Go gates, and the
  native gate on the unmodified branch. The branch's own ledger entries remain the record
  for those.
