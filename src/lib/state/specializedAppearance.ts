/**
 * One appearance projection for the F7 terminal and chart surfaces.
 *
 * The shell already owns the theme and density decision: `data-mode` and
 * `data-density` on the document root, with the operating-system colour scheme
 * used when no explicit mode is recorded. This adapter is the single place that
 * turns those shell state and the Skeleton colour tokens into values a canvas
 * library accepts. `oklch()` and other modern CSS colour syntaxes are not
 * assumed to be understood by a canvas, so every resolved value is passed
 * through a canvas `fillStyle` setter and read back in normalized form.
 */

/** A resolved appearance shared by the terminal and chart adapters. */
export interface SpecializedAppearance {
  /** Colour mode in effect after resolving the system preference. */
  readonly mode: "light" | "dark";
  /** Density in effect. */
  readonly density: "comfortable" | "compact";
  /** Terminal/chart background. */
  readonly background: string;
  /** Slightly raised surface for headers or the terminal host. */
  readonly surface: string;
  /** Primary text colour. */
  readonly foreground: string;
  /** Muted text colour for captions and axis labels. */
  readonly muted: string;
  /** Accent colour for series and focus. */
  readonly accent: string;
  /** Border and grid colour. */
  readonly border: string;
  /** Monospaced terminal stack; the application loads no remote fonts. */
  readonly terminalFontFamily: string;
  /** Terminal font size in CSS pixels, from the density scale. */
  readonly terminalFontSize: number;
  /** Chart axis and legend font size in CSS pixels, from the density scale. */
  readonly chartFontSize: number;
}

const FALLBACK_LIGHT = {
  background: "#f8fafc",
  surface: "#f1f5f9",
  foreground: "#0f172a",
  muted: "#475569",
  accent: "#2563eb",
  border: "#cbd5e1",
} as const;

const FALLBACK_DARK = {
  background: "#0f172a",
  surface: "#1e293b",
  foreground: "#e2e8f0",
  muted: "#94a3b8",
  accent: "#60a5fa",
  border: "#334155",
} as const;

/** The terminal needs a monospaced stack; no bundled or remote font is used. */
const TERMINAL_FONT_FAMILY = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

/** The inputs the mapping needs, decoupled from the DOM for testing. */
export interface AppearanceSources {
  /** Explicit root `data-mode`, if any. */
  readonly explicitMode: string | undefined;
  /** Explicit root `data-density`, if any. */
  readonly explicitDensity: string | undefined;
  /** Whether the OS currently requests a dark colour scheme. */
  readonly systemPrefersDark: boolean;
  /** Reads one computed CSS custom property. */
  readonly readToken: (name: string) => string;
}

/**
 * Maps shell state and Skeleton tokens into library-ready values.
 *
 * This is the single token-to-library mapping: mode selects the light or dark
 * side of each colour pairing, density selects the font scale, and the terminal
 * always receives a monospaced stack. Colours go through `normalize` because a
 * canvas library cannot be assumed to accept `oklch()`/`light-dark()` syntax.
 *
 * @param sources Shell state and token values.
 * @param normalize Colour normalizer; defaults to the canvas-backed
 *   {@link canvasColor}. Tests inject a deterministic recorder because jsdom has
 *   no canvas implementation and therefore no rendering evidence.
 */
export function mapSpecializedAppearance(
  sources: AppearanceSources,
  normalize: (raw: string, fallback: string) => string = canvasColor,
): SpecializedAppearance {
  const explicit = sources.explicitMode;
  const mode =
    explicit === "dark" || (explicit !== "light" && sources.systemPrefersDark) ? "dark" : "light";
  const density = sources.explicitDensity === "compact" ? "compact" : "comfortable";
  const fallback = mode === "dark" ? FALLBACK_DARK : FALLBACK_LIGHT;
  const pair = (lightToken: string, darkToken: string): string =>
    sources.readToken(mode === "dark" ? darkToken : lightToken);
  return {
    mode,
    density,
    background: normalize(pair("--color-surface-50", "--color-surface-950"), fallback.background),
    surface: normalize(pair("--color-surface-100", "--color-surface-900"), fallback.surface),
    foreground: normalize(pair("--color-surface-950", "--color-surface-50"), fallback.foreground),
    muted: normalize(pair("--color-surface-600", "--color-surface-400"), fallback.muted),
    accent: normalize(sources.readToken("--color-primary-500"), fallback.accent),
    border: normalize(pair("--color-surface-200", "--color-surface-800"), fallback.border),
    terminalFontFamily: TERMINAL_FONT_FAMILY,
    terminalFontSize: density === "compact" ? 12 : 13,
    chartFontSize: density === "compact" ? 10 : 11,
  };
}

/**
 * Resolves the current shell appearance from the live document.
 *
 * @param root Document root carrying `data-mode` and `data-density`.
 * @param systemPrefersDark Whether the OS currently requests a dark scheme.
 * @param normalize Colour normalizer, defaulting to the canvas-backed one.
 * @returns Normalized colours plus the density-derived font sizes.
 */
export function resolveSpecializedAppearance(
  root: HTMLElement,
  systemPrefersDark: boolean,
  normalize: (raw: string, fallback: string) => string = canvasColor,
): SpecializedAppearance {
  const style = getComputedStyle(root);
  return mapSpecializedAppearance(
    {
      explicitMode: root.dataset["mode"],
      explicitDensity: root.dataset["density"],
      systemPrefersDark,
      readToken: (name) => style.getPropertyValue(name),
    },
    normalize,
  );
}

/**
 * Normalizes one CSS colour for a canvas library.
 *
 * The `fillStyle` setter ignores invalid values, so the fallback remains in
 * place when a token is missing or unsupported. Reading the property back yields
 * `#rrggbb` or `rgba(...)`, both of which xterm.js and uPlot accept.
 *
 * @param raw Token value from the computed style.
 * @param fallback Compatible colour used when `raw` cannot be resolved.
 */
export function canvasColor(raw: string, fallback: string): string {
  const value = raw.trim();
  if (value.length === 0) {
    return fallback;
  }
  try {
    const context = document.createElement("canvas").getContext("2d");
    if (context === null) {
      return fallback;
    }
    context.fillStyle = fallback;
    context.fillStyle = value;
    const normalized = context.fillStyle;
    return typeof normalized === "string" && normalized.length > 0 ? normalized : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Observes every input of {@link resolveSpecializedAppearance}.
 *
 * Root `data-mode`/`data-density` attributes cover explicit theme and density
 * choices, and the colour-scheme media query covers the OS preference while the
 * shell is in system mode. `onChange` runs once immediately so the library is
 * created with the resolved appearance instead of the library default.
 *
 * @param resources Owner that removes the media listener and root observer.
 * @param onChange Called with each newly resolved appearance.
 */
export function observeSpecializedAppearance(
  resources: {
    listen(target: MediaQueryList, type: "change", listener: EventListener): () => void;
    addObserver(disconnect: () => void): void;
  },
  onChange: (appearance: SpecializedAppearance) => void,
): void {
  const media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = (): void => {
    onChange(resolveSpecializedAppearance(document.documentElement, media.matches));
  };
  resources.listen(media, "change", update);
  const observer = new MutationObserver(update);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-mode", "data-density"],
  });
  resources.addObserver(() => observer.disconnect());
  update();
}
