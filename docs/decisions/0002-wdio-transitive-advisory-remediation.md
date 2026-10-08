# 0002: Keep the embedded WebDriver harness with audited transitive pins

Date: 2026-10-08. Status: accepted for milestone 1.

## Context

Adding the pinned WebdriverIO 9.31.9 / Tauri service 1.5.0 harness introduced
six npm audit findings in development-only dependencies. The paths included
`serialize-javascript` through Mocha, `extract-zip` and `basic-ftp` through the
WebDriver browser utility tree, and `braces` through Mocha's file watcher.
These findings still fail the repository's audit gate even though they are
under development dependencies.

## Decision

Retain the Tauri embedded WebDriver path and pin compatible transitive
remediations in `pnpm-workspace.yaml`:

- `@puppeteer/browsers` 3.2.4 replaces the vulnerable 2.x tree that depended on
  unpublished `extract-zip` 2.0.1 fixes. The imported browser utility API
  remains available to WebdriverIO 9.31.9.
- `basic-ftp` 6.2.2 fixes GHSA-c475-qrg2-pj4r.
- `chokidar` 4.0.3 removes the vulnerable `braces` 3.0.3 dependency from the
  watcher used by Mocha 10.8.2.
- `serialize-javascript` 7.1.2 fixes the RCE and CPU exhaustion advisories
  while retaining the CommonJS API Mocha uses.

The installed WebdriverIO harness ran its two actual Tauri integration cases
after these overrides, and `pnpm audit --audit-level=low` reported no known
vulnerabilities. The override pins stay explicit in source and lockfile so a
future compatibility change is reviewable.

## Alternatives considered

- Drop the native Tauri harness: rejected because it is a foundation
  acceptance requirement.
- Add audit exceptions for the new packages: rejected because compatible
  upstream versions resolve the findings and the native test verifies the
  selected overrides.

## Consequences and verification

WebdriverIO uses browser-download utilities outside this app's embedded
provider, so their alternate browser-driver paths are not exercised here. The
embedded Tauri handshake and permission tests exercise the required provider.
Retest the native harness and audit after changing any of the pins.

- [GHSA-5c6j-r48x-rmvq](https://github.com/advisories/GHSA-5c6j-r48x-rmvq)
- [GHSA-qj8w-gfj5-8c6v](https://github.com/advisories/GHSA-qj8w-gfj5-8c6v)
- [GHSA-jmr9-qjv8-65gv](https://github.com/advisories/GHSA-jmr9-qjv8-65gv)
- [GHSA-7pqw-9j4j-h8q3](https://github.com/advisories/GHSA-7pqw-9j4j-h8q3)
- [GHSA-c475-qrg2-pj4r](https://github.com/advisories/GHSA-c475-qrg2-pj4r)
- [GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
