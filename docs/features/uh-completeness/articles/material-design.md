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
shell (Models/Launch/Toolbox/DevTools/Status/Docs, plus the command
palette, dialogs, and context menus) renders through this one shared
primitive set, so a token change in one place -- a new seed color, a
density change, a corner-radius change -- propagates to literally every
rendered control at once rather than requiring a per-screen sweep. As of
this article, the primitive library itself, the token layer, and the
runtime `applyScheme()` mechanism exist and are wired into shipped screens;
the separate per-element appearance *editor* the shared canonical contract
also requires (right-click "Edit appearance...", the infinite color
picker/translator, Word-depth typography controls, named presets with
export/import) is its own inventory row -- see `appearance-editor.md` --
and is not yet built.

## Configuration

TODO(material-design): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(material-design): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(material-design): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(material-design): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(material-design): link the related features, the prerequisites, and the natural next article a reader should open.
