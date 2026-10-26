# 0020 — Generated third-party notices from locked dependency graphs

- **Status:** accepted for F8 (2026-10-26)
- **Packet:** [F8/document 07](../plans/foundation-finish/07-f8-dependencies-notices-security.md)
- **Supersedes:** the "final installer notice packaging remains a release task" note in [dependencies](../dependencies.md); it is replaced only for the rows F8 actually qualifies.
- **Related:** [0014](0014-ci-scope-and-caching.md) (analysis scope), [0018](0018-ci-feedback-and-cache-budgets.md) (evidence reuse)

## Context

Talos Pilot redistributes three dependency populations: the bundled frontend assets
(JavaScript, CSS, workers, fonts), the Rust native executable, and the Go helper
binary. The repository already generates a dependency inventory from the authoritative
lock files, but that inventory is a _Linux view of the graph_, not a redistribution
manifest, and it records license identifiers rather than the attribution texts a
recipient needs. Several obligations therefore had no executable evidence:

- License identifiers and `hasNotice` booleans cannot carry the copyright, licence and
  subcomponent text a recipient must receive. Monaco Editor's `ThirdPartyNotices.txt`
  is not named `NOTICE`, so the inventory never detected it.
- 28 Cargo packages reachable from the declared targets publish no licence file at all
  (for example `kube`, `tauri-plugin`, the `objc2` family), so the obligation cannot be
  satisfied by copying package contents.
- The declared targets differ: 502 crate identities are reachable across Linux x86_64,
  macOS Intel/ARM and Windows x86_64, but only 449 on Linux. Picking the Linux view
  would silently under-report the other platforms.
- `pnpm desktop:build` is `--no-bundle`, so no existing gate proves that a legal file
  reaches an installed artifact.
- Development-only packages without any declared licence (`css-value@0.0.1`) must stay
  out, and that exclusion needs executable evidence rather than a sentence.

## Decision

Generate two committed artifacts from the live locked inputs, render them
deterministically, and enforce their freshness at source and package level:

1. `legal/THIRD-PARTY-NOTICES.txt` — the full upstream licence, copyright and notice
   texts for every redistributed component, with a generated header, stable ordering
   and relative provenance per text. No timestamps, host names, absolute cache paths or
   commit identifiers appear, so repeated generation is byte-identical across machines
   and revisions that do not change dependencies.
2. `legal/third-party-manifest.json` — the machine-readable identity/digest manifest:
   ecosystem, name, version, declared and selected licence, per-target membership, text
   provenance and SHA-256 digests, curated-override provenance, and the digest of the
   notices file itself.

The component selection is a **reproducible all-target superset from pinned sources**:

| Ecosystem | Selection                                                                                                                                                         | Redistributed by                 |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| npm       | production dependency graph of `pnpm-lock.yaml` (`pnpm licenses list --prod`)                                                                                     | frontend assets, workers and CSS |
| Cargo     | union of the normal and build closures for `x86_64-unknown-linux-gnu`, `x86_64-apple-darwin`, `aarch64-apple-darwin`, `x86_64-pc-windows-msvc` (`cargo metadata`) | native executable                |
| Go        | modules contributing packages to the helper on `linux/amd64`, `darwin/amd64`, `darwin/arm64`, `windows/amd64` (`go list -deps`)                                   | bundled helper binary            |

Unions are recorded per component in the manifest, so a later target-specific split does
not require re-reviewing the texts. First-party workspace members and development/build
edges are excluded. Go graph-only modules remain `unobserved`: they are never read, so
the output does not depend on whatever happens to be warm in a module cache.

Where a published package ships **no** licence text, a narrow override in
`legal/sources/registry.json` names the exact upstream commit (taken from the package's
`.cargo_vcs_info.json` or `package.json` repository) and the file that is committed under
`legal/sources/`. Where upstream ships a licensing _statement_ but no text at all (the
`objc2` family, `is-reference`, `locate-character`, `selectors`), the canonical SPDX
license-list-data text is committed, upstream's statement is reproduced beside it, and
the manifest labels the text origin. Every curated input is digest-checked, version-bound
and fails the check when the locked graph no longer contains its component.

**Commands** (exact, and the only supported entry points):

| Command                                         | Behavior                                                                                                                            |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm notices:generate`                         | Collects the live graph, renders both artifacts, and replaces them only after the whole render succeeded.                           |
| `pnpm notices:check`                            | Read-only. Regenerates in memory and fails nonzero on stale, missing, unexpected or malformed output, unknown terms or bad inputs.  |
| `pnpm notices:check-packaged -- <payload-root>` | Read-only. Compares an extracted installed payload against the committed artifacts byte for byte, and fails on missing/extra files. |

`pnpm notices:check` runs before every Tauri build (`beforeBuildCommand`) and in the
Linux desktop CI job, so a stale committed artifact cannot be masked by a build that
would regenerate it, and a bundle cannot be produced from stale legal files.

Bundling uses Tauri's `bundle.resources` map, which ships the two artifacts to a
documented directory inside the package. No renderer capability, IPC command, CSP
directive or runtime download is added: the recipient reads the installed plain-text
file with ordinary tools, offline.

## Alternatives considered

- **Reuse the generated inventory as the notice source.** Rejected: it is a Linux graph
  view, records identifiers rather than attribution texts, misses non-`NOTICE`
  subcomponent files, and would make one artifact serve two different contracts.
- **Copy only package `LICENSE`/`NOTICE` files found by the inventory's `hasNotice`
  check.** Rejected: 28 reachable Cargo packages publish no file, so the output would be
  silently incomplete, and nested subcomponent licences (for example `ring`'s vendored
  `once_cell` texts) would be missed.
- **Target-specific legal artifacts per platform.** Legally equivalent and rejected only
  for cost: four generated sets, four override reviews, and four payload checks, while
  the union is reproducible from the same pinned metadata on any host. The manifest keeps
  per-target membership, so this remains available if a platform ever needs to differ.
- **Fetch licence texts from the network at generation time.** Rejected: it would make a
  clean checkout depend on GitHub availability and mutable refs. Overrides are fetched
  once, reviewed, committed and digest-checked; generation itself is offline.
- **Generate at build time only and ship the result.** Rejected: a build that regenerates
  hides a stale committed artifact, so the check must run before the build and the
  artifacts stay under review in the repository.
- **Use SPDX identifiers plus a generic MIT text for every package.** Rejected: it
  discards upstream copyright lines and subcomponent notices. Canonical texts are used
  only for the four groups where upstream provides none.

## Consequences

- The committed notices file is roughly 5 MiB and changes whenever a redistributed
  dependency's text, version or target membership changes. That diff is the review
  surface, and `pnpm notices:check` makes it mandatory.
- Generating and checking require `pnpm`, `cargo` metadata and the Go toolchain with the
  module cache populated. This is the same requirement as the existing inventory and
  provisioned desktop jobs; the renderer-only CI job is unaffected.
- The all-target union includes crates that never link on Linux (WebView/objc2 glue).
  The manifest's per-target membership keeps that visible as a conservative superset
  rather than a claim about a Linux binary.
- Installed-package layout, per-format installer inspection and runtime qualification on
  macOS/Windows remain F9/document 10 work. F8 qualifies the Linux bundle payload and the
  unaffected native boundary only.
- MPL-2.0 recipients receive the licence text, the exact upstream package identity and
  the source-availability statement; no covered file is modified, and the Cargo lock
  digest records the packages that were built unmodified.

## Verification

- Deterministic unit and CLI tests cover rendering stability, ordering, provenance,
  bounds, path escapes, malformed registries, missing/unreadable/oversized texts, and the
  packaged-payload pass/fail matrix.
- An isolated synthetic graph fixture injects a new dependency and a changed text, proves
  `notices:check` fails without rewriting output, then proves regeneration passes.
- The Linux bundle payload is extracted and compared against the manifest, including
  negative missing/tampered cases, and the native suite observes the installed resources.
- Evidence, hashes and limits are recorded in
  [the F8 verification record](../verification/f8-notices-security.md) and the ledger.
