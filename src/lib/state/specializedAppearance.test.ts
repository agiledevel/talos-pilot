import { describe, expect, it } from "vitest";

import { mapSpecializedAppearance } from "./specializedAppearance";
import type { AppearanceSources } from "./specializedAppearance";

function sources(overrides: Partial<AppearanceSources> = {}): AppearanceSources {
  return {
    explicitMode: undefined,
    explicitDensity: undefined,
    systemPrefersDark: false,
    readToken: (name) => `token:${name}`,
    ...overrides,
  };
}

function identity(raw: string, fallback: string): string {
  return raw.length === 0 ? fallback : raw;
}

describe("specialized appearance mapping", () => {
  it("follows the system colour scheme when no explicit mode is recorded", () => {
    expect(mapSpecializedAppearance(sources({ systemPrefersDark: true }), identity).mode).toBe(
      "dark",
    );
    expect(mapSpecializedAppearance(sources({ systemPrefersDark: false }), identity).mode).toBe(
      "light",
    );
  });

  it("prefers an explicit root mode over the system colour scheme", () => {
    const light = mapSpecializedAppearance(
      sources({ explicitMode: "light", systemPrefersDark: true }),
      identity,
    );
    expect(light.mode).toBe("light");
    expect(light.background).toBe("token:--color-surface-50");
    expect(light.foreground).toBe("token:--color-surface-950");

    const dark = mapSpecializedAppearance(
      sources({ explicitMode: "dark", systemPrefersDark: false }),
      identity,
    );
    expect(dark.mode).toBe("dark");
    expect(dark.background).toBe("token:--color-surface-950");
    expect(dark.foreground).toBe("token:--color-surface-50");
  });

  it("maps density to the font scale without touching data", () => {
    const comfortable = mapSpecializedAppearance(sources(), identity);
    expect(comfortable.density).toBe("comfortable");
    expect(comfortable.terminalFontSize).toBe(13);
    expect(comfortable.chartFontSize).toBe(11);

    const compact = mapSpecializedAppearance(sources({ explicitDensity: "compact" }), identity);
    expect(compact.density).toBe("compact");
    expect(compact.terminalFontSize).toBe(12);
    expect(compact.chartFontSize).toBe(10);

    const unknownDensity = mapSpecializedAppearance(sources({ explicitDensity: "wide" }), identity);
    expect(unknownDensity.density).toBe("comfortable");
  });

  it("falls back when a token is missing or cannot be normalized", () => {
    const appearance = mapSpecializedAppearance(
      sources({ readToken: () => "" }),
      (raw, fallback) => (raw.length === 0 ? fallback : raw),
    );
    expect(appearance.background).toMatch(/^#/u);
    expect(appearance.foreground).toMatch(/^#/u);
    expect(appearance.accent).toMatch(/^#/u);
  });

  it("always provides a monospaced, offline terminal stack", () => {
    const appearance = mapSpecializedAppearance(sources(), identity);
    expect(appearance.terminalFontFamily).toContain("monospace");
    expect(appearance.terminalFontFamily).not.toMatch(/https?:|url\(/u);
  });
});
