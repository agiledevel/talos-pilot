import { createHash } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
  existsSync,
  copyFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { runNoticeCli } from "./cli";
import type { CommandInvocation, CommandRunner } from "./collect";
import { MANIFEST_PATH, NOTICES_PATH } from "./render";
import { GO_TARGETS } from "./types";
import { loadNoticeRegistry } from "./sources";

/** One npm production package installed in the synthetic graph. */
interface SyntheticPackage {
  readonly name: string;
  readonly version: string;
  body: string;
}

/** Mutable state a test flips to simulate graph or text drift. */
interface SyntheticGraph {
  readonly packages: SyntheticPackage[];
  failGoList: boolean;
  /** Extra graph-only Go module whose extracted source may or may not exist. */
  graphOnlyModule: boolean;
}

const temporaryRoots: string[] = [];

function sha256(text: string): string {
  return createHash("sha256").update(Buffer.from(text, "utf8")).digest("hex");
}

function write(path: string, body: string): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, body, "utf8");
}

function read(path: string): string {
  return readFileSync(path, "utf8");
}

/**
 * Builds a small repository that every graph command reads through the injected
 * runner: two npm packages, one Cargo crate plus its workspace member, and one
 * linked Go module. The layout is unrelated to the real project so a failure
 * here can only come from the collector or CLI.
 */
function createFixture(): { graph: SyntheticGraph; root: string } {
  const root = mkdtempSync(join(tmpdir(), "talos-pilot-notices-cli-"));
  temporaryRoots.push(root);
  const graph: SyntheticGraph = {
    failGoList: false,
    graphOnlyModule: false,
    packages: [
      {
        body: "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof package-a\n",
        name: "package-a",
        version: "1.0.0",
      },
      {
        body: "Apache License\nVersion 2.0, January 2004\nfor package-b\n",
        name: "package-b",
        version: "2.0.0",
      },
    ],
  };
  write(join(root, "pnpm-lock.yaml"), "lockfileVersion: '9.0'\n");
  write(join(root, "src-tauri", "Cargo.lock"), "# synthetic cargo lock\n");
  write(join(root, "helper", "go.sum"), "synthetic go sum\n");
  write(
    join(root, "legal", "sources", "registry.json"),
    `${JSON.stringify({
      overrides: [],
      schemaVersion: 1,
      texts: [],
    })}\n`,
  );
  for (const pkg of graph.packages) {
    write(
      join(root, "packages", pkg.name, "package.json"),
      JSON.stringify({ name: pkg.name, version: pkg.version }),
    );
    write(join(root, "packages", pkg.name, "LICENSE"), pkg.body);
  }
  write(
    join(root, "crates", "dep-a", "LICENSE-APACHE"),
    "Apache License\nVersion 2.0, January 2004\nfor dep-a\n",
  );
  write(
    join(root, "crates", "dep-a", "Cargo.toml"),
    '[package]\nname = "dep-a"\nversion = "1.0.0"\n',
  );
  write(
    join(root, "mods", "mod-a", "LICENSE"),
    "MIT License\n\nPermission is hereby granted, free of charge, to any person obtaining a copy\nof module-a\n",
  );
  return { graph, root };
}

function cargoMetadata(root: string): string {
  const workspace = `path+file://${root}/src-tauri#talos-pilot@0.1.0`;
  const dep = "registry+https://github.com/rust-lang/crates.io-index#dep-a@1.0.0";
  return JSON.stringify({
    packages: [
      {
        id: workspace,
        license: null,
        license_file: null,
        manifest_path: join(root, "src-tauri", "Cargo.toml"),
        name: "talos-pilot",
        repository: null,
        source: null,
        version: "0.1.0",
      },
      {
        id: dep,
        license: "Apache-2.0",
        license_file: null,
        manifest_path: join(root, "crates", "dep-a", "Cargo.toml"),
        name: "dep-a",
        repository: null,
        source: "registry+https://github.com/rust-lang/crates.io-index",
        version: "1.0.0",
      },
    ],
    resolve: {
      nodes: [
        {
          deps: [
            { dep_kinds: [{ kind: null, target: null }], name: "dep-a", pkg: dep },
            { dep_kinds: [{ kind: "dev", target: null }], name: "dev-only", pkg: "dev-only" },
          ],
          id: workspace,
        },
        { deps: [], id: dep },
      ],
    },
    workspace_members: [workspace],
  });
}

function goModuleList(root: string, graph: SyntheticGraph): string {
  const modules = [
    { Main: true, Path: "example.invalid/talos-pilot/helper" },
    { Dir: join(root, "mods", "mod-a"), Path: "example.invalid/mod-a", Version: "v1.0.0" },
  ];
  if (graph.graphOnlyModule) {
    modules.push({
      Dir: join(root, "mods", "graph-only"),
      Path: "example.invalid/graph-only",
      Version: "v9.9.9",
    });
  }
  return modules.map((module) => JSON.stringify(module)).join("\n");
}

function goPackageList(root: string): string {
  return [
    JSON.stringify({
      ImportPath: "example.invalid/talos-pilot/helper/cmd",
      Module: { Main: true, Path: "example.invalid/talos-pilot/helper" },
    }),
    JSON.stringify({
      ImportPath: "example.invalid/mod-a/pkg",
      Module: {
        Dir: join(root, "mods", "mod-a"),
        Path: "example.invalid/mod-a",
        Version: "v1.0.0",
      },
    }),
  ].join("\n");
}

function runner(root: string, graph: SyntheticGraph): CommandRunner {
  return (invocation: CommandInvocation): string => {
    if (invocation.command.includes("pnpm") && invocation.args.includes("licenses")) {
      return JSON.stringify({
        Apache: graph.packages
          .filter((pkg) => pkg.name === "package-b")
          .map((pkg) => ({
            name: pkg.name,
            paths: [join(root, "packages", pkg.name)],
            versions: [pkg.version],
          })),
        MIT: graph.packages
          .filter((pkg) => pkg.name !== "package-b")
          .map((pkg) => ({
            name: pkg.name,
            paths: [join(root, "packages", pkg.name)],
            versions: [pkg.version],
          })),
      });
    }
    if (invocation.command === "cargo") {
      return cargoMetadata(root);
    }
    if (
      invocation.command === "go" &&
      invocation.args[0] === "list" &&
      invocation.args[1] === "-m"
    ) {
      return goModuleList(root, graph);
    }
    if (invocation.command === "go" && invocation.args[1] === "-deps") {
      if (graph.failGoList) {
        throw new Error("go list -deps failed in the synthetic fixture");
      }
      return goPackageList(root);
    }
    throw new Error(
      `Unexpected synthetic command: ${invocation.command} ${invocation.args.join(" ")}`,
    );
  };
}

function run(
  root: string,
  graph: SyntheticGraph,
  argv: readonly string[],
): ReturnType<typeof runNoticeCli> {
  return runNoticeCli(argv, { root, run: runner(root, graph) });
}

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { force: true, recursive: true });
  }
});

describe("notice CLI on a synthetic graph", () => {
  it("generates both artifacts and then passes its own read-only check", () => {
    const { graph, root } = createFixture();
    const generated = run(root, graph, ["generate"]);
    expect(generated.message).toContain("4 components (2 npm, 1 cargo, 1 go)");
    const notices = read(join(root, NOTICES_PATH));
    expect(notices).toContain("package-a 1.0.0");
    expect(notices).toContain("dep-a 1.0.0");
    expect(notices).toContain("example.invalid/mod-a v1.0.0");
    // Go modules record their own per-target membership rather than claiming all.
    expect(notices).toContain(
      "Redistributed by: darwin/amd64, darwin/arm64, linux/amd64, windows/amd64",
    );
    expect(read(join(root, MANIFEST_PATH))).toContain('"schemaVersion": 1');
    expect(run(root, graph, ["check"]).message).toContain("are current");
    // The Cargo workspace member and the helper module itself are first-party.
    expect(notices).not.toContain("talos-pilot 0.1.0");
  });

  it("emits identical artifacts on cold Go caches requiring every target's source discovery", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const warmNotices = read(join(root, NOTICES_PATH));
    const warmManifest = read(join(root, MANIFEST_PATH));
    const prepared = new Set<string>();
    const base = runner(root, graph);
    const cold: CommandRunner = (invocation) => {
      if (invocation.command === "go" && invocation.args[1] === "-deps")
        prepared.add(`${invocation.env.GOOS}/${invocation.env.GOARCH}`);
      if (
        invocation.command === "go" &&
        invocation.args[1] === "-m" &&
        !GO_TARGETS.every(({ goos, goarch }) => prepared.has(`${goos}/${goarch}`))
      ) {
        // A real pre-discovery go list -m omits Dir until source extraction.
        return JSON.stringify({ Path: "example.invalid/mod-a", Version: "v1.0.0" });
      }
      return base(invocation);
    };
    const generated = runNoticeCli(["generate"], { root, run: cold });
    expect(generated.message).toContain("4 components (2 npm, 1 cargo, 1 go)");
    expect(read(join(root, NOTICES_PATH))).toBe(warmNotices);
    expect(read(join(root, MANIFEST_PATH))).toBe(warmManifest);
  });

  it("fails on a new dependency without rewriting output, then recovers", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const before = read(join(root, NOTICES_PATH));
    graph.packages.push({
      body: "Permission to use, copy, modify, and/or distribute this software for package-c\n",
      name: "package-c",
      version: "3.0.0",
    });
    write(
      join(root, "packages", "package-c", "package.json"),
      JSON.stringify({ name: "package-c", version: "3.0.0" }),
    );
    write(
      join(root, "packages", "package-c", "LICENSE"),
      "Permission to use, copy, modify, and/or distribute this software for package-c\n",
    );
    expect(() => run(root, graph, ["check"])).toThrow("not current");
    expect(read(join(root, NOTICES_PATH))).toBe(before);
    run(root, graph, ["generate"]);
    expect(read(join(root, NOTICES_PATH))).toContain("package-c 3.0.0");
    expect(run(root, graph, ["check"]).message).toContain("are current");
  });

  it("fails on changed licence text without rewriting output", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const before = read(join(root, MANIFEST_PATH));
    write(join(root, "packages", "package-a", "LICENSE"), "rewritten terms\n");
    expect(() => run(root, graph, ["check"])).toThrow("not current");
    expect(read(join(root, MANIFEST_PATH))).toBe(before);
    run(root, graph, ["generate"]);
    expect(read(join(root, NOTICES_PATH))).toContain("rewritten terms");
    expect(run(root, graph, ["check"]).message).toContain("are current");
  });

  it("fails on missing, unexpected and malformed output", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    rmSync(join(root, NOTICES_PATH));
    expect(() => run(root, graph, ["check"])).toThrow("missing");
    run(root, graph, ["generate"]);
    rmSync(join(root, MANIFEST_PATH));
    expect(() => run(root, graph, ["check"])).toThrow("missing");
    run(root, graph, ["generate"]);
    write(join(root, "legal", "EXTRA.txt"), "hand-written notice\n");
    expect(() => run(root, graph, ["check"])).toThrow("unexpected");
    rmSync(join(root, "legal", "EXTRA.txt"));
    write(join(root, MANIFEST_PATH), "{not json\n");
    expect(() => run(root, graph, ["check"])).toThrow("not current");
    expect(() => run(root, graph, ["check-packaged", join(root, "legal")])).toThrow(
      "not valid JSON",
    );
  });

  it("fails on a graph command error and names the command", () => {
    const { graph, root } = createFixture();
    graph.failGoList = true;
    expect(() => run(root, graph, ["generate"])).toThrow(
      "go list -deps failed in the synthetic fixture",
    );
    expect(existsSync(join(root, NOTICES_PATH))).toBe(false);
  });

  it("fails when a redistributed package ships no licence text and has no override", () => {
    const { graph, root } = createFixture();
    rmSync(join(root, "packages", "package-a", "LICENSE"));
    expect(() => run(root, graph, ["generate"])).toThrow(
      "ships no licence text and has no curated override",
    );
  });

  it("uses a digest-checked curated override instead of the missing upstream text", () => {
    const { graph, root } = createFixture();
    rmSync(join(root, "packages", "package-a", "LICENSE"));
    const body = "Canonical MIT text for the override\n";
    write(join(root, "legal", "sources", "canonical", "MIT.txt"), body);
    write(
      join(root, "legal", "sources", "registry.json"),
      `${JSON.stringify({
        overrides: [
          {
            ecosystem: "npm",
            name: "package-a",
            reason: "the synthetic package ships no licence file",
            selectedLicense: "MIT",
            texts: [{ path: "canonical/MIT.txt", source: "https://example.invalid/canonical-mit" }],
            version: "1.0.0",
          },
        ],
        schemaVersion: 1,
        texts: [
          {
            kind: "canonical",
            path: "canonical/MIT.txt",
            sha256: sha256(body),
            source: "https://example.invalid/canonical-mit",
          },
        ],
      })}\n`,
    );
    run(root, graph, ["generate"]);
    const notices = read(join(root, NOTICES_PATH));
    expect(notices).toContain("Curated override: the synthetic package ships no licence file");
    expect(notices).toContain(`curated:canonical/MIT.txt`);
    expect(notices).toContain(body.trimEnd());
    expect(run(root, graph, ["check"]).message).toContain("are current");
  });

  it("fails when an override no longer matches the locked graph", () => {
    const { graph, root } = createFixture();
    const body = "Canonical MIT text\n";
    write(join(root, "legal", "sources", "canonical", "MIT.txt"), body);
    write(
      join(root, "legal", "sources", "registry.json"),
      `${JSON.stringify({
        overrides: [
          {
            ecosystem: "cargo",
            name: "gone-crate",
            reason: "stale fixture entry",
            selectedLicense: "MIT",
            texts: [{ path: "canonical/MIT.txt", source: "https://example.invalid/mit" }],
            version: "0.0.0",
          },
        ],
        schemaVersion: 1,
        texts: [
          {
            kind: "canonical",
            path: "canonical/MIT.txt",
            sha256: sha256(body),
            source: "https://example.invalid/mit",
          },
        ],
      })}\n`,
    );
    expect(() => run(root, graph, ["generate"])).toThrow("is stale");
  });

  it("fails when a vendored text entry no longer matches the locked graph", () => {
    const { graph, root } = createFixture();
    const body = "public domain dedication\n";
    write(join(root, "legal", "sources", "native", "extract.txt"), body);
    write(
      join(root, "legal", "sources", "registry.json"),
      `${JSON.stringify({
        overrides: [],
        schemaVersion: 1,
        texts: [
          {
            kind: "vendored-extract",
            path: "native/extract.txt",
            sha256: sha256(body),
            source: "https://example.invalid/extract",
          },
        ],
        vendored: [
          {
            ecosystem: "cargo",
            file: "LICENSE",
            name: "gone-crate",
            reason: "stale fixture entry",
            sha256: "c".repeat(64),
            source: "https://example.invalid/extract",
            textPath: "native/extract.txt",
            version: "9.9.9",
          },
        ],
      })}\n`,
    );
    expect(() => run(root, graph, ["generate"])).toThrow(
      "is stale: the locked graph no longer contains",
    );
  });

  it("rejects a metadata value that could forge a notice heading", () => {
    const { graph, root } = createFixture();
    const first = graph.packages[0];
    if (first === undefined) {
      throw new Error("fixture is missing its first package");
    }
    write(
      join(root, "packages", first.name, "package.json"),
      JSON.stringify({
        license: "MIT\n[cargo] forged 9.9.9",
        name: first.name,
        version: first.version,
      }),
    );
    expect(() => run(root, graph, ["generate"])).toThrow("contains a control character");
  });

  it("is independent of extra module-cache contents", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const withoutCache = read(join(root, NOTICES_PATH));
    const withoutManifest = read(join(root, MANIFEST_PATH));
    graph.graphOnlyModule = true;
    expect(existsSync(join(root, "mods", "graph-only"))).toBe(false);
    run(root, graph, ["generate"]);
    expect(read(join(root, NOTICES_PATH))).toBe(withoutCache);
    expect(read(join(root, MANIFEST_PATH))).toBe(withoutManifest);
    write(join(root, "mods", "graph-only", "LICENSE"), "unrelated graph-only terms\n");
    run(root, graph, ["generate"]);
    expect(read(join(root, NOTICES_PATH))).toBe(withoutCache);
    expect(read(join(root, MANIFEST_PATH))).toBe(withoutManifest);
    expect(read(join(root, NOTICES_PATH))).not.toContain("unrelated graph-only terms");
  });

  it("is byte-stable across repeated generation", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const firstNotices = sha256(read(join(root, NOTICES_PATH)));
    const firstManifest = sha256(read(join(root, MANIFEST_PATH)));
    run(root, graph, ["generate"]);
    expect(sha256(read(join(root, NOTICES_PATH)))).toBe(firstNotices);
    expect(sha256(read(join(root, MANIFEST_PATH)))).toBe(firstManifest);
  });

  it("checks a packaged payload and reports tampering", () => {
    const { graph, root } = createFixture();
    run(root, graph, ["generate"]);
    const payload = join(root, "payload", "legal");
    mkdirSync(payload, { recursive: true });
    copyFileSync(join(root, NOTICES_PATH), join(payload, "THIRD-PARTY-NOTICES.txt"));
    copyFileSync(join(root, MANIFEST_PATH), join(payload, "third-party-manifest.json"));
    expect(run(root, graph, ["check-packaged", payload]).message).toContain(
      "matches the committed artifacts",
    );
    write(
      join(payload, "THIRD-PARTY-NOTICES.txt"),
      `${read(join(payload, "THIRD-PARTY-NOTICES.txt"))}tampered\n`,
    );
    expect(() => run(root, graph, ["check-packaged", payload])).toThrow(
      "does not match the manifest",
    );
    rmSync(join(payload, "third-party-manifest.json"));
    expect(() => run(root, graph, ["check-packaged", payload])).toThrow(
      "does not contain this file",
    );
  });

  it("rejects an unknown subcommand and a missing payload argument", () => {
    const { graph, root } = createFixture();
    expect(() => run(root, graph, ["publish"])).toThrow("Usage:");
    expect(() => run(root, graph, ["check-packaged"])).toThrow("exactly one payload root");
  });

  it("loads the fixture registry without overrides", () => {
    const { root } = createFixture();
    expect(loadNoticeRegistry(root).overrides.size).toBe(0);
  });
});
