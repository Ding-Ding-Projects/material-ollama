# Dialog Emoji Toggle

## Behaviour

The emoji half of `app/ui/app/src/uh/funny.ts`'s `funny()` is real: at funny level 2 or higher, with `opts.emoji` true, it appends ` ✨` (or ` 🎉🥟` at level 4) to the already-suffixed copy string. `voice.emoji` (a plain boolean on the `Voice` object `provider.tsx` builds) is what `Txt.tsx`'s `copy` channel passes through as that `opts.emoji` flag, so the mechanism is genuinely wired end-to-end for any `channel="copy"` text.

As with `language-modes.md` and `funny-level-controls.md`, the toggle itself does not exist as a UI control anywhere yet -- `emoji` is read from the same currently-unwritten `material-ollama:preferences` localStorage key and defaults to `false` (`Boolean(raw.emoji)` on an absent key) for every user today, so no dialog in the app currently shows a decorative emoji regardless of funny level.

## Configuration

TODO(dialog-emoji-toggle): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(dialog-emoji-toggle): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(dialog-emoji-toggle): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(dialog-emoji-toggle): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(dialog-emoji-toggle): link the related features, the prerequisites, and the natural next article a reader should open.
