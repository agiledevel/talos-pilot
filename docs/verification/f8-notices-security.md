# F8 — dependency notices and security evidence

Status: **in progress, locally qualified on Linux; not accepted** (2026-10-26).
Every applicable row below has executed local evidence. F8-07 (candidate hosted
results) is unexecuted because the branch is local and no push/PR is
authorised, so F8 is **not** accepted and document 07 stays in progress.

- **Branch / revision:** `ft-dependency-notices-security` at
  `0c93868d33aefd0f2bc17f93b141d6b0cf41bf54`, based on merged `main`
  `41b1e008abbcb9a663d02f425bdc67775f4170b6`.
- **Recording:** this record is committed immediately after `5810c15` as a
  documentation-only checkpoint; no executable input changed between them.
- **Contract:** [document 07](../plans/foundation-finish/07-f8-dependencies-notices-security.md),
  [dependencies](../dependencies.md#third-party-notices-and-redistribution),
  [decision 0020](../decisions/0020-dependency-notice-generation.md).
- **Host:** openSUSE Tumbleweed, x86_64, WebKitGTK 605.1.15, private pinned
  toolchain (Node 26.12.1, pnpm 12.15.0, Rust 1.99.1, Go 1.27.3, protoc 36.2,
  cargo-audit 0.22.2, Trivy 0.74.0, actionlint 1.7.12, ShellCheck 0.11.0).
- **Entry evidence (not an F8 result):** `main` Foundation
  [40245086906](https://github.com/agiledevel/talos-pilot/actions/runs/40245086906)
  and Security
  [40245086864](https://github.com/agiledevel/talos-pilot/actions/runs/40245086864)
  on `41b1e00`, read on 2026-10-26.

## Artifacts

| Artifact                                                        | Bytes      | SHA-256                                                            |
| --------------------------------------------------------------- | ---------- | ------------------------------------------------------------------ |
| `legal/THIRD-PARTY-NOTICES.txt`                                 | 5,406,879  | `39a7c887a94f796927991c16464de29319ceaaef59ba226e5a37b051739842ba` |
| `legal/third-party-manifest.json`                               | 516,195    | `e79cedfa4a699d027b745d87d3097238eee761e41b3a6fe2811ba7623f16f9f2` |
| `legal/sources/registry.json`                                   | —          | `b15d5449ade55135c798f7f0be6d0d56e3aed6ccf8eb624310dcd2d37924f97e` |
| `Talos Pilot_0.1.0_amd64.deb` (DEB bundle)                      | 27,812,232 | `cb2398618a8ed4b9c7b478f20db582d52a323acbe801da458a1b088abd04e360` |
| packaged `/usr/lib/Talos Pilot/legal/THIRD-PARTY-NOTICES.txt`   | 5,406,879  | `39a7c887…` (identical)                                            |
| packaged `/usr/lib/Talos Pilot/legal/third-party-manifest.json` | 516,195    | `e79cedfa…` (identical)                                            |
| packaged `/usr/bin/talos-pilot`                                 | —          | `f132290db52b2477efffc0d6caa166713aa2fa756e79c0f4bcf3f994dca4fb83` |
| packaged `/usr/lib/Talos Pilot/binaries/talos-pilot-helper`     | —          | `1c6c2e746b9735b1bf5545db9b63773c62a30840b78ab7d5ebe1f7c3efd39e69` |
| final ordinary Linux executable (after the bundle patch)        | —          | `12f62c43530f3ded654e34acbabc234feb0a335c77540f0b1104ecc4456c9e0a` |

Contents: **639 components** (102 npm, 502 Cargo, 35 Go), **1,059 texts**,
4,816,465 text bytes, 30 digest-checked curated overrides, 2 canonical SPDX
texts and 1 verified vendored extract. Coverage is the reproducible all-target
superset: 102 npm production components (101 package entries; `@internationalized/date`
is installed at 3.12.4 and 3.12.3), 502 Cargo identities reachable on
aarch64-apple-darwin / x86_64-apple-darwin / x86_64-pc-windows-msvc /
x86_64-unknown-linux-gnu (449/377/375/377 per target, membership recorded per
crate), and 35 Go modules linked on darwin/amd64, darwin/arm64, linux/amd64 and
windows/amd64.

## Acceptance rows

### F8-01 — frozen install, locked clean-checkout build, provenance, determinism

**Passed (local).** A detached worktree of `5810c15` with no working changes ran
`pnpm install --frozen-lockfile`, `pnpm notices:check` (**current**, 639
components), `pnpm inventory:check` (**current**, 538 npm / 614 Cargo / 143 Go,
35 linked) and a locked build (`pnpm tauri build --no-bundle -- --locked`,
1 min 04 s), producing `/tmp/tp-f8-clean-tree/.../talos-pilot`
(`7d35fac9…`). The checked-out artifacts hash to exactly the values above, so
the committed bytes survive a fresh checkout. `.gitattributes` marks the notices
file and the curated upstream/canonical/native copies `-text`, because Git must
not normalize text that embeds upstream line endings and is digest-checked; the
manifest is LF-only JSON whose normalization is a no-op, which the same checkout
confirms.

Repeated generation is byte-stable: two consecutive `pnpm notices:generate` runs
in the main tree produced the same two digests, and the synthetic-graph suite
proves the same bytes with and without an extra graph-only Go module in the
module cache (including a module directory that does not exist). Series
provenance: the npm graph moved 535 → 538 inventory entries only through the F7
`@xterm/xterm`, `@xterm/addon-fit` and `uplot` pins; Cargo and Go counts are
unchanged since S2, and no dependency was added or refreshed by F8.

### F8-02 — reviewed coverage, full texts and obligations

**Passed (local).** Coverage and obligations are recorded in
[dependencies](../dependencies.md#third-party-notices-and-redistribution) and
encoded in the manifest:

- Alternatives: `OR` expressions record one selection (Apache-2.0 for
  `dompurify`, `tauri-plugin`, `libappindicator-sys`; MIT for the Objective-C
  trio and `defmt-parser`); both texts ship where upstream provides both.
- Five `AND` expressions (`unicode-ident`, `brotli`, `dpi`, `encoding_rs`,
  `ring`) were checked file by file; `ring`'s nested `src/polyfill/once_cell`
  and `third_party/fiat` texts are included by the bounded recursive scan.
- Monaco Editor's `ThirdPartyNotices.txt` (63,064 bytes, not named `NOTICE`) is
  present as `npm:monaco-editor@0.57.0/ThirdPartyNotices.txt`.
- Bundled native data: `libsqlite3-sys` 0.38.2's SQLite 3.53.2 amalgamation is
  digest-checked (`0a409f16…`) and its own public-domain dedication is
  reproduced as a `vendored-extract` text; Unicode data arrives through the
  `Unicode-3.0` licence files of the `icu_*`/`zerovec` crates.
- MPL-2.0 (`selectors`, `cssparser`, `cssparser-macros`, `dtoa-short`,
  `option-ext`) ships the MPL text, the exact crate identity and a source
  URL; no covered file is modified, and `src-tauri/Cargo.lock` pins the built
  packages and checksums.
- 30 components that publish no licence text carry digest-checked overrides at
  exact upstream commits; the four groups with no upstream text at all
  (`objc2` family, `selectors`, `is-reference`, `locate-character`) use the
  canonical SPDX text beside upstream's own statement, labelled as such in the
  manifest.
- Unknown or missing redistributed terms fail: a package with no licence text
  and no override aborts generation naming the package, and a Go module whose
  root text cannot be classified is an error (both covered by tests).
- `css-value@0.0.1`, the only npm package without a declared licence, is absent
  from the production graph the notices use and from shipped artifacts
  (`pnpm production:check`).

### F8-03 — drift failure without rewriting, regeneration pass, failures and enforcement

**Passed (local).** `scripts/lib/notices/cli.test.ts` runs the real CLI against a
synthetic fixture graph:

- adding a dependency makes `check` fail (`not current`) and leaves both files
  byte-identical; `generate` then passes and includes the new package;
- changing a licence text fails and recovers the same way;
- missing notices, missing manifest, an unexpected file in `legal/` and a
  malformed manifest each fail with a distinct `missing` / `unexpected` /
  `stale` message;
- a graph command failure and a licence-less package fail with actionable
  messages and write nothing;
- a stale override (component no longer in the graph) fails;
- a curated digest mismatch, traversal/absolute paths, insecure sources,
  duplicate identities, undeclared override texts and an unreferenced curated
  text all fail validation;
- packaged payload: matching bytes pass; missing, tampered and unexpected files
  fail separately.

Enforcement and exit propagation: `pnpm notices:check` is the first command in
`beforeBuildCommand` and a Linux desktop CI step. In the clean worktree, adding
nine bytes to the committed notices file made
`pnpm tauri build --no-bundle -- --locked` exit 1 **before compiling**
(`legal/THIRD-PARTY-NOTICES.txt: stale — committed 5406888 bytes, regenerated
5406879 bytes`); restoring the file made the check pass again. The real payload
negatives below exit 1 through `pnpm` as well. `scripts/lib/ci-scope.test.ts`
asserts that legal artifacts and curated inputs are code (not documentation), so
a change to them cannot reuse stale analysis.

### F8-04 — actual Linux bundle payload and native smoke

**Passed (local, Linux x86_64 DEB only).** `pnpm tauri build --ci --config
.github/tauri.release.conf.json --bundles deb -- --locked` produced the DEB
above. Extracting it in a private `/tmp` directory (`ar` + `tar`, nothing
installed) yields exactly:

```text
/usr/bin/talos-pilot
/usr/bin/export_ipc_types
/usr/lib/Talos Pilot/binaries/talos-pilot-helper
/usr/lib/Talos Pilot/legal/THIRD-PARTY-NOTICES.txt
/usr/lib/Talos Pilot/legal/third-party-manifest.json
/usr/share/applications/Talos Pilot.desktop
/usr/share/icons/hicolor/512x512/apps/talos-pilot.png
```

`pnpm notices:check-packaged -- '<payload>/legal'` reports
`2 files, 639 components, 1059 texts` and exits 0. On copies of the real payload,
deleting the notices, appending one newline to the manifest and adding
`LICENSE-extra.txt` each exit 1 with `missing`, `tampered` and `unexpected`
respectively. The release workflow runs the same extraction-and-check step
before upload; its shell passes ShellCheck with the matrix expression
substituted, and actionlint accepts both changed workflows. `export_ipc_types`
is a maintainer tool that the bundler installs from `src-tauri/src/bin`; it is
recorded for F9 as an installed-payload decision, not a legal obligation.

Native smoke, run **before** the ordinary builds, on the actual Tauri/WebKitGTK
application with private `XDG_*` directories under one temporary root:

```text
xvfb-run -a -s '-screen 0 1280x800x24 -nolisten tcp' env GDK_BACKEND=x11 pnpm test:native
```

**31 tests / 5 spec files passed** in 15 s (4 chart, 5 editor, 12 helper/shell,
7 Kubernetes-session, 3 terminal). No helper process, synthetic endpoint or Xvfb
process remained, and the temporary XDG root was removed afterwards
(`/tmp/tp-f8-native.log`). Then, in order, `pnpm desktop:build`,
`pnpm production:check` (no WebDriver, no driver listener) and
`pnpm advisories:check` passed; the DEB build afterwards patched the release
executable (ordinary build `be5ee74f…`, patched bundle input `f95c94c0…`, final
`12f62c43…`), so both gates were re-run on the final output and passed.

### F8-05 — current npm, Go and Cargo evidence

**Passed (local).** `pnpm audit --audit-level=low` → no known vulnerabilities.
`pnpm audit:go` (govulncheck 1.8.0) → 0 called vulnerabilities, 0 in imported
packages, 1 in a required module (GO-2026-5932). `cargo audit --file
src-tauri/Cargo.lock` (cargo-audit 0.22.2, advisory database
`21d909e4c8bd4e14c7aea58bf980c881a0053ab1`, 1,352 entries) → exit 0 with the
five recorded warnings and nothing unexplained. `pnpm advisories:check` passed
on the final `12f62c43…` executable: 67,079 demangled symbols against the five
recorded advisories, reverse paths unchanged, inactive crates still absent from
the resolved graph, and **0** `VariantStrIter` symbols. Decisions
[0006](../decisions/0006-gtk3-advisory-applicability.md) and
[0017](../decisions/0017-keyring-zbus-advisory-applicability.md) were reviewed
and remain valid.

### F8-06 — Trivy exceptions re-proved, dated and enforced

**Passed (local).** Both exceptions kept their IDs and paths and were renewed to
**2027-02-28** after re-proof on 2026-10-26:

- `GHSA-wrw7-89jp-8q8g` / `src-tauri/Cargo.lock`: `cargo tree --locked -i glib`
  still reaches glib 0.18.5 only through `gtk 0.18.2` (via `muda 0.20.0`,
  `tao 0.37.1`, `tauri 2.12.1`, `webkit2gtk 2.0.2`, `wry 0.57.0`).
  `rustsec/advisory-db` patches only `glib >= 0.20.0`; glib 0.18.5 is the final
  0.18 release; `gtk 0.19.0` requires `glib ^0.22` but the latest `wry` (0.57.1)
  still requires `gtk ^0.18`, so no compatible fix exists in the released stack.
  Residual risk is a compiled-but-never-called API defect.
- `GO-2026-5932` / `helper/go.mod`: no fixed release exists (primary source
  `pkg.go.dev/vuln/GO-2026-5932`, which recommends `github.com/ProtonMail/go-crypto`,
  the fork the helper links at v1.4.1). `go list -deps` for linux/amd64,
  darwin/amd64, darwin/arm64 and windows/amd64 imports only x/crypto
  `argon2`, `blake2b`, `cast5`, `cryptobyte`, `cryptobyte/asn1`, `hkdf` and
  `sha3` — zero `openpgp` packages on every target, which `govulncheck` alone
  cannot show.

Negative expiry verification was re-run with the pinned Trivy 0.74.0 binary on a
tracked-files-only archive: the renewed record yields **0** SARIF results, the
same file with `expired_at: 2026-01-01` yields exactly the two findings, and
scanning without an ignore file yields the same two. Nothing was widened, no
scanner was weakened, and the renewal is recorded in
[automation.md](automation.md#amendment-f8-trivy-exception-renewal).

### F8-07 — candidate hosted results

**Unexecuted / blocked.** `gh pr list --state open --head
ft-dependency-notices-security` returns nothing, `gh run list --branch
ft-dependency-notices-security` returns nothing, and `git ls-remote --heads
origin ft-dependency-notices-security` shows the branch is not on the remote.
No push, PR or dispatch authority was granted to this session, so no Foundation
or Security run exists for this revision. The `main` runs listed above are
entry evidence only. This row cannot be satisfied from local output.

### F8-08 — final review and documentation agreement

**Passed (local).** The final tree was reviewed separately after the gates:
collection/rendering/CLI/payload separation, the fail-closed bounds and path
handling, the curated-override policy, the packaging step and the renewed
exceptions. Findings fixed in this session: the licence-name matcher read
`src/copying.rs` as a licence, Go licence classification was confused by nested
subcomponent texts, rendering trusted caller order, `pnpm run --` forwarded its
separator to the payload check, and the initial local Trivy run scanned `.tools/`
instead of a CI-equivalent tree. The separate adversarial review then found and
this session fixed four more: `pnpm` could not be spawned from the Windows
desktop job or before its Tauri build (Node cannot launch the installed `.cmd`
shim without a shell), a curated vendored entry was silently dropped when its
component left the graph instead of failing as stale, Go components claimed
"every declared target" instead of recording their per-target membership, and
untrusted crate metadata could forge a notice heading through control
characters. Those fixes carry regression tests and are in `5810c15`; every gate
below was re-run on that revision. Two further review nits were examined and
resolved without a code change: a crate that declares only a Cargo
`license-file` and no SPDX expression is still rejected, because shipping a
component whose terms are not reviewed is exactly what the contract forbids, and
its error message should name the `license-file` the next time that branch is
touched (a message-only change did not justify rebuilding the verified bundle);
and the Windows/macOS execution of the new check stays unexecuted until the
hosted candidate run, as recorded under Limits. `pnpm check:ci` (**353 tests / 47 files**,
coverage 70.19 % statements / 73.3 % branches, production build) and
`pnpm test:e2e` (**31 passed**, 27.5 s) passed on the final relevant tree;
`pnpm format:check`, `pnpm lint`, `git diff --check`, actionlint and ShellCheck
pass; documentation links, plan/ledger/README statuses and the dependency record
agree. Remaining limits are listed below and are carried by F9 / document 10 and
the owner review.

## Limits

- Only the development Linux host is qualified. macOS and Windows installed
  packages, WebViews and runtime rows are unexecuted (F9/document 10); the
  all-target manifest is a legal superset, not runtime evidence.
- Only the DEB payload was inspected. RPM and AppImage payload checks, all-format
  installer scans, clean Ubuntu/Fedora installation and vault/runtime rows are
  F9 work; the known openSUSE AppImage problem was not reopened.
- Hosted Foundation/Security results and the hosted Trivy/CodeQL scans for this
  revision are pending owner-authorised push/PR (F8-07). That run also has to
  exercise `pnpm notices:check` on the macOS and Windows desktop runners, which
  this host cannot execute: the check needs cross-target Go module resolution
  and `cargo metadata` on those platforms, so a platform-specific failure there
  would leave F8-03's enforcement row incomplete rather than accepted.
- The notices describe the resolved dependency graph; they do not prove that a
  given installer contains every bundled file beyond the measured DEB payload.
- `export_ipc_types` ships in the DEB and needs an explicit F9 packaging
  decision.
- C6/C7, the remaining formats/targets, fixture/version rows, budgets, the Q13
  owner review and M2.0 remain open.
