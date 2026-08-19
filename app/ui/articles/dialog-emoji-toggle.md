# Dialog Emoji Toggle

## Behaviour

The emoji half of `app/ui/app/src/uh/funny.ts`'s `funny()` is real: at funny level 2 or higher, with `opts.emoji` true, it appends ` ✨` (or ` 🎉🥟` at level 4) to the already-suffixed copy string. `voice.emoji` (a plain boolean on the `Voice` object `provider.tsx` builds) is what `Txt.tsx`'s `copy` channel passes through as that `opts.emoji` flag, so the mechanism is genuinely wired end-to-end for any `channel="copy"` text.

The toggle itself now exists: the Settings screen's General card (`app/ui/app/src/screens/Settings/GeneralCard.tsx`) renders a `Switch` bound to `preferences.emoji` under the label "Show emojis in dialogs" (`emojiLabel`/`emojiToggleLabel`), whose `onChange` calls `patchPreferences({ emoji: checked })` -- PATCHing the real `/api/v1/uh/preferences` endpoint and, via the same mirror-to-localStorage step `language-modes.md` describes, updating `provider.tsx`'s live `Voice.emoji` with no reload. `emoji` still defaults to `false` (`DEFAULT_UI_PREFERENCES.emoji`). This exact row is what `SettingsScreen.dom.test.tsx`'s "distinguishes a stored value from the compiled-in default in the same render" test directly asserts on: with a fixture where `emoji: true` (deliberately differing from the default), the "Show emojis in dialogs" row's own provenance line reads "currently your saved value: on".

As with `language-modes.md`, the real `/settings` route currently crashes before a user can reach this card in the packaged build (see that article's caveat), so this is proven at the component-test level only for now.

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
