# Guided Forms

## Behaviour

The Settings screen's cards consistently populate pickers from real, live data rather than leaving a free-text box as the only path: `LanguageVoiceCard.tsx`'s narrator voice `Select`s are built from the platform's own `speechSynthesis.getVoices()` list (`narrator-voice-selection.md`) rather than a hard-coded name; `AppearanceCard.tsx`'s theme/glyph controls offer a fixed, real set of choices instead of a color-name text field; `AdvancedCard.tsx`'s schedule kind is a `Select` over the three real supported actions, not free text a user has to guess the spelling of. Every one of these rows carries the shared `SettingRow` shape (`settings-explanations-provenance.md`), and its `disabledReason` prop is rendered *instead of* the control -- never a greyed-out control with no explanation -- naming the exact unmet condition (e.g. `preferencesLoading` renders "Saving…" in place of the control) rather than leaving a user to guess why something will not respond.

`AppearanceCard.tsx`'s seed-color field also demonstrates the "sanitized suggested default instead of a blank box" half of the contract: `SEED_PRESETS` offers eight real, named swatches a user can click directly, with the free-text hex field available alongside for anything the presets do not anticipate -- never the only path when a real list of valid values exists. `TotpAccountRow.tsx`'s delete action and `ConfirmDialog.tsx`'s destructive actions require an exact typed keyword rather than a bare confirm click, and the required keyword itself is shown in the UI rather than left for the user to guess.

Not yet found in this codebase: a native path-browse control paired with every path-shaped text field (the Models directory field in `GeneralCard.tsx` uses a webview file picker for browsing but this was not independently verified against the "typed and browsed values run through identical validation" requirement in this pass).

## Configuration

TODO(guided-forms): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(guided-forms): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(guided-forms): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(guided-forms): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(guided-forms): link the related features, the prerequisites, and the natural next article a reader should open.
