import { existsSync, readdirSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";

import { collectNotices, type CommandRunner } from "./collect.ts";
import { describe, readBoundedFile } from "./files.ts";
import { inspectPayload } from "./payload.ts";
import {
  MANIFEST_PATH,
  NOTICES_PATH,
  assertArtifactPair,
  compareArtifacts,
  renderNotices,
  type ArtifactDifference,
  type RenderedNotices,
} from "./render.ts";
import { NOTICE_LIMITS } from "./types.ts";

/** The three supported subcommands. */
export type NoticeCommand = "generate" | "check" | "check-packaged";

/** Dependencies a caller may replace; tests inject a root and a graph runner. */
export interface NoticeCliOptions {
  readonly root: string;
  readonly run?: CommandRunner;
  readonly limits?: typeof NOTICE_LIMITS;
  readonly log?: (message: string) => void;
}

/** Outcome of one successful command. */
export interface NoticeCliResult {
  readonly command: NoticeCommand;
  readonly message: string;
}

/** Directories directly under `legal/` that are inputs rather than generated output. */
const ALLOWED_LEGAL_ENTRIES: ReadonlySet<string> = new Set([
  basename(NOTICES_PATH),
  basename(MANIFEST_PATH),
  "sources",
]);

function readCommitted(root: string, relative: string, maxBytes: number): string | undefined {
  const path = join(root, relative);
  if (!existsSync(path)) {
    return undefined;
  }
  return readBoundedFile(path, maxBytes, relative).toString("utf8");
}

function unexpectedLegalEntries(root: string): ArtifactDifference[] {
  const directory = join(root, "legal");
  if (!existsSync(directory)) {
    return [];
  }
  const differences: ArtifactDifference[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (!ALLOWED_LEGAL_ENTRIES.has(entry.name)) {
      differences.push({
        detail: "legal/ contains an entry that is neither a generated artifact nor a curated input",
        kind: "unexpected",
        path: `legal/${entry.name}`,
      });
    }
  }
  return differences;
}

function formatDifferences(differences: readonly ArtifactDifference[]): string {
  return differences
    .map((difference) => `  ${difference.path}: ${difference.kind} — ${difference.detail}`)
    .join("\n");
}

/**
 * Writes both artifacts through temporary files.
 *
 * Both renders complete before anything touches the repository, and each file
 * is replaced by an atomic rename, so a failure cannot leave a truncated file.
 * A crash between the two renames leaves a pair that `pnpm notices:check`
 * reports as inconsistent rather than silently accepting.
 */
function writeArtifacts(root: string, rendered: RenderedNotices): void {
  const noticesPath = resolve(root, NOTICES_PATH);
  const manifestPath = resolve(root, MANIFEST_PATH);
  const noticesTemp = `${noticesPath}.tmp`;
  const manifestTemp = `${manifestPath}.tmp`;
  try {
    writeFileSync(noticesTemp, rendered.notices, "utf8");
    writeFileSync(manifestTemp, rendered.manifestJson, "utf8");
    renameSync(noticesTemp, noticesPath);
    renameSync(manifestTemp, manifestPath);
  } catch (error) {
    rmSync(noticesTemp, { force: true });
    rmSync(manifestTemp, { force: true });
    throw new Error(`Could not write the notice artifacts: ${describe(error)}.`, { cause: error });
  }
}

function summarize(rendered: RenderedNotices): string {
  const { coverage } = rendered.manifest;
  return (
    `${String(coverage.components)} components ` +
    `(${String(coverage.npm)} npm, ${String(coverage.cargo)} cargo, ${String(coverage.go)} go), ` +
    `${String(coverage.texts)} texts, ${String(coverage.textBytes)} bytes`
  );
}

/**
 * Runs one notice command.
 *
 * `generate` replaces both artifacts after a complete render. `check` never
 * writes: it regenerates from the live locked inputs and fails on any
 * difference, missing file, unexpected file in `legal/`, malformed manifest or
 * inconsistent artifact pair. `check-packaged` compares an extracted installed
 * payload with the committed artifacts.
 *
 * @throws When the graph cannot be collected, a bound is exceeded, or the
 *   requested comparison fails; the message names every difference found.
 */
export function runNoticeCli(argv: readonly string[], options: NoticeCliOptions): NoticeCliResult {
  const limits = options.limits ?? NOTICE_LIMITS;
  const log = options.log ?? (() => undefined);
  const command = argv[0];
  if (command !== "generate" && command !== "check" && command !== "check-packaged") {
    throw new Error(
      "Usage: pnpm notices:generate | pnpm notices:check | pnpm notices:check-packaged -- <payload-root>",
    );
  }
  const collect = (): RenderedNotices =>
    renderNotices(
      collectNotices({
        limits,
        log,
        root: options.root,
        ...(options.run === undefined ? {} : { run: options.run }),
      }),
      limits,
    );
  if (command === "generate") {
    const rendered = collect();
    writeArtifacts(options.root, rendered);
    return {
      command,
      message: `Wrote ${NOTICES_PATH} and ${MANIFEST_PATH}: ${summarize(rendered)}.`,
    };
  }
  if (command === "check") {
    const rendered = collect();
    const differences = [
      ...compareArtifacts(rendered, {
        manifest: readCommitted(options.root, MANIFEST_PATH, limits.manifestBytes),
        notices: readCommitted(options.root, NOTICES_PATH, limits.noticesBytes),
      }),
      ...unexpectedLegalEntries(options.root),
    ];
    if (differences.length > 0) {
      throw new Error(
        `The generated notice artifacts are not current. Run pnpm notices:generate.\n${formatDifferences(differences)}`,
      );
    }
    assertArtifactPair(rendered.notices, rendered.manifestJson);
    return { command, message: `Notice artifacts are current: ${summarize(rendered)}.` };
  }
  const payloadRoot = argv[1];
  if (payloadRoot === undefined || argv.length > 2) {
    throw new Error("notices:check-packaged needs exactly one payload root argument.");
  }
  const notices = readCommitted(options.root, NOTICES_PATH, limits.noticesBytes);
  const manifest = readCommitted(options.root, MANIFEST_PATH, limits.manifestBytes);
  if (notices === undefined || manifest === undefined) {
    throw new Error("The committed notice artifacts are missing; run pnpm notices:generate.");
  }
  assertArtifactPair(notices, manifest);
  const report = inspectPayload({
    expected: { manifest, notices },
    limits,
    payloadRoot: resolve(payloadRoot),
  });
  if (report.problems.length > 0) {
    const details = report.problems
      .map((problem) => `  ${problem.path}: ${problem.kind} — ${problem.detail}`)
      .join("\n");
    throw new Error(`The packaged legal payload does not match the manifest.\n${details}`);
  }
  return {
    command,
    message:
      `Packaged legal payload matches the committed artifacts: ` +
      `${String(report.verified.length)} files, ${String(report.components)} components, ` +
      `${String(report.texts)} texts.`,
  };
}
