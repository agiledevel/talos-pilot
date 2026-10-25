import * as monaco from "monaco-editor/editor/editor.api";
import { editorRuntime } from "../../lib/state/editorRuntimeDiagnostics.svelte";

/** Language identity registered for the synthetic YAML feasibility surface. */
export const YAML_LANGUAGE_ID = "talos-pilot-yaml";

let environmentInstalled = false;
let languageRegistered = false;

/**
 * Monaco theme names used by the feasibility editor. The token override exists
 * because Monaco's theme API accepts only hex colours, not the Skeleton CSS
 * variables. The light key colour is darker than the stock token so it keeps
 * WCAG AA contrast on Monaco's inserted-line diff background; the dark theme
 * keeps Monaco's dark base. Everything else inherits the built-in base theme.
 */
const LIGHT_THEME = "talos-pilot-light";
const DARK_THEME = "talos-pilot-dark";

/**
 * Installs the Monaco worker factory before any editor is created.
 *
 * Every worker constructor is a same-origin module emitted by Vite. The factory
 * never returns a `blob:` URL and never asks for a remote script, so the
 * packaged CSP's `script-src 'self'` fallback authorizes it without a
 * `worker-src` widening. The factory receives the editor's worker labels; the
 * YAML analysis worker is created separately by the editor state so its request
 * protocol stays explicit.
 *
 * The function is idempotent because the shell may open the feasibility surface
 * repeatedly and Monaco reads the environment lazily.
 */
export function installMonacoEnvironment(): void {
  if (environmentInstalled) {
    return;
  }
  environmentInstalled = true;
  self.MonacoEnvironment = {
    getWorker: () => {
      const worker = editorRuntime.trackWorker(
        new Worker(new URL("./monacoEditor.worker.ts", import.meta.url), {
          name: "talos-pilot-monaco-worker",
          type: "module",
        }),
      );
      editorRuntime.recordMonacoWorkerAsset("monacoEditor.worker");
      return worker;
    },
  };
}

/**
 * Registers the YAML language once for the application's lifetime.
 *
 * Monaco language and tokenizer registration is process-wide, not owned by one
 * editor, so it has no per-surface teardown. The editor models, workers,
 * listeners, and controls remain owned by the surface attachment. The tokenizer
 * is deliberately small: diagnostics and editing come from the worker and the
 * editor core, while the colours are Monaco's light/dark base themes.
 */
export function ensureMonacoYaml(): void {
  if (languageRegistered) {
    return;
  }
  languageRegistered = true;
  monaco.languages.register({
    id: YAML_LANGUAGE_ID,
    aliases: ["YAML", "yaml"],
    extensions: [".yaml", ".yml"],
    mimetypes: ["application/yaml", "application/x-yaml"],
  });
  monaco.languages.setLanguageConfiguration(YAML_LANGUAGE_ID, {
    comments: { lineComment: "#" },
    brackets: [
      ["{", "}"],
      ["[", "]"],
    ],
    autoClosingPairs: [
      { open: "{", close: "}" },
      { open: "[", close: "]" },
      { open: '"', close: '"' },
      { open: "'", close: "'" },
    ],
  });
  monaco.editor.defineTheme(LIGHT_THEME, {
    base: "vs",
    inherit: true,
    rules: [{ token: "type.identifier", foreground: "005f5f" }],
    colors: {},
  });
  monaco.editor.defineTheme(DARK_THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {},
  });
  monaco.languages.setMonarchTokensProvider(YAML_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/#.*$/u, "comment"],
        [/^\s*-/u, "keyword"],
        [/^\s*[\w.-]+\s*:/u, "type.identifier"],
        [/\b(?:true|false|null|yes|no|on|off)\b/u, "keyword"],
        [/-?\b\d+(?:\.\d+)?\b/u, "number"],
        [/[&*][\w.-]+/u, "variable"],
        [/[|>][-+]?\s*$/u, "string"],
        [/[{}[\],]/u, "delimiter"],
      ],
    },
  });
}

/** Appearance inputs read from the shell's root attributes. */
export interface EditorAppearance {
  /** True when the application resolves to the dark colour mode. */
  readonly dark: boolean;
  /** True when the compact density is selected. */
  readonly compact: boolean;
}

/**
 * Reads the shell's current colour mode and density.
 *
 * `data-mode` is the shell's explicit choice; without it the operating system
 * preference decides, matching `src/styles.css`. The editor has no second theme
 * mechanism: it follows the same attributes as the rest of the application.
 */
export function readEditorAppearance(): EditorAppearance {
  const root = document.documentElement;
  const mode = root.dataset["mode"];
  const compact = root.dataset["density"] === "compact";
  const dark =
    mode === "dark" ||
    (mode !== "light" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  return { dark, compact };
}

interface AppearanceTarget {
  updateOptions(options: monaco.editor.IEditorOptions): void;
}

interface DiffAppearanceTarget extends AppearanceTarget {
  getOriginalEditor(): AppearanceTarget;
  getModifiedEditor(): AppearanceTarget;
}

function isDiffEditor(editor: AppearanceTarget): editor is DiffAppearanceTarget {
  return (
    "getOriginalEditor" in editor &&
    typeof editor.getOriginalEditor === "function" &&
    "getModifiedEditor" in editor &&
    typeof editor.getModifiedEditor === "function"
  );
}

/**
 * Applies the shell colour mode and density to one editor or diff editor.
 *
 * Monaco's own base themes are used instead of a second colour palette. The
 * font size and line height follow the two declared densities; the stylesheet
 * continues to own spacing and typography outside the editor.
 *
 * @param editor Editor or diff editor created by this module's Monaco instance.
 */
export function applyEditorAppearance(editor: AppearanceTarget): void {
  const { dark, compact } = readEditorAppearance();
  monaco.editor.setTheme(dark ? DARK_THEME : LIGHT_THEME);
  const options: monaco.editor.IEditorOptions = {
    fontSize: compact ? 12 : 14,
    lineHeight: compact ? 18 : 22,
  };
  if (isDiffEditor(editor)) {
    editor.getOriginalEditor().updateOptions(options);
    editor.getModifiedEditor().updateOptions(options);
  } else {
    editor.updateOptions(options);
  }
}

/** Monaco API surface exported to the lazy editor modules. */
export { monaco };
