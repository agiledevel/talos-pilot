/**
 * Declared program allowlists for packaged payloads.
 *
 * The bundler copies every Cargo `bin` target it can see, so a maintainer tool
 * in `src-tauri/src/bin` reached the DEB in F8. The exporter now lives in
 * `src-tauri/examples` and is not a bundle target, but a future binary or a
 * test helper must still fail this gate instead of shipping silently. These
 * lists describe the programs an installed product is allowed to carry; they
 * are not a two-executable limit, because platform support programs such as
 * the AppImage runtime and the WebKit helper processes are listed explicitly.
 */

/** A regular file inside an extracted payload or a release output directory. */
export interface PayloadEntry {
  /** POSIX-style path relative to the inspected root. */
  readonly path: string;
  /** Whether the file carries an execute bit. */
  readonly executable: boolean;
}

/** A payload layout that can be inspected without installing anything. */
export type PayloadPlatform = "linux-deb" | "linux-rpm" | "linux-appimage" | "macos-app";

/** Narrows a CLI/state value to an inspected payload layout. */
export function isPayloadPlatform(value: string): value is PayloadPlatform {
  return (
    value === "linux-deb" ||
    value === "linux-rpm" ||
    value === "linux-appimage" ||
    value === "macos-app"
  );
}

interface PayloadRules {
  /** Exact paths that must exist and be executable. */
  readonly required: readonly string[];
  /** Executable basenames that must appear somewhere in the payload. */
  readonly requiredBasenames: readonly string[];
  /** Executable paths that are allowed; anything else fails. */
  readonly allowed: readonly RegExp[];
}

const MAIN_BINARY = "usr/bin/talos-pilot";
const BUNDLED_HELPER = "usr/lib/Talos Pilot/binaries/talos-pilot-helper";
const MACOS_MAIN = "Contents/MacOS/talos-pilot";
const MACOS_HELPER = "Contents/Resources/binaries/talos-pilot-helper";
const WEBKIT_HELPERS = ["WebKitNetworkProcess", "WebKitWebProcess"] as const;

function exact(path: string): RegExp {
  return new RegExp(`^${path.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "u");
}

// The AppImage bundler copies the WebKit helpers from whichever distribution
// directory exists, so the directory differs between Ubuntu and other distros.
// Their basenames are required, and any `webkit2gtk-4.1` location is allowed.
const APPIMAGE_WEBKIT = /(?:^|\/)webkit2gtk-4\.1\/(?:WebKitNetworkProcess|WebKitWebProcess)$/u;

const PAYLOAD_RULES: Readonly<Record<PayloadPlatform, PayloadRules>> = {
  "linux-deb": {
    required: [MAIN_BINARY, BUNDLED_HELPER],
    requiredBasenames: [],
    allowed: [exact(MAIN_BINARY), exact(BUNDLED_HELPER)],
  },
  "linux-rpm": {
    required: [MAIN_BINARY, BUNDLED_HELPER],
    requiredBasenames: [],
    allowed: [exact(MAIN_BINARY), exact(BUNDLED_HELPER)],
  },
  "linux-appimage": {
    required: [MAIN_BINARY, BUNDLED_HELPER, "AppRun"],
    requiredBasenames: [...WEBKIT_HELPERS],
    allowed: [exact(MAIN_BINARY), exact(BUNDLED_HELPER), exact("AppRun"), APPIMAGE_WEBKIT],
  },
  "macos-app": {
    required: [MACOS_MAIN, MACOS_HELPER],
    requiredBasenames: [],
    allowed: [exact(MACOS_MAIN), exact(MACOS_HELPER)],
  },
};

/**
 * File names that must never appear in a production payload, on any target.
 *
 * `export_ipc_types` is the maintainer's DTO generator; the synthetic
 * Kubernetes server and the WebDriver surfaces are test-only. Their presence in
 * an installed payload is a packaging defect, not a legal one.
 */
const FORBIDDEN_BASENAMES: readonly RegExp[] = [
  /^export_ipc_types(?:\.exe)?$/u,
  /^kubernetes-synthetic-apiserver(?:\.exe)?$/u,
  /wdio/iu,
];

/** The release-output program each target's ordinary build must produce. */
export function releaseOutputProgram(target: string): string {
  switch (target) {
    case "x86_64-unknown-linux-gnu":
    case "aarch64-apple-darwin":
    case "x86_64-apple-darwin":
      return "talos-pilot";
    case "x86_64-pc-windows-msvc":
      return "talos-pilot.exe";
    default:
      throw new Error(`Unsupported release target: ${target}`);
  }
}

function basename(path: string): string {
  const separator = path.lastIndexOf("/");
  return separator === -1 ? path : path.slice(separator + 1);
}

/**
 * Shared objects are libraries even when a platform marks them executable.
 *
 * Linux versioned shared objects keep the `so` stem before numeric components
 * (`libglib-2.0.so.0.8600.0`), macOS versioned dylibs keep the extension
 * (`libfoo.1.dylib`), and Windows keeps `.dll`. Only those suffixes are
 * excluded: an arbitrary executable is still a program.
 */
function isProgram(path: string, executable: boolean): boolean {
  return executable && !/\.(?:so(?:\.[0-9]+)*|dylib|dll)$/u.test(path);
}

function assertNoForbiddenTools(entries: readonly PayloadEntry[]): void {
  for (const entry of entries) {
    if (FORBIDDEN_BASENAMES.some((pattern) => pattern.test(basename(entry.path)))) {
      throw new Error(`Production payload contains the maintainer or test tool ${entry.path}.`);
    }
  }
}

/**
 * Validates an extracted payload's program set.
 *
 * Required programs must be present and executable, every executable file must
 * be declared, and no maintainer or test tool may exist anywhere in the payload.
 * Throws with the offending path list so a packaging regression names its file.
 */
export function validatePayload(platform: PayloadPlatform, entries: readonly PayloadEntry[]): void {
  const rules = PAYLOAD_RULES[platform];
  const paths = new Set(entries.map((entry) => entry.path));
  const executable = new Set(
    entries.filter((entry) => isProgram(entry.path, entry.executable)).map((entry) => entry.path),
  );
  assertNoForbiddenTools(entries);
  for (const required of rules.required) {
    if (!paths.has(required)) {
      throw new Error(`The ${platform} payload is missing ${required}.`);
    }
    if (!executable.has(required)) {
      throw new Error(`The ${platform} payload cannot execute ${required}.`);
    }
  }
  const basenames = new Set([...executable].map((path) => basename(path)));
  for (const required of rules.requiredBasenames) {
    if (!basenames.has(required)) {
      throw new Error(`The ${platform} payload is missing executable ${required}.`);
    }
  }
  const unexpected = [...executable]
    .filter((path) => !rules.allowed.some((pattern) => pattern.test(path)))
    .sort();
  if (unexpected.length !== 0) {
    throw new Error(
      `The ${platform} payload contains undeclared executable files: ${unexpected.join(", ")}.`,
    );
  }
}

/**
 * Validates a target's ordinary release output directory.
 *
 * This is the exclusion check for targets whose installer payload cannot be
 * extracted in the build step (the Windows NSIS installer). It requires exactly
 * the application program at the top level and no maintainer or test tool
 * anywhere below it, so a future `src/bin` target cannot pass silently.
 */
export function validateReleaseOutput(target: string, entries: readonly PayloadEntry[]): void {
  assertNoForbiddenTools(entries);
  const program = releaseOutputProgram(target);
  const topLevel = entries.filter((entry) => !entry.path.includes("/"));
  const programs = topLevel
    .filter((entry) => isProgram(entry.path, entry.executable) && !entry.path.endsWith(".d"))
    .map((entry) => entry.path);
  if (programs.length !== 1 || programs[0] !== program) {
    throw new Error(
      `The ${target} release output must contain only ${program}; found ${programs.sort().join(", ") || "none"}.`,
    );
  }
}
