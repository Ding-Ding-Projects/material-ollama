# Settings Explanations Provenance

## Behaviour

`app/ui/app/src/screens/Settings/SettingRow.tsx` is the one shape every control on every Settings card is built from, which is what makes the contract checkable in one place instead of by convention across six separate cards: an icon, a title, a progressive-disclosure explanation (collapsed by default behind a `lightbulb` `IconButton` toggle, `aria-expanded`/`aria-controls` wired to the real explanation region), a truthful provenance line, and the real control itself. A row's `explanation` prop is required to state what the setting actually does, not restate its `title` -- enforced by convention at each card's call site, not mechanically.

The provenance half is built by `app/ui/app/src/screens/Settings/provenance.ts`'s `isDefaultValue()`/`provenanceFact()`: because the server always returns a complete `UIPreferences` document (`store.DefaultUIPreferences()`), "the field genuinely still holds the shipped default" and "the field was never set" are indistinguishable on the wire -- so every provenance line is built from that same honest signal and names the real current value ("currently your saved value: on" / "currently the compiled-in default: en"), never the bare word "default". `SettingsScreen.dom.test.tsx`'s "distinguishes a stored value from the compiled-in default in the same render" proves this directly and precisely: within one render, the emoji row (deliberately fixtured to differ from its default) reads "your saved value: on" while the sibling language-mode row (fixtured to equal its default) reads "the compiled-in default: en" -- proving the two states are computed per-row and cannot bleed into each other.

Every card built in this lane (`GeneralCard`, `LanguageVoiceCard`, `SchoolModeCard`, `AppearanceCard`, `AdvancedCard`, `DataPrivacyCard`) uses `SettingRow` for its bindable controls; `DataPrivacyCard`'s pure-action rows (export, reset) correctly omit a `provenance` prop, matching `SettingRow`'s own documented exception for a row with no bindable value. No hand-written completeness list yet enumerates every settings element that must carry an explanation and a provenance line, the way the canonical contract's own guard-discipline note requires -- so a settings row added later without one would not currently be caught mechanically.

## Configuration

TODO(settings-explanations-provenance): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(settings-explanations-provenance): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(settings-explanations-provenance): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(settings-explanations-provenance): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(settings-explanations-provenance): link the related features, the prerequisites, and the natural next article a reader should open.
