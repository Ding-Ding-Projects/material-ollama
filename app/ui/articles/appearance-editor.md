# Appearance Editor

## Behaviour

The Settings screen's Appearance card (`app/ui/app/src/screens/Settings/AppearanceCard.tsx`, 331 lines) is a real, live-applying editor over seed color, theme mode (light/dark/auto via `SegmentedControl`), corner radius (`Slider`), app display name (see `app-display-name.md`), and a logo glyph picker (see `app-logo-customization.md`). Every control dual-writes: it calls the real `useTheme()` setters from `@/theme/ThemeProvider` -- so a seed-color pick or radius change applies to this window's own chrome immediately, with no reload -- AND PATCHes `/api/v1/uh/preferences` so the choice survives a restart. `SettingsScreen.dom.test.tsx`'s "reaches the live theme when a seed colour swatch is picked" proves this end-to-end: clicking a preset swatch button changes the real `--p` CSS custom property on `document.documentElement` before the test's `waitFor` resolves.

On first load, a one-time reconciliation effect (`reconciledRef`) pushes a previously-saved backend appearance value into `useTheme()` when it differs from whatever `ThemeProvider` already booted from its own separate localStorage copy -- closing the loop in the other direction too, so a preference saved on one launch is honored the next even before this card's own `patchPreferences` calls fire again. A full reset (`handleReset`) restores every field to `DEFAULT_APPEARANCE` and is a normal, undoable action rather than a special one-time operation.

Every row on this card, like every row on every Settings card, carries the shared `SettingRow` shape: an icon, a title, a progressive-disclosure explanation, and a truthful provenance line -- see `settings-explanations-provenance.md`.

As with the rest of the Settings screen, the real `/settings` route currently crashes into the router's default error boundary before a user can reach this card in the packaged build, so this is proven at the component-test level only for now.

## Configuration

TODO(appearance-editor): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(appearance-editor): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(appearance-editor): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(appearance-editor): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(appearance-editor): link the related features, the prerequisites, and the natural next article a reader should open.
