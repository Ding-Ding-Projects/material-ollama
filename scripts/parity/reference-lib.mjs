/**
 * Shared constants and CDP helpers for the design-parity reference capture.
 *
 * The reference is a single-file React prototype (design/Material Ollama.dc.html)
 * served verbatim by scripts/design-reference/reference-renderer.mjs. It has no
 * hash routing and no query parameters: every screen and overlay is React state,
 * reached by clicking the reference's own controls. The inventory's
 * "/reference/material-ollama/#<id>" strings are row identifiers, not navigable
 * routes -- see docs/features/design-parity/README.md.
 *
 * Selection is by aria-label throughout. The reference's icons are Material
 * Symbols ligatures, so an element's textContent carries the glyph NAME
 * ("storefront", "rocket_launch") glued to its visible label; matching on text
 * would match the wrong thing or nothing at all.
 */

/** The one comparison tuple every parity row shares. */
export const TUPLE = Object.freeze({
  width: 816,
  height: 639,
  scale: 1,
  theme: 'light',
  locale: 'en-US',
  seed: '#8a5a00',
  radius: '16px',
  schoolMode: 'off',
  // The design reference renders the tab strip in one position and has no
  // docking control; the built app ships 'left' as its default, per the
  // shared instruction that names left the default edge. Neither is wrong --
  // they are two states of the same feature -- but a pair captured in two
  // different states compares two different layouts and every diff after
  // that is noise. Both sides are pinned to the edge the reference renders.
  tabDock: 'top',
})

/** Frozen instant every capture renders at, so a clock cannot move a pixel. */
export const FROZEN_TIME_ISO = '2026-01-01T00:00:00Z'

/**
 * Injected before any document script runs. Freezes time and disables every
 * animation and transition, so two captures of the same state are identical
 * rather than merely similar.
 */
export const DETERMINISM_SCRIPT = `
(() => {
  const frozen = new Date(${JSON.stringify(FROZEN_TIME_ISO)}).getTime();
  const RealDate = Date;
  function FrozenDate(...args) {
    if (args.length === 0) return new RealDate(frozen);
    return new RealDate(...args);
  }
  FrozenDate.prototype = RealDate.prototype;
  FrozenDate.now = () => frozen;
  FrozenDate.parse = RealDate.parse;
  FrozenDate.UTC = RealDate.UTC;
  globalThis.Date = FrozenDate;
  globalThis.performance && (globalThis.performance.now = () => 0);
  // Pin randomness too. The reference draws its dim-sum surprise on a
  // probability check and picks a dish at random; leaving that to chance
  // makes one row un-capturable and every other row's diff noisy. 0 makes
  // the draw always succeed and always choose the first dish.
  Math.random = () => 0;
  const style = document.createElement('style');
  style.textContent = '*,*::before,*::after{animation:none !important;transition:none !important;caret-color:transparent !important}';
  const attach = () => document.documentElement.appendChild(style);
  if (document.documentElement) attach();
  else document.addEventListener('readystatechange', attach, { once: true });
})();
`

/** Click the one element carrying this exact accessible name. */
export function clickByLabelExpression(label) {
  const json = JSON.stringify(label)
  return `(() => {
    const matches = Array.from(document.querySelectorAll('[aria-label=' + JSON.stringify(${json}) + ']'));
    if (matches.length !== 1) return 'EXPECTED_ONE_GOT_' + matches.length;
    matches[0].click();
    return 'OK';
  })()`
}

/** True only when exactly one element has this accessible name. */
export function countByLabelExpression(label) {
  const json = JSON.stringify(label)
  return `document.querySelectorAll('[aria-label=' + JSON.stringify(${json}) + ']').length`
}
