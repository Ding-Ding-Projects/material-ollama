# Infinite Color Translator

## Behaviour

`app/ui/app/src/screens/Settings/ColorTranslator.tsx` (274 lines) is a real, continuous color picker rather than a swatch-only chooser: a draggable and keyboard-operable saturation/value field (pointer and arrow-key handlers both call `commitRgb`) plus a hue strip, synced bidirectionally with three editable numeric spaces -- hex, RGB (three channels), and HSL (hue/saturation/lightness) -- via `app/ui/app/src/screens/Settings/colorMath.ts`'s conversion functions (`hexToRgb`, `rgbToHsl`, `rgbToHsv`, `hslToRgb`, `hsvToRgb`, `rgbToHex`). A live OKLCH readout (`formatOklch`, reusing the already-shipped `@/theme/oklch`'s `hexToOklch` rather than reimplementing it) and a live WCAG contrast ratio against both white and black (`contrastRatio`, with an explicit pass/fail badge at the 4.5:1 threshold) round out the panel. Editing any one space immediately updates every other space and the 2D field's own cursor position, all driven from one canonical `Rgb` value.

Measured against the fuller canonical contract (named colors, HEX8, RGBA/HSLA, HSV as an editable space, HWB, CIELAB/LCH, CMYK, and alpha), this translator covers hex/RGB/HSL as editable spaces plus a read-only OKLCH readout and contrast checking; HSV is used internally to drive the 2D field but is not exposed as its own editable numeric entry, and HWB/LAB/LCH/CMYK/named-color/alpha translation are not yet implemented.

The translator is deliberately a mixing workspace, not a value that writes itself back to the theme on every keystroke: `AppearanceCard.tsx` seeds it from the current theme seed but only commits a change to the live theme and to `/api/v1/uh/preferences` when the user explicitly clicks "Use as seed colour" (`onUseAsSeed`) -- so exploring colors freely never has a side effect until that one deliberate step.

## Test coverage

`colorMath.test.ts` proves the conversion maths the whole panel is built on: `normalizeHex` accepts both 3- and 6-digit hex with or without a leading `#` and rejects garbage rather than throwing; hex round-trips exactly back to hex through `rgbToHex(hexToRgb(...))`; RGB round-trips through both HSL and HSV within a one-unit-per-channel rounding tolerance; and `contrastRatio` computes the real WCAG maximum of 21:1 between pure black and white (in both directions) and exactly 1 for a colour against itself. The 2D saturation/value field's pointer/keyboard handlers and the OKLCH readout remain uncovered by a dedicated test in this pass.

## Configuration

TODO(infinite-color-translator): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(infinite-color-translator): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(infinite-color-translator): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/colorMath.test.ts::computes the real WCAG maximum (21:1) contrast between pure black and white` (plus its five sibling cases in the same file).
- Built-artifact proof: not yet attached -- the translator sits below the fold on `/settings`, and no capture in this inventory's manifest shows it.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the Appearance card's colour translator would close this gap honestly.

## Suggested articles

TODO(infinite-color-translator): link the related features, the prerequisites, and the natural next article a reader should open.
