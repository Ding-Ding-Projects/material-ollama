# Personal Vocabulary

## Behaviour

`app/ui/app/src/uh/vocab.ts`'s `applyVocab(text, rules)` is a real, pure find-replace pass: literal substring matching only (never regex, since vocabulary rules are user data), applied in order so a later rule can act on an earlier rule's own replacement text. `Txt.tsx`'s `copy` and `content` channels both run every rendered string through it with `voice.vocab` -- the array `provider.tsx`'s `sanitizeVocab` produces from stored preferences, filtering to only well-formed `{find, replace}` entries.

No settings UI exists yet for a user to actually upload or manage a vocabulary JSON file, so `voice.vocab` is always the empty array in practice today (the same unwritten `material-ollama:preferences` key every row in this cluster shares) -- `applyVocab`'s own empty-array fast path (`if (rules.length === 0) return text`) is therefore what runs on every render. The transform itself is real, tested by inspection against the module's own docstring examples, and would apply correctly the moment a real rules array reaches it.

## Configuration

TODO(personal-vocabulary): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(personal-vocabulary): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(personal-vocabulary): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(personal-vocabulary): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(personal-vocabulary): link the related features, the prerequisites, and the natural next article a reader should open.
