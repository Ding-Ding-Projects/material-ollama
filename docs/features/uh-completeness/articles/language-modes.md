# Language Modes

## Behaviour

`app/ui/app/src/uh/provider.tsx`'s `UhProvider`/`useUh()` and `t.ts`'s `useT()` are the real consumption engine behind every piece of dictionary-backed copy in the app: `buildVoice()` reads a `langMode` of `"en"`/`"yue"`/`"both"` from a stored-preferences object, and `useT`'s bilingual branch returns `en + " · " + yue` for `"both"` exactly as the shared contract specifies. Every `<Txt ns="..." k="..." />` call site across the app (dozens of them, per the `k="..."` greps used elsewhere in this inventory pass) already flows through this same pipeline, so a change to `langMode` would immediately re-render every one of those strings correctly.

The writer half is now real: the Settings screen's Language & Voice card (`app/ui/app/src/screens/Settings/LanguageVoiceCard.tsx`) renders a `Select` bound to `preferences.langMode` with the three canonical options (English/Cantonese/Both), and its `onChange` calls `patchPreferences({ langMode: value })`. That flows through `usePreferencesSync.ts`'s `usePreferencesSync()`, which PATCHes the real `app/ui/uh.go` `uhPatchPreferences` endpoint (backed by `app/store/store.go`'s `UIPreferences.LangMode` column, validated against a `legalLangModes` allowlist) and, on every successful fetch or patch, mirrors the result into `provider.tsx`'s own `material-ollama:preferences` localStorage key and fires `PREFERENCES_CHANGED_EVENT` -- the exact event `provider.tsx` already listened for and the exact key it already read, closing the loop this article previously described as inert. `SettingsScreen.dom.test.tsx`'s "distinguishes a stored value from the compiled-in default in the same render" proves the Language mode row's own provenance line correctly reads "the compiled-in default: en" for an unmodified preferences document, and `uh/localization.dom.test.tsx`'s "picks up a live preference change with no reload, via PREFERENCES_CHANGED_EVENT" proves the read side of that same loop end-to-end.

One caveat: the real `/settings` route in the packaged desktop build currently crashes into TanStack Router's default error boundary (`Cannot read properties of null (reading 'length')`, reproduced 4/4 in an independent recapture pass) before a user can actually reach this card, so this is verified at the component-test level but not yet demonstrated working in the running application; see the `settings.png` capture's recorded `knownIssue`.

## Configuration

TODO(language-modes): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(language-modes): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(language-modes): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(language-modes): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(language-modes): link the related features, the prerequisites, and the natural next article a reader should open.
