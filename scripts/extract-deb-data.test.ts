import { spawnSync } from "node:child_process";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

let root: string;
const script = resolve("scripts/extract-deb-data.sh");
const member = "./usr/share/doc/libfixture/copyright";
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "talos deb data-"));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

// Boundary fixture for libarchive invocation/error handling. Real Ubuntu archive
// bytes/modes are checked separately locally and on the hosted qualification job.
describe.skipIf(process.platform === "win32")("declared Debian data extraction", () => {
  function extract(options: { corrupt?: boolean; duplicate?: boolean; path?: string } = {}) {
    const bin = join(root, "bin");
    mkdirSync(bin, { recursive: true });
    const mock = join(bin, "bsdtar");
    writeFileSync(
      mock,
      `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  -tf)
    printf 'debian-binary\\ncontrol.tar.gz\\ndata.tar.gz\\n'
    if [[ $MOCK_DUPLICATE == 1 ]]; then printf 'data.tar.xz\\n'; fi ;;
  -xOf)
    test "$#" -eq 3
    test "$3" = data.tar.gz
    printf 'synthetic compressed boundary stream'
    if [[ $MOCK_CORRUPT == 1 ]]; then exit 13; fi ;;
  -xpf)
    test "$#" -eq 10
    test "$2" = -
    test "$3" = --no-same-owner
    test "$4" = --no-acls
    test "$5" = --no-xattrs
    test "$6" = --no-fflags
    test "$7" = -C
    test "$9" = --
    test "\${10}" = ./usr/share/doc/libfixture/copyright
    cat > /dev/null
    mkdir -p "$8/usr/share/doc/libfixture"
    printf 'synthetic data' > "$8/usr/share/doc/libfixture/copyright" ;;
  *) exit 19 ;;
esac
`,
    );
    chmodSync(mock, 0o755);
    const archive = join(root, "Ubuntu fixture.deb");
    writeFileSync(archive, "synthetic Debian archive boundary");
    return spawnSync("bash", [script, archive, options.path ?? member, join(root, "extracted")], {
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH ?? ""}`,
        MOCK_CORRUPT: options.corrupt ? "1" : "0",
        MOCK_DUPLICATE: options.duplicate ? "1" : "0",
      },
      encoding: "utf8",
      timeout: 5_000,
    });
  }

  it("uses preserved archive modes, not ownership/ACL/xattr restoration, with spaced paths", () => {
    const result = extract();
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "extracted/usr/share/doc/libfixture/copyright"), "utf8")).toBe(
      "synthetic data",
    );
  });

  it("propagates a failed/truncated producer and removes partial output", () => {
    const result = extract({ corrupt: true });
    expect(result.status).toBe(13);
    expect(existsSync(join(root, "extracted"))).toBe(false);
  });

  it("rejects duplicate data archives before creating output", () => {
    expect(extract({ duplicate: true }).status).toBe(1);
    expect(existsSync(join(root, "extracted"))).toBe(false);
  });

  it.each([
    "./usr/bin/evil",
    "./usr/share/doc/../copyright",
    "/usr/share/doc/libfixture/copyright",
    "./usr/share/glib-2.0/schemas/evil.sh",
  ])("rejects undeclared member %s", (path) => {
    const result = extract({ path });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Usage:");
    expect(existsSync(join(root, "extracted"))).toBe(false);
  });

  it("does not overwrite or delete a preexisting extraction destination", () => {
    mkdirSync(join(root, "extracted"));
    writeFileSync(join(root, "extracted/marker"), "owner data");
    expect(extract().status).toBe(1);
    expect(readFileSync(join(root, "extracted/marker"), "utf8")).toBe("owner data");
  });
});
