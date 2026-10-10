import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const helperDir = join(root, "helper");
const protoDir = join(root, "proto");
const generatedGo = join(helperDir, "internal/protocol/helper/v1/envelope.pb.go");
const schema = "helper/v1/envelope.proto";
const protoVersion = "libprotoc 36.2";
// The Go pin of record is helper/go.mod, which CI also reads through setup-go's
// go-version-file; deriving it here keeps the contract gate from drifting.
const goDirective = /^go\s+(\S+)$/mu.exec(readFileSync(join(helperDir, "go.mod"), "utf8"))?.[1];
if (goDirective === undefined) {
  throw new Error("helper/go.mod does not record a go directive.");
}
const goVersionPrefix = `go version go${goDirective} `;
const pluginVersion = "protoc-gen-go v1.36.12";
const goPluginModule = "google.golang.org/protobuf/cmd/protoc-gen-go@v1.36.12";
const checkOnly = process.argv.includes("--check");

function run(command: string, args: string[], cwd: string, env = process.env): string {
  const result = spawnSync(command, args, {
    cwd,
    env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) {
    throw new Error(`${command} could not start: ${result.error.message}`);
  }
  if (result.status !== 0) {
    const detail = `${result.stdout}${result.stderr}`.trim();
    throw new Error(`${command} ${args.join(" ")} failed${detail ? `:\n${detail}` : "."}`);
  }
  return result.stdout.trim();
}

function sha256(filePath: string): string {
  return createHash("sha256").update(readFileSync(filePath)).digest("hex");
}

function verifyVersion(command: string, args: string[], expected: string, cwd: string): void {
  const actual = run(command, args, cwd);
  if (actual !== expected) {
    throw new Error(
      `Expected ${expected}, received ${actual}. Install the pinned contract toolchain from docs/protocol/helper-v1.md.`,
    );
  }
}

function main(): void {
  const tempRoot = mkdtempSync(join(tmpdir(), "talos-pilot-contracts-"));
  try {
    verifyVersion("protoc", ["--version"], protoVersion, root);
    const actualGoVersion = run("go", ["version"], helperDir);
    if (!actualGoVersion.startsWith(goVersionPrefix)) {
      throw new Error(
        `Expected ${goVersionPrefix.trim()}, received ${actualGoVersion}. Install the pinned contract toolchain from docs/protocol/helper-v1.md.`,
      );
    }

    const binDir = join(tempRoot, "bin");
    const pluginName = process.platform === "win32" ? "protoc-gen-go.exe" : "protoc-gen-go";
    const pluginPath = join(binDir, pluginName);
    run("go", ["install", goPluginModule], helperDir, {
      ...process.env,
      GOBIN: binDir,
    });
    verifyVersion(pluginPath, ["--version"], pluginVersion, helperDir);

    const goOutput = join(tempRoot, "go");
    mkdirSync(goOutput);
    run(
      "protoc",
      [
        `--plugin=protoc-gen-go=${pluginPath}`,
        `--go_out=${goOutput}`,
        "--go_opt=paths=source_relative",
        "-I",
        protoDir,
        schema,
      ],
      root,
    );

    const typescriptOutput = checkOnly
      ? join(tempRoot, "typescript")
      : join(root, "src/lib/ipc/generated");
    mkdirSync(typescriptOutput, { recursive: true });
    run(
      "cargo",
      [
        "run",
        "--locked",
        "--manifest-path",
        join(root, "src-tauri/Cargo.toml"),
        "--bin",
        "export_ipc_types",
        "--",
        "--output-dir",
        typescriptOutput,
      ],
      root,
    );
    run("pnpm", ["exec", "oxfmt", typescriptOutput], root);

    const stagedGo = join(goOutput, "helper/v1/envelope.pb.go");
    if (checkOnly) {
      const goFiles = readdirSync(join(helperDir, "internal/protocol/helper/v1"), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      if (goFiles.join("\n") !== "envelope.pb.go") {
        throw new Error("Unexpected or missing generated Go protocol file.");
      }
      if (sha256(stagedGo) !== sha256(generatedGo)) {
        throw new Error("Generated Go protocol output is stale. Run `pnpm contracts:generate`.");
      }
      const expectedTsFiles = readdirSync(join(root, "src/lib/ipc/generated"), {
        withFileTypes: true,
      })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      const stagedTsFiles = readdirSync(typescriptOutput, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name)
        .sort();
      if (stagedTsFiles.join("\n") !== expectedTsFiles.join("\n")) {
        throw new Error("Generated IPC declaration files differ from the checked-in set.");
      }
      for (const file of stagedTsFiles) {
        if (
          sha256(join(typescriptOutput, file)) !== sha256(join(root, "src/lib/ipc/generated", file))
        ) {
          throw new Error(
            `Generated IPC declaration \`${file}\` is stale. Run \`pnpm contracts:generate\`.`,
          );
        }
      }
      run(
        "cargo",
        ["check", "--locked", "--manifest-path", join(root, "src-tauri/Cargo.toml")],
        root,
      );
    } else {
      const targetGoDir = join(helperDir, "internal/protocol/helper/v1");
      mkdirSync(targetGoDir, { recursive: true });
      copyFileSync(stagedGo, generatedGo);
    }
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

try {
  main();
  console.log(
    checkOnly ? "Rust, Go, and TypeScript contracts are current." : "Contracts generated.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : "Contract generation failed.");
  process.exitCode = 1;
}
