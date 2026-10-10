# 0006: Accept the GTK3 advisory pair with verified non-linkage

Date: 2026-10-09. Status: accepted for milestone 1. Review by 2026-11-30.

## Context

`cargo audit --file src-tauri/Cargo.lock` with cargo-audit 0.22.2 against
advisory database commit `550efd3d587a29b2e2c2b21b17a440da4fede999` (1,295
advisories, 569 locked Rust dependencies) still exits 0 while reporting two
informational findings inherited from Tauri 2.12.1's Linux desktop stack. FND-007
requires a compatible remediation or a verified applicability decision for each,
with no silent exclusion.

- **RUSTSEC-2024-0429 / GHSA-wrw7-89jp-8q8g (`glib` 0.18.5, unsound).** The
  advisory's affected set is exactly `glib::VariantStrIter::{next, nth, last,
  next_back, nth_back}`, `>=0.15.0, <0.20.0`. The path is `glib 0.18.5` reached
  from `atk`/`cairo-rs`/`gio` into `gtk 0.18.2`, `webkit2gtk 2.0.2`, `wry 0.57.0`,
  and `tauri 2.12.1`. `tauri` requires `gtk = "0.18"` with the `v3_24` feature and
  `gtk` requires `glib = "0.18"`, so the Cargo semver range cannot select the
  patched `>=0.20.0` line; the crates.io index shows `0.18.5` as the last 0.18
  release.
- **RUSTSEC-2024-0370 (`proc-macro-error` 1.0.4, unmaintained).** Its only direct
  dependents in this graph are `glib-macros v0.18.5 (proc-macro)` and
  `gtk3-macros v0.18.2 (proc-macro)`, so it contributes compiler-time code
  generation only. It also drags `syn 1.0.109` beside the `syn 2.0.119`/`3.0.6`
  copies, the duplicate-dependency cost the advisory itself calls out. Upstream
  `glib-macros` dropped `proc-macro-error` in the newer series (the 0.21.5
  manifest depends on `heck`, `proc-macro-crate`, `proc-macro2`, `quote`, and
  `syn 2` only), so this too is fixed only by moving the binding series.

Linkage was checked on the actual unstripped Linux release artifact rather than
asserted: `nm -C src-tauri/target/release/talos-pilot` yields 37,865 demangled
symbols, including 345 `glib::` entries such as `glib::variant::Variant`, and
**zero** `VariantStrIter` entries, confirming nothing in the resolved graph calls
`Variant::str_iter()`. The same scan contains **zero** `proc_macro_error`
symbols, matching its proc-macro-only position.

## Decision

Accept both findings as recorded, actively verified applicability decisions for
milestone 1 instead of pretending a remediation exists in the locked stack:

1. Keep the single-ID, path-scoped, expiring Trivy exception for the GLib GHSA
   alias and keep `cargo audit` unignored, so the scan still prints the findings.
2. Record the accepted set in [`scripts/lib/advisories.ts`](../../scripts/lib/advisories.ts)
   and enforce it with `pnpm advisories:check`
   ([`scripts/advisory-baseline.ts`](../../scripts/advisory-baseline.ts)) in the
   Linux desktop CI job. The gate fails on a new advisory, a changed crate,
   version, or kind of a recorded advisory, a recorded advisory that disappears,
   a proc-macro-only path that gains a runtime dependent, or the appearance of an
   affected symbol in the linked executable. A stripped binary or a missing
   `nm` read is an error, never a pass.
3. Re-evaluate when Tauri moves its Linux bindings to `gtk-rs` 0.20 or newer; that
   upstream move resolves both entries at once. Until then milestone 1 keeps the
   findings visible in the evidence record with their residual risk.

## Alternatives considered

- Force `glib` 0.20/0.21 with a `[patch]` or version override: rejected because
  `gtk 0.18` requires `glib ^0.18`, the newer series changes the binding API, and
  a newer incompatible GLib line is not a drop-in substitution for the GTK3 tree.
- Fork and locally patch `glib` 0.18.5: rejected because the defect is in an API
  this application never calls, the patch would have to be maintained against the
  final release of a superseded series, and it would add an unreviewed private
  registry to a reproducible-install product.
- Drop or downgrade the Linux desktop target: rejected; the platform matrix and
  the Tauri/GTK3 stack are locked design decisions.
- Silence either finding in the scanners: rejected by the development
  instructions and by the requirement that exceptions stay narrow, justified, and
  expiring.

## Consequences and verification

The Linux desktop build continues to carry two advisory warnings until the
upstream binding series changes, and the record must be re-reviewed by
2026-11-30 when the Trivy exception expires. The gate makes the claim testable at
any future revision: `pnpm advisories:check` passed on this revision against the
scanner report, the reverse dependency paths, and the linked executable, and a
deliberate probe that listed a genuinely linked symbol (`glib::main_context_channel::Channel`)
made the same gate exit 1. Unit coverage for the comparison logic is in
[`scripts/lib/advisories.test.ts`](../../scripts/lib/advisories.test.ts) (8 cases,
including unrecorded findings, version drift, a vanished record, a runtime
dependent on the proc-macro path, and linked affected symbols). The scan is
defined for the Linux ELF artifact; macOS and Windows inherit C8's platform
qualification and the script reports their symbol scan as unexecuted.

- [RUSTSEC-2024-0429](https://rustsec.org/advisories/RUSTSEC-2024-0429),
  [GHSA-wrw7-89jp-8q8g](https://github.com/advisories/GHSA-wrw7-89jp-8q8g),
  [upstream fix](https://github.com/gtk-rs/gtk-rs-core/pull/1343)
- [RUSTSEC-2024-0370](https://rustsec.org/advisories/RUSTSEC-2024-0370)
- [CI/release contract](../ci-release.md), [dependency research](../dependencies.md),
  and [milestone 1 evidence](../verification/milestone-1.md)
