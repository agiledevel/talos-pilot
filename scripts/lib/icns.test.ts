import { describe, expect, it } from "vitest";
import { canonicalIcns } from "./icns";

function chunk(type: string, payload: string): Buffer {
  const header = Buffer.alloc(8);
  header.write(type, "ascii");
  header.writeUInt32BE(8 + payload.length, 4);
  return Buffer.concat([header, Buffer.from(payload)]);
}
function container(chunks: Buffer[]): Buffer {
  const header = Buffer.alloc(8);
  header.write("icns", "ascii");
  header.writeUInt32BE(8 + chunks.reduce((size, item) => size + item.length, 0), 4);
  return Buffer.concat([header, ...chunks]);
}
describe("reproducible ICNS conversion", () => {
  it("retains image bytes while canonicalizing equivalent chunk orders", () => {
    const small = chunk("ic07", "small image bytes");
    const large = chunk("ic10", "large image bytes");
    expect(canonicalIcns(container([large, small]))).toEqual(container([small, large]));
    expect(canonicalIcns(container([small, large]))).toEqual(container([small, large]));
  });
  it("rejects truncated containers, invalid lengths, and duplicate image types", () => {
    expect(() => canonicalIcns(Buffer.from("icns"))).toThrow("header");
    expect(() => canonicalIcns(container([Buffer.from("ic07")]))).toThrow("Incomplete");
    const broken = chunk("ic07", "x");
    broken.writeUInt32BE(999, 4);
    expect(() => canonicalIcns(container([broken]))).toThrow("chunk size");
    expect(() => canonicalIcns(container([chunk("ic07", "x"), chunk("ic07", "y")]))).toThrow(
      "duplicate",
    );
  });
});
