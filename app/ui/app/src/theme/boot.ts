import {
  buildScheme,
  DEFAULT_APPEARANCE,
  APPEARANCE_STORAGE_KEY,
  type Appearance,
} from "./scheme";
import { applyScheme } from "./applyScheme";

/**
 * Pre-paint theme bootstrapper. This file is never part of the normal Vite
 * module graph -- vite.config.ts's `themeBoot()` plugin bundles it
 * standalone with `esbuild.buildSync` into a minified IIFE and injects it
 * as a classic (non-module) `<script>` at `head-prepend`, so the top-level
 * `boot()` call at the bottom of this file runs before first paint and
 * before React ever mounts.
 *
 * Because of that, nothing else in the app may `import` this module --
 * doing so would run `boot()` a second time through Vite's own bundle.
 * ThemeProvider.tsx re-implements the same handful of lines (reading
 * appearance, resolving "auto", building + applying the scheme) rather
 * than importing this file, specifically to avoid that double execution.
 */

declare global {
  interface Window {
    /** Optionally injected server-side, replacing the
     * `<!--MO_APPEARANCE-->` placeholder comment in index.html with a
     * `<script>window.__MO_APPEARANCE__ = {...}</script>` before this
     * script runs. Not yet wired up in this lane -- see index.html. */
    __MO_APPEARANCE__?: Partial<Appearance>;
  }
}

function readAppearance(): Appearance {
  if (window.__MO_APPEARANCE__) {
    return { ...DEFAULT_APPEARANCE, ...window.__MO_APPEARANCE__ };
  }
  try {
    const raw = window.localStorage.getItem(APPEARANCE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Appearance>;
      return { ...DEFAULT_APPEARANCE, ...parsed };
    }
  } catch {
    // Corrupt value, storage disabled, or a security exception (e.g. a
    // sandboxed embed) -- fall through to shipped defaults.
  }
  return DEFAULT_APPEARANCE;
}

function resolveDark(theme: Appearance["theme"]): boolean {
  return (
    theme === "dark" ||
    (theme === "auto" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches)
  );
}

function boot(): void {
  const appearance = readAppearance();
  const mode = resolveDark(appearance.theme) ? "dark" : "light";

  const supportsOklch =
    typeof CSS !== "undefined" &&
    typeof CSS.supports === "function" &&
    CSS.supports("color", "oklch(.5 .1 20)");

  const tokens = buildScheme({
    seed: appearance.seed,
    mode,
    radius: appearance.radius,
    overrides: appearance.overrides,
    format: supportsOklch ? "oklch" : "hex",
  });

  const root = document.documentElement;
  applyScheme(root, tokens);
  root.dataset.theme = mode;
  root.style.colorScheme = mode;
}

boot();
