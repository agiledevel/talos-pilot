import type { Component } from "svelte";
import { YAML_DOCUMENT_LIMIT_BYTES } from "../../features/editor/documentBounds";
import { editorRuntime } from "./editorRuntimeDiagnostics.svelte";

/** Benign synthetic document with one unclosed flow sequence. */
export const MALFORMED_YAML_SAMPLE = `release:
  name: synthetic-preview
  channels:
    - stable
    - edge
  rollout:
    batches: [1, 2, 3
`;

/** The same synthetic document after correcting the flow sequence. */
export const CORRECTED_YAML_SAMPLE = `release:
  name: synthetic-preview
  channels:
    - stable
    - edge
  rollout:
    batches: [1, 2, 3]
`;

/**
 * Builds a benign synthetic draft above the UTF-8 byte ceiling.
 *
 * The draft is generated only when the feasibility surface asks for it, so the
 * initial shell does not retain an oversized string. It contains no credential
 * or cluster data; it exists to demonstrate visible byte-limit rejection.
 *
 * @returns A synthetic YAML document larger than {@link YAML_DOCUMENT_LIMIT_BYTES}.
 */
export function oversizeYamlSample(): string {
  const header = "release:\n  name: synthetic-preview\n  notes: |\n";
  const line = `    ${"x".repeat(120)}\n`;
  const count = Math.ceil(YAML_DOCUMENT_LIMIT_BYTES / line.length) + 1;
  return header + line.repeat(count);
}

/** Identity shown beside every editor and diff in this feasibility surface. */
export const EDITOR_TARGET_LABEL = "Synthetic release preview (offline, no cluster)";

/** Props the lazily loaded editor surface accepts. */
export interface EditorSurfaceProps {
  /** Controlled synthetic document. */
  value: string;
  /** Reports edits made inside the editor. */
  onChange: (value: string) => void;
  /** Replaces the document with the corrected sample. */
  onCorrect: () => void;
  /** Replaces the document with the malformed sample. */
  onReset: () => void;
  /** Attempts a controlled replacement above the editor's byte ceiling. */
  onOversize: () => void;
  /** Closes the surface and restores focus to its opener. */
  onClose: () => void;
  /** Visible target identity. */
  targetLabel: string;
  /** Original document used by the diff. */
  original: string;
  /** Corrected document used by the diff. */
  corrected: string;
}

/** A lazily imported Svelte component with {@link EditorSurfaceProps}. */
export type EditorSurfaceComponent = Component<EditorSurfaceProps>;

type SurfaceStatus = "closed" | "loading" | "ready" | "failed";

/**
 * Owns one lazily imported surface and invalidates an import that resolves
 * after the owner has closed or replaced it.
 *
 * The generation counter is the cancellation contract: `close()` advances it,
 * so a pending `import()` can still finish without assigning a component or
 * leaving state that a later open would reuse. This is deliberately generic so
 * its cancellation path is tested without Monaco or a DOM.
 */
export class LazySurface<Surface> {
  /** Current load state; `failed` retains a safe error. */
  status = $state<SurfaceStatus>("closed");
  /** Loaded surface, or `null` while closed/loading/failed. */
  surface = $state.raw<Surface | null>(null);
  /** Safe message for a failed import. */
  error = $state<string | null>(null);

  readonly #load: () => Promise<Surface>;
  #generation = 0;

  /** @param load Importer invoked for each open attempt. */
  constructor(load: () => Promise<Surface>) {
    this.#load = load;
  }

  /**
   * Starts an import. A close during the import wins over its eventual result.
   * A repeated open supersedes the earlier attempt instead of rendering twice.
   */
  async open(): Promise<void> {
    const generation = ++this.#generation;
    this.status = "loading";
    this.error = null;
    this.surface = null;
    try {
      const surface = await this.#load();
      if (generation !== this.#generation) {
        return;
      }
      this.surface = surface;
      this.status = "ready";
    } catch {
      if (generation !== this.#generation) {
        return;
      }
      this.status = "failed";
      this.error = "The offline editor could not be loaded. Try again.";
    }
  }

  /** Cancels a pending import and releases the loaded surface reference. */
  close(): void {
    this.#generation += 1;
    this.surface = null;
    this.status = "closed";
    this.error = null;
  }
}

async function loadEditorSurface(): Promise<EditorSurfaceComponent> {
  const module = await import("../../features/editor/YamlEditorSurface.svelte");
  return module.default;
}

/**
 * View state for the synthetic YAML editor feasibility surface.
 *
 * The state owns the synthetic document and the lazy surface boundary. Monaco,
 * models, workers, and listeners stay in the lazy chunk and are owned by the
 * editor/diff attachments, so opening Home never imports the editor and closing
 * the surface releases everything the attachments created.
 */
export class EditorFeasibilityState {
  /** Current synthetic document; editable and replaceable by the buttons. */
  value = $state(MALFORMED_YAML_SAMPLE);
  /** Lazy surface boundary with cancellation. */
  readonly surface = new LazySurface<EditorSurfaceComponent>(loadEditorSurface);

  /** Starts the lazy editor import and exposes its first-use state. */
  async open(): Promise<void> {
    editorRuntime.beginLazyImport();
    await this.surface.open();
    if (this.surface.status === "failed") {
      editorRuntime.failLazyImport();
    }
  }

  /**
   * Opens the surface with an oversized synthetic draft.
   *
   * The editor rejects the initial document before creating a model or worker
   * and shows the byte ceiling; the surface's sample buttons remain usable to
   * recover with a bounded document.
   */
  async openWithOversize(): Promise<void> {
    this.value = oversizeYamlSample();
    await this.open();
  }

  /** Cancels a pending import or unmounts the loaded surface. */
  close(): void {
    this.surface.close();
  }

  /** Replaces the document with the corrected sample. */
  correct(): void {
    this.value = CORRECTED_YAML_SAMPLE;
  }

  /** Restores the malformed sample so the worker diagnostic is reproducible. */
  reset(): void {
    this.value = MALFORMED_YAML_SAMPLE;
  }

  /** Attempts an oversized controlled replacement to demonstrate rejection. */
  oversize(): void {
    this.value = oversizeYamlSample();
  }
}
