# Funny Level Controls

## Behaviour

`app/ui/app/src/uh/funny.ts`'s `funny()` is a small, pure text transform: given already-localized text and a `FunnyOptions` (language, a 0-4 level, and whether emoji are on), it appends the matching entry from a fixed `SUFFIX_EN`/`SUFFIX_YUE` table (levels 0 and 1 both add nothing; 2-4 add progressively more playful suffixes such as " Nice." through " Absolutely legendary!!"). `Txt.tsx`'s `copy` channel is the one place it actually runs, and it is structurally impossible to hand it a `fact()` value -- facts render as a sibling `<Txt channel="fact">` node instead -- so "voice, never facts" holds by construction rather than by convention.

The two sliders now exist: `LanguageVoiceCard.tsx` renders `funnyEn` and `funnyYue` each as their own independent row of five `Chip`s (levels 0-4, labelled via the `funnyLevel0`..`funnyLevel4` dictionary keys), each `onClick` calling `patchPreferences({ funnyEn: level })` / `patchPreferences({ funnyYue: level })` independently -- so English and Cantonese genuinely never share a value, per the shared contract's "adjustable independently for English and for Cantonese" requirement. Both PATCH the real `/api/v1/uh/preferences` endpoint and, via `usePreferencesSync.ts`'s mirror-to-localStorage step, update `provider.tsx`'s live `Voice` (and every `channel="copy"` `<Txt>` styled by it) with no reload. `funnyEn`/`funnyYue` are clamped to 0-4 by `clampFunnyLevel` on read and default to 2 (`DEFAULT_UI_PREFERENCES.funnyEn`/`funnyYue`), not 0 as this article previously stated before the default was revised alongside the real UI.

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build (see that article's caveat and the `settings.png` capture's recorded `knownIssue`), so this is proven at the component-test level only for now.

## Configuration

TODO(funny-level-controls): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(funny-level-controls): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(funny-level-controls): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(funny-level-controls): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(funny-level-controls): link the related features, the prerequisites, and the natural next article a reader should open.
