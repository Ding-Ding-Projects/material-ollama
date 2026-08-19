import type { SchemeTokens } from "./scheme";

/**
 * The only DOM-touching module under src/theme. Writes every token in
 * `tokens` onto `el.style` via `setProperty`, which wins over anything
 * declared in tokens.css or @theme -- inline styles beat authored CSS,
 * provided nothing in tokens.css carries `!important` (it must not; see
 * the header comment there).
 *
 * Kept separate from scheme.ts/oklch.ts on purpose: vitest runs with
 * `environment: "node"`, so importing this module (which assumes a live
 * HTMLElement) from a pure unit test of the maths would throw before the
 * test body even runs. Never import this from scheme.ts or oklch.ts.
 *
 * `setProperty` never throws on an invalid value -- a typo in one of the
 * scheme's lightness/chroma numbers produces a `var(--p)` that is invalid
 * at computed-value time, which resolves to `unset` (transparent) with no
 * console output at all. There is no defensive check for that here; the
 * defence is the transcription in scheme.ts being exact.
 */
export function applyScheme(el: HTMLElement, tokens: SchemeTokens): void {
  for (const key of Object.keys(tokens)) {
    el.style.setProperty(key, tokens[key]);
  }
}
