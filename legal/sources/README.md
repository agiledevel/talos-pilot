# Curated notice inputs

These files are reviewed inputs to `pnpm notices:generate`; the generated
artifacts (`legal/THIRD-PARTY-NOTICES.txt`, `legal/third-party-manifest.json`) are
never edited by hand. The contract is [decision 0020](../../docs/decisions/0020-dependency-notice-generation.md).

## Why curated inputs exist

The generator reads licence, copyright and notice files from the real package
sources. Two gaps cannot be closed that way:

1. **A published package ships no licence file.** 28 Cargo packages reachable from
   the declared targets and 2 production npm packages are in this position; for
   example `kube` 4.2.0 and `tauri-plugin` 2.7.1 omit the file their manifest
   declares. `registry.json` names the exact published commit (taken from the
   package's `.cargo_vcs_info.json` or `package.json` repository field) and the
   committed copy of the upstream file.
2. **Upstream ships a licensing statement but no licence text at all.** The
   `objc2` family ships only `LICENSE.md`, a pointer to the MIT/Zlib/Apache-2.0
   texts; `selectors` has no licence file in stylo; `is-reference` and
   `locate-character` have no licence file in their repositories while their
   `package.json` declares MIT. For those, the canonical text from the SPDX
   `license-list-data` v3.29.0 release is committed beside upstream's own
   statement, and the manifest labels the text origin.

A package that does ship licence text is never overridden. An override whose
component is no longer in the locked graph is stale and fails `pnpm notices:check`.

## Layout

| Path            | Contents                                                                             |
| --------------- | ------------------------------------------------------------------------------------ |
| `registry.json` | Digest registry, per-component overrides and the vendored-native extract             |
| `upstream/`     | Verbatim upstream files at a pinned commit, named `<project>-<file>`                 |
| `canonical/`    | Canonical SPDX licence texts (`MIT`, `MPL-2.0`) from `license-list-data` v3.29.0     |
| `native/`       | Verbatim extract of SQLite's public-domain dedication from the vendored amalgamation |

Every file is covered by a SHA-256 entry in `registry.json`. The generator rejects
an unlisted file, a digest mismatch, a missing file, a path outside this directory
and an override entry that duplicates or contradicts a component identity.

`upstream/` and the generated artifacts are excluded from `oxfmt`
(`.oxfmtrc.json`): they must stay byte-identical to what upstream published, so
formatting them would falsify the provenance the digest records. `canonical/` and
`native/` hold plain `.txt`, which the formatter does not rewrite.

## Overrides in force

| Component                                                              | Reason                                                                        | Upstream source                                                                             |
| ---------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `objc2` 0.6.5 and 10 sibling crates (`block2`, `dispatch2`, `objc2-*`) | No licence file in the published crates; repository `LICENSE.md` is a pointer | `github.com/madsmtm/objc2` at each crate's published commit                                 |
| `kube`, `kube-client`, `kube-core`, `kube-runtime` 4.2.0               | No licence file in the published crates                                       | `github.com/kube-rs/kube` at `526f1f2c`                                                     |
| `tauri-plugin` 2.7.1                                                   | No licence file in the published crate                                        | `github.com/tauri-apps/tauri` at `30da1fd6`                                                 |
| `ts-rs`, `ts-rs-macros` 12.0.1                                         | No licence file in the published crates                                       | `github.com/Aleph-Alpha/ts-rs` at `7182ad82`                                                |
| `selectors` 0.38.0                                                     | No licence file in the published crate or the stylo repository                | `github.com/servo/stylo` at `572ecba2` plus canonical MPL-2.0                               |
| `dlopen2` 0.8.2, `dlopen2_derive` 0.4.3                                | No licence file in the published crates                                       | `github.com/OpenByteDev/dlopen2` at `cc80e4a0`                                              |
| `defmt-parser` 1.0.0                                                   | No licence file in the published crate                                        | `github.com/knurling-rs/defmt` at `4a8cdb44`                                                |
| `webview2-com`, `webview2-com-sys` 0.39.1, `webview2-com-macros` 0.8.1 | No licence file in the published crates                                       | `github.com/wravery/webview2-rs` at each crate's published commit                           |
| `alloc-stdlib` 0.3.0                                                   | No licence file in the published crate                                        | `github.com/dropbox/rust-alloc-no-stdlib` at `0a81fd69`                                     |
| `libappindicator-sys` 0.9.0                                            | No licence file, no repository field in the published crate                   | `github.com/tauri-apps/libappindicator-rs` at `eafd1e36`, named by the crate's CHANGELOG    |
| `is-reference` 3.0.3, `locate-character` 3.0.0 (npm)                   | No licence file in the package or its repository                              | package.json MIT declaration plus canonical MIT text                                        |
| `libsqlite3-sys` 0.38.2 (vendored)                                     | Bundled SQLite is public domain and has no licence file                       | `sqlite.org` Fossil check-in `d6e03d8c…`, extract verified against the shipped amalgamation |

## Review rule

Adding or changing an entry needs the upstream file, the exact commit, the
digest and a one-line reason. Fetching is a review-time action, not a build or
runtime action: generation is offline and reproducible from these committed
files.
