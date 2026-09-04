// Inlines the Material Symbols sprite into the document, once, so that
// `<use href="#ms-name">` resolves against this document rather than against a
// separate file.
//
// This exists because the cross-document form did NOT work. Icon.tsx used to
// reference the built asset URL -- `<use href="/assets/icons-<hash>.svg#ms-x">`
// -- and carried a comment asserting that "WebView2 (Chromium) fully supports
// cross-document <use> fragment references". It does not, under the conditions
// this app serves under, and nothing had ever checked.
//
// Measured in the real built application, driven over its own devtools
// endpoint: the sprite fetched fine (HTTP 200, 39,415 bytes), 36 <use>
// elements existed, their hrefs were correct and the sprite's symbol ids
// matched them exactly -- and every one of them reported `getBBox()` of 0x0
// with no `instanceRoot`. The references never resolved, so every icon in the
// application rendered as an empty box. Nothing threw, nothing logged, and the
// type-safe SymbolName union that was supposed to make a bad icon impossible
// was working perfectly the whole time: the names were all correct.
//
// A same-document fragment reference has none of that failure mode, and it
// removes a network round trip per launch as a side effect.

import spriteMarkup from "../../assets/icons.svg?raw"

const SPRITE_ELEMENT_ID = "md3-icon-sprite"

let injected = false

/**
 * Inject the sprite markup into the document body if it is not already there.
 *
 * Idempotent, and safe to call before the DOM is ready: the injection is
 * deferred to DOMContentLoaded in that case. Called at module load from
 * Icon.tsx, so it runs before the first icon renders without every caller
 * having to remember it.
 */
export function ensureIconSprite(): void {
  if (injected || typeof document === "undefined") return
  injected = true

  const inject = () => {
    if (document.getElementById(SPRITE_ELEMENT_ID)) return
    const host = document.createElement("div")
    host.id = SPRITE_ELEMENT_ID
    host.setAttribute("aria-hidden", "true")
    // The sprite's own root <svg> already carries display:none; this keeps the
    // wrapper out of layout too, so it can never occupy space or be focused.
    host.style.display = "none"
    host.innerHTML = spriteMarkup
    document.body.appendChild(host)
  }

  if (document.body) inject()
  else document.addEventListener("DOMContentLoaded", inject, { once: true })
}

/** True when the sprite is present in this document. Used by the icon
 * rendering test to prove the injection actually happened, rather than
 * trusting that calling the function was enough. */
export function iconSpriteIsPresent(): boolean {
  return typeof document !== "undefined" && document.getElementById(SPRITE_ELEMENT_ID) !== null
}
