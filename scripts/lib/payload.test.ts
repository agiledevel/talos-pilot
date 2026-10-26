import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { APPIMAGE_DATA_LIMITS } from "./appimage-system-data";
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

function prepareAppImageCli(): () => string {
  for (const path of [
    main,
    helper,
    "AppRun",
    "AppRun.wrapped",
    "usr/lib/webkit2gtk-4.1/WebKitNetworkProcess",
    "usr/lib/webkit2gtk-4.1/WebKitWebProcess",
  ])
    writeExecutable(`appimage/${path}`);
  return () =>
    execFileSync(
      process.execPath,
      [
        script,
        "--platform",
        "linux-appimage",
        "--root",
        join(fixture, "appimage"),
        "--appimage-system-root",
        join(fixture, "system"),
      ],
      { encoding: "utf8", stdio: "pipe", timeout: 5_000 },
    );
}

function writeSystemData(path: string, bytes: string | Buffer): void {
  for (const [root, mode] of [
    ["system", 0o644],
    ["appimage", 0o755],
  ] as const) {
    const file = join(fixture, root, path);
    mkdirSync(join(file, ".."), { recursive: true });
    writeFileSync(file, bytes);
    chmodSync(file, mode);
  }
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
      ["AppRun.wrapped", true],
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
        appimage.filter((entry) => entry.path !== "AppRun.wrapped"),
      ),
    ).toThrow("missing AppRun.wrapped");
    const data = { path: "usr/share/doc/libglib2.0-0/copyright", executable: true };
    expect(() => validatePayload("linux-appimage", [...appimage, data])).toThrow(
      "undeclared executable",
    );
    expect(() =>
      validatePayload("linux-appimage", [...appimage, { ...data, verifiedSystemData: true }]),
    ).not.toThrow();
    expect(() =>
      validatePayload("linux-appimage", [
        ...appimage,
        { path: "usr/share/doc/hidden-tool", executable: true, verifiedSystemData: true },
      ]),
    ).toThrow("undeclared executable");
    expect(() =>
      validatePayload("linux-deb", [
        ...entries([main, true], [helper, true]),
        { ...data, verifiedSystemData: true },
      ]),
    ).toThrow("undeclared executable");
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
      ["AppRun.wrapped", true],
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

  it("verifies executable-mode AppImage data against a separate trusted OS root", () => {
    const check = prepareAppImageCli();
    const data = "usr/share/glib-2.0/schemas/org.example.gschema.xml";
    writeSystemData(data, "<schemalist/>\n");
    expect(check()).toContain("Verified unchanged AppImage system data");
    const hidden = "appimage/usr/share/doc/libfoo/not-copyright";
    writeExecutable(hidden);
    expect(check).toThrow("undeclared executable");
    rmSync(join(fixture, hidden));
    writeExecutable(`appimage/${data}`, "printf 'hidden script without shebang'\n");
    expect(check).toThrow("payload bytes differ");
  });

  it("bounds the verified data file count without relaxing the inclusive limit", () => {
    const check = prepareAppImageCli();
    for (let index = 0; index < APPIMAGE_DATA_LIMITS.files; index += 1)
      writeSystemData(`usr/share/doc/libfixture${index}/copyright`, "synthetic copyright\n");
    expect(check()).toContain("only declared programs");
    writeSystemData("usr/share/doc/libextra/copyright", "synthetic copyright\n");
    expect(check).toThrow("data file count exceeds its bound");
  });

  it("bounds cumulative verified bytes independently of per-file limits", () => {
    const check = prepareAppImageCli();
    const bytes = Buffer.alloc(APPIMAGE_DATA_LIMITS.fileBytes, 0x61);
    const count = APPIMAGE_DATA_LIMITS.totalBytes / APPIMAGE_DATA_LIMITS.fileBytes;
    for (let index = 0; index < count; index += 1)
      writeSystemData(`usr/share/doc/libfixture${index}/copyright`, bytes);
    expect(check()).toContain("only declared programs");
    writeSystemData("usr/share/doc/libextra/copyright", bytes);
    expect(check).toThrow("data bytes exceed their total bound");
  });

  it("rejects a system-data override outside AppImage inspection", () => {
    expect(() =>
      execFileSync(
        process.execPath,
        [script, "--platform", "linux-deb", "--root", fixture, "--appimage-system-root", fixture],
        { stdio: "pipe" },
      ),
    ).toThrow("requires a linux-appimage payload root");
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
