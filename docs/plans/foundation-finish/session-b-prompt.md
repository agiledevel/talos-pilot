# Session B — launch prompt for the next long-horizon task

Use this prompt for a fresh implementing model in this repository. It launches **document 05 only**, not the rest of the foundation series. The [ledger](ledger.md), [packet](05-f6-editor-workers-csp.md), [series rules](README.md), and [FLASH pace](../../flash-pace.md) remain authoritative. The prompt does not expand the owner's permissions or replace a packet acceptance case.

## Verified handoff, not a new qualification claim

- Final CI implementation: `facf409`. Foundation [39879520097](https://github.com/agiledevel/talos-pilot/actions/runs/39879520097) passed in 8m14s; Security [39879520035](https://github.com/agiledevel/talos-pilot/actions/runs/39879520035) passed in 8m19s. The renderer ran 176 tests and eight browser flows; all three PR desktop runners and all CodeQL languages passed. These are measured samples, not guaranteed budgets.
- Documentation-only proof: `6e73cc4`. Foundation [39880666037](https://github.com/agiledevel/talos-pilot/actions/runs/39880666037) passed in 39s; Security [39880665805](https://github.com/agiledevel/talos-pilot/actions/runs/39880665805) passed in 31s. Desktop, renderer execution and CodeQL reused actual executed evidence from `facf409`; formatting, npm audit and Trivy ran fresh. Reuse is not fresh native or compiler evidence.
- The pre-Session-B implementation/PR/local handoff is closed in the ledger. First default-branch native/cache-maintenance entry points, current Intel macOS native setup, minimum-OS/installed-package rows and an authorized end-to-end release remain unexecuted where recorded. Do not reclassify them as passed, or reopen unrelated CI work merely to begin this packet.
- Document 05 has not started. Its native offline-worker/CSP evidence does not exist yet. The next session must produce it.

## Copy-paste task prompt

```text
You are implementing Session B of Talos Pilot's foundation finish series.
Work autonomously through document 05 (F6: offline Monaco/YAML workers under
packaged CSP), including implementation, failure-path tests, actual native
verification, documentation, review, commits and pushes. Do not stop after
planning or scaffolding. Stop at document 05's exit or a genuine recorded
blocker; do not automatically start document 06 or a fixture session.

Repository: /developer/ifjkt/talos-pilot
Allowed working/push branch: ft-foundation-completion
Owner's PR: 2, targeting main. Do not merge, close, retarget or edit it.
No force-push, main push, tag, release, or unapproved host configuration change.
Preserve unrelated owner work. Do not reset the branch to the snapshot below.

START AND AUTHORITIES
1. Inspect git status/current HEAD and current hosted checks once. The verified
   CI code baseline is facf409; 6e73cc4 proved the docs-only fast path. Later
   handoff commits are documentation, not new native acceptance. Re-read the
   actual branch-head results and record their evidence class in your entry.
2. Read AGENTS.md; docs/design.md; docs/quality.md; docs/flash-pace.md;
   docs/plans/foundation-finish/README.md; the ledger's status, owner decisions,
   carried rows and latest entries; the Session B section of closeout-plan.md;
   docs/plans/foundation-finish/05-f6-editor-workers-csp.md completely; and F6
   in docs/plans/foundation-completion-flash.md. Follow the packet's read list,
   including decisions 0008/0009, existing shell/state/styles, build configs,
   native harness and browser tests. Do not re-derive completed F0-F4/A1/A2.
3. Read the relevant project Svelte, TypeScript and Tauri skills plus the Svelte
   lifecycle/attachment reference and tooling skill; read the Rust skill before
   any Rust change. Keep this a client-only Svelte application, not SvelteKit.
4. Reuse and verify the pinned private toolchain; use the checked-in bootstrap
   if necessary. Do not assume scratch installations survive, install tools
   system-wide, or refresh unrelated pins. Current pins: Node 26.12.1, pnpm
   12.15.0, Rust 1.99.1, Go 1.27.3, protoc 36.2; repository manifests win if
   the owner has deliberately updated them.
5. Before code, mark document 05 in progress and write a nine-case acceptance
   matrix with observable tests and browser/native evidence columns. Record
   that proceeding before fixture document 04 follows the owner's Q11 order
   (A2, then 05-08); no fixture or completed F5 claim is involved.

IMPLEMENT THE PACKET, NOT A MOCK DEMONSTRATION
- Re-verify and fix shell preferences/rejected saves, focus return, target
  context, scaling, themes and densities using existing accessible patterns.
- Research current compatible Monaco and YAML support from upstream sources;
  pin exact versions and commit lockfile, license and generated inventory
  updates. Do not choose versions from memory or hand-edit generated output.
- Build real reusable YAML editor and diff components with documented props,
  @component comments, cohesive .svelte.ts state, and attachment-owned cleanup.
  Put the benign synthetic feasibility surface in an existing working view,
  not a new placeholder navigation entry. No secret-bearing machine editor,
  credential import, cluster client or cluster mutation belongs in this task.
- Lazy-load the editor only on first use. Bundle every worker/schema asset as
  a same-origin file; reject/disable remote schema references and runtime
  downloads. Produce a real worker diagnostic for malformed YAML, clear it by
  correcting the text, and render a real diff with visible target context.
- Keep the packaged CSP restrictive: no blob:, unsafe-eval, wildcard or remote
  executable source. Do not remove style-src's required unsafe-inline by
  assumption. If a policy change is necessary, collect native evidence and
  document/escalate it under the packet/design rules; never bypass the CSP.
- Prove actual ownership/disposal across repeated open/close, prop replacement,
  resize, theme change and cancelled lazy import. Observe real worker/model/
  listener counts returning to baseline; a called cleanup spy is not proof.
- Test both light/dark themes, both densities, 1280x800, 1024x700 and 720x480,
  keyboard/focus behavior, rejected preference persistence, and axe checks.
  Include unauthorized-origin and inline-script denial and zero remote
  requests. Simulate offline conditions within owned test resources; do not
  disconnect the owner's network/VPN or change host firewall policy.
- In the actual release executable with embedded production assets, prove
  acceptance cases 3-8 under the development WebView, not merely browser mocks
  or a successful build. Extend the native harness as needed without exposing
  test commands/listeners/capabilities in production. Record shell/editor/
  worker chunk sizes as observations, not invented performance budgets.

EXECUTION, VERIFICATION AND CLOSE
- Make coherent checkpoints. While CI runs, do independent review/docs/test
  work. Use narrow checks during iteration, then pnpm check:ci once for the
  final renderer state plus the packet's browser/accessibility matrix. Do not
  immediately duplicate it with check/test:run/test:coverage on unchanged input.
- Run every applicable dependency, contract, Rust/Go/native and production gate
  required by quality.md and the packet. Do not suppress findings or let scope
  reuse replace the new native evidence. Unknown/changed CI inputs run fully.
- For final native evidence, use the registered Native tests workflow for the
  relevant revision or the recorded local pnpm test:native equivalent. Before
  default-branch registration, use local evidence rather than repeated 404
  dispatch attempts. On Linux use private Xvfb/X11 and private XDG directories;
  clean owned displays, helpers, workers and servers on failure and success.
- Do not race Cargo/native builds in src-tauri/target or Vite builds in dist.
  After native tests, run pnpm desktop:build and pnpm production:check to restore
  and verify the ordinary production executable; run advisory checks against
  that current binary when applicable. Never qualify stale build output.
- Review the final diff separately for security, bounds, ownership, failure
  paths, documentation, scope and generated-artifact consistency. Correct
  findings and rerun affected gates. Record all nine acceptance cases with
  command, revision, environment and actual result; identify every unexecuted
  or failed check and its practical limit.
- Update docs/dependencies.md, the finish ledger/status board, relevant user/
  recovery documentation, README and milestone checkpoint evidence as needed.
  Mark document 05 done only when its entire exit holds. Keep C6 in progress:
  document 06, installed-package and remaining WebView qualification are not
  completed by this packet. If blocked, leave an exact resumable next step.
- Commit code with its ledger entry and push each commit only to the allowed
  branch. Use the repository's semantic messages, per-command git identity
  Tamas Kiss <ifjkt@ifjkt.com>, and an honest model Co-Authored-By trailer; do
  not change global git config. Read final hosted results before claiming
  passes. No recursive ledger-only result commits.

Only ask the owner about a material design/security/scope decision, an authority
conflict, or a genuinely unavailable resource. Do not reopen answered owner
questions. Finish with revision/run links, acceptance matrix, commands/results,
remaining limits and the precise next packet or resumable step. No mock-only
completion, stale native proof, fabricated qualification, or hidden skipped gate.
```
