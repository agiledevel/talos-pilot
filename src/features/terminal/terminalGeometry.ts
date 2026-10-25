/**
 * Finite emulator geometry for the synthetic terminal.
 *
 * xterm's `scrollback` counts rows but excludes the visible rows, and no xterm
 * option bounds the terminal's cell budget by itself. These clamps keep the
 * emulator, its scrollback, and therefore its cell memory finite at every
 * supported window size. They are a cell-count bound, not a byte or heap bound.
 */

/** Minimum visible columns applied to any proposed fit. */
export const TERMINAL_MIN_COLS = 20;
/** Maximum visible columns applied to any proposed fit. */
export const TERMINAL_MAX_COLS = 200;
/** Minimum visible rows applied to any proposed fit. */
export const TERMINAL_MIN_ROWS = 5;
/** Maximum visible rows applied to any proposed fit. */
export const TERMINAL_MAX_ROWS = 50;
/** Emulator scrollback rows; these are in addition to the visible rows. */
export const TERMINAL_SCROLLBACK_ROWS = 1_000;

/**
 * Largest number of cells the emulator can retain: the maximum visible rows
 * plus scrollback, multiplied by the maximum columns.
 */
export const TERMINAL_CELL_LIMIT =
  TERMINAL_MAX_COLS * (TERMINAL_MAX_ROWS + TERMINAL_SCROLLBACK_ROWS);

/** Clamped terminal dimensions. */
export interface TerminalGeometry {
  readonly cols: number;
  readonly rows: number;
}

/**
 * Clamps a proposed fit into the supported geometry.
 *
 * Non-finite, zero, and negative proposals are treated as the minimum, so a
 * hidden or not-yet-laid-out host can never produce a degenerate terminal.
 *
 * @param cols Proposed visible columns.
 * @param rows Proposed visible rows.
 * @returns Integer columns and rows inside the declared clamps.
 */
export function clampTerminalGeometry(cols: number, rows: number): TerminalGeometry {
  return {
    cols: clamp(
      Math.floor(Number.isFinite(cols) ? cols : TERMINAL_MIN_COLS),
      TERMINAL_MIN_COLS,
      TERMINAL_MAX_COLS,
    ),
    rows: clamp(
      Math.floor(Number.isFinite(rows) ? rows : TERMINAL_MIN_ROWS),
      TERMINAL_MIN_ROWS,
      TERMINAL_MAX_ROWS,
    ),
  };
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}
