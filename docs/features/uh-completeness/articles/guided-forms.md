# Guided Forms

## Behaviour

The Settings screen's cards consistently populate pickers from real, live data rather than leaving a free-text box as the only path: `LanguageVoiceCard.tsx`'s narrator voice `Select`s are built from the platform's own `speechSynthesis.getVoices()` list (`narrator-voice-selection.md`) rather than a hard-coded name; `AppearanceCard.tsx`'s theme/glyph controls offer a fixed, real set of choices instead of a color-name text field; `AdvancedCard.tsx`'s schedule kind is a `Select` over the three real supported actions, not free text a user has to guess the spelling of. Every one of these rows carries the shared `SettingRow` shape (`settings-explanations-provenance.md`), and its `disabledReason` prop is rendered *instead of* the control -- never a greyed-out control with no explanation -- naming the exact unmet condition (e.g. `preferencesLoading` renders "Saving…" in place of the control) rather than leaving a user to guess why something will not respond.

`AppearanceCard.tsx`'s seed-color field also demonstrates the "sanitized suggested default instead of a blank box" half of the contract: `SEED_PRESETS` offers eight real, named swatches a user can click directly, with the free-text hex field available alongside for anything the presets do not anticipate -- never the only path when a real list of valid values exists. `TotpAccountRow.tsx`'s delete action and `ConfirmDialog.tsx`'s destructive actions require an exact typed keyword rather than a bare confirm click, and the required keyword itself is shown in the UI rather than left for the user to guess.

The Models directory field in `GeneralCard.tsx` (visible in `settings.png`, this inventory's real Settings capture) pairs its text box with a real "Browse…" button whose `handleBrowse` calls `window.webview.selectModelsDirectory()` -- a genuine native OS folder picker, not a decorative button -- and both the typed path and the browsed one flow through the identical `change("Models", directory)` write path into the same settings mutation, so neither route is trusted more than the other. Both the field and its Browse control are built from `SettingRow`, the exact same shared shape every other Settings row uses.

Not yet found in this codebase: a native path-browse control paired with every OTHER path-shaped text field in the app beyond this one Models-directory case.

## Configuration

TODO(guided-forms): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(guided-forms): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(guided-forms): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Test coverage

`SettingRow.dom.test.tsx` renders the shared row shape directly (not through a specific card, since every card builds on it identically) and asserts: with no `disabledReason`, the real control renders and the explanation stays collapsed by default; with a `disabledReason` set, the control is entirely absent from the DOM and the named unmet condition renders in its place under the "Unavailable —" prefix, proving the substitution is real rather than a greyed-out control with no text; and clicking the lightbulb toggle expands the previously-hidden explanation and flips `aria-expanded` to `"true"`.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/SettingRow.dom.test.tsx::substitutes the real control with the named unmet condition when disabled, rather than a bare disabled control` (plus its two sibling cases in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.8.artifact.sha256`.
- Capture evidence: `docs/features/uh-completeness/captures/images/settings.png`, showing the real "Model location" row built on `SettingRow` with its native "Browse…" control beside the text field.

## Suggested articles

TODO(guided-forms): link the related features, the prerequisites, and the natural next article a reader should open.
