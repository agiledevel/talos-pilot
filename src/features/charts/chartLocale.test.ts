import { afterEach, describe, expect, it } from "vitest";

import { isSupportedIntlLocale, withSupportedNavigatorLanguage } from "./chartLocale";

afterEach(() => {
  Reflect.deleteProperty(navigator, "language");
});

describe("chart locale workaround", () => {
  it("recognizes supported and unsupported number-format locales", () => {
    expect(isSupportedIntlLocale("en-US")).toBe(true);
    expect(isSupportedIntlLocale("de-DE")).toBe(true);
    // The POSIX locale WebKitGTK reports on an unconfigured host.
    expect(isSupportedIntlLocale("C")).toBe(false);
    expect(isSupportedIntlLocale("not a tag")).toBe(false);
  });

  it("does not touch a supported navigator language", async () => {
    const original = navigator.language;
    const seen = await withSupportedNavigatorLanguage(async () => navigator.language);
    expect(seen).toBe(original);
    expect(navigator.language).toBe(original);
  });

  it("supplies a supported language only for the work and restores the value", async () => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => "C",
    });
    expect(navigator.language).toBe("C");

    const seen = await withSupportedNavigatorLanguage(async () => navigator.language);
    expect(seen).toBe("en-US");
    expect(navigator.language).toBe("C");

    Reflect.deleteProperty(navigator, "language");
    expect(navigator.language).not.toBe("C");
  });

  it("restores the real language when the import fails", async () => {
    Object.defineProperty(navigator, "language", {
      configurable: true,
      get: () => "C",
    });
    await expect(
      withSupportedNavigatorLanguage(async () => {
        expect(navigator.language).toBe("en-US");
        throw new Error("import failed");
      }),
    ).rejects.toThrow("import failed");
    expect(navigator.language).toBe("C");
  });
});
