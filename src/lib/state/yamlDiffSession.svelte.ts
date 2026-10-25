import {
  applyEditorAppearance,
  ensureMonacoYaml,
  installMonacoEnvironment,
  monaco,
  readEditorAppearance,
  YAML_LANGUAGE_ID,
} from "../../features/editor/editorMonaco";
import { observeEditorAppearance, observeEditorSize } from "../../features/editor/editorLifecycle";
import { admitDocumentPair } from "../../features/editor/documentBounds";
import { editorRuntime, OwnedListeners } from "./editorRuntimeDiagnostics.svelte";

let nextUri = 0;

function modelUri(name: string): monaco.Uri {
  nextUri += 1;
  return monaco.Uri.parse(`talos-pilot://synthetic/${name}-${String(nextUri)}.yaml`);
}

/** Documents and accessible names supplied by a diff component. */
export interface YamlDiffOptions {
  /** Accessible name of the diff group. */
  readonly label: string;
  /** Original document, shown on the left or in the inline view. */
  readonly original: string;
  /** Modified document, shown on the right or in the inline view. */
  readonly modified: string;
  /** Accessible name of the original editor. */
  readonly originalLabel: string;
  /** Accessible name of the modified editor. */
  readonly modifiedLabel: string;
}

/**
 * Owns one Monaco diff editor and its two read-only text models.
 *
 * Both documents are admitted against the UTF-8 byte ceiling before either
 * model is created or replaced, and a replacement is applied as a pair: if
 * either side is oversized, both sides keep their previous accepted text and
 * the component shows the rejection. No text is truncated. An oversized initial
 * pair creates no model; a later accepted pair can still start the diff.
 *
 * The diff is computed by Monaco's worker-backed diff service under the same
 * packaged CSP as the YAML editor. The attachment cleanup disposes the editor,
 * both models, the resize/theme observers, and every owned listener; the editor
 * worker becomes idle and is stopped by Monaco when its last model disappears.
 *
 * The documents are synthetic. This component does not accept credentials or
 * cluster data and does not write anything back to a model.
 */
export class YamlDiffSession {
  /** Diff-editor lifecycle shown by the component. */
  status = $state<"idle" | "ready" | "failed">("idle");
  /** Safe failure message when Monaco cannot create the diff. */
  mountError = $state<string | null>(null);
  /** Visible rejection of either diff side. */
  documentError = $state<string | null>(null);

  readonly #options: YamlDiffOptions;
  #original: string;
  #modified: string;
  #hasAcceptedDocuments: boolean;
  #element: HTMLElement | null = null;
  #editor: monaco.editor.IStandaloneDiffEditor | null = null;
  #originalModel: monaco.editor.ITextModel | null = null;
  #modifiedModel: monaco.editor.ITextModel | null = null;
  #listeners: OwnedListeners | null = null;
  #disposed = false;
  #modelsTracked = false;

  /** @param options Initial documents and accessible names. */
  constructor(options: YamlDiffOptions) {
    this.#options = options;
    const admitted = admitDocumentPair(options.original, options.modified);
    if (!admitted.accepted) {
      this.#original = "";
      this.#modified = "";
      this.#hasAcceptedDocuments = false;
      this.documentError = admitted.message;
    } else {
      this.#original = admitted.original;
      this.#modified = admitted.modified;
      this.#hasAcceptedDocuments = true;
      this.documentError = null;
    }
  }

  /** Builds the Svelte attachment that owns the diff editor's lifetime. */
  createAttachment(): (element: HTMLElement) => () => void {
    return (element) => {
      this.#mount(element);
      return () => {
        this.dispose();
      };
    };
  }

  /**
   * Replaces both documents as one reviewable pair. Programmatic changes do not
   * emit an edit event. If either side exceeds the byte ceiling, neither side
   * changes and the rejection is shown.
   */
  setDocuments(original: string, modified: string): void {
    if (this.#disposed) {
      return;
    }
    if (original === this.#original && modified === this.#modified && this.#hasAcceptedDocuments) {
      this.documentError = null;
      if (this.#editor === null && this.#element !== null) {
        this.#startEditor();
      }
      return;
    }
    const admitted = admitDocumentPair(original, modified);
    if (!admitted.accepted) {
      this.documentError = admitted.message;
      return;
    }
    this.#original = admitted.original;
    this.#modified = admitted.modified;
    this.#hasAcceptedDocuments = true;
    this.documentError = null;
    const originalModel = this.#originalModel;
    const modifiedModel = this.#modifiedModel;
    if (originalModel === null || modifiedModel === null) {
      this.#startEditor();
      return;
    }
    if (originalModel.getValue() !== admitted.original) {
      originalModel.setValue(admitted.original);
    }
    if (modifiedModel.getValue() !== admitted.modified) {
      modifiedModel.setValue(admitted.modified);
    }
  }

  /** Updates the accessible group name after a prop change. */
  setLabel(label: string): void {
    const editor = this.#editor;
    if (editor === null) {
      return;
    }
    editor.updateOptions({ ariaLabel: label });
    editor.getOriginalEditor().updateOptions({ ariaLabel: this.#options.originalLabel });
    editor.getModifiedEditor().updateOptions({ ariaLabel: this.#options.modifiedLabel });
  }

  /** Releases the diff editor, both models, observers, and listeners. */
  dispose(): void {
    if (this.#disposed) {
      return;
    }
    this.#disposed = true;
    this.#listeners?.dispose();
    this.#listeners = null;
    this.#element = null;
    const editor = this.#editor;
    this.#editor = null;
    const original = this.#originalModel;
    const modified = this.#modifiedModel;
    this.#originalModel = null;
    this.#modifiedModel = null;
    editor?.dispose();
    original?.dispose();
    modified?.dispose();
    if (this.#modelsTracked) {
      this.#modelsTracked = false;
      editorRuntime.modelDisposed();
      editorRuntime.modelDisposed();
    }
    this.status = "idle";
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
    if (!this.#hasAcceptedDocuments) {
      return;
    }
    const admitted = admitDocumentPair(this.#original, this.#modified);
    if (!admitted.accepted) {
      this.documentError = admitted.message;
      return;
    }
    this.documentError = null;
    const listeners = new OwnedListeners(editorRuntime);
    this.#listeners = listeners;
    try {
      installMonacoEnvironment();
      ensureMonacoYaml();
      const appearance = readEditorAppearance();
      const originalModel = monaco.editor.createModel(
        admitted.original,
        YAML_LANGUAGE_ID,
        modelUri("before"),
      );
      this.#originalModel = originalModel;
      const modifiedModel = monaco.editor.createModel(
        admitted.modified,
        YAML_LANGUAGE_ID,
        modelUri("after"),
      );
      this.#modifiedModel = modifiedModel;
      this.#modelsTracked = true;
      editorRuntime.modelCreated();
      editorRuntime.modelCreated();
      const editor = monaco.editor.createDiffEditor(element, {
        theme: appearance.dark ? "talos-pilot-dark" : "talos-pilot-light",
        ariaLabel: this.#options.label,
        originalAriaLabel: this.#options.originalLabel,
        modifiedAriaLabel: this.#options.modifiedLabel,
        originalEditable: false,
        readOnly: true,
        automaticLayout: false,
        renderSideBySide: true,
        useInlineViewWhenSpaceIsLimited: true,
        minimap: { enabled: false },
        fontSize: appearance.compact ? 12 : 14,
        lineHeight: appearance.compact ? 18 : 22,
        wordWrap: "on",
        scrollBeyondLastLine: false,
        ignoreTrimWhitespace: false,
      });
      this.#editor = editor;
      editor.setModel({ original: originalModel, modified: modifiedModel });
      this.status = "ready";
      this.mountError = null;
      observeEditorSize(element, listeners, () => {
        this.#editor?.layout();
      });
      observeEditorAppearance(listeners, () => {
        const active = this.#editor;
        if (active !== null) {
          applyEditorAppearance(active);
        }
      });
    } catch {
      this.dispose();
      this.status = "failed";
      this.mountError = "The YAML diff could not be started. Close and try again.";
    }
  }
}
