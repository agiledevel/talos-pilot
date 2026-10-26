import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  releaseOutputProgram,
  validatePayload,
  validateReleaseOutput,
  type PayloadEntry,
} from "./payload";

const script = resolve("scripts/check-payload.ts");
const main = "usr/bin/talos-pilot";
const helper = "usr/lib/Talos Pilot/binaries/talos-pilot-helper";
let fixture: string;

beforeEach(() => {
  fixture = mkdtempSync(join(tmpdir(), "talos-pilot-payload-"));
});
afterEach(() => {
  rmSync(fixture, { recursive: true, force: true });
});

function entries(...values: readonly (readonly [string, boolean])[]): PayloadEntry[] {
  return values.map(([path, executable]) => ({ path, executable }));
}

function writeExecutable(path: string, contents = "synthetic program"): void {
  const target = join(fixture, path);
  mkdirSync(join(target, ".."), { recursive: true });
  writeFileSync(target, contents);
  chmodSync(target, 0o755);
}

describe("packaged payload allowlists", () => {
  it("accepts the intended Linux programs", () => {
    expect(() => validatePayload("linux-deb", entries([main, true], [helper, true]))).not.toThrow();
    expect(() => validatePayload("linux-rpm", entries([main, true], [helper, true]))).not.toThrow();
  });

  it("rejects a missing or non-executable helper", () => {
    expect(() => validatePayload("linux-deb", entries([main, true]))).toThrow("missing");
    expect(() => validatePayload("linux-deb", entries([main, true], [helper, false]))).toThrow(
      "cannot execute",
    );
  });

  it("rejects the maintainer exporter and test tools anywhere in the payload", () => {
    expect(() =>
      validatePayload(
        "linux-deb",
        entries([main, true], [helper, true], ["usr/bin/export_ipc_types", true]),
      ),
    ).toThrow("maintainer or test tool");
    expect(() =>
      validatePayload(
        "linux-deb",
        entries([main, true], [helper, true], ["usr/lib/Talos Pilot/binaries/wdio-driver", false]),
      ),
    ).toThrow("maintainer or test tool");
  });

  it("rejects an undeclared program but not executable shared objects", () => {
    expect(() =>
      validatePayload(
        "linux-deb",
        entries([main, true], [helper, true], ["usr/bin/extra-tool", true]),
      ),
    ).toThrow("undeclared executable");
    expect(() =>
      validatePayload(
        "linux-deb",
        entries([main, true], [helper, true], ["usr/lib/Talos Pilot/libsomething.so", true]),
      ),
    ).not.toThrow();
  });

  it("treats versioned shared libraries as libraries, not undeclared programs", () => {
    const libraries = entries(
      [main, true],
      [helper, true],
      ["usr/lib/x86_64-linux-gnu/libglib-2.0.so.0.8600.0", true],
      ["usr/lib/x86_64-linux-gnu/libgobject-2.0.so.0.8600.0", true],
      ["usr/lib/x86_64-linux-gnu/libfoo.so.1", true],
      ["usr/lib/x86_64-linux-gnu/libbar.so", true],
    );
    expect(() => validatePayload("linux-deb", libraries)).not.toThrow();
    expect(() =>
      validatePayload(
        "macos-app",
        entries(
          ["Contents/MacOS/talos-pilot", true],
          ["Contents/Resources/binaries/talos-pilot-helper", true],
          ["Contents/Frameworks/libfoo.1.dylib", true],
          ["Contents/Frameworks/libbar.dylib", true],
        ),
      ),
    ).not.toThrow();
    // A library-looking name that is not a shared-object suffix is still a program.
    expect(() =>
      validatePayload("linux-deb", [
        ...libraries,
        { path: "usr/bin/libnotreally.so.debug", executable: true },
      ]),
    ).toThrow("undeclared executable");
    expect(() =>
      validatePayload("linux-deb", [
        ...libraries,
        { path: "usr/bin/really-a-program", executable: true },
      ]),
    ).toThrow("undeclared executable");
  });

  it("requires the AppImage runtime and WebKit helpers explicitly", () => {
    const appimage = entries(
      [main, true],
      [helper, true],
      ["AppRun", true],
      ["usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitNetworkProcess", true],
      ["usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/WebKitWebProcess", true],
      [
        "usr/lib/x86_64-linux-gnu/webkit2gtk-4.1/injected-bundle/libwebkit2gtkinjectedbundle.so",
        true,
      ],
    );
    expect(() => validatePayload("linux-appimage", appimage)).not.toThrow();
    expect(() =>
      validatePayload(
        "linux-appimage",
        appimage.filter((entry) => !entry.path.endsWith("WebKitWebProcess")),
      ),
    ).toThrow("WebKitWebProcess");
    // The bundler copies the helpers from whichever distro directory exists.
    const libexec = entries(
      [main, true],
      [helper, true],
      ["AppRun", true],
      ["usr/libexec/webkit2gtk-4.1/WebKitNetworkProcess", true],
      ["usr/libexec/webkit2gtk-4.1/WebKitWebProcess", true],
    );
    expect(() => validatePayload("linux-appimage", libexec)).not.toThrow();
    expect(() =>
      validatePayload("linux-appimage", [
        ...appimage,
        { path: "usr/bin/helper-tool", executable: true },
      ]),
    ).toThrow("undeclared executable");
  });

  it("accepts the macOS app programs and rejects an undeclared one", () => {
    const app = entries(
      ["Contents/MacOS/talos-pilot", true],
      ["Contents/Resources/binaries/talos-pilot-helper", true],
    );
    expect(() => validatePayload("macos-app", app)).not.toThrow();
    expect(() =>
      validatePayload("macos-app", [...app, { path: "Contents/MacOS/extra", executable: true }]),
    ).toThrow("undeclared executable");
  });
});

describe("ordinary release output exclusion", () => {
  it("requires exactly the application program, ignoring dep files", () => {
    expect(releaseOutputProgram("x86_64-pc-windows-msvc")).toBe("talos-pilot.exe");
    expect(() =>
      validateReleaseOutput(
        "x86_64-unknown-linux-gnu",
        entries(["talos-pilot", true], ["talos-pilot.d", false]),
      ),
    ).not.toThrow();
    expect(() =>
      validateReleaseOutput("x86_64-pc-windows-msvc", entries(["talos-pilot.exe", true])),
    ).not.toThrow();
  });

  it("rejects a second program or the maintainer exporter", () => {
    expect(() =>
      validateReleaseOutput(
        "x86_64-unknown-linux-gnu",
        entries(["talos-pilot", true], ["export_ipc_types", true], ["talos-pilot.d", false]),
      ),
    ).toThrow("maintainer or test tool");
    expect(() =>
      validateReleaseOutput(
        "x86_64-unknown-linux-gnu",
        entries(["talos-pilot", true], ["another-program", true]),
      ),
    ).toThrow("must contain only talos-pilot");
  });
});

describe("payload CLI", () => {
  it("inspects an extracted DEB payload and fails the exporter case", () => {
    writeExecutable(main);
    writeExecutable(helper);
    const legal = join(fixture, "usr/lib/Talos Pilot/legal/THIRD-PARTY-NOTICES.txt");
    mkdirSync(join(legal, ".."), { recursive: true });
    writeFileSync(legal, "notice");
    const check = () =>
      execFileSync(process.execPath, [script, "--platform", "linux-deb", "--root", fixture], {
        cwd: fixture,
        encoding: "utf8",
        stdio: "pipe",
      });
    expect(check()).toContain("only declared programs");
    writeExecutable("usr/bin/export_ipc_types");
    expect(check).toThrow("maintainer or test tool");
    rmSync(join(fixture, "usr/bin/export_ipc_types"));
    chmodSync(join(fixture, helper), 0o644);
    expect(check).toThrow("cannot execute");
  });

  it("inspects a release output directory", () => {
    writeExecutable("talos-pilot");
    writeExecutable("binaries/talos-pilot-helper");
    writeFileSync(join(fixture, "talos-pilot.d"), "deps");
    const check = () =>
      execFileSync(
        process.execPath,
        [script, "--release-output", fixture, "--target", "x86_64-unknown-linux-gnu"],
        { cwd: fixture, encoding: "utf8", stdio: "pipe" },
      );
    expect(check()).toContain("only the application program");
    writeExecutable("binaries/export_ipc_types");
    expect(check).toThrow("maintainer or test tool");
  });

  it("rejects unknown options and unsupported payload platforms", () => {
    expect(() =>
      execFileSync(process.execPath, [script, "--unknown"], { cwd: fixture, stdio: "pipe" }),
    ).toThrow("Unknown option");
    expect(() =>
      execFileSync(process.execPath, [script, "--platform", "freebsd", "--root", fixture], {
        cwd: fixture,
        stdio: "pipe",
      }),
    ).toThrow("Unsupported payload platform");
  });
});
