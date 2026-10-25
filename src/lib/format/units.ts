/** Display formatting for bounded diagnostic counts. */

/**
 * Formats a byte count into a short binary unit string.
 *
 * @param bytes Non-negative retained-data byte count.
 * @returns A bounded string such as `0 B`, `64.0 KiB`, or `1.0 MiB`.
 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }
  if (bytes < 1024) {
    return `${String(Math.trunc(bytes))} B`;
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KiB`;
  }
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

/**
 * Formats an integer count with deterministic thousands separators.
 *
 * @param count Non-negative count, such as retained lines or samples.
 * @returns A bounded string such as `10,000`.
 */
export function formatCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) {
    return "0";
  }
  return String(Math.trunc(count)).replace(/\B(?=(\d{3})+(?!\d))/gu, ",");
}
