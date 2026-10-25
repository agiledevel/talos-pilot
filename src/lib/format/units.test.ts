import { describe, expect, it } from "vitest";

import { formatBytes, formatCount } from "./units";

describe("diagnostic unit formatting", () => {
  it("formats bounded byte counts", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-1)).toBe("0 B");
    expect(formatBytes(Number.NaN)).toBe("0 B");
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(1024)).toBe("1.0 KiB");
    expect(formatBytes(1024 * 1024)).toBe("1.00 MiB");
  });

  it("formats counts with deterministic separators", () => {
    expect(formatCount(0)).toBe("0");
    expect(formatCount(9_999)).toBe("9,999");
    expect(formatCount(10_000)).toBe("10,000");
    expect(formatCount(1_048_576)).toBe("1,048,576");
    expect(formatCount(Number.NaN)).toBe("0");
  });
});
