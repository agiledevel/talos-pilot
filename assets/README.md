# Talos Pilot icon

[app-icon.png](app-icon.png) is the canonical bitmap source, generated with the built-in image generation tool on 2026-10-08. The new mark combines a pilot compass with three connected cluster nodes. It replaces the initial repository-native scaffold icon and contains no upstream product trademark or wordmark.

Generation prompt:

> Create one polished desktop application icon for Talos Pilot, a local desktop application for operating Talos Linux and Kubernetes clusters. Square app icon, no text or lettering. A bold precise geometric compass/pilot navigation mark subtly combined with three connected infrastructure nodes. Strong balanced silhouette readable at 32px, restrained flat vector-like rendering, clean optical spacing, no fine details, no Kubernetes or Talos trademark logos. Retain the application's blue visual identity: deep navy rounded square tile, vivid azure blue and white central symbol with a small cyan accent. Center the tile with a small transparent margin on all sides; genuinely transparent outside the rounded tile. Single icon only, front-facing, no mockup, no scene, no watermark, no shadows outside the tile. Square high-resolution bitmap source suitable for deterministic desktop icon conversion.

The source bitmap is retained as the generated design artifact. Re-running the generative prompt is not expected to reproduce it byte-for-byte. Desktop conversion from the retained source is deterministic:

```sh
pnpm icons:generate
pnpm icons:check
```

The pinned Tauri CLI generates PNG/ICO/ICNS files. [scripts/icons.ts](../scripts/icons.ts) canonicalizes the ICNS container's chunk order; equivalent encoded image payloads remain unchanged. Tests reject malformed container lengths and duplicate chunk types. This addresses the CLI's observed map-order nondeterminism without hand-editing generated image content. Keep generated desktop icons under `src-tauri/icons/`; edit/replace the source and regenerate them rather than editing derivatives.
