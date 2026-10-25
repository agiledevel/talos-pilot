/**
 * Compatibility workaround for uPlot's module-scope number formatting.
 *
 * uPlot 1.6.32 evaluates `new Intl.NumberFormat(navigator.language)` while its
 * module body runs. WebKitGTK reports the POSIX locale `C` on hosts without a
 * configured locale (common on minimal Linux installs and CI fixtures), and the
 * stricter WebKit ICU rejects that tag with a `RangeError`, so the chart module
 * would never evaluate. Supplying a supported tag only for the duration of the
 * lazy import keeps the library usable without changing the application locale
 * or patching the dependency's compiled output.
 */

/** English (United States), used only while an unsupported tag would break uPlot. */
const FALLBACK_LOCALE = "en-US";

/**
 * Reports whether `Intl` accepts a tag as a number-format locale.
 *
 * @param tag Candidate BCP-47 tag, such as `navigator.language`.
 * @returns True when constructing a formatter does not throw.
 */
export function isSupportedIntlLocale(tag: string): boolean {
  try {
    // Constructing the formatter is the check; unsupported or structurally
    // invalid tags throw RangeError.
    new Intl.NumberFormat(tag);
    return true;
  } catch {
    return false;
  }
}

/**
 * Runs `work` with a `navigator.language` value uPlot can use.
 *
 * The override is an own configurable property on the Navigator instance that
 * shadows the prototype accessor; it is removed afterwards, so the WebView's
 * real language is unchanged for the rest of the application. When the reported
 * tag is already supported, no property is touched.
 *
 * @param work The lazy import that evaluates uPlot.
 * @returns The value produced by `work`.
 */
export async function withSupportedNavigatorLanguage<Value>(
  work: () => Promise<Value>,
): Promise<Value> {
  if (isSupportedIntlLocale(navigator.language)) {
    return work();
  }
  // Preserve an existing own property (some WebViews and tests define one) and
  // otherwise remove the shim so the prototype accessor applies again.
  const previous = Object.getOwnPropertyDescriptor(navigator, "language");
  Object.defineProperty(navigator, "language", {
    configurable: true,
    get: () => FALLBACK_LOCALE,
  });
  try {
    return await work();
  } finally {
    if (previous === undefined) {
      Reflect.deleteProperty(navigator, "language");
    } else {
      Object.defineProperty(navigator, "language", previous);
    }
  }
}
