<!--
@component
The lazily loaded synthetic terminal surface.

This component and its xterm.js imports are never part of the initial shell
chunk: Home imports it only after the user opens the terminal. The host element
is owned by the terminal attachment, which admits replacement snapshots,
replays them under a bounded write/backpressure contract, follows the shell
appearance, and releases the emulator and every observer on unmount. The
component renders the projection and synthetic controls only; it never reads or
prints the emulator's buffer.
-->
<script lang="ts">
  import {
    TERMINAL_MAX_COLS,
    TERMINAL_MAX_ROWS,
    TERMINAL_SCROLLBACK_ROWS,
  } from "./terminalGeometry";
  import { TERMINAL_BYTE_LIMIT, TERMINAL_LINE_LIMIT } from "./terminalSnapshot";
  import { terminalAttachment } from "./terminalAttachment.svelte";
  import { formatCount } from "../../lib/format/units";
  import type { TerminalSurfaceProps } from "../../lib/state/terminalFeasibility.svelte";

  let { readSnapshot, revision, view, targetLabel, onSample, onClose }: TerminalSurfaceProps =
    $props();

  const uid = $props.id();
  const titleId = `${uid}-title`;
  const noteId = `${uid}-note`;

  // Stable attachment: it follows `revision` through a getter and reads the
  // proposal only at admission, so re-renders never recreate the emulator.
  const attach = terminalAttachment({
    readSnapshot: () => readSnapshot(),
    revision: () => revision,
    state: () => view,
  });

  const limits = `${formatCount(TERMINAL_BYTE_LIMIT)} UTF-8 bytes and ${formatCount(TERMINAL_LINE_LIMIT)} logical lines`;
  const geometry = `${String(TERMINAL_MAX_COLS)} columns × ${String(TERMINAL_MAX_ROWS)} visible rows plus ${formatCount(TERMINAL_SCROLLBACK_ROWS)} scrollback rows`;
</script>

<section
  class="grid min-w-0 gap-3 rounded-base border border-surface-200-800 p-4"
  aria-labelledby={titleId}
  data-terminal-surface
>
  <div class="flex flex-wrap items-start justify-between gap-2">
    <div>
      <h3 id={titleId} class="h6">Synthetic terminal output</h3>
      <p class="text-sm">
        <strong>Target:</strong>
        {targetLabel}
      </p>
      <p id={noteId} class="text-sm text-surface-700-300">
        Read-only synthetic text. There is no stdin, process, socket, cluster connection, or
        forwarding integration. Retention is bounded to {limits}; the emulator is bounded to
        {geometry}. The emulator keeps at most 210,000 cells.
      </p>
    </div>
    <button type="button" class="btn preset-outlined-surface-500" onclick={onClose}>
      Close terminal surface
    </button>
  </div>

  <div class="flex flex-wrap gap-2" role="group" aria-label="Propose synthetic terminal output">
    <button type="button" class="btn preset-primary-action" onclick={() => onSample("sample")}>
      Next sample
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("byte-over")}
    >
      Byte ceiling + 1
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("line-over")}
    >
      Line ceiling + 1
    </button>
    <button type="button" class="btn preset-outlined-surface-500" onclick={() => onSample("burst")}>
      Burst 12,000 lines
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("long-line")}
    >
      One oversized line
    </button>
    <button type="button" class="btn preset-outlined-surface-500" onclick={() => onSample("empty")}>
      Clear output
    </button>
    <button
      type="button"
      class="btn preset-outlined-surface-500"
      onclick={() => onSample("control")}
    >
      Try an escape sequence
    </button>
  </div>

  {#if view.failure !== null}
    <p class="alert variant-filled-error" role="alert" data-terminal-failure>{view.failure}</p>
  {/if}
  {#if view.rejection !== null}
    <p class="alert variant-soft-warning" role="alert" data-terminal-rejection>
      {view.rejection}
    </p>
  {/if}
  {#if view.notice !== null}
    <p class="text-sm" role="status" data-terminal-notice>{view.notice}</p>
  {/if}
  <p class="text-sm break-all text-surface-700-300" data-terminal-retained>
    Admitted: {formatCount(view.retainedLines)} lines · replaying:
    {view.replaying ? "yes" : "no"}
  </p>
  <p class="text-sm break-all text-surface-700-300" data-terminal-emulator>
    Emulator rows: {formatCount(view.emulatorRows)} · newest row:
    {view.emulatorLastLine === "" ? "(empty)" : view.emulatorLastLine}
  </p>

  <div
    class="h-64 w-full overflow-hidden rounded-base border border-surface-300-700 p-1"
    aria-describedby={noteId}
    data-terminal-host
    {@attach attach}
  ></div>

  <p class="text-xs text-surface-700-300">
    Keyboard: Tab into the terminal to focus it; use the arrow, Page, Home, and End keys to scroll
    and select. Closing the surface returns focus to the “Open terminal” button.
  </p>
</section>
