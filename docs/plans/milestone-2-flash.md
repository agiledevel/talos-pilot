# Milestone 2: Connections and read views — FLASH implementation plan

Date: 2026-10-11. Plan revision: 2 (same-day review: design-row coverage,
storage/label authority, router decision, reuse of foundation views and query
adapter, decision triggers, and three owner decisions recorded in section 8).
Status: prepared; implementation entry gate open.

Audience: a fast LLM working in small, independently verifiable sessions. FLASH
describes the execution format, not a model vendor. This document prepares the
next milestone; it does not establish that foundation is complete or that these
features have been implemented.

## 1. Authority, objective, and entry gate

Follow [AGENTS.md](../../AGENTS.md), the [locked design](../design.md), and
[quality.md](../quality.md). Milestone 2 delivers context import/linking, a
cluster overview, Talos nodes/services/logs, and the Kubernetes
discovery/resource browser. Invalid credentials, partial permissions,
unavailable nodes, and reconnects must produce usable states.

The [foundation readiness review](../verification/foundation-readiness-2026-10-11.md)
inspected `main` at `f0731cf870ed832e30a5c3d0b4de7f668089e7c5`.
Foundation completion could not be verified: C4 reconnect/resync remains open,
C5 has no adapter, and C6/C8/C9 have incomplete implementation or qualification.
The [milestone 1 ledger](../verification/milestone-1.md) remains authoritative
for those rows. Do not reinterpret the owner's completion statement as passing
evidence or silently change the milestone order.

Before M2.0 is accepted:

1. Complete the remaining packets in the
   [foundation completion plan](foundation-completion-flash.md), starting with
   F1 steps 4–5, then F2–F10. Preserve completed F0 and F1 steps 1–3.
2. Record final-candidate evidence for every row of the original
   [foundation acceptance matrix](milestone-1-flash.md#8-milestone-acceptance-matrix),
   including actual Kubernetes reads/watches, offline workers, OS vaults,
   packages/runtime targets, cleanup, and enforced measured budgets.
3. Record the milestone UX/tradeoff review and its outcome. Update README's
   current stage only when acceptance is supported by evidence.

Source inspection and dependency/API research for milestone 2 may proceed
before acceptance. Feature implementation follows foundation acceptance.
If the owner directs a changed sequence, record that decision and its
consequences; keep unexecuted checks visible.

## 2. Scope and boundaries

| Deliver in milestone 2               | Acceptance boundary                                                                                                                                                           |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Saved profiles and context selection | Explicit Talos/kubeconfig context selection, rename/tags/favorites, explicit credential export, backend credential references, independent connection health and storage mode |
| Connection linking                   | Kubeconfig-only and Talos-only profiles; explicit linking of imported or Talos-retrieved Kubernetes access without assuming both APIs identify the same cluster               |
| Overview                             | Bounded health, version, node, and event summaries with timestamps, provenance, partial permission and stale states                                                           |
| Talos read views                     | Node inventory/details, service status, service/kernel logs, and safe resource/event inspection using upstream clients and sensitivity metadata                               |
| Kubernetes read browser              | Built-in and discovered resources, basic CRD discovery, namespaced/cluster scope, list/filter/sort, details, conditions, events, read-only YAML, basic owner links            |
| Context-safe desktop UX              | Cluster switcher, namespace scope, hash routing, tabs pinned to their original cluster, accessible status and recovery actions                                                |

The table condenses these [design](../design.md) rows. Each is placed in a
packet below so none is lost between milestones:

| Design row or page                                               | Milestone 2 placement                                                                                                 |
| ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Cluster profiles: import, test, rename/tag, select endpoints     | M2.1 import/rename/tag and endpoint selection; M2.3 connection test                                                   |
| Cluster profiles: inspect certificate expiry                     | M2.3, where the API or credential exposes it                                                                          |
| Cluster profiles: export credentials explicitly                  | M2.1, by owner decision (section 8); the design's milestone table leaves it unassigned                                |
| Contexts and namespaces: favorites, health, access inspection    | M2.1 favorites; M2.3 health; M2.2/M2.7 permission feedback                                                            |
| Node inspection: CPU/memory/disks/volumes/network/extensions     | M2.4 projections, M2.5 views                                                                                          |
| Node inspection: services and containers                         | M2.4 projections, M2.5 views; read-only, with no restart action                                                       |
| Live diagnostics: logs, node events, process/resource inspection | M2.4/M2.5; process command lines and environment are not projected by default                                         |
| Kubernetes Nodes: links to matching Talos nodes                  | M2.6, using demonstrated identity evidence only                                                                       |
| Navigation: Home (saved clusters, connection state)              | M2.2/M2.3; "recent operations" waits for the operation engine                                                         |
| Navigation: Overview, Talos, Custom resources, Kubernetes groups | Entries arrive with their working views, per [0009](../decisions/0009-desktop-shell-layout.md)                        |
| Version matrix: legacy 1.33/1.34 browsing                        | Not a milestone 2 acceptance row; M2.7 records whether it ran and M2.9 tracks the remainder for release qualification |

Creation/configuration mutation belongs to milestone 3. Kubernetes CRUD, pod
logs/exec/forwarding and workload actions belong to milestone 4. Lifecycle
operations, backup/recovery, Helm, metrics integration, rich topology/custom
columns/bulk actions remain in their design milestones. Overview shows an
unavailable optional metrics state until the metrics integration exists.
Keep every v1 feature commitment; this is a sequencing boundary.

A read view must not introduce a service restart, configuration apply, Secret
reveal, or arbitrary helper RPC as a convenience action. Access-review API
requests may inform permission feedback; server authorization is always final.
Fixture setup mutations are separately allowlisted harness activity.

## 3. Existing implementation and mandatory reading

The following paths exist at the reviewed baseline. Locate them again with
`rg` when implementation starts; foundation F2–F10 will add contracts and
code that this plan must reuse rather than duplicate.

| Boundary                     | Inspect before editing                                                                                                                                                                                                                                                                                                    |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Native commands/capabilities | [lib.rs](../../src-tauri/src/lib.rs), [main capability](../../src-tauri/capabilities/main.json), [build.rs](../../src-tauri/build.rs)                                                                                                                                                                                     |
| Storage/import               | [storage runtime](../../src-tauri/src/storage/runtime.rs), [kubeconfig parser](../../src-tauri/src/storage/kubeconfig.rs), [Talos sessions](../../src-tauri/src/talos.rs), [storage contract](../storage/storage-v1.md), [0005](../decisions/0005-native-kubeconfig-import.md)                                            |
| Contracts and helper         | [Rust DTO source](../../src-tauri/src/contracts.rs), [application IPC](../protocol/application-ipc.md), [helper protocol](../protocol/helper-v1.md), [helper owner](../../src-tauri/src/helper/service.rs), [Talos client](../../helper/internal/talosprobe/client.go)                                                    |
| Renderer                     | [shell](../../src/components/PilotApp.svelte), [shell state](../../src/lib/state/shell.svelte.ts), [transport](../../src/lib/ipc/transport.ts), [cluster view](../../src/features/clusters/ClustersView.svelte), [0008](../decisions/0008-svelte-skeleton-renderer.md), [0009](../decisions/0009-desktop-shell-layout.md) |
| Harnesses and automation     | [native tests](../../tests/native/helper-status.spec.ts), [Talos fixture harness](../../scripts/talos-fixture.ts), [fixture authority](../verification/fixtures/talos-c4-disposable.md), [CI](../../.github/workflows/check.yml), [CI/release setup](../ci-release.md)                                                    |

Facts at the reviewed baseline that constrain milestone 2:

- Talos credentials are **session-only**. The store in `talos.rs` admits four
  sessions and bounds an import to 64 KiB, eight endpoints and 64 configured
  nodes. No persistent Talos credential kind exists. Persisting a talosconfig is
  new M2.1 work under the storage contract, not a reuse of C4.
- The configured-node bound limits default targets only. Node inventory comes
  from upstream member discovery, so the design's 100-node fixture must not be
  capped by, or derived from, the talosconfig node list.
- [Storage v1](../storage/storage-v1.md) has a nonsecret profile display name,
  credential references with a bounded free-form `value_kind` (unique per
  profile), and encrypted values whose AAD binds profile, reference and value
  kind. One Talos and one Kubernetes credential per profile therefore fit
  without a schema change; tags, favorites and link metadata have no field. [0005](../decisions/0005-native-kubeconfig-import.md) writes a generic
  display name and keeps the imported context label out of plaintext rows.
- The C4 Talos probe view and foundation F3's Workloads feasibility view are
  scaffolding for these features. M2.5 and M2.7 absorb or remove them rather
  than leave two paths to the same data. Preserve their tests where they still
  describe behavior.
- [0008](../decisions/0008-svelte-skeleton-renderer.md) defers the router
  choice, a small hash router or SvelteKit, to the first routed view, which
  M2.2 introduces.

Apply the [Rust](../../.agents/skills/talos-pilot-rust/SKILL.md),
[Tauri](../../.agents/skills/talos-pilot-tauri/SKILL.md),
[TypeScript](../../.agents/skills/talos-pilot-typescript/SKILL.md), and
[project Svelte](../../.agents/skills/talos-pilot-svelte/SKILL.md) skills for
their affected domains. Read the [Svelte reference](../../.agents/skills/svelte/SKILL.md)
for components/runes and [Svelte tooling](../../.agents/skills/svelte-tooling/SKILL.md)
for its diagnostics. Go work uses the Go gates in quality.md.

Keep pinned tools and committed lockfiles. Resolve new API/dependency questions
from primary documentation for the selected version before writing dependent
code. Do not invent SDK methods, pick a new stack, or copy a CLI's lifecycle
implementation. Foundation F3 pins TanStack Query's Svelte adapter; extend that
setup rather than adding a second one. The router and list virtualization need
concrete compatibility/license/advisory evidence when introduced. Use the
existing foundation editor wrappers rather than a second worker setup.

## 4. Contracts, ownership, and resource budgets

These are implementation requirements, not names of existing commands or DTOs.
M2.0 inventories the accepted foundation contracts and M2.1/M2.4/M2.7 define
the exact additions with producer/consumer tests.

- Rust owns profiles, credential references, API clients, discovery caches,
  bounded projections, subscriptions, and shutdown. Go owns Talos API calls.
  Ordinary Kubernetes browsing stays in Rust and shares the foundation adapter.
- A profile has a stable opaque ID and independent optional Talos/Kubernetes
  associations. Distinguish saved profile, imported context, active session,
  target node, and subscription IDs. Labels/endpoints are not cluster identity.
  Linking records an explicit association; it does not establish cryptographic
  equivalence. Show independently observed identities and allow unlinking.
- Keep imported context labels, endpoint material, credentials, and sensitive
  metadata encrypted according to the storage contract. A name the user types
  may occupy the existing nonsecret display-name column, and the rename control
  says that this name is stored unencrypted. The importer never copies an
  imported context label there. Tags and favorites have no v1 field; by owner
  decision (section 8) they are encrypted value kinds, which need no schema
  change and stay hidden until the vault opens. Version any schema change, test
  upgrade/rollback with synthetic v1 data, and preserve unknown-future schema
  rejection. Session-only credentials never become persistent implicitly.
- Native import reads bounded selected files in zeroizing backend memory. Return
  only safe context summaries and opaque selection tokens with an expiry and
  owner. Selection cannot reopen a renderer-supplied path or substitute another
  import. Cancel/expiry releases temporary material. Do not overwrite source
  kubeconfig/talosconfig files.
- Startup can list nonsensitive profile metadata without opening the vault or
  connecting. A user action that opens encrypted metadata or connects may access
  the vault. A restored tab does not silently launch authentication executables.
- Every query/cache key includes profile/session generation, API family,
  namespace or cluster scope, group/version/resource, selectors, sort and page
  identity. Every stream also carries subscription, generation, and sequence.
  Late results for an old connection never populate its replacement or a
  different tab. Replace a snapshot atomically after a successful bounded relist.
- Retain accepted foundation limits for session admission, in-flight requests,
  subscriptions, frames, projection bytes, delivery acknowledgement, retry,
  timeout and cancellation. Milestone 2's linked sessions must reconcile the
  separate Talos/Kubernetes caps that the foundation plan's
  [section 4](foundation-completion-flash.md#4-contracts-and-resource-limits)
  proposes and F2–F4 implement. Do not count a saved profile as an active
  client or assume a single helper stream multiplexes.
- Before adding each stream, record its numeric per-message, queue, retained
  byte/item, task and aggregate session limits in application/helper contracts.
  A proposed starting log ring is 5,000 lines and 4 MiB per viewer, with at most
  two live log viewers globally; both limits apply. Verify against the accepted
  foundation measurements before adopting them. Overflow visibly reports lost
  data and drops bounded old log entries; object-watch overflow instead becomes
  stale and resyncs. Do not increase the 256-event foundation probe cap silently.
- Log exports use a native destination picker and explicit scope review, stream
  bounded chunks, and handle cancellation/partial output. Logs stay in memory by
  default and may contain workload/operator secrets: no automatic persistence,
  payload logging, telemetry, or background export.
- Navigation stops inactive resource watches/log follows unless an explicitly
  visible shell-owned task retains them. Pause behavior must say whether capture
  continues into the bounded ring. Closing a tab/session, unlinking/replacing
  credentials, failed startup, channel loss and app shutdown cancel and join
  owned tasks and release clients, caches, permits and secret buffers.
- Normal sessions verify TLS. Never convert authenticated failure to maintenance
  mode or insecure TLS. Permission, credential, certificate, unsupported API,
  unavailable, partial, bounded and stale states remain distinct.
- Default projections exclude Secret data/stringData, raw configuration, tokens,
  arbitrary annotations, and unfiltered SDK errors. Generic/custom objects may
  themselves contain secrets: project approved fields by default. Explicit
  read-only YAML inspection is temporary, bounded, redacted, and excluded from
  persisted query caches. Secret reveal is a separate later flow.

## 5. Execution packets

Sequence: **M2.0 → M2.1 → M2.2 → M2.3 → M2.4 → M2.5 → M2.6 → M2.7 → M2.8 → M2.9**.
Implement one packet or its smallest complete numbered subpacket per session.
Each leaves a runnable app, updates relevant contracts/docs, and records actual
gate results. An unavailable required integration keeps its packet in progress.

### M2.0 — Accept the foundation handoff and establish the evidence ledger

**Prerequisite:** section 1's foundation entry gate. **Result:** the implementing
session can identify accepted APIs, limits, measured budgets and platform/version
evidence without reconstructing chat history.

1. Inspect the current revision and working tree. Reconcile every foundation
   acceptance row with final-candidate evidence; resolve stale status prose.
2. Create `docs/verification/milestone-2.md` with these packet IDs, observable
   acceptance criteria, base revision, environment/tool pins, and pending status.
   Do not prepopulate passes from this planning document.
3. Record the now-existing Kubernetes adapter paths, storage handles, offline
   editor wrapper, performance commands and helper scheduling contract. Identify
   extensions versus replacements. Preserve the acknowledged-delivery contract.
4. Refresh frozen/locked installs and applicable baseline gates. Identify fixture
   identity/version allowlists and available native/platform runners.
5. Recheck the current Talos 1.14 patch and the Kubernetes fixture patches from
   primary sources, per the design's version policy. A newer patch moves module,
   CLI, image and manifests together, as F1 did. Record the expiry dates of
   accepted security exceptions. The foundation plan's Trivy exceptions expire
   on 2026-11-30, and its date trigger carries into this milestone.

**Acceptance:** prerequisite rows have evidence; the baseline passes or newly
found defects are fixed and verified before dependent feature packets proceed.

### M2.1 — Deliver backend profiles and safe multi-context import

**Prerequisite:** M2.0. **Result:** an operator explicitly selects contexts and
saves or retains a session-only profile, then can reopen, rename, tag, favorite,
or remove it without revealing credentials, and can export a credential only
through an explicit reviewed action.

1. Extend native Talos/kubeconfig import to enumerate safe bounded context
   summaries, explicitly choose contexts, and atomically associate credentials.
   Reuse existing validation; reject unsupported auth before any SDK action.
   Add the persistent Talos credential kind under the storage contract. The
   session-only Talos path remains for an unavailable vault or explicit choice.
2. Add backend profile list/update/remove and credential association services.
   Duplicate names remain distinguishable by opaque identity; repeated imports
   require explicit create/update choice and never overwrite another profile.
   Let the operator choose the endpoint order and default targets from the
   imported context's validated lists. Store that choice with the encrypted
   credential, since endpoints are sensitive. The official client still owns
   failover.
3. Store tags and favorites as encrypted value kinds, per the section 8 owner
   decision. Add a tested schema migration only where schema v1 cannot
   represent an association. Separate deleting local credentials from any
   cluster action; block or close dependent sessions through their owner
   before removal.
4. Add explicit credential export, per the section 8 owner decision. The
   operator picks one profile credential and reviews its scope: profile, API,
   contexts, and the fact that the file holds usable unencrypted credentials.
   Rust writes the selected bytes through a native save dialog straight to that
   destination, with owner-only permissions where the platform supports them.
   The bytes never cross IPC, are never logged, and never replace an imported
   source file. Cancel or a failed write leaves no partial file, and nothing
   records the destination path. Portable encrypted recovery bundles remain
   milestone 6 work.
5. Cover persistent, session-only and mixed mode; vault unavailable/locked;
   cancelled picker; missing/deleted context; malformed/oversized import;
   atomic failure, concurrent update and restart with encrypted credentials.
   For export, cover cancel, an unwritable or existing destination, an
   interrupted write, session-only credentials, and a plaintext-sentinel scan
   of logs, IPC and the database.

**Gates:** Rust, generated IPC/TypeScript, actual native allowed/denied import and
storage flows, migration/encryption/redaction/restart checks. Source files remain
unchanged; imported bytes/paths stay behind the backend boundary.

### M2.2 — Add cluster selection, namespace scope, and context-pinned tabs

**Prerequisite:** M2.1. **Result:** profile selection opens implemented read
destinations; changing the global cluster does not retarget an open work tab.

1. Introduce the first hash routes with explicit unknown-route recovery. Use
   stable IDs, never credentials, endpoints or imported context labels in URLs.
   By owner decision (section 8), use a small hash router: a pinned package,
   or a minimal in-repository router over rune state. Record the choice, with
   pin, license, advisory, CSP and native evidence, in an ADR that completes
   0008's deferral. SvelteKit is not adopted.
2. Add the cluster switcher above navigation, profile management in Settings,
   Home's saved clusters with their connection state, namespace selection, and
   visible context in the status bar and each work view. Add navigation entries
   only with their implemented view.
3. Extend the TanStack Query setup that foundation F3 established to profile
   and session-scoped keys. Keep presentation state in scoped rune modules; do
   not copy authoritative object caches into separate global stores. A replaced
   session invalidates its keys.
4. Test two clusters with identical resource names, tab restore/close, removed
   profiles, unknown hash, changed namespace, slow old responses and keyboard
   focus. Do not require namespace enumeration permission to use an explicitly
   entered allowed namespace.

**Gates:** renderer/state tests, browser/axe in both themes and densities, shell
sizes 1280×800/1024×700/720×480, production build and actual native context flow.

### M2.3 — Link access and expose independent connection states

**Prerequisite:** M2.2. **Result:** Talos-only, Kubernetes-only and linked
profiles connect explicitly; failure of one API leaves the other usable.

1. Build connection test/open/close on foundation sessions. Project version,
   certificate expiry where available, supported capabilities, and safe endpoint
   metadata; classify invalid credentials, TLS, permission and transport failure.
2. Link an imported Kubernetes context explicitly. Also retrieve kubeconfig via
   an authorized Talos connection using the official client, keeping bytes in
   private pipes/Rust storage; review the observed API target before linking.
   Retrieval failure cannot replace existing credentials or break Talos access.
3. Preserve exec/auth-provider rejection by default. For supported kubeconfig
   exec authentication, first define a narrow backend trust contract and threat
   review: native executable selection/resolution, exact arguments/configuration
   binding, working directory/environment allowlist, deadlines, output limits,
   cancellation, credential redaction, expiry and trust invalidation on changes.
   Show a safe explicit trust review before invocation, use no shell, and never
   launch at import/startup. This is a backend credential-provider adapter, not
   renderer process access. Credentials cannot be passed in arguments or
   environment variables; providers requiring that remain unsupported.
   Unsupported providers remain actionable errors.
4. Test admin and restricted identities, expired/wrong certificates, one API
   offline, endpoint failover, helper failure, unlink/relink, restart and stale
   connection results. Test exec denial invokes nothing, changed binary/config
   invalidates trust, and a trusted synthetic provider's failures/cleanup.

**Gates:** Rust/Go/contract/renderer gates, native trust/permission boundary,
allowlisted live Talos retrieval/linking and Kubernetes connection cases. Record
the supported auth subset explicitly; unimplemented exec trust stays open here.

### M2.4 — Extend the helper with owned Talos read subscriptions

**Prerequisite:** M2.3. **Result:** node inventory and service/resource reads
have distinct identities and bounded lifetimes; a diagnostic stream cannot
indefinitely block helper control/status or another admitted read.

1. Resolve the tracked R3 serialization limitation in
   [the remediation plan](foundation-review-remediation-flash.md). Use one child
   owner to route admitted requests/events/cancellation and prioritize control
   outcomes. Document numeric concurrency/queue limits; do not add competing
   readers of the same pipe or start a helper per table row.
2. Extend Protobuf at its source with explicit read operation kinds and safe
   projections. Check capability/version negotiation and incompatible builds.
   Preserve cancel-safe framing, node-pinned COSI streams and sensitive-resource
   rejection using pinned upstream metadata.
3. Use upstream discovery and typed resources for members, role, version, stage,
   readiness, hardware/storage/network/extensions, services, containers,
   processes, node events and safe diagnostics. Read the pinned upstream role
   rules for each RPC before relying on `os:reader`. Project process names and
   resource figures, not command lines or environment, which can carry secrets.
   Permit explicit target selection when discovery is denied; never turn a
   partial member list into complete cluster health.
4. Test concurrent control/stream work, unknown IDs, cancellation races, partial
   frames, slow consumers, overflow, denied resources, TLS failure, helper exit,
   reconnect replacement generations and parent shutdown.

**Gates:** Rust/Go including race tests, cross-language fixtures/regeneration,
actual native channels and allowlisted live reads with restricted identities.

### M2.5 — Deliver Talos nodes, services, and bounded live diagnostics

**Prerequisite:** M2.4. **Result:** an operator selects a node, inspects its
safe details/services/events, and follows service or kernel logs with clear scope.

1. Add searchable nodes and detail/service/container/process/resource views
   using M2.4 projections. Show per-node permission/unavailable/stale states and
   explicit target identity. Fold the C4 probe view's read and stream into these
   views and remove the separate probe page once they cover it.
2. Add log source selection, timestamps, follow/pause, search/filter, clear and
   explicit export. Separate display pause from stopping capture; expose truncation
   and reconnect gaps. Implement the section 4 retention/export contract.
3. On node/source/tab change, stop the old source and reject its late events.
   Returning to a tab starts a new identified follow; no hidden background logs.
4. Test reader/denied roles, absent service, unavailable worker, noisy logs,
   incomplete UTF-8 chunks, export cancellation/failure, helper death and shutdown.

**Gates:** renderer/browser/axe, Rust/Go/contract gates, native file/channel
checks, live multi-node/service/kernel diagnostics and observed task cleanup.

### M2.6 — Add a bounded overview with independent health summaries

**Prerequisite:** M2.5. **Result:** the overview identifies which API, nodes,
and permissions contribute to its health summary and when each observation aged.

1. Compose lightweight Kubernetes node/workload/event and Talos summaries with
   backend ownership. Overview subscribes only while active; avoid a watch for
   every discovered resource. Reuse admitted sessions and existing projections.
2. Keep healthy/degraded/connecting/unavailable/unauthorized/unsupported/stale
   states and partial coverage distinct. Do not compute healthy from zero visible
   objects or missing permission. Show optional metrics as unavailable until
   supported; no fabricated charts or alternate metrics adapter.
3. Link safe summary items into the implemented Talos details. Add Kubernetes
   detail links with M2.8, when their destination exists. Correlate Talos/Kubernetes
   nodes only using demonstrated identity evidence; ambiguous matches remain
   unlinked rather than matching display names alone.
4. Test either API offline, restricted namespace-only access, no nodes/events,
   missing optional APIs, stale summary recovery and switching clusters mid-load.

**Gates:** backend invariant tests, renderer/browser/axe, native subscriptions,
live restricted/partial/offline scenarios and measured watch/resource budgets.

### M2.7 — Add permission-aware Kubernetes discovery and list views

**Prerequisite:** M2.6. **Result:** accessible built-in and custom resource
types are browsable in their correct namespace/cluster scope.

1. Extend foundation dynamic discovery in Rust. Bound API groups, versions,
   resource descriptors and response bytes; keep preferred/served versions and
   verbs explicit. Handle unavailable aggregated APIs and denied discovery as
   partial results. Never hide a list permission error as an empty resource list.
2. Add basic CRD discovery and generic resource navigation. Replace foundation
   F3's Workloads feasibility view with the generic list, keeping its
   permission, pagination and stale-response tests. A CRD appearing,
   changing served version, or disappearing refreshes relevant discovery/cache
   generations; inaccessible CRD definitions do not imply no custom APIs exist.
3. Reuse paginated list/watch/relist and acknowledged delivery. Virtualize the
   rendered list; document whether search/sort is server-supported or only within
   the loaded bounded snapshot. Avoid claiming global sort across partial pages.
4. Validate selectors/scope/GVR and backend cursor ownership. No renderer URL,
   arbitrary API proxy or unbounded raw-object command. Respect list-only,
   watch-denied and namespace-only identities with usable bounded refresh paths.
5. Test 410/relist, repeated expiration, RBAC/scope faults, absent optional APIs,
   CRD install/remove, cluster-scoped resources, UID replacement, high volume,
   overflow and cancellation on scope change.

**Gates:** Rust/IPC/renderer, native channels, disposable Kubernetes 1.36 and
affected core read/discovery/watch cases on 1.35/1.37. CRD/RBAC fixture changes
must be named in the allowlist before the harness applies them. Record whether
legacy 1.33/1.34 discovery and browsing ran. If not, M2.9 tracks the gap as
release qualification work.

### M2.8 — Add safe resource details, events, and read-only YAML

**Prerequisite:** M2.7. **Result:** selecting a resource opens details for its
exact cluster/scope/GVR/UID, with bounded conditions/events and explicit YAML.

1. Define approved common and built-in detail projections; bound owner references,
   conditions, messages and events. Treat untrusted messages as text. Generic
   custom views begin with metadata and approved fields.
2. Distinguish deleted/recreated objects, missing get/event permission and removed
   API versions. Owner links preserve cluster, namespace and UID; an inaccessible
   related resource leaves the current view usable.
3. Reuse the lazy offline Monaco wrapper for explicit read-only YAML with
   redaction, byte/time bounds and disposal. Exclude Secret values and clear
   temporary documents on close/session replacement. No apply/save mutation or
   persistent raw-object cache is added in this packet.
4. Test malicious markup, annotations/custom secret-bearing fields, oversize
   documents/events, missing related APIs, deletion/recreation, stale detail
   response, native offline workers and editor cleanup.

**Gates:** backend projection/redaction tests, renderer/browser/axe, real native
worker/CSP/detail flow, live restricted built-in/custom resource checks.

### M2.9 — Qualify the milestone and prepare the creation handoff

**Prerequisite:** M2.0–M2.8 accepted. **Result:** milestone 2 has a recorded
acceptance decision and a concrete handoff to milestone 3.

1. Run the final applicable suites and real fixture scenarios on the final
   candidate. Refresh affected native/package/vault/helper evidence on the
   declared platform targets; build runners alone do not prove minimum OS use.
2. Run the accepted foundation performance harness/budget command against the
   new profiles, queries, logs and virtualized lists. Separate synthetic
   20-profile/3-cluster/100-node/10,000-object load from native/live evidence.
   Resolve regressions before accepting the milestone.
3. Perform a separate correctness, security, ownership, cleanup, accessibility
   and documentation review. Update setup/import/auth/reconnect/export guidance,
   supported versions, limitations, generated contracts and dependency notices.
4. Review the matrix below with the owner, together with every section 8
   question still open and any untracked legacy-version rows. Update README to milestone 3 only after
   acceptance. Prepare the creation/configuration FLASH plan with durable
   operation plans, locks, journaling and reconciliation before its first mutation.

## 6. Verification commands and enforcement

Use pinned tools from their actual installed locations; historical `/tmp`
locations are not setup instructions. Check Node/pnpm/Rust/Go/protoc versions
before executing gates. Local and CI commands must remain identical.

Existing commands to select according to the changed boundary:

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test:coverage
pnpm test:e2e
pnpm contracts:check
pnpm format:rust:check
cargo clippy --manifest-path src-tauri/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --locked --all-targets
RUSTDOCFLAGS="-D warnings" cargo doc --manifest-path src-tauri/Cargo.toml --locked --no-deps
cargo build --manifest-path src-tauri/Cargo.toml --locked
pnpm test:native
pnpm desktop:build
pnpm production:check
pnpm advisories:check
pnpm audit --audit-level=low
pnpm audit:go
pnpm inventory:check
git diff --check
```

Also run Clippy/tests with `--features native-test` when that boundary changes.
Run doctests (`cargo test --manifest-path src-tauri/Cargo.toml --locked --doc`)
for crates exposing executable examples. The existing live Talos harness is
`pnpm talos:fixture -- --manifest tests/fixtures/talos-c4.json` with
`--talosconfig`, `--reader-talosconfig` and `--denied-talosconfig` file
references. The [C4 allowlist](../verification/fixtures/talos-c4-disposable.md)
authorizes its use; extend both before a new action, identity or node. In `helper/`, assert
`test -z "$(gofmt -l .)"`, then run `go vet ./...`, `go test ./...`,
`go test -race ./...`, `go mod verify`, and `go build ./...` on supported targets.
Rebuild default production after `pnpm test:native`, which shares its executable
path, before production/advisory artifact inspection. Package qualification
requires actual bundles, not `desktop:build`'s `--no-bundle` executable alone.

M2.0 must record the actual cluster/platform/performance commands delivered by
foundation F5/F9/F10. Do not invent their names here or count their absence as a
pass. Extend their real harnesses with these packets and enforce the same gates
in CI. Preserve exact-revision CodeQL/Trivy and contract drift failure semantics.

Fixture authority is independent of a profile's display label. Verify manifest
identity, API endpoint, version, synthetic credentials, and allowed setup/fault
actions before connecting. Reuse recorded host remediation authorization only
within its existing scope. Destroy fixtures and restore the recorded host
baseline after success and failure; document anything deliberately retained.

## 7. Milestone acceptance matrix

Every row starts pending. Link implementation, revision, commands, actual
environments, results and unexecuted limits in the milestone 2 ledger.

| Required result                           | Packets   | Evidence                                                                                                                                                  |
| ----------------------------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Foundation accepted                       | M2.0      | All original C/FND acceptance rows, measured budgets, final review and milestone handoff                                                                  |
| Safe profile/context lifecycle            | M2.1      | Atomic import/selection, persistent/session/mixed modes, migration, restart, rename/tag/favorite/remove, reviewed credential export, no plaintext secrets |
| Context and navigation isolation          | M2.2      | Two clusters with same names, namespaces, tab pinning, old response rejection, keyboard/resize/theme checks                                               |
| Independent linked access                 | M2.3      | Talos-only/Kubernetes-only/linked access, retrieval, mismatched/failed links, restricted identities, TLS and trusted exec failure paths                   |
| Talos read/diagnostic views               | M2.4–M2.5 | Upstream read semantics, sensitivity handling, node routing, bounded logs/export, permission/reconnect/helper/control/cleanup cases                       |
| Honest overview                           | M2.6      | Partial coverage, API independence, stale/recovery, missing metrics and identity-safe node links                                                          |
| Kubernetes discovery/browser              | M2.7–M2.8 | Built-in/custom scope, optional/denied APIs, pagination/watch/relist, UID identity, safe detail/YAML/events and version matrix                            |
| Native/platform/performance qualification | M2.9      | Real native/fixture evidence, affected target packages/vaults/offline CSP, measured budgets, no production test surfaces                                  |
| Documentation and review                  | M2.9      | Current contracts/workflows/setup, final diff review, explicit limitations, owner milestone review and next handoff                                       |

## 8. Open questions and decision triggers

**Owner decisions (2026-10-11).** The owner accepted three recommendations:

1. **Tags and favorites are encrypted.** They are stored as encrypted value
   kinds under schema v1 and decision 0005, and appear once the vault opens.
   Startup lists profiles by display name without them. No schema migration or
   0005 amendment is planned for them.
2. **A small hash router serves the first routes.** M2.2 records the pinned
   router, or a minimal in-repository one over rune state, in an ADR that
   completes 0008's deferral. SvelteKit is not adopted.
3. **Explicit credential export is milestone 2 work.** It is delivered in M2.1,
   because the design's milestone table leaves it unassigned. This assigns an
   existing v1 row; it does not change the release scope.

No other milestone 2 scope question is open. The following need an answer
before the step that depends on them. A default applies unless the owner
directs otherwise. An owner-required item blocks only its dependent step.

| Question                                                              | Resolution point       | Default and escalation                                                                                                                                                                                                  |
| --------------------------------------------------------------------- | ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Does F2's saved-credential listing need to change for profiles?       | M2.0 inventory         | Reuse F2's handle and label rules as accepted. A different identity or label model needs its own evidence and decision                                                                                                  |
| Which kubeconfig exec providers can be trusted, and on what contract? | M2.3 step 3            | The design permits trusted exec. Write the trust contract and threat review before any code. It runs no provider until the review is accepted. Providers that need credential arguments or environment stay unsupported |
| Do the starting log-ring and viewer limits survive measurement?       | M2.5, against F10 data | 5,000 lines/4 MiB per viewer and two live viewers. Change them only with the measurements and the contract update                                                                                                       |
| Does a new Talos 1.14 patch or Kubernetes fixture patch exist?        | M2.0, M2.9             | Refresh module, CLI, image and manifests together after primary-source verification. Never mix versions                                                                                                                 |
| Do Trivy exceptions expire during this milestone?                     | Before 2026-11-30      | Repeat the applicability evidence and renew or remove each exception, as foundation F8 describes. Never widen one to unblock a packet                                                                                   |

## 9. Session handoff and first execution prompt

For each packet record: base revision and working-tree state; trigger and expected
result; inspected sources/skills; prerequisite evidence; contract/schema/generation
changes; ownership and numeric limits; normal/invalid/denied/failure/cleanup tests;
commands, exit codes and actual hosts; mock versus native/live evidence; separate
review findings; remaining tasks with acceptance criteria; next smallest packet.

**Current next executable work:** foundation F1 steps 4–5, documented in the
[foundation ledger](../verification/milestone-1.md#next-increment), followed by
F2–F10. This milestone 2 plan remains prepared until that acceptance gate closes.

After foundation acceptance, use:

> Read AGENTS.md, docs/plans/milestone-2-flash.md, and the final foundation
> evidence. Execute M2.0 only: verify its entry gate on the current revision,
> inventory the accepted contracts and measured budgets, create the milestone 2
> ledger, and run the applicable baseline gates. Read relevant skills first.
> Record actual environments and failed/unexecuted checks; preserve unrelated
> changes. Review the final diff separately and hand off the next smallest
> packet. Do not implement M2.1 in the same session or relabel a missing
> foundation result as a pass.
