import {
  applyEditorAppearance,
  ensureMonacoYaml,
  installMonacoEnvironment,
  monaco,
  readEditorAppearance,
  YAML_LANGUAGE_ID,
} from "../../features/editor/editorMonaco";
import { observeEditorAppearance, observeEditorSize } from "../../features/editor/editorLifecycle";
import { admitDocument, type DocumentAdmission } from "../../features/editor/documentBounds";
import {
  YamlValidationQueue,
  type YamlValidationPhase,
  type YamlValidationSnapshot,
} from "../../features/editor/yamlValidationQueue";
import type { YamlDiagnostic, YamlWorkerRequest } from "../../features/editor/yamlAnalysis";
import { editorRuntime, OwnedListeners } from "./editorRuntimeDiagnostics.svelte";

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
  /** Initial document text. Accepted only when it fits the UTF-8 byte ceiling. */
  readonly value: string;
  /** Reports user edits back to the owner. Rejected edits are never reported. */
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
 * the bounded validation queue and every listener that keeps it in sync with
 * the shell.
 *
 * Document admission happens before `createModel`, before `model.setValue` and
 * before `Worker.postMessage`, using {@link admitDocument}'s UTF-8 byte check.
 * A rejected initial document creates no model or worker; the visible rejection
 * stays until a bounded replacement arrives. A rejected user edit (typing,
 * paste or undo/redo) is reverted to the last accepted text in the same content
 * event, so the model never retains oversized text and the value is never
 * silently truncated.
 *
 * The attachment returned by {@link YamlEditorSession.createAttachment} creates
 * the editor when its host element mounts and releases everything when the host
 * unmounts. Diagnostics are produced by the bundled worker, not by parsing on
 * the renderer thread. {@link YamlValidationQueue} owns the single in-flight
 * request and the single coalesced latest document; its `pending` publication
 * clears stale diagnostics and markers immediately on a document change.
 *
 * No credential, cluster client, or secret-bearing document is held here. The
 * surface is a synthetic feasibility editor and the worker receives only the
 * supplied text.
 */
export class YamlEditorSession {
  /** Most recent bounded diagnostic set produced by the worker. */
  diagnostics = $state.raw<readonly YamlDiagnostic[]>([]);
  /** Bounded validation phase for the currently accepted document. */
  validation = $state<YamlValidationPhase>("idle");
  /** Editor lifecycle shown by the component. */
  status = $state<"idle" | "ready" | "failed">("idle");
  /** Safe failure message when Monaco or its worker cannot start. */
  mountError = $state<string | null>(null);
  /** Visible rejection of an initial, replaced, edited or pasted document. */
  documentError = $state<string | null>(null);

  readonly #options: YamlEditorOptions;
  readonly #queue: YamlValidationQueue;
  #value: string;
  #hasAcceptedDocument: boolean;
  #readOnly: boolean;
  #label: string;
  #element: HTMLElement | null = null;
  #editor: monaco.editor.IStandaloneCodeEditor | null = null;
  #model: monaco.editor.ITextModel | null = null;
  #worker: Worker | null = null;
  #removeWorkerMessage: (() => void) | null = null;
  #removeWorkerError: (() => void) | null = null;
  #listeners: OwnedListeners | null = null;
  #disposed = false;
  #applyingValue = false;
  #modelTracked = false;

  /** @param options Initial value, accessible name, and change callbacks. */
  constructor(options: YamlEditorOptions) {
    this.#options = options;
    const initial = admitDocument(options.value);
    this.#value = initial.accepted ? initial.text : "";
    this.#hasAcceptedDocument = initial.accepted;
    this.documentError = initial.accepted ? null : initial.message;
    this.#readOnly = options.readOnly ?? false;
    this.#label = options.label;
    this.#queue = new YamlValidationQueue({
      dispatch: (request) => this.#dispatchRequest(request),
      publish: (snapshot) => {
        this.#applyValidation(snapshot);
      },
      onWorkerFailure: () => {
        this.#discardWorker();
      },
    });
  }

  /**
   * Builds the Svelte attachment that owns the editor's lifetime.
   *
   * The attachment identity is stable, so it runs once for a host element. Its
   * cleanup is idempotent and is also reached when mounting fails part-way. A
   * rejected initial document leaves the element attached without a model, so a
   * later bounded replacement can still start the editor.
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
   * change callback. An oversized replacement is rejected visibly: the accepted
   * model and last accepted value stay unchanged and the text is not retained.
   */
  setValue(value: string): void {
    if (this.#disposed) {
      return;
    }
    if (value === this.#value && this.#hasAcceptedDocument) {
      this.documentError = null;
      if (this.#editor === null && this.#element !== null) {
        this.#startEditor();
      }
      return;
    }
    const admission = admitDocument(value);
    if (!admission.accepted) {
      this.documentError = admission.message;
      return;
    }
    this.#value = admission.text;
    this.#hasAcceptedDocument = true;
    this.documentError = null;
    const model = this.#model;
    if (model === null) {
      this.#startEditor();
      return;
    }
    if (model.getValue() !== admission.text) {
      this.#applyingValue = true;
      model.setValue(admission.text);
      this.#applyingValue = false;
    }
    this.#queue.submit(admission.text);
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

  /** Releases the editor, model, worker, queue timers, observers and listeners. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#queue.dispose();
    this.#discardWorker();
    this.#listeners?.dispose();
    this.#listeners = null;
    this.#element = null;
    const editor = this.#editor;
    this.#editor = null;
    const model = this.#model;
    this.#model = null;
    if (model !== null) {
      monaco.editor.setModelMarkers(model, MARKER_OWNER, []);
    }
    editor?.dispose();
    model?.dispose();
    if (this.#modelTracked) {
      this.#modelTracked = false;
      editorRuntime.modelDisposed();
    }
    this.status = "idle";
    this.validation = "idle";
    this.diagnostics = [];
  }

  #mount(element: HTMLElement): void {
    if (this.#disposed || this.#element !== null) {
      return;
    }
    this.#element = element;
    this.#startEditor();
  }

  #startEditor(): void {
    const element = this.#element;
    if (this.#disposed || element === null || this.#editor !== null) {
      return;
    }
    if (!this.#hasAcceptedDocument) {
      // The initial document was rejected before any model existed. Keep the
      // element attached and wait for a bounded replacement instead of creating
      // a model from rejected text.
      this.validation = "idle";
      return;
    }
    const admission: DocumentAdmission = admitDocument(this.#value);
    if (!admission.accepted) {
      this.documentError = admission.message;
      return;
    }
    this.documentError = null;
    const listeners = new OwnedListeners(editorRuntime);
    this.#listeners = listeners;
    try {
      installMonacoEnvironment();
      ensureMonacoYaml();
      const appearance = readEditorAppearance();
      const model = monaco.editor.createModel(
        admission.text,
        YAML_LANGUAGE_ID,
        modelUri("manifest"),
      );
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
        this.#handleContentChange(model);
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
      this.#queue.submit(admission.text);
      if (this.#options.autoFocus === true) {
        editor.focus();
      }
    } catch {
      this.dispose();
      this.status = "failed";
      this.mountError = "The offline YAML editor could not be started. Close and try again.";
    }
  }

  /**
   * Applies every user mutation path — typing, paste and undo/redo — through one
   * admission check. Rejected text is reverted synchronously to the last
   * accepted value, so it cannot stay in the model or be queued to the worker.
   */
  #handleContentChange(model: monaco.editor.ITextModel): void {
    if (this.#applyingValue || this.#disposed) {
      return;
    }
    const next = model.getValue();
    const admission = admitDocument(next);
    if (!admission.accepted) {
      this.#applyingValue = true;
      model.setValue(this.#value);
      this.#applyingValue = false;
      this.documentError = admission.message;
      return;
    }
    this.#value = admission.text;
    this.#hasAcceptedDocument = true;
    this.documentError = null;
    this.#options.onChange?.(admission.text);
    this.#queue.submit(admission.text);
  }

  #dispatchRequest(request: YamlWorkerRequest): boolean {
    const worker = this.#ensureWorker();
    if (worker === null) {
      return false;
    }
    try {
      worker.postMessage(request);
      return true;
    } catch {
      return false;
    }
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
      this.#removeWorkerMessage = listeners.add(worker, "message", (event: Event) => {
        if (this.#disposed || !(event instanceof MessageEvent)) {
          return;
        }
        this.#queue.receive(event.data);
      });
      this.#removeWorkerError = listeners.add(worker, "error", () => {
        if (this.#disposed) {
          return;
        }
        this.#queue.fail("error");
      });
      return worker;
    } catch {
      return null;
    }
  }

  /** Removes the failed worker's listeners before terminating it exactly once. */
  #discardWorker(): void {
    const worker = this.#worker;
    this.#worker = null;
    this.#removeWorkerMessage?.();
    this.#removeWorkerMessage = null;
    this.#removeWorkerError?.();
    this.#removeWorkerError = null;
    worker?.terminate();
  }

  #applyValidation(snapshot: YamlValidationSnapshot): void {
    if (this.#disposed) {
      return;
    }
    this.validation = snapshot.phase;
    this.diagnostics = snapshot.diagnostics;
    const model = this.#model;
    if (model !== null) {
      monaco.editor.setModelMarkers(
        model,
        MARKER_OWNER,
        snapshot.diagnostics.map((diagnostic) => ({
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
    this.#options.onDiagnostics?.(snapshot.diagnostics);
  }
}
