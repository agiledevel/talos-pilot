import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { untrack } from "svelte";
import type { Attachment } from "svelte/attachments";

import { observeSpecializedAppearance } from "../../lib/state/specializedAppearance";
import type { SpecializedAppearance } from "../../lib/state/specializedAppearance";
import {
  OwnedSpecializedResources,
  terminalRuntime,
} from "../../lib/state/specializedViewRuntime.svelte";
import {
  TERMINAL_MAX_COLS,
  TERMINAL_MAX_ROWS,
  TERMINAL_SCROLLBACK_ROWS,
  clampTerminalGeometry,
} from "./terminalGeometry";
import { TerminalReplaySession } from "./terminalReplay";
import { admitTerminalSnapshot } from "./terminalSnapshot";
import type { TerminalSurfaceState } from "./terminalSurfaceState.svelte";

/**
 * Attachment that owns the synthetic terminal instance.
 *
 * Everything expensive lives here and therefore in the lazily imported surface
 * chunk: the xterm.js terminal, the fit addon, the replay session, the resize
 * and appearance observers, and the single pending frame and deadline. Opening
 * Home imports none of it. The attachment admits each replacement snapshot
 * synchronously before the replay session sees it, resets and replays admitted
 * data so evicted output cannot survive in the emulator, and releases every
 * resource on close, including after a failed initialization.
 */

/** Options the terminal attachment reads reactively. */
export interface TerminalAttachmentOptions {
  /** Synchronous replacement-snapshot reader; its result is consumed immediately. */
  readSnapshot: () => string;
  /** Revision that changes whenever the owner proposes a new snapshot. */
  revision: () => number;
  /** Visible projection written by the attachment. */
  state: () => TerminalSurfaceState;
}

/**
 * Creates the terminal attachment for one host element.
 *
 * The returned function is stable for the surface's lifetime; a nested effect
 * follows the snapshot revision and reads the proposal only at admission time.
 * A caller must not cache the reader's result: the owner generates oversized
 * proposals on demand and retains only admitted data.
 *
 * @param options Reader, revision, and visible projection.
 * @returns A Svelte attachment with idempotent cleanup.
 */
export function terminalAttachment(options: TerminalAttachmentOptions): Attachment<HTMLElement> {
  return (node) => {
    const resources = new OwnedSpecializedResources(terminalRuntime);
    const state = options.state();
    let terminal: Terminal | null = null;
    let replay: TerminalReplaySession | null = null;
    let fit: FitAddon | null = null;
    let instanceCounted = false;
    let disposed = false;

    const guard = (work: () => void, message: string): void => {
      try {
        work();
      } catch {
        state.fail(message);
        teardown();
      }
    };

    const teardown = (): void => {
      if (disposed) {
        return;
      }
      disposed = true;
      replay?.dispose();
      replay = null;
      resources.dispose();
      fit?.dispose();
      fit = null;
      terminal?.dispose();
      terminal = null;
      if (instanceCounted) {
        instanceCounted = false;
        terminalRuntime.instanceClosed();
      }
    };

    const resize = (): void => {
      if (terminal === null || fit === null) {
        return;
      }
      // `proposeDimensions` measures the host; the clamps are applied before the
      // proposed geometry reaches the terminal. Hidden hosts measure as zero and
      // are ignored rather than resized to a degenerate grid.
      const proposed = fit.proposeDimensions();
      if (
        proposed === undefined ||
        !Number.isFinite(proposed.cols) ||
        !Number.isFinite(proposed.rows) ||
        proposed.cols < 1 ||
        proposed.rows < 1
      ) {
        return;
      }
      const { cols, rows } = clampTerminalGeometry(proposed.cols, proposed.rows);
      if (terminal.cols !== cols || terminal.rows !== rows) {
        terminal.resize(cols, rows);
      }
    };

    const inspectEmulator = (): void => {
      if (terminal === null) {
        return;
      }
      try {
        const buffer = terminal.buffer.active;
        // The cursor row (and possibly trailing rows) can be empty, so report the
        // first and last rows that actually contain text. Both scans are bounded
        // and only the two boundary strings cross into renderer state.
        const scanLimit = 200;
        let firstLine = "";
        let lastLine = "";
        for (let index = 0; index < buffer.length && index < scanLimit; index += 1) {
          const text = buffer.getLine(index)?.translateToString(true) ?? "";
          if (text.length > 0) {
            firstLine = text;
            break;
          }
        }
        for (
          let index = buffer.length - 1;
          index >= 0 && index >= buffer.length - scanLimit;
          index -= 1
        ) {
          const text = buffer.getLine(index)?.translateToString(true) ?? "";
          if (text.length > 0) {
            lastLine = text;
            break;
          }
        }
        state.observeEmulator({ rows: buffer.length, firstLine, lastLine });
      } catch {
        // Diagnostics are advisory: a failed read leaves the previous bounded
        // inspection in place instead of disturbing replay.
      }
    };

    const applyAppearance = (appearance: SpecializedAppearance): void => {
      if (terminal === null) {
        return;
      }
      terminal.options.theme = {
        background: appearance.background,
        foreground: appearance.foreground,
        cursor: appearance.accent,
        cursorAccent: appearance.background,
      };
      terminal.options.fontFamily = appearance.terminalFontFamily;
      terminal.options.fontSize = appearance.terminalFontSize;
      // A font-size change changes the cell size; refit on the next frame.
      resources.scheduleFrame(() => {
        guard(resize, "The synthetic terminal could not be resized.");
      });
    };

    try {
      terminal = new Terminal({
        cols: Math.min(80, TERMINAL_MAX_COLS),
        rows: Math.min(24, TERMINAL_MAX_ROWS),
        scrollback: TERMINAL_SCROLLBACK_ROWS,
        // Read-only synthetic output: no stdin handler is enabled and the
        // emulator still supports selection, scrolling, and keyboard focus.
        disableStdin: true,
        cursorBlink: false,
        screenReaderMode: true,
        allowProposedApi: false,
        convertEol: false,
        fontFamily: "ui-monospace, monospace",
        fontSize: 13,
        theme: { background: "#0f172a", foreground: "#e2e8f0" },
      });
      fit = new FitAddon();
      terminal.loadAddon(fit);
      terminal.open(node);
      terminalRuntime.instanceOpened();
      instanceCounted = true;
      terminal.focus();

      replay = new TerminalReplaySession({
        writer: {
          write: (data, callback) => {
            if (terminal === null) {
              callback();
              return;
            }
            terminal.write(data, callback);
          },
          reset: () => {
            terminal?.reset();
          },
        },
        scheduler: {
          setDeadline: (delayMs, callback) => {
            resources.setDeadline(delayMs, callback);
          },
          clearDeadline: () => {
            resources.clearDeadline();
          },
        },
        diagnostics: terminalRuntime,
        onProgress: () => {
          state.progress(replay?.state.replaying ?? false);
          inspectEmulator();
        },
        onStall: (message) => {
          state.fail(message);
          teardown();
        },
      });

      const observer = new ResizeObserver((entries) => {
        const box = entries.at(-1)?.contentRect;
        if (box === undefined || box.width <= 0 || box.height <= 0) {
          return;
        }
        resources.scheduleFrame(() => {
          guard(resize, "The synthetic terminal could not be resized.");
        });
      });
      observer.observe(node);
      resources.addObserver(() => observer.disconnect());

      observeSpecializedAppearance(resources, (appearance) => {
        guard(() => {
          applyAppearance(appearance);
        }, "The synthetic terminal could not apply the application appearance.");
      });
      resources.scheduleFrame(() => {
        guard(resize, "The synthetic terminal could not be sized.");
      });
    } catch {
      state.fail("The offline terminal could not start. Close and reopen it to try again.");
      teardown();
      return () => undefined;
    }

    const applySnapshot = (): void => {
      if (disposed) {
        return;
      }
      // The proposal is consumed immediately: admission either materializes a
      // bounded canonical copy or rejects it, and this local reference is not
      // stored in the session, an effect closure, or component state.
      const admission = untrack(() => admitTerminalSnapshot(options.readSnapshot()));
      if (!admission.accepted) {
        state.rejected(admission.message);
        return;
      }
      state.accepted(admission);
      replay?.apply(admission);
    };

    $effect(() => {
      // Track the revision only; the snapshot itself is read at admission.
      const revision = options.revision();
      if (revision < 0) {
        return;
      }
      applySnapshot();
    });

    return teardown;
  };
}
