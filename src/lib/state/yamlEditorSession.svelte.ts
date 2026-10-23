import {
  applyEditorAppearance,
  ensureMonacoYaml,
  installMonacoEnvironment,
  monaco,
  readEditorAppearance,
  YAML_LANGUAGE_ID,
} from "../../features/editor/editorMonaco";
import { observeEditorAppearance, observeEditorSize } from "../../features/editor/editorLifecycle";
import { editorRuntime, OwnedListeners } from "./editorRuntimeDiagnostics.svelte";
import { isYamlWorkerResponse, type YamlDiagnostic } from "../../features/editor/yamlAnalysis";

/** Delay between the last edit and the worker request, in milliseconds. */
const VALIDATION_DEBOUNCE_MS = 120;

/** Marker owner used for the diagnostics this surface sets on its models. */
const MARKER_OWNER = "talos-pilot-yaml-worker";

let nextUri = 0;

function modelUri(name: string): monaco.Uri {
  nextUri += 1;
  return monaco.Uri.parse(`talos-pilot://synthetic/${name}-${String(nextUri)}.yaml`);
}

/** Callbacks and initial values supplied by an editor component. */
export interface YamlEditorOptions {
  /** Accessible name of the editor and its surrounding group. */
  readonly label: string;
  /** Initial document text. */
  readonly value: string;
  /** Reports user edits back to the owner. */
  readonly onChange?: ((value: string) => void) | undefined;
  /** Reports each validated diagnostic set. */
  readonly onDiagnostics?: ((diagnostics: readonly YamlDiagnostic[]) => void) | undefined;
  /** Prevents user edits while keeping the document selectable and focusable. */
  readonly readOnly?: boolean;
  /** Moves focus into the editor when it mounts. */
  readonly autoFocus?: boolean;
}

/**
 * Owns one Monaco YAML editor, its text model, its dedicated analysis worker,
 * and every listener that keeps it in sync with the shell.
 *
 * The attachment returned by {@link YamlEditorSession.createAttachment} creates
 * the editor when its host element mounts and releases everything when the host
 * unmounts. Diagnostics are produced by the bundled worker, not by parsing on
 * the renderer thread. A response whose request id is no longer current is
 * ignored, so a slow result cannot overwrite a newer edit or a closed surface.
 *
 * No credential, cluster client, or secret-bearing document is held here. The
 * surface is a synthetic feasibility editor and the worker receives only the
 * supplied text.
 */
export class YamlEditorSession {
  /** Most recent bounded diagnostic set produced by the worker. */
  diagnostics = $state.raw<readonly YamlDiagnostic[]>([]);
  /** Editor lifecycle shown by the component. */
  status = $state<"idle" | "ready" | "failed">("idle");
  /** Safe failure message when Monaco or its worker cannot start. */
  mountError = $state<string | null>(null);

  readonly #options: YamlEditorOptions;
  #value: string;
  #readOnly: boolean;
  #label: string;
  #editor: monaco.editor.IStandaloneCodeEditor | null = null;
  #model: monaco.editor.ITextModel | null = null;
  #worker: Worker | null = null;
  #listeners: OwnedListeners | null = null;
  #requestId = 0;
  #debounce: ReturnType<typeof setTimeout> | null = null;
  #disposed = false;
  #applyingValue = false;
  #modelTracked = false;

  /** @param options Initial value, accessible name, and change callbacks. */
  constructor(options: YamlEditorOptions) {
    this.#options = options;
    this.#value = options.value;
    this.#readOnly = options.readOnly ?? false;
    this.#label = options.label;
  }

  /**
   * Builds the Svelte attachment that owns the editor's lifetime.
   *
   * The attachment identity is stable, so it runs once for a host element. Its
   * cleanup is idempotent and is also reached when mounting fails part-way.
   */
  createAttachment(): (element: HTMLElement) => () => void {
    return (element) => {
      this.#mount(element);
      return () => {
        this.dispose();
      };
    };
  }

  /**
   * Applies a new controlled value. Programmatic replacements do not call the
   * change callback; they are validated and keep the model in sync.
   */
  setValue(value: string): void {
    if (this.#disposed || value === this.#value) {
      return;
    }
    this.#value = value;
    const model = this.#model;
    if (model === null || model.getValue() === value) {
      return;
    }
    this.#applyingValue = true;
    model.setValue(value);
    this.#applyingValue = false;
    this.#scheduleValidation();
  }

  /** Updates the read-only option after a prop change. */
  setReadOnly(readOnly: boolean): void {
    if (this.#disposed || readOnly === this.#readOnly) {
      return;
    }
    this.#readOnly = readOnly;
    this.#editor?.updateOptions({ readOnly });
  }

  /** Updates the accessible name after a prop change. */
  setLabel(label: string): void {
    if (this.#disposed || label === this.#label) {
      return;
    }
    this.#label = label;
    this.#editor?.updateOptions({ ariaLabel: label });
  }

  /** Releases the editor, model, worker, observers, listeners, and timers. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#requestId += 1;
    if (this.#debounce !== null) {
      clearTimeout(this.#debounce);
      this.#debounce = null;
    }
    this.#listeners?.dispose();
    this.#listeners = null;
    const editor = this.#editor;
    this.#editor = null;
    const model = this.#model;
    this.#model = null;
    const worker = this.#worker;
    this.#worker = null;
    if (model !== null) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
    editor?.dispose();
    model?.dispose();
    if (this.#modelTracked) {
      this.#modelTracked = false;
      editorRuntime.modelDisposed();
    }
    worker?.terminate();
    this.status = "idle";
    this.diagnostics = [];
  }

  #mount(element: HTMLElement): void {
    if (this.#disposed || this.#editor !== null) {
      return;
    }
    const listeners = new OwnedListeners(editorRuntime);
    this.#listeners = listeners;
    try {
      installMonacoEnvironment();
      ensureMonacoYaml();
      const appearance = readEditorAppearance();
      const model = monaco.editor.createModel(this.#value, YAML_LANGUAGE_ID, modelUri("manifest"));
      this.#model = model;
      this.#modelTracked = true;
      editorRuntime.modelCreated();
      const editor = monaco.editor.create(element, {
        model,
        readOnly: this.#readOnly,
        ariaLabel: this.#label,
        theme: appearance.dark ? "talos-pilot-dark" : "talos-pilot-light",
        automaticLayout: false,
        minimap: { enabled: false },
        scrollBeyondLastLine: false,
        fontSize: appearance.compact ? 12 : 14,
        lineHeight: appearance.compact ? 18 : 22,
        wordWrap: "on",
        tabSize: 2,
        renderLineHighlight: "none",
      });
      this.#editor = editor;
      this.status = "ready";
      this.mountError = null;

      const contentSubscription = model.onDidChangeContent(() => {
        if (this.#applyingValue || this.#disposed) {
          return;
        }
        this.#value = model.getValue();
        this.#options.onChange?.(this.#value);
        this.#scheduleValidation();
      });
      listeners.addDisposable(() => {
        contentSubscription.dispose();
      });
      observeEditorSize(element, listeners, () => {
        this.#editor?.layout();
      });
      observeEditorAppearance(listeners, () => {
        const active = this.#editor;
        if (active !== null) {
          applyEditorAppearance(active);
        }
      });
      this.#scheduleValidation();
      if (this.#options.autoFocus === true) {
        editor.focus();
      }
    } catch {
      this.dispose();
      this.status = "failed";
      this.mountError = "The offline YAML editor could not be started. Close and try again.";
    }
  }

  #scheduleValidation(): void {
    if (this.#disposed) {
      return;
    }
    if (this.#debounce !== null) {
      clearTimeout(this.#debounce);
    }
    this.#debounce = setTimeout(() => {
      this.#debounce = null;
      this.#validate();
    }, VALIDATION_DEBOUNCE_MS);
  }

  #ensureWorker(): Worker | null {
    if (this.#worker !== null) {
      return this.#worker;
    }
    const listeners = this.#listeners;
    if (listeners === null) {
      return null;
    }
    try {
      const worker = editorRuntime.trackWorker(
        new Worker(new URL("./yamlDiagnostics.worker.ts", import.meta.url), {
          name: "talos-pilot-yaml-worker",
          type: "module",
        }),
      );
      editorRuntime.recordYamlWorkerAsset("yamlDiagnostics.worker");
      this.#worker = worker;
      const removeMessage = listeners.add(worker, "message", (event: Event) => {
        if (this.#disposed || !(event instanceof MessageEvent)) {
          return;
        }
        const payload: unknown = event.data;
        if (!isYamlWorkerResponse(payload) || payload.requestId !== this.#requestId) {
          return;
        }
        this.#applyDiagnostics(payload.diagnostics);
      });
      const removeError = listeners.add(worker, "error", () => {
        if (this.#disposed) {
          return;
        }
        removeMessage();
        removeError();
        this.#applyDiagnostics([
          {
            message: "The YAML worker stopped unexpectedly. Close and reopen the editor.",
            line: 1,
            column: 1,
            endLine: 1,
            endColumn: 2,
          },
        ]);
        this.#worker = null;
        worker.terminate();
      });
      return worker;
    } catch {
      this.#applyDiagnostics([
        {
          message: "The YAML worker could not start. The editor remains available.",
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 2,
        },
      ]);
      return null;
    }
  }

  #validate(): void {
    const worker = this.#ensureWorker();
    const model = this.#model;
    if (worker === null || model === null || this.#disposed) {
      return;
    }
    this.#requestId += 1;
    try {
      worker.postMessage({ requestId: this.#requestId, text: model.getValue() });
    } catch {
      this.#applyDiagnostics([
        {
          message: "The YAML worker could not analyze this document. Close and reopen the editor.",
          line: 1,
          column: 1,
          endLine: 1,
          endColumn: 2,
        },
      ]);
    }
  }

  #applyDiagnostics(diagnostics: readonly YamlDiagnostic[]): void {
    if (this.#disposed) {
      return;
    }
    this.diagnostics = diagnostics;
    const model = this.#model;
    if (model !== null) {
      monaco.editor.setModelMarkers(
        model,
        MARKER_OWNER,
        diagnostics.map((diagnostic) => ({
          severity: monaco.MarkerSeverity.Error,
          message: diagnostic.message,
          startLineNumber: diagnostic.line,
          startColumn: diagnostic.column,
          endLineNumber: diagnostic.endLine,
          endColumn:
            diagnostic.endLine === diagnostic.line && diagnostic.endColumn <= diagnostic.column
              ? diagnostic.column + 1
              : diagnostic.endColumn,
          source: "YAML worker",
        })),
      );
    }
    this.#options.onDiagnostics?.(diagnostics);
  }
}
