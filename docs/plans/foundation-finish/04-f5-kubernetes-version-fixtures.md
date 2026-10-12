# 04 — F5: Kubernetes 1.35 to 1.37 fixtures

Read the series [README](README.md) and the [ledger](ledger.md) first.

Plan packet: [F5](../foundation-completion-flash.md#f5--qualify-kubernetes-135137-fixtures). Maps to checkpoint C5.3 and task FND-004. Prerequisite: document 03 is `done`.

## Outcome

One reproducible harness runs the read and watch cases against three explicitly identified disposable fixtures: Kubernetes 1.36 inside the Talos fixture, and Kubernetes-only fixtures for 1.35 and 1.37. It refuses any unrelated context. With that evidence, checkpoint C5 is complete on Linux.

## Read before you start

| File                                                                                       | Why                                                                       |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| [Plan, owner decisions](../foundation-completion-flash.md#1-objective-and-owner-decisions) | Decision 2 defines the split fixture matrix                               |
| [quality.md section 7](../../quality.md#7-cluster-and-release-qualification)               | The version matrix rule                                                   |
| The Kubernetes fixture harness and manifest from documents 02 and 03                       | What you extend                                                           |
| [Fixture allowlist](../../verification/fixtures/talos-c4-disposable.md)                    | The model for a new allowlist entry                                       |
| `.github/workflows/check.yml`                                                              | Where a fixture job would be wired                                        |
| [Decision 0012](../../decisions/0012-kubernetes-client-session-boundary.md)                | The single compile-time schema feature and the runtime discovery strategy |

Apply the `talos-pilot-rust` and `talos-pilot-typescript` skills.

## Context

### Why three fixtures

The owner decided on 2026-10-11 that Kubernetes 1.36 runs in the allowlisted Talos fixture, and that Kubernetes-only disposable fixtures cover the affected 1.35 and 1.37 adapter cases. A Kubernetes-only fixture proves Kubernetes behavior and nothing about Talos.

The adapter is compiled against one schema, `v1_36`, and relies on runtime discovery for 1.35 and 1.37. This packet is where that strategy meets real servers.

### What is not known yet

No Kubernetes-only fixture exists, and nobody has verified what container or virtualization tooling works for the harness user on this host. On 2026-10-12 the `docker` command was pointed at a podman socket that was not running, although Docker bridges exist on the host. QEMU and KVM work with `sudo`. Find out before designing anything:

- which container runtime the harness user can actually reach, without changing host configuration;
- whether a local-cluster tool can be pinned and run with it;
- what network, if any, each candidate needs.

Record what you checked and what you found. If a candidate needs a host firewall, zone, or bridge change, that is outside the recorded remediation: stop and ask the owner.

### Pins

Pin exact patch images by digest for 1.35 and 1.37 after checking the upstream release lists for the current patches. Do not write a version or digest from memory. A container CLI used to set up a development fixture is not a runtime dependency of the shipped application; say so in `docs/dependencies.md`.

## Do not

- Do not use an existing cluster, an ambient kube context, or the owner's virtual machine.
- Do not replace a missing fixture with mock-only coverage. A version that cannot be provisioned stays pending, with the exact missing resource recorded.
- Do not select a second `k8s-openapi` schema feature or disable TLS validation.
- Do not store credentials or raw resource payloads in evidence. Store redacted revision, version, topology, and results.

## Work

1. Do the discovery described above and record it in the ledger.
2. Extend the harness from document 02 to the Kubernetes-only fixtures: one manifest and one allowlist entry per fixture. Keep the same checks before anything is dispatched: identity, version, endpoint, CA, namespace, and scope.
3. Provision the 1.35 and 1.37 fixtures with pinned images. Each gets its own allowlist entry, written before the fixture is used, naming its identity, its network, what setup may create, and how it is destroyed.
4. Use synthetic namespaces and restricted identities, as in document 02. Seed only allowlisted data to cause add, change, delete, and delete-then-recreate. Keep setup authority separate from the read identity. Require the recorded namespace anchor to match before cleanup.
5. Run the affected read and watch cases on all three versions. Run the Talos-hosted 1.36 fixture with the [fixture runbook](fixture-runbook.md).
6. Where a live fault is impractical to generate, cover it with a deterministic TLS or 410 fault and label it as such.
7. Wire a fixture job into CI, or into an explicit fixture workflow, with the same harness command and with evidence artifacts. Push it and read the hosted result. If the result cannot be read (blocker B2 in the ledger), validate the workflow with the pinned workflow validator and record its hosted execution as unexecuted.
8. Destroy every fixture and verify cleanup, including after a partial setup or a failed test.

## Acceptance cases

For each of 1.35, 1.36, and 1.37:

1. A real paginated list.
2. A valid read and a restricted read.
3. Watch changes for add, change, delete, and delete-then-recreate.
4. Cancellation ends promptly and cleanly.
5. Recovery after a disconnect.

And once:

6. The harness rejects a wrong identity, a wrong version, and a wrong manifest.
7. Cleanup succeeds after a partial setup failure and after a test failure.
8. Each fixture is destroyed and the host is back at its baseline.

## Gates

- The harness command for each fixture, with result lines recorded.
- Rust and TypeScript gates for whatever the harness or adapter changes touched.
- Workflow validation for a changed workflow file.
- `pnpm inventory:check` and `docs/dependencies.md` for any new pin.

## Done means

- Every required C5 version row has evidence, or is recorded as pending with the exact missing resource.
- The plan's exit holds: every required C5 version row has evidence. If a version stays pending, this document is `blocked`, not `done`.
- Legacy 1.33 and 1.34 stay out of scope; they are listed in the ledger's deferred rows.
- The milestone ledger's C5 row and this series ledger are updated.
