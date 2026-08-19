/**
 * Pure MD3 scheme builder — no DOM. Vitest runs with `environment: "node"`,
 * so nothing in this file may touch `window`, `document`, or any browser
 * global; see applyScheme.ts for the module that actually writes to the DOM.
 */

import { hexToOklch, oklchToSrgbHex } from "./oklch";

export type ThemeMode = "light" | "dark";
export type TokenFormat = "oklch" | "hex";

/** The user-facing appearance setting. `theme: "auto"` resolves against
 * `prefers-color-scheme` in boot.ts / ThemeProvider.tsx, never in here. */
export interface Appearance {
  seed: string;
  theme: ThemeMode | "auto";
  radius: number;
  overrides?: Record<string, string>;
}

/** Matches the prototype's `defaults().appearance` exactly (seed, theme,
 * radius) — `density`, `appName`, and `glyph` belong to a sibling lane and
 * are not part of the raw token system this module builds. */
export const DEFAULT_APPEARANCE: Appearance = {
  seed: "#8a5a00",
  theme: "light",
  radius: 16,
  overrides: {},
};

/** Single source of truth for where the persisted appearance lives, so
 * boot.ts (bundled standalone by vite.config.ts's themeBoot() plugin) and
 * ThemeProvider.tsx (built normally through Vite) read/write the same key. */
export const APPEARANCE_STORAGE_KEY = "mo-appearance";

export interface BuildSchemeOptions {
  seed: string;
  mode: ThemeMode;
  radius: number;
  overrides?: Record<string, string>;
  format?: TokenFormat;
}

export type SchemeTokens = Record<string, string>;

/** Formats one OKLCH triple as a token value, in the requested
 * representation. Matches the prototype's `ok()` helper's number
 * formatting exactly in "oklch" mode (raw L, C to 3 decimals, H to 1). */
function ok(L: number, C: number, H: number, format: TokenFormat): string {
  const hue = ((H % 360) + 360) % 360;
  if (format === "hex") return oklchToSrgbHex(L, C, hue);
  return `oklch(${L} ${C.toFixed(3)} ${hue.toFixed(1)})`;
}

/**
 * Builds the raw MD3 color + radius tokens for one seed/mode/radius
 * combination. Transcribed exactly from the prototype's `applyTheme()`
 * light/dark tables — every lightness and chroma multiplier below is
 * load-bearing; do not "simplify" or re-round it.
 *
 * `--e1`/`--e2` are deliberately NOT set here: the prototype's
 * `applyTheme()` never touches them either. They are fixed elevation
 * shadows declared once in tokens.css and never re-derived from the seed.
 */
export function buildScheme(options: BuildSchemeOptions): SchemeTokens {
  const { seed, mode, radius, overrides, format = "oklch" } = options;
  const { c: rawC, h } = hexToOklch(seed);
  const c = Math.min(0.13, Math.max(0.06, rawC || 0.09));
  const dark = mode === "dark";
  const th = h + 60;

  const T: SchemeTokens = dark
    ? {
        "--p": ok(0.8, c * 0.9, h, format),
        "--on-p": ok(0.28, c * 0.6, h, format),
        "--pc": ok(0.38, c * 0.65, h, format),
        "--on-pc": ok(0.92, c * 0.35, h, format),

        "--sec": ok(0.78, c * 0.3, h, format),
        "--sec-c": ok(0.34, c * 0.18, h, format),
        "--on-sec-c": ok(0.9, c * 0.12, h, format),

        "--ter": ok(0.8, c * 0.7, th, format),
        "--ter-c": ok(0.36, c * 0.4, th, format),
        "--on-ter-c": ok(0.92, c * 0.3, th, format),

        "--err": ok(0.8, 0.12, 25, format),
        "--err-c": ok(0.35, 0.12, 27, format),
        "--on-err-c": ok(0.92, 0.05, 27, format),

        "--bg": ok(0.165, 0.012, h, format),

        "--c-lowest": ok(0.21, 0.012, h, format),
        "--c-low": ok(0.2, 0.012, h, format),
        "--c": ok(0.23, 0.013, h, format),
        "--c-high": ok(0.26, 0.014, h, format),
        "--c-highest": ok(0.3, 0.015, h, format),

        "--on-s": ok(0.93, 0.008, h, format),
        "--on-sv": ok(0.78, 0.015, h, format),
        "--outline": ok(0.62, 0.015, h, format),
        "--outline-v": ok(0.36, 0.012, h, format),

        "--inv": ok(0.92, 0.01, h, format),
        "--on-inv": ok(0.25, 0.012, h, format),
      }
    : {
        "--p": ok(0.48, c, h, format),
        "--on-p": ok(0.995, 0.005, h, format),
        "--pc": ok(0.9, c * 0.45, h, format),
        "--on-pc": ok(0.25, c * 0.6, h, format),

        "--sec": ok(0.5, c * 0.35, h, format),
        "--sec-c": ok(0.9, c * 0.18, h, format),
        "--on-sec-c": ok(0.25, c * 0.3, h, format),

        "--ter": ok(0.55, c * 0.8, th, format),
        "--ter-c": ok(0.9, c * 0.35, th, format),
        "--on-ter-c": ok(0.25, c * 0.5, th, format),

        "--err": ok(0.5, 0.19, 27, format),
        "--err-c": ok(0.9, 0.06, 27, format),
        "--on-err-c": ok(0.28, 0.12, 27, format),

        "--bg": ok(0.985, 0.007, h, format),

        "--c-lowest": ok(0.997, 0.003, h, format),
        "--c-low": ok(0.97, 0.008, h, format),
        "--c": ok(0.955, 0.009, h, format),
        "--c-high": ok(0.94, 0.01, h, format),
        "--c-highest": ok(0.92, 0.012, h, format),

        "--on-s": ok(0.22, 0.015, h, format),
        "--on-sv": ok(0.42, 0.02, h, format),
        "--outline": ok(0.55, 0.02, h, format),
        "--outline-v": ok(0.82, 0.015, h, format),

        "--inv": ok(0.27, 0.015, h, format),
        "--on-inv": ok(0.95, 0.008, h, format),
      };

  T["--r"] = radius + "px";

  Object.assign(T, overrides || {});

  return T;
}
