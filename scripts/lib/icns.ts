/**
 * Canonicalizes Tauri's ICNS chunk order without changing encoded image payloads.
 * The pinned CLI emits equivalent chunks in nondeterministic map order.
 * Invalid container lengths and duplicate chunk types are rejected.
 */
export function canonicalIcns(input: Buffer): Buffer {
  if (
    input.length < 8 ||
    input.length > 16 * 1024 * 1024 ||
    input.toString("ascii", 0, 4) !== "icns" ||
    input.readUInt32BE(4) !== input.length
  ) {
    throw new Error("Invalid ICNS container header or size.");
  }
  const chunks: Buffer[] = [];
  const types = new Set<string>();
  let offset = 8;
  while (offset < input.length) {
    if (offset + 8 > input.length) throw new Error("Incomplete ICNS chunk header.");
    const length = input.readUInt32BE(offset + 4);
    const type = input.toString("ascii", offset, offset + 4);
    if (length < 8 || offset + length > input.length || types.has(type)) {
      throw new Error("Invalid ICNS chunk size or duplicate type.");
    }
    types.add(type);
    chunks.push(input.subarray(offset, offset + length));
    offset += length;
  }
  return Buffer.concat([
    input.subarray(0, 8),
    ...chunks.sort((left, right) => Buffer.compare(left, right)),
  ]);
}
