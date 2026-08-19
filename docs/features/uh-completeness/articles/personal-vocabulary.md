# Personal Vocabulary

## Behaviour

`app/ui/app/src/uh/vocab.ts`'s `applyVocab(text, rules)` is a real, pure find-replace pass: literal substring matching only (never regex, since vocabulary rules are user data), applied in order so a later rule can act on an earlier rule's own replacement text. `Txt.tsx`'s `copy` and `content` channels both run every rendered string through it with `voice.vocab` -- the array `provider.tsx`'s `sanitizeVocab` produces from stored preferences, filtering to only well-formed `{find, replace}` entries.

No settings UI exists yet for a user to actually upload or manage a vocabulary JSON file, so `voice.vocab` is always the empty array in practice today (the same unwritten `material-ollama:preferences` key every row in this cluster shares) -- `applyVocab`'s own empty-array fast path (`if (rules.length === 0) return text`) is therefore what runs on every render. The transform itself is real and would apply correctly the moment a real rules array reaches it.

## Test coverage

`vocab.test.ts` proves the module's own docstring claims directly rather than by inspection: every literal occurrence of a `find` string is replaced; a `find` value containing regex metacharacters (`.`, `(`, `)`) matches only that literal substring -- both a real match and a deliberate near-miss that a regex interpretation would wrongly also match are asserted; rules apply strictly in order, so a second rule can act on the first rule's own replacement output (`"cat"` -> `"dog"` -> `"fish"`, ending at `"fish"` rather than stopping at `"dog"`); a rule with an empty `find` is skipped rather than replacing every character position; and an empty rules array returns the input completely unchanged.

## Configuration

TODO(personal-vocabulary): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(personal-vocabulary): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(personal-vocabulary): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/uh/vocab.test.ts::applies rules in order, letting a later rule act on an earlier rule's output` (plus its four sibling cases in the same file).
- Built-artifact proof: not yet attached -- there is no settings UI yet for this feature (see above), so no capture can show it in use.
- Capture evidence: not yet attached, for the same reason. Once the upload control this article describes as missing actually ships, a real capture of it would close this gap honestly.

## Suggested articles

TODO(personal-vocabulary): link the related features, the prerequisites, and the natural next article a reader should open.
