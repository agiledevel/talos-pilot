/** Narrows JSON objects at CLI/API boundaries without trusting a wire declaration. */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
