/**
 * Pinned-tool version checks for the generated-contract gate.
 *
 * The contract generator compares the version each pinned tool reports with the
 * version recorded in `docs/protocol/helper-v1.md`. One of those tools, Go's
 * `protoc-gen-go` plugin, reports the file name it was invoked as, so the same
 * pinned release reports `protoc-gen-go v1.36.12` on Linux and macOS and
 * `protoc-gen-go.exe v1.36.12` on Windows. Comparing the reported line byte for
 * byte therefore failed on the Windows runner before any generated output was
 * compared.
 */

/** Matches an executable suffix on the tool name, and nothing else. */
const EXECUTABLE_SUFFIX = /^(\S+)\.exe(?=\s+\S+$)/u;

/**
 * Removes a Windows executable suffix from a tool's self-reported version line.
 *
 * Only the tool name's `.exe` suffix is removed; the reported version text is
 * still compared exactly, so a wrong plugin release fails on every platform.
 * Input without that suffix is returned unchanged, which keeps the POSIX
 * comparison byte for byte identical to what it was before this normalization.
 */
export function normalizeToolVersion(reported: string): string {
  const line = reported.trim();
  const match = EXECUTABLE_SUFFIX.exec(line);
  if (match === null) {
    return line;
  }
  return `${match[1]}${line.slice(match[0].length)}`;
}
