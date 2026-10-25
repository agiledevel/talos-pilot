# 02 — F3: the bounded scoped Kubernetes list probe

Read the series [README](README.md) and the [ledger](ledger.md) first. This document needs a fixture session for its live read; follow the [fixture runbook](fixture-runbook.md). Most of the work needs no fixture.

Plan packet: [F3](../foundation-completion-flash.md#f3--deliver-the-bounded-scoped-kubernetes-list-probe). Maps to checkpoint C5.1 and tasks FND-004 and FND-005. Prerequisite: document 01 recorded in the ledger, or recorded as blocked.

## Outcome

A user opens an imported Kubernetes session, picks a namespace and an optional selector, and sees paginated, nonsensitive Pod summaries, or a precise state for forbidden, unreachable, unsupported, or empty. The list comes from Rust through real Tauri IPC, and one run reads the allowlisted Talos-hosted Kubernetes 1.36 fixture.

## Read before you start

| File                                                                                                                | Why                                                                    |
| ------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| [Plan section 4](../foundation-completion-flash.md#4-contracts-and-resource-limits)                                 | Every limit below comes from here; it is the authority                 |
| [Decision 0012](../../decisions/0012-kubernetes-client-session-boundary.md)                                         | The client and session boundary F2 built, which this packet extends    |
| [Decision 0005](../../decisions/0005-native-kubeconfig-import.md)                                                   | Rules for stored credentials and labels; must not be reversed          |
| [Decision 0009](../../decisions/0009-desktop-shell-layout.md)                                                       | The shell layout and the rule for adding a navigation entry            |
| [Application IPC](../../protocol/application-ipc.md)                                                                | The IPC contract you extend                                            |
| `src-tauri/src/kubernetes/` (`mod.rs`, `session.rs`, `client.rs`, `error.rs`, `synthetic.rs`)                       | The existing adapter                                                   |
| `src-tauri/src/lib.rs`, `src-tauri/src/contracts.rs`, `src-tauri/build.rs`                                          | Commands, DTO sources, and the command list that generates permissions |
| `src/lib/ipc/transport.ts`, `src/lib/ipc/validation.ts`, `src/lib/ipc/testing/browserMock.ts`                       | The renderer side of IPC                                               |
| `src/components/PilotApp.svelte`, `src/features/talos/TalosProbePanel.svelte`, `src/lib/state/talosProbe.svelte.ts` | The pattern for a view, its state module, and its place in the shell   |
| `scripts/talos-fixture.ts`, `tests/fixtures/talos-c4.json`                                                          | The model for the Kubernetes fixture harness                           |
| `tests/native/kubernetes-session.spec.ts`, `scripts/test-native.ts`                                                 | How native tests reach a synthetic API server                          |

Apply the `talos-pilot-rust`, `talos-pilot-tauri`, `talos-pilot-typescript`, and `talos-pilot-svelte` skills.

## Context

### What F2 delivered

- `kube` 4.2.0 and `k8s-openapi` 0.28.0 with the single schema feature `v1_36`, TLS through rustls with the ring provider. The `kube` features enabled today are `client`, `config`, `ring`, and `rustls-tls`.
- `KubernetesSessionStore` in `src-tauri/src/kubernetes/session.rs`: `open` builds a client from a resolved credential, `apiserver_version` reads the version, `close` releases the session. Constants: `MAX_KUBERNETES_SESSIONS = 4`, `MAX_ADMITTED_REQUESTS = 32`, `REQUEST_DEADLINE = 15 s`.
- The client is built only from an explicitly selected, validated in-memory kubeconfig. There is no ambient, in-cluster, or `$KUBECONFIG` path. Exec, auth-provider, and external-file credentials and insecure TLS are rejected before any SDK call.
- `KubernetesError` has stable redacted categories: `CredentialInvalid`, `SessionLimit`, `SessionUnknown`, `CapacityExceeded`, `Unauthorized`, `Forbidden`, `CertificateInvalid`, `Unavailable`, `UnsupportedResponse`, `ClientUnavailable`, `RegistryUnavailable`.
- Tauri commands: `import_kubeconfig`, `list_kubernetes_credentials`, `open_kubernetes_session`, `close_kubernetes_session`, `read_kubernetes_version`. DTOs: `KubernetesCredentialSummaryDto`, `KubernetesSessionDto`, `KubernetesVersionDto`.
- A synthetic TLS API server for tests, `src-tauri/src/kubernetes/synthetic.rs`, compiled only for tests and the `native-test` feature.

All of that was proven against the synthetic endpoint only. No real cluster has been read yet.

### How a command reaches the renderer

Adding a command touches these places, and all of them must change together:

1. the DTO in `src-tauri/src/contracts.rs`, then `pnpm contracts:generate` to write `src/lib/ipc/generated/`;
2. the command function in `src-tauri/src/lib.rs` and its entry in `generate_handler!`;
3. the command name in the list in `src-tauri/build.rs`, which generates the `allow-...` permission;
4. the permission in `src-tauri/capabilities/main.json`;
5. a runtime parser in `src/lib/ipc/validation.ts` and a typed function in `src/lib/ipc/transport.ts`;
6. the explicit browser mock in `src/lib/ipc/testing/browserMock.ts`;
7. `docs/protocol/application-ipc.md`;
8. a native test that the command works for the main window and is denied to a window without the capability.

Command wrappers stay thin. Business logic lives in `src-tauri/src/kubernetes/`.

### The shell

The navigation bar lists Home, Talos, and Settings. Decision 0009 admits a new entry only when it has a working view, and only with the name and position of a design navigation group. Pods belong to the design group **Workloads**. No router is installed; do not add one until a view needs an addressable parameter.

### Limits you must implement

From plan section 4. Test at each bound and one step beyond it.

| Limit                                    | Value                                                                                     |
| ---------------------------------------- | ----------------------------------------------------------------------------------------- |
| Items per list page                      | 200                                                                                       |
| Retained projected objects per probe     | 10,000                                                                                    |
| Decoded list page                        | 2 MiB, enforced on response bytes before decoding                                         |
| Projection budget per session            | 16 MiB                                                                                    |
| Field bounds                             | name 253 bytes, namespace 63, UID 64, resource version 128, phase 32, each selector 1 KiB |
| Attempt deadline                         | 15 s per request                                                                          |
| Complete multi-page snapshot             | 60 s, retries included                                                                    |
| Transient read failures                  | 3 attempts in total, 0.5 s and 1 s backoff, at most 20 % jitter                           |
| Auth, permission, input, or TLS failures | never retried                                                                             |
| Admitted requests                        | 32; reject excess before spawning or queuing                                              |

Hitting any cap yields an explicit bounded or partial status. It must never appear as a healthy complete list.

### What may be projected

Only: name, namespace, UID, resource version, phase, and a readiness summary. Never annotations, Pod specs, environment variables, addresses, or raw error or status messages from the server.

## Do not

- Do not read ambient kube configuration anywhere, including in the fixture harness.
- Do not list all namespaces to find out what the user may see. A restricted identity must work with only its own namespace.
- Do not let the Go helper touch Kubernetes.
- Do not store server data twice in the renderer. The query cache holds server data; rune state modules hold selection and UI state.
- Do not raise a limit to make a test or a fixture fit.

## Work

### Part A: fixture harness and allowlist (before the first live request)

1. Add `pnpm kubernetes:fixture`, with a real script beside `scripts/talos-fixture.ts`. It accepts a checked manifest and a credential **file reference**, never inline credentials. Before running anything it validates the fixture ID, expected server version, endpoint, CA or cluster identity, namespace, and the allowed setup and cleanup scope. It refuses an ambient current context and refuses a credential file inside the repository.
2. Extend the manifest and the [fixture allowlist](../../verification/fixtures/talos-c4-disposable.md) with:
   - the Kubernetes endpoint (`https://10.79.0.1:6443` on the last run; confirm the literal endpoint, CA, and server version from `/tmp/tpc4/kubeconfig` at provisioning);
   - one synthetic namespace that setup may create and must delete;
   - the setup actions inside that namespace: a restricted read identity (a ServiceAccount with a Role and RoleBinding limited to reading Pods there), and a small number of synthetic Pods to list;
   - making the fixture kubeconfig readable by the harness user, the same way the Talos credential files are handled.

   Amend the allowlist **before** performing any of these.

3. Keep setup authority separate from the read identity: the admin kubeconfig creates the namespace and the restricted identity; the probe under test reads with the restricted identity.
4. Record a namespace UID or equivalent anchor at setup, and require it to match before cleanup deletes anything.

### Part B: Rust list

5. Implement the list in `src-tauri/src/kubernetes/`: server-side pagination with `limit` and the continue token, namespace and selector validation before the request, the byte and field bounds, the aggregate cap, and resource-version preservation. Continuation state stays in the backend.
6. Distinguish these outcomes as different states: an API that does not exist, an API the identity is forbidden to read, an empty list, and an expired continuation token.
7. Add limited API discovery only as far as the probe needs it.
8. Add the command, DTOs, permissions, parsers, transport function, mock, and protocol documentation as listed under "How a command reaches the renderer".

### Part C: the view

9. Add a Workloads navigation entry with a working Kubernetes feasibility view under `src/features/`. Follow the Talos panel's structure: a `.svelte` component with an `@component` comment and documented props, and a `.svelte.ts` state module with TSDoc.
10. Pin the TanStack Query Svelte adapter here, where it is first used. Research the current compatible version from its upstream documentation; do not guess a version. Use it for the server projection and cache identity. The cache key includes session, namespace, resource, selectors, and page identity.
11. Show the session and namespace in the view and in the status bar. A session or query change discards late responses. Pagination never retargets a request to a different session or namespace.
12. Keep the Kubernetes and Talos connection states independent.
13. Check the layout at 1280×800, 1024×700, and 720×480.

### Part D: the live read

14. Follow the [fixture runbook](fixture-runbook.md). After its step 5, run `pnpm kubernetes:fixture` against the fixture.
15. Check whether the fixture kubeconfig authenticates with a client certificate. If it does, the admin read is the first real mutual-TLS handshake; record it against the carried row in the ledger.
16. Clean up the synthetic namespace, verify it is gone, then complete runbook step 7.

## Acceptance cases

1. A valid restricted identity lists Pods in its namespace across more than one page.
2. A 401 and a 403 produce their own states and are not retried.
3. An unsupported API, a TLS fault, and an empty list each produce a distinct state.
4. An expired continuation token is handled without presenting a mixed list.
5. A malformed namespace or selector is rejected before any request.
6. Oversized or hostile fields and an oversized response are rejected at their bounds; the aggregate cap produces a partial status, not a complete one.
7. Replacing the session or query during a request discards the late response.
8. Work beyond the admission limit is rejected before it starts.
9. Tasks, permits, and retained data return to baseline after an error and after a cancel.
10. The fixture harness rejects a wrong identity, a wrong version, and a wrong manifest.
11. The new command is allowed for the main window and denied to a window without its capability, in a native run.
12. The view passes the accessibility checks and keeps the shell layout at all three sizes.
13. One real list comes from Rust against the allowlisted Kubernetes 1.36 fixture through the harness.

## Gates

Rust, TypeScript and Svelte, IPC, Tauri, and dependency gates from the README, because this packet touches all of them. Add `pnpm test:e2e` for the browser flow and `pnpm test:native` for the capability checks. Then `pnpm desktop:build` and `pnpm production:check`.

## Done means

- Every acceptance case has recorded evidence. Mock, native, and real-cluster results are labelled separately.
- `docs/protocol/application-ipc.md`, `docs/dependencies.md`, and `pnpm inventory:generate` reflect the new command and dependency.
- The plan's exit holds: native list results come from Rust against the allowlisted Talos-hosted Kubernetes 1.36 fixture.
- The milestone ledger's C5 row and this series ledger are updated.
