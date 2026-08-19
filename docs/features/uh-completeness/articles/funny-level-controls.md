# Funny Level Controls

## Behaviour

`app/ui/app/src/uh/funny.ts`'s `funny()` is a small, pure text transform: given already-localized text and a `FunnyOptions` (language, a 0-4 level, and whether emoji are on), it appends the matching entry from a fixed `SUFFIX_EN`/`SUFFIX_YUE` table (levels 0 and 1 both add nothing; 2-4 add progressively more playful suffixes such as " Nice." through " Absolutely legendary!!"). `Txt.tsx`'s `copy` channel is the one place it actually runs, and it is structurally impossible to hand it a `fact()` value -- facts render as a sibling `<Txt channel="fact">` node instead -- so "voice, never facts" holds by construction rather than by convention.

The two sliders now exist: `LanguageVoiceCard.tsx` renders `funnyEn` and `funnyYue` each as their own independent row of five `Chip`s (levels 0-4, labelled via the `funnyLevel0`..`funnyLevel4` dictionary keys), each `onClick` calling `patchPreferences({ funnyEn: level })` / `patchPreferences({ funnyYue: level })` independently -- so English and Cantonese genuinely never share a value, per the shared contract's "adjustable independently for English and for Cantonese" requirement. Both PATCH the real `/api/v1/uh/preferences` endpoint and, via `usePreferencesSync.ts`'s mirror-to-localStorage step, update `provider.tsx`'s live `Voice` (and every `channel="copy"` `<Txt>` styled by it) with no reload. `funnyEn`/`funnyYue` are clamped to 0-4 by `clampFunnyLevel` on read and default to 2 (`DEFAULT_UI_PREFERENCES.funnyEn`/`funnyYue`), not 0 as this article previously stated before the default was revised alongside the real UI.

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build (see that article's caveat and the `settings.png` capture's recorded `knownIssue`), so this is proven at the component-test level only for now.

## Test coverage

`LanguageVoiceCard.dom.test.tsx` now supplies that component-level proof: with default preferences, both rows' provenance lines read "Currently the compiled-in default: Balanced" independently; clicking the English group's "Maximum fun" chip flips the English row to "Currently your saved value: Maximum fun" while the Cantonese row stays at its compiled-in default, unmoved; and a third case does the mirror check the other direction (lowering Cantonese to "Fully serious" leaves English at its default) -- together proving the two sliders genuinely never share a value rather than one control silently driving both.

## Configuration

TODO(funny-level-controls): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(funny-level-controls): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(funny-level-controls): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/LanguageVoiceCard.dom.test.tsx::raising the English level to Maximum fun leaves the Cantonese level untouched` (plus its two sibling cases in the same file).
- Built-artifact proof: not yet attached -- `settings.png` shows only the General card; the Language & Voice card holding these two sliders sits further down the same scrolling page.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the funny-level rows would close this gap honestly.

## Suggested articles

TODO(funny-level-controls): link the related features, the prerequisites, and the natural next article a reader should open.
