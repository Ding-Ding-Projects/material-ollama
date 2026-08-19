# Funny Level Controls

## Behaviour

`app/ui/app/src/uh/funny.ts`'s `funny()` is a small, pure text transform: given already-localized text and a `FunnyOptions` (language, a 0-4 level, and whether emoji are on), it appends the matching entry from a fixed `SUFFIX_EN`/`SUFFIX_YUE` table (levels 0 and 1 both add nothing; 2-4 add progressively more playful suffixes such as " Nice." through " Absolutely legendary!!"). `Txt.tsx`'s `copy` channel is the one place it actually runs, and it is structurally impossible to hand it a `fact()` value -- facts render as a sibling `<Txt channel="fact">` node instead -- so "voice, never facts" holds by construction rather than by convention.

There is no settings UI anywhere in the codebase that lets a user set either language's funny level; `funnyEn`/`funnyYue` are read from the same unwritten `material-ollama:preferences` localStorage key `language-modes.md` describes, clamped to 0-4 by `clampFunnyLevel`, and default to 0 (fully serious) for every user today. The engine is real and exercised by every `channel="copy"` `<Txt>` call in the app; only the two sliders themselves are missing.

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
