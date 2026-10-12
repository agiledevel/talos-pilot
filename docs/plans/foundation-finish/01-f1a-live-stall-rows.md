# 01 — F1a step 4: live stall, exhaustion, and reboot rows

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs one fixture session; follow the [fixture runbook](fixture-runbook.md).

Plan packet: [F1a](../foundation-completion-flash.md#f1a--detect-a-stalled-talos-stream), step 4. Maps to checkpoint C4 and task FND-004.

## Outcome

The stall detection that is already implemented is observed working on a real Talos node. A frozen worker is seen to go stale and end `TALOS_UNAVAILABLE` inside the documented bounds, an idle healthy stream is seen to stay current, and the reboot row asserts one specific outcome. With that evidence, packet F1a is done and C4's live retry-exhaustion evidence is no longer absent.

## Read before you start

| File                                                                                                                                          | Why                                                                                |
| --------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| [Decision 0013](../../decisions/0013-talos-stream-stall-detection.md)                                                                         | The mechanism, the bounds, and the list of things only a live run can confirm      |
| [Decision 0011](../../decisions/0011-talos-stream-reconnect-and-generations.md), with its amendment                                           | The reconnect budget, generations, and sequences that stall detection reuses       |
| [Decision 0007](../../decisions/0007-pin-talos-streams-to-the-node-api.md)                                                                    | Why the stream connects directly to the selected node                              |
| [`src-tauri/tests/talos_fixture.rs`](../../../src-tauri/tests/talos_fixture.rs)                                                               | The live harness you will change                                                   |
| [`helper/cmd/talos-pilot-helper/main.go`](../../../helper/cmd/talos-pilot-helper/main.go)                                                     | `subscriptionStream.run`, the loop that owns the window, the check, and the budget |
| [`helper/internal/talosprobe/client.go`](../../../helper/internal/talosprobe/client.go)                                                       | `Session.CheckLiveness` and `WatchMachineStatus`                                   |
| [Milestone ledger, "F1a packet evidence"](../../verification/milestone-1.md#f1a-packet-evidence-bounded-stall-detection-steps-13--2026-10-12) | What steps 1–3 delivered and the step 4 table                                      |
| [Fixture allowlist](../../verification/fixtures/talos-c4-disposable.md)                                                                       | What you may do to the fixture                                                     |

Apply the `talos-pilot-rust` and `talos-pilot-tauri` skills.

## Context

### What already exists

Steps 1–3 of F1a are committed in `b662b1a`. The Go helper owns one `MachineStatus` watch per subscription, on a connection that dials the selected node directly. Its behavior:

1. Silence is measured from the last projection delivered to the application. After 30 seconds of silence the helper makes one `Version` call on the same node connection, with a 15-second deadline. This is the liveness check.
2. If the check succeeds, nothing changes and the window restarts. An idle healthy node therefore costs one small call every 30 seconds.
3. If the check fails, the helper stops the watch, sends one stale marker, and spends the reconnect budget: at most three attempts, each with a 15-second deadline, waiting about 0.5 s and 1 s (with up to 20 % jitter) before the second and third.
4. A reconnect that succeeds delivers a replacement snapshot under the next generation, with the sequence continuing. An exhausted budget ends the subscription with `talos_unavailable`, which the application reports as `TALOS_UNAVAILABLE`.

The documented bounds are: stale marker within 45 seconds of the last projection (30 s window plus 15 s check), and the terminal outcome within about 92 seconds.

### Why the old live row was removed

The earlier live exhaustion test rebooted the worker and then froze it. It could not pass, for two reasons that you must not repeat:

- `reboot_worker` runs `talosctl reboot` synchronously, and that command waits until the node is ready again. The freeze was therefore sent after the worker had already recovered.
- Before stall detection existed, a frozen node produced no failure at all, so nothing drove the reconnect budget.

The test and its helpers were removed in commit `896e613`. Commit `ae67a9c` still holds them: `worker_machine_name`, `worker_qemu_pid`, `signal_worker_qemu`, and the `SuspendedWorker` guard that sends `SIGCONT` when it is dropped, including on a panic. View them with `git show ae67a9c:src-tauri/tests/talos_fixture.rs`. The manifest field `stateDir` in `tests/fixtures/talos-c4.json` was kept for this purpose; the Rust `FixtureManifest` struct needs its `state_dir` field back to read it.

### What the reboot row does today

`live_interruption_marks_stale_then_recovers_or_exhausts_within_the_policy` accepts either a recovery or an exhaustion. That is too loose now. With stall detection, an ordinary reboot is expected to end the subscription, because the check fails while the node is down and the three attempts are spent before it returns. The owner accepted that outcome.

### What is only an inference

Decision 0013 reasons from the pinned client sources that the official client retries a broken watch by itself for up to 15 minutes, so a broken connection looks like silence to the helper, and that a rebooted node rejects the earlier bookmark. Nobody has observed this. This session should watch for it and record what actually happens.

## Do not

- Do not change the retry policy, the 30-second window, the 15-second deadline, or any helper production code to make a row pass. If a live result contradicts decision 0013, record it and stop; that is a finding for the owner, not something to tune away.
- Do not reboot, freeze, reset, or upgrade a control-plane node. Only the worker `10.79.0.5`.
- Do not signal a process by name or wildcard. Resolve the worker's QEMU process by both the fixture's state directory and the machine name `talos-pilot-c4-20261009-worker-1`, and require exactly one match.
- Do not add host firewall rules to simulate a partition.

## Work

### Part A: harness changes (no fixture needed)

1. Restore the QEMU signal helpers and the `SuspendedWorker` guard from `ae67a9c`, and the `state_dir` manifest field they read.
2. Stop the live cases from blocking the test runtime. Each test runs on a single-threaded Tokio runtime, so a synchronous `talosctl reboot` stops the stream under test from being polled for minutes. Run the reboot on a blocking thread, for example with `tokio::task::spawn_blocking`, and keep the recorded command form unchanged. If you change the command's arguments instead, amend the allowlist first.
3. Add `live_stall_exhausts_while_the_worker_is_suspended`:
   - subscribe to the worker and wait for the first projection;
   - record the time, then suspend the worker with the guard;
   - assert a stale marker arrives within 45 seconds plus a small scheduling margin that you state and justify in a comment;
   - assert the stream ends with `TALOS_UNAVAILABLE` within about 92 seconds of the last projection, with the same kind of margin;
   - assert no projection is presented as current after the stale marker;
   - resume the worker and wait for it to report running.
4. Add `live_stall_recovers_when_the_worker_resumes`:
   - subscribe, wait for the first projection, suspend the worker;
   - as soon as the stale marker is observed, resume the worker;
   - assert a replacement snapshot arrives with the generation advanced by one and the sequence advanced by one, and the same session identity;
   - cancel the stream and assert it ends cleanly.
5. Add `live_idle_stream_stays_current`:
   - subscribe to the worker and do nothing for longer than two windows (more than 60 seconds);
   - assert no stale marker, no error, and a sequence that never goes backwards.
6. Replace the reboot row's either-outcome assertion. Measure the outage: the time from the stale marker until a fresh probe of the worker succeeds. Then assert the outcome that length implies:
   - if the outage outlasted what the budget can cover, the stream must have ended `TALOS_UNAVAILABLE`;
   - a recovery under the next generation is accepted only when the measured outage was short enough for an attempt to be served.
     Print the measured outage and the outcome so they reach the log.
7. Every live case that suspends or reboots the worker ends by waiting for the worker to report running, so the next case starts from a healthy fixture.
8. Run the Rust gates from the README. The live rows are `#[ignore]`, so the normal test run only compiles them.

### Part B: the fixture session

1. Follow the [fixture runbook](fixture-runbook.md) from step 0 to step 6.
2. Run the harness. Keep the complete output.
3. While the reboot row runs, note when the stale marker appears relative to the reboot. If it appears about 30 to 45 seconds after the last projection, the watch stayed silent across the broken connection, which supports decision 0013's reading. If a watch failure arrives immediately instead, that reading is wrong for this case. Record which.
4. If a row fails, read the output before changing anything. Decide whether the test is wrong or the product behaves differently from decision 0013. Fix a wrong test and re-run. Report a product difference.
5. Complete runbook step 7 whatever the result.

## Acceptance cases

State these before editing. Each must be marked in the ledger entry.

1. A suspended worker produces a stale marker within the documented 45-second bound.
2. The same subscription ends `TALOS_UNAVAILABLE` within the documented terminal bound, and presents nothing as current after the stale marker.
3. A worker resumed at the stale marker recovers with a replacement snapshot: generation plus one, sequence plus one, same session.
4. An idle healthy stream stays current for more than two windows.
5. The reboot row records its measured outage and asserts the matching outcome.
6. No live case leaves the worker suspended, on success, failure, or panic.
7. The six earlier live rows still pass on the changed harness.
8. The host is restored to its baseline.

## Gates

- Rust gates from the README, in both feature configurations.
- `pnpm format:check` and `git diff --check`.
- The live harness command from the runbook, with its result lines recorded.
- Go gates only if you touched `helper/`, which this document does not expect.

## Done means

- All eight acceptance cases have recorded results.
- The ledger's unverified-assumptions table is updated: each row this session settled is marked confirmed or refuted, with the observation.
- [Decision 0013](../../decisions/0013-talos-stream-stall-detection.md)'s "Unverified until step 4" section and the [milestone ledger](../../verification/milestone-1.md)'s C4 row are updated to match what was observed.
- The fixture allowlist's status line records this run.
- If every case passed: set this document to `done` and F1a to accepted in the plan. If any case could not be produced, the document stays `in progress` or `blocked`, with the reason.
