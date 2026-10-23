import type { OwnedListeners } from "../../lib/state/editorRuntimeDiagnostics.svelte";

/**
 * Follows the shell's colour mode and density without adding a second theme
 * store. The root attributes are the source of truth used by `styles.css`.
 *
 * @param listeners Owner that removes the media listener and observer.
 * @param onChange Called once for setup and after each relevant root mutation.
 */
export function observeEditorAppearance(listeners: OwnedListeners, onChange: () => void): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  listeners.add(media, "change", onChange);
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-mode", "data-density"],
  });
  listeners.addDisposable(() => observer.disconnect());
  onChange();
}

/**
 * Watches an editor host's own box so Monaco lays out after a shell resize
 * without making the window or the view responsible for a global listener.
 *
 * @param element Editor container whose size Monaco should follow.
 * @param listeners Owner that disconnects the observer.
 * @param onResize Called after the observed box changes.
 */
export function observeEditorSize(
  element: HTMLElement,
  listeners: OwnedListeners,
  onResize: () => void,
): void {
  const observer = new ResizeObserver(() => {
    onResize();
  });
  observer.observe(element);
  listeners.addDisposable(() => observer.disconnect());
}
