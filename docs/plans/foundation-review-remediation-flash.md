# Foundation branch review remediation: FLASH implementation plan

Date: 2026-10-09. Plan revision: 1. Status: ready for incremental implementation.

Audience: a fast LLM with limited reasoning, working in small verifiable sessions. This
document supplies repository context, exact task packets, concrete fix direction, required
tests, and verification commands. It does not assume a particular model vendor. Creating
this plan does not execute or qualify the fixes.

## 1. Objective and authority

Resolve the defects found in the review of branch `ft-foundation` at revision `a31e086`
against `main` (`2926f4c`). The branch is otherwise sound and well-tested; these are
targeted corrections, not a redesign. Each packet is independently implementable and
keeps the application runnable.

The [locked design](../design.md) defines architecture and scope. [AGENTS.md](../../AGENTS.md)
and [quality.md](../quality.md) define mandatory gates. The
[milestone 1 plan](milestone-1-flash.md) defines the surrounding foundation work; this
document only remediates reviewed defects and cannot override any of those sources. If a
newer owner instruction disagrees, follow it and update the affected packet first.

Read before editing:

1. [AGENTS.md](../../AGENTS.md), [quality.md](../quality.md) sections 2, 4, 5, 8.
2. The skill for each affected domain:
   [Rust](../../.agents/skills/talos-pilot-rust/SKILL.md) (R1–R5) and, for R3 only,
   [Tauri](../../.agents/skills/talos-pilot-tauri/SKILL.md).
3. [helper-v1.md](../protocol/helper-v1.md) and
   [storage-v1.md](../storage/storage-v1.md) for the contracts these packets must keep.
4. The current source files named in each packet. Do not trust this plan's line numbers
   after the repository advances; re-locate the code with `rg` first.

## 2. Environment note (affects verification, not the fixes)

The review was static. On the review host, `cargo fmt --all --check` and
`git diff --check` passed, but Clippy, `cargo test`, `cargo build`, and `cargo doc` could
not run: the host toolchain was rustc 1.98.1 while
[rust-toolchain.toml](../../rust-toolchain.toml) pins 1.99.0, and `protoc` (required by
[src-tauri/build.rs](../../src-tauri/build.rs) through `prost-build`) was absent, so any
compile-based gate panicked before building. `go`, `node`, and `pnpm` were also absent.

Consequence for you: **R1 is identified from tokio's documented cancel-safety semantics
and code inspection, not from a reproduced failure.** Your first job in R1 is to write the
failing test and confirm it actually fails before the fix, so the defect is proven rather
than assumed. Run every gate on a correctly provisioned host with the pinned toolchain,
`protoc`, Go, and pnpm available. Report executed versus unexecuted gates separately, as
[quality.md section 9](../quality.md) requires.

## 3. Findings summary

Severity is the reviewer's assessment. Do not lower a severity to skip work; if you
believe a finding is wrong, record evidence in the packet's verification section and stop.

| ID | Severity | Area | One-line summary |
| -- | -------- | ---- | ---------------- |
| R1 | High | helper supervisor | `read_exact` in the probe `select!` is not cancel-safe; a cancel mid-frame desyncs the pipe and kills the helper |
| R2 | Medium | Talos config parse | parsed `ca`/`crt`/`key` and their base64 decode are not zeroized, unlike the kubeconfig parser |
| R3 | Low | helper service | `get_helper_status` blocks for the whole duration of an active probe stream |
| R4 | Low | storage commands | a `std::sync::Mutex` guard is held across blocking OS-vault I/O on the async executor |
| R5 | Low | helper deadline tie | the Go probe deadline equals the Rust startup deadline, so a slow node yields a generic error |

## 4. Operating instructions

Work one packet at a time, in order R1 → R2 → R3 → R4 → R5 (R1 and R2 are the required
fixes; R3–R5 are recommended and may become tracked follow-ups). For every packet:

1. Inspect current source and record the actual base revision and working-tree state.
2. Write the acceptance cases and the failing test **before** the behavior change. Confirm
   the test fails for the stated reason.
3. Implement the smallest complete change, including reachable error and cleanup paths.
4. Run the packet's verification commands on the final code, inspect exit codes, then do a
   separate diff review. Correct findings and rerun.
5. Update [milestone-1.md](../verification/milestone-1.md) with the packet result, linking
   this plan. Report passed, failed, and unexecuted checks separately.

Do not weaken strict types, add broad lint suppressions, bypass CSP, replace the selected
stack, or turn a required gate into an always-passing script. Do not add a dependency
without recording version, license, and advisory review; R1 and R2 need **no** new
dependency (see each packet). Keep generated artifacts regenerated, never hand-edited.

## 5. Task packets

### R1 — Make the probe stream loop cancel-safe (HIGH)

**Trigger:** `helper/supervisor.rs` races `cancellation.changed()` against a frame read in
`tokio::select!`. The read path `read_probe_envelope` → `read_envelope` →
`read_async_frame` performs two sequential `read_exact` calls (header, then body).

**Why it is a defect:** tokio documents `AsyncReadExt::read_exact` as **not cancel safe** —
"If the method is used as a branch in `tokio::select!` and another branch completes first,
then some data may already have been read into `buf`." (Verify against the pinned
`tokio = "=1.53.2"`; see `src/io/util/async_read_ext.rs`.) `self.stdout` is an unbuffered
`ChildStdout` with no `BufReader`, so when the cancel branch wins after the header (or part
of the body) has been consumed, those bytes are dropped. The next loop iteration starts a
fresh `read_async_frame` that reads the next 4 bytes as a length — now misaligned into the
previous frame's payload — producing a garbage length and a `Frame`/`Decode`/
`ResponseMismatch` error. `talos_probe` maps any error to `terminate()`, killing the
helper. This is reachable whenever cancellation lands while a `TALOS_STATUS_EVENT` frame is
in flight; the Go helper writes events from the watcher goroutine concurrently with the
cancel acknowledgement (`helper/cmd/talos-pilot-helper/main.go`, `runProbe` and the
`TALOS_CANCEL_REQUEST` case).

**Exact boundary:** `src-tauri/src/helper/supervisor.rs`, the `talos_probe_inner` `select!`
loop and `read_async_frame`/`read_envelope`/`read_probe_envelope`. Do not change the
protocol, the DTOs, or the Go helper. Do not change the documented 2-second cancellation
acknowledgement deadline in [helper-v1.md](../protocol/helper-v1.md).

**Acceptance cases (write these tests first):**

- A cancel signal that arrives while a status-event frame is only partially delivered does
  **not** corrupt the next read; the stream ends as `cancelled`/`stream_complete` (Ok) or a
  genuine helper failure, never a spurious `Frame`/`Decode`/`ResponseMismatch` from
  desynced bytes.
- The existing `streams_validated_status_and_cancels_the_helper_subscription` and
  `cancellation_acknowledgement_wait_is_bounded` tests still pass unchanged.
- The 256-event forward bound and the 2-second cancel-ack deadline still terminate a
  stalled helper (no regression of the documented cleanup).

**Fix direction (choose one; no new dependency):**

1. *Preferred — dedicated reader task.* Move `self.stdout` into a task that loops
   `read_envelope` and sends each whole `Envelope` over a bounded
   `tokio::sync::mpsc::channel(1)`. The `select!` then chooses only between
   `frame_rx.recv()` and `cancellation.changed()`, **both cancel-safe**. The reader task is a
   resource with an explicit owner: abort/join it on every exit path (success, error, and
   `terminate()`), consistent with how `stderr_drain` is already owned and awaited. A closed
   channel maps to `ChildExited`/`Pipe`. Keep the cancel-ack deadline by wrapping
   `frame_rx.recv()` in `timeout_at(cancel_deadline, …)`.
2. *Alternative — stable pinned future.* Hoist the frame read into one future created
   outside the loop and re-poll it across iterations so it is never dropped mid-frame; use
   `Pin<Box<…>>` or `tokio::pin!` with an `Option` take/put-back, and keep `cancel_deadline`
   as the only in-`select` cancellation. This keeps the current ownership but is
   pin-fiddly; prefer option 1 unless you can justify this clearly.

Whatever you choose, the invariant is: **a frame read that can be interrupted by
cancellation must not lose bytes already consumed from the pipe.** State that invariant in
a comment where the read loop lives.

**Verification:**

- `cargo fmt --manifest-path src-tauri/Cargo.toml --all -- --check`
- `cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings`
- `cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets`
- The new mid-frame-cancel test must fail on the pre-fix code and pass after. Record both
  results; a test that only passes is not evidence.
- No `protoc`/Go change is needed, but the supervisor tests build the real Go helper, so Go
  must be on `PATH` for `cargo test` here.

### R2 — Zeroize parsed Talos mTLS material (MEDIUM)

**Trigger:** `src-tauri/src/talos.rs` parses the talosconfig with `TalosConfigContext`
fields `ca`, `crt`, `key` typed as `Option<String>`, and `valid_inline_material` base64-
decodes into a plain `Vec<u8>` only to check it is non-empty. Neither is zeroized, so live
client-key material sits in ordinary heap allocations until dropped, and the decode buffer
is never scrubbed.

**Why it is a defect:** it contradicts the sibling parser in the same branch.
`src-tauri/src/storage/kubeconfig.rs` wraps every secret field in
`SensitiveString(Zeroizing<String>)` and zeroizes its base64 decode in `valid_base64`
(`Zeroizing::new(decoded)`). The Rust skill requires keys to live "in backend secret types
with redacted formatting." The talosconfig holds the same class of mTLS key material.

**Exact boundary:** `src-tauri/src/talos.rs` only — the `TalosConfigContext` struct,
`parse_config`, and `valid_inline_material`. Do not change the accepted/rejected config
semantics, the endpoint/node validation, the session DTO, or the renderer contract. Do not
change [helper-v1.md](../protocol/helper-v1.md): the helper still receives the original
`Zeroizing<Vec<u8>>` source unchanged.

**Acceptance cases:**

- Behavior is unchanged: every existing `parse_config`/`TalosSessionStore` test (valid
  config, external auth/proxy rejection, path-reference and empty-material rejection,
  node allowlist) still passes with identical outcomes.
- A regression test asserts the parsed key/`crt`/`ca` values are held in a zeroizing type.
  A direct way: expose a `#[cfg(test)]` accessor or assert inside the module that the
  secret fields are `Zeroizing`-backed, mirroring how `kubeconfig.rs` proves its
  `SensitiveString`. Do not print or retain secret bytes in the test.

**Fix direction (no new dependency):**

1. Add a `SensitiveString(Zeroizing<String>)` newtype with a `Deserialize` impl, exactly
   mirroring `storage/kubeconfig.rs` (`String::deserialize(d).map(|v| Self(Zeroizing::new(v)))`).
   Reuse the same pattern; do not invent a different one.
2. Change `ca`, `crt`, `key` in `TalosConfigContext` to `Option<SensitiveString>`. Update
   `valid_inline_material` to take the inner `&str` and wrap its decode:
   `Zeroizing::new(STANDARD.decode(value)?)`. Keep the "must decode and be non-empty"
   meaning so a filesystem path reference is still rejected as
   `UnsupportedAuthentication`.
3. `proxy_url`/`auth` stay `IgnoredAny` (they are rejected, not retained). The session still
   stores the original `Zeroizing<Vec<u8>>` config; only the parse-time copies change.

**Verification:**

- `cargo fmt … --check`, `cargo clippy … --locked --all-targets -- -D warnings`,
  `cargo test … --locked --all-targets`.
- Confirm no secret value appears in any `Debug`/`Display`/log path you touched: the
  newtype must not derive `Debug` in a way that prints the inner string (mirror
  `kubeconfig.rs`, which does not derive a revealing `Debug`).
- `grep -rn "unwrap()\|expect(" src-tauri/src/talos.rs` shows no new production
  `unwrap`/`expect` outside `#[cfg(test)]`.

### R3 — Decouple `get_helper_status` from an active probe stream (LOW)

**Trigger:** `src-tauri/src/helper/service.rs`. `status()` acquires
`self.supervisor.lock().await`; `talos_probe()` holds that same mutex across the entire
stream loop. A status refresh during a healthy probe waits until the probe ends.

**Why it matters:** this is a responsiveness coupling, not a deadlock — the wait is bounded
by the 256-event forward cap or the cancellation deadline. But an unrelated read should not
be gated on stream lifetime. Confirm the impact before choosing scope: if no renderer path
polls status during a probe today, this may be a documented limitation plus a tracked issue
rather than an immediate code change.

**Exact boundary:** `service.rs` ownership of the supervisor and the `status()`/
`talos_probe()` locking. Do not change the wire protocol or DTOs. Any change must preserve
the documented "one in-flight exchange" property — you may not simply drop the mutex,
because the single helper pipe cannot interleave a status exchange with a probe stream.

**Acceptance cases (if implemented):**

- A test starts a probe that yields several events and asserts `status()` returns while the
  probe is still active, then the probe completes normally.
- No two exchanges touch the pipe concurrently (the "one in-flight" invariant still holds).

**Fix direction:** the clean fix is to own the child in a dedicated task that serializes
pipe access through a request queue, so `status()` and probe events are scheduled rather
than mutex-blocked. That is a larger refactor; if it exceeds this packet's scope, instead
(a) document the coupling in [helper-v1.md](../protocol/helper-v1.md) and this ledger, and
(b) open a tracked issue with the acceptance case above. Do not leave it silently
undocumented.

**Verification:** `cargo fmt … --check`, `cargo clippy … -- -D warnings`,
`cargo test … --all-targets`; if only documented, run the documentation gates
(`git diff --check`, valid local links) instead.

### R4 — Do not hold the storage mutex across blocking vault I/O (LOW)

**Trigger:** `src-tauri/src/lib.rs` and `src-tauri/src/storage/runtime.rs`.
`retry_persistent_storage` and `import_kubeconfig` lock
`std::sync::Mutex<StorageRuntime>` and then call `retry_persistent()` /
`store_kubeconfig()`, which reach `Database::load_or_create_master_key` →
`vault.load_or_create_key()` (a keyring call that can block, e.g. on a locked Secret
Service or a macOS Keychain prompt) **while the guard is held**.

**Why it matters:** a `std::sync::MutexGuard` held across blocking I/O on the async
executor ties up a tokio worker for the duration of the vault call, and is exactly the
"do not hold synchronous lock guards across `.await`" pattern the Rust skill warns about.
Correction to the earlier review wording: sync Tauri commands run on a tokio worker via
`respond_async_serialized`, **not** the UI thread, so this is a worker-starvation /
responsiveness risk, not a frozen window. Severity is low.

**Exact boundary:** the storage command path in `lib.rs` and the vault access in
`runtime.rs`. Do not weaken the "one import at a time" `import_gate`, the
`VAULT_ACCESS` serialization in `vault.rs`, or the atomic profile+envelope transaction.

**Acceptance cases:**

- Existing storage/runtime tests pass unchanged (atomic import, session-only, vault-failure
  requires explicit choice, retry retains session values).
- A test or inspection shows the vault key is obtained without holding the `StorageRuntime`
  guard across the keyring call.

**Fix direction (pick the smallest that holds the invariant):** obtain the `EncryptionKey`
from the vault **before** locking `StorageRuntime`, then lock only to perform the SQLite
transaction with the already-loaded key; or move the whole storage call into
`spawn_blocking` (as `import_kubeconfig` partly does) so the blocking vault + DB work runs
off the async worker and the guard never spans an `.await`. Preserve ordering: capacity/ID
checks and the encrypted write must remain atomic with respect to other imports.

**Verification:** `cargo fmt … --check`, `cargo clippy … -- -D warnings`,
`cargo test … --all-targets`. Re-run the storage sentinel scans (no plaintext in
DB/WAL/SHM/journal) that already exist in `storage/` tests.

### R5 — Make the helper probe deadline strictly shorter than the parent's (LOW)

**Trigger:** the Go `probeStartDeadline` (`helper/cmd/talos-pilot-helper/main.go`,
`15 * time.Second`) equals the Rust `TALOS_PROBE_STARTUP_DEADLINE`
(`src-tauri/src/helper/service.rs`, `Duration::from_secs(15)`).

**Why it matters:** both start near the probe request, so on a slow-but-valid node the Rust
parent timeout can fire at the same moment as, or before, the helper's own
`talos_probe_timeout`. When the parent wins, the user sees a generic `TALOS_UNAVAILABLE`
instead of the helper's more specific classification. This is a small correctness/UX
regression, not a crash.

**Exact boundary:** the two constants and the [helper-v1.md](../protocol/helper-v1.md)
sentence describing the "15-second initial read deadline." Keep the parent deadline the
outer bound; the helper must finish its own deadline first so its specific error reaches
the parent.

**Acceptance cases:**

- The helper's startup deadline is strictly less than the parent's (e.g. helper 12s, parent
  15s), leaving headroom for the helper to encode and send `talos_probe_timeout` before the
  parent gives up.
- Existing handshake/status/probe tests pass; the timeout classification test (if present in
  the Go suite) still asserts `talos_probe_timeout`.

**Fix direction:** lower the Go `probeStartDeadline` below the Rust value, update the
`helper-v1.md` wording to state both deadlines and their ordering, and keep them in a single
documented place if practical. Do not raise the parent deadline to "fix" the tie.

**Verification:** in `helper/`, `test -z "$(gofmt -l $(find . -name '*.go'))"`,
`go vet ./...`, `go test ./...`, `go test -race ./...`, `go build ./...`; then the Rust
gates above (the supervisor tests build the real helper). Update the documentation gate for
the `helper-v1.md` edit (`git diff --check`, valid links).

## 6. Definition of done

A packet is complete when its acceptance cases pass, the applicable Rust/Go/documentation
gates in [quality.md section 3](../quality.md) pass on the final changed revision, the
contract docs (`helper-v1.md`, `storage-v1.md`) match the code, and
[milestone-1.md](../verification/milestone-1.md) records the result with commands,
environment, and any unexecuted gate. R1 and R2 must be fixed and verified before this
remediation is considered done; R3–R5 must be either fixed or converted into tracked issues
with their acceptance cases. Do not present a compile-only or mock-only result as behavior
verification, and do not relabel an unrun gate as passing.
