/**
 * Types and finite limits shared by notice collection, rendering and payload
 * inspection.
 *
 * The bounds are deliberately small multiples of the observed graph (roughly
 * 640 components and 5 MiB of licence text in 2026-10) so that a runaway
 * package tree, an unexpectedly huge licence file or a stuck command fails with
 * a named limit instead of exhausting memory or time. Every limit is enforced
 * by the collector and repeated in `docs/dependencies.md`.
 */

/** Ecosystems in rendered order. */
export type NoticeEcosystem = "npm" | "cargo" | "go";

/** Rendered and compared in this array's order. */
export const ECOSYSTEM_ORDER: readonly NoticeEcosystem[] = ["npm", "cargo", "go"];

/**
 * Desktop targets whose dependency closure the notices must cover. The set
 * matches the release asset matrix in `.github/workflows/release.yml` and the
 * helper build targets in `scripts/build-helper.ts`.
 */
export const CARGO_TARGETS = [
  "aarch64-apple-darwin",
  "x86_64-apple-darwin",
  "x86_64-pc-windows-msvc",
  "x86_64-unknown-linux-gnu",
] as const;

/** One helper build target; `go list` needs `GOOS`/`GOARCH` separately. */
export interface GoTarget {
  readonly goos: string;
  readonly goarch: string;
}

/** Helper build targets, in `GOOS/GOARCH` order. */
export const GO_TARGETS: readonly GoTarget[] = [
  { goarch: "amd64", goos: "darwin" },
  { goarch: "arm64", goos: "darwin" },
  { goarch: "amd64", goos: "linux" },
  { goarch: "amd64", goos: "windows" },
];

/** Where a text came from; rendered so a reader can tell curated text from shipped text. */
export type TextOrigin = "upstream" | "curated-upstream" | "canonical" | "vendored-extract";

/** Finite bounds for one generation or check. */
export const NOTICE_LIMITS = {
  /** Components across all ecosystems. */
  components: 2000,
  /** Licence/notice files read for one component. */
  textsPerComponent: 24,
  /** Bytes in one licence/notice file (the largest observed is ~63 KiB). */
  textBytes: 4 * 1024 * 1024,
  /** Bytes of licence text across the whole generation. */
  totalTextBytes: 32 * 1024 * 1024,
  /** Directory levels descended below a package or module root. */
  scanDepth: 4,
  /** Directory entries examined in one directory. */
  directoryEntries: 4096,
  /** Wall-clock deadline for one graph command. */
  commandTimeoutMs: 300_000,
  /** Captured bytes from one graph command. */
  commandMaxBytes: 256 * 1024 * 1024,
  /** Bytes in one vendored native file that a curated extract must appear in. */
  vendoredBytes: 32 * 1024 * 1024,
  /** Bytes written to the notices file. */
  noticesBytes: 48 * 1024 * 1024,
  /** Bytes written to the manifest. */
  manifestBytes: 8 * 1024 * 1024,
  /** Curated text entries the registry may declare. */
  registryTexts: 1024,
  /** Override entries the registry may declare. */
  registryOverrides: 1024,
  /** Bytes read from one `package.json`. */
  packageJsonBytes: 1024 * 1024,
} as const;

/** One licence/copyright/notice text captured for a component. */
export interface NoticeText {
  /** Stable relative identifier, for example `cargo:kube@4.2.0/LICENSE`. */
  readonly provenance: string;
  /** Absolute source path; never rendered. */
  readonly path: string;
  /** SHA-256 of the source bytes. */
  readonly sha256: string;
  /** Source byte count. */
  readonly bytes: number;
  /** Decoded text, rendered verbatim. */
  readonly body: string;
  readonly origin: TextOrigin;
  /** Upstream URL for curated and vendored texts. */
  readonly source?: string;
}

/** One redistributed component and every text that must accompany it. */
export interface NoticeComponent {
  readonly ecosystem: NoticeEcosystem;
  readonly name: string;
  readonly version: string;
  /** License expression as declared by the package or crate. */
  readonly declaredLicense: string;
  /** The alternative the notices rely on, or the declared expression when it is not a choice. */
  readonly selectedLicense: string;
  /**
   * Where the component is redistributed: Cargo target triples or Go
   * `os/arch` labels. Empty for npm, which is the same on every target.
   */
  readonly targets: readonly string[];
  /** Where recipients obtain the exact source (crates.io, pkg.go.dev, npm). */
  readonly source: string;
  readonly texts: readonly NoticeText[];
  /** Reviewed notes rendered after the header, for example MPL source delivery. */
  readonly notes: readonly string[];
  /** Why a curated override was required; absent when the package shipped its text. */
  readonly overrideReason?: string;
}

/** The collected graph before rendering. */
export interface CollectedNotices {
  readonly components: readonly NoticeComponent[];
  readonly inputs: {
    readonly pnpmLockSha256: string;
    readonly cargoLockSha256: string;
    readonly goSumSha256: string;
    readonly registrySha256: string;
  };
}
