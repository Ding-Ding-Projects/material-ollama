# Material Design

## Behaviour

The desktop app's whole visual language is built from one Material Design 3
token set, not a mix of hand-picked colors and framework defaults. Every raw
`--p` (primary), `--sec`/`--sec-c`, `--ter`/`--ter-c`, `--err`/`--err-c`,
`--bg`, `--c-lowest` through `--c-highest` (the surface tier ladder),
`--on-s`/`--on-sv`, and `--outline`/`--outline-v` custom property is declared
exactly once, in `app/ui/app/src/styles/tokens.css`, as an unlayered `:root`
fallback. Every component-level primitive under `app/ui/app/src/components/
md3/` -- `Button`, `IconButton`, `Surface`, `Chip`, `Switch`, `Slider`,
`TextField`, `SearchField`, `Select`, `ListItem`, `Dialog`, `ConfirmDialog`,
`Menu`, `ContextMenu`, `Popover`, `Snackbar`, `ProgressBar`, `TabStrip`,
`NavigationRail`, `Badge` -- reads those tokens indirectly through Tailwind
v4 CSS-first utility classes declared in `tokens.ts` (`TONE_CLASSES`,
`SURFACE_TIER_CLASSES`, `RADIUS_CLASSES`, `ELEVATION_CLASSES`,
`BUTTON_VARIANT_CLASSES`, and the rest), never a hard-coded hex value or a
template-literal-built class name.

At runtime, a function the codebase calls `applyScheme()` overwrites every
one of those custom properties directly on `document.documentElement` via
`style.setProperty`, which is what lets the seed color, accent, and
light/dark scheme change live without a page reload -- the CSS file's
declarations are only the pre-JS fallback paint. Shape follows the same
token discipline: `rounded-token` maps to the user's customizable corner
radius rather than a fixed Tailwind radius utility, and elevation is a
named two-step scale (`elev-1`, `elev-2`) layered on top of the five-tier
surface-tone ladder (`lowest` -> `low` -> `base` -> `high` -> `highest`)
rather than raw box-shadow values scattered per component.

The result a user actually sees: every screen currently wired into the app
shell (Models/Launch/Toolbox/DevTools/Status/Docs/Settings, plus the command
palette, tab context menu, dialogs, and toy-lock surfaces) renders through
this one shared primitive set, so a token change in one place -- a new seed
color, a density change, a corner-radius change -- propagates to literally
every rendered control at once rather than requiring a per-screen sweep. As
of this update, the primitive library, the token layer, and the runtime
`applyScheme()` mechanism exist and are wired into every shipped screen
including the new ones; a genuine seed-color/theme-mode/radius *editor*
(the Settings screen's Appearance card, see `appearance-editor.md`) now
also exists and dual-writes into `applyScheme()` live. What remains
missing from the fuller canonical contract is the *per-element* editor --
right-click "Edit appearance..." on an arbitrary rendered element, Word-
depth typography controls, and named presets with export/import -- which
is still not built anywhere in the codebase.

## Test coverage

`applyScheme.dom.test.tsx` runs against a real jsdom `HTMLElement` (never `document`, per `applyScheme.ts`'s own header comment about staying out of the node-environment unit tests for the OKLCH maths) and asserts: every custom property `buildScheme()` computes for a seed color is genuinely written onto the element's inline style, matching value for value; two visually distinct seed colors (violet `#6750a4` vs. green `#006e1c`) produce different `--p` values, proving the seed genuinely drives the scheme rather than the app rendering a fixed palette regardless of user choice; and light vs. dark mode for the *same* seed produces a different `--p`, proving the mode switch is real.

## Configuration

TODO(material-design): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(material-design): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(material-design): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/theme/applyScheme.dom.test.tsx::produces a genuinely different primary token for a different seed color` (plus its two sibling cases in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.0.artifact.sha256`.
- Capture evidence: `docs/features/uh-completeness/captures/images/models.png`, showing the shared M3 primitive set (surfaces, badges, buttons, tab rail) rendered consistently across the Models screen.

## Suggested articles

TODO(material-design): link the related features, the prerequisites, and the natural next article a reader should open.
