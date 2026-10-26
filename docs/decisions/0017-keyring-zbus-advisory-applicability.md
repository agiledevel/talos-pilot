# 0017: Record the inactive keyring back-end advisories with an enforced absence check

Date: 2026-10-22; reviewed at the document 07 packet on 2026-10-26. Status:
accepted for milestone 1. Next review when keyring moves to a 4.x line, or at
the M2.0 foundation handoff, whichever comes first.

## Context

On 2026-10-22 `cargo audit --file src-tauri/Cargo.lock` with cargo-audit 0.22.2,
against advisory database commit
`640bf5a9f06e66d8721e8772766531fe77c8630d` (1,349 advisories, 635 locked Rust
packages), reported the two findings already recorded by
[decision 0006](0006-gtk3-advisory-applicability.md) plus three new
informational `unmaintained` advisories:

- **RUSTSEC-2026-0370 (`zvariant` 4.2.0, unmaintained).**
- **RUSTSEC-2026-0371 (`zbus_names` 3.0.0, unmaintained).**
- **RUSTSEC-2026-0372 (`zvariant_derive` 4.2.0, unmaintained).**

All three are locked only through the optional asynchronous `secret-service`
back-end that `keyring` 3.6.3 declares:

```text
keyring 3.6.3 (default-features = false, features = ["crypto-rust", "sync-secret-service"])
└── secret-service 4.0.0 (optional, not enabled)
    └── zbus 4.4.0
        ├── zbus_names 3.0.0
        └── zvariant 4.2.0
            └── zvariant_derive 4.2.0
```

The Linux target enables the synchronous `dbus-secret-service` path instead. The
three crates are therefore present in `Cargo.lock`, which records inactive
optional dependencies, but absent from the resolved graph for every declared
target: `cargo tree --target all -e normal -i` prints no reverse path for each
of them, so no code is compiled or linked. The maintained lines (`zbus` 5/6 and
`zvariant` 5) arrive only with `keyring` 4.x, which is a major upgrade of a
direct application dependency and is not justified by an informational
`unmaintained` advisory for code that is never built.

`pnpm advisories:check` failed on these three findings, because the recorded set
did not describe them. Leaving the gate red is not acceptable, and silently
adding them to the accepted list would record a claim that nothing verifies.

## Document 07 review (2026-10-26, foundation F8)

The packet review re-ran `pnpm advisories:check` and `cargo audit --file
src-tauri/Cargo.lock` on the `ft-dependency-notices-security` branch. All three
`unmaintained` advisories are still reported by the scanner and still absent from
the resolved graph for every declared target, so the enforced absence check
remains true; no entry was widened or removed. `keyring 4.2.0` (which would pull
`zbus` 5/6 and `zvariant` 5) is available but stays deferred: it is a major
upgrade of a direct dependency with vault behaviour to requalify, and the
advisories cover code this build never compiles. There is no Trivy exception for
these three findings, so this review does not change an expiry date.

## Decision

1. Record the three advisories in
   [`scripts/lib/advisories.ts`](../../scripts/lib/advisories.ts) as
   `unmaintained` entries with an empty `forbiddenSymbols` list and a new
   `absentFromResolvedGraph` flag.
2. Enforce the flag in
   [`scripts/advisory-baseline.ts`](../../scripts/advisory-baseline.ts): for each
   such entry the gate runs
   `cargo tree --locked --target all -e normal -i <crate>@<version>` and fails if
   any reverse path is printed. The absence of compiled code is thus checked, not
   assumed; the existing scanner comparison, proc-macro-only path check, and
   linked-symbol scan stay unchanged.
3. Do not upgrade `keyring` to 4.x, do not add a duplicate `zbus`/`zvariant`
   version, and do not suppress either scanner. `cargo audit` still prints the
   findings unignored.
4. Re-evaluate at the document 07 dependency and security packet, or as soon as
   `keyring` 4.x is adopted, the `secret-service` feature is enabled, or any of
   the three crates gains a resolved path. The gate fails in each of those cases
   until the record is revised deliberately.

## Alternatives considered

- **Upgrade `keyring` to 4.2.0 now.** Rejected: it is a semver-major change of a
  credential-storage dependency, needs its own platform and vault evidence, and
  only clears informational advisories for code the build never compiles.
- **Force `secret-service`/`zbus` to newer versions with a `[patch]` or version
  override.** Rejected: the inactive back-end's constraints are not part of the
  supported feature set, so overriding them would ship an untested combination
  and could still be replaced by the next `cargo update`.
- **List the advisories with no verification.** Rejected: the gate would then
  pass without evidence, which is the always-green script the quality standards
  forbid.
- **Ignore the advisory IDs in the scanner.** Rejected: exceptions must stay
  narrow, justified, and visible, and the repository already records accepted
  findings instead of silencing them.

## Consequences and verification

The advisory record now has five entries: the two GTK3 findings and the three
inactive keyring back-end findings. Each is re-proved on every Linux desktop CI
run. A resolved path, a version drift, a disappeared advisory, or a linked
affected symbol fails the gate.

`pnpm advisories:check` passed on this revision against advisory database
`640bf5a9`: the scanner reported exactly the five recorded findings, the reverse
dependency check printed no path for `zbus_names`, `zvariant`, and
`zvariant_derive`, and `nm -C` scanned 67,067 demangled symbols in the release
executable without finding an affected symbol. Unit coverage for the new
predicate is in
[`scripts/lib/advisories.test.ts`](../../scripts/lib/advisories.test.ts)
(9 cases), including an empty path for an absent crate and a printed path that
fails. The Linux symbol scan covers the ELF artifact only; macOS and Windows
inherit the platform qualification rows and are not claimed by this decision.

- [RUSTSEC-2026-0370](https://rustsec.org/advisories/RUSTSEC-2026-0370)
- [RUSTSEC-2026-0371](https://rustsec.org/advisories/RUSTSEC-2026-0371)
- [RUSTSEC-2026-0372](https://rustsec.org/advisories/RUSTSEC-2026-0372)
- [keyring 3.6.3 features](https://docs.rs/crate/keyring/3.6.3/features),
  [decision 0006](0006-gtk3-advisory-applicability.md),
  [dependency research](../dependencies.md), and the
  [CI/release contract](../ci-release.md)
