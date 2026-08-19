# Secret Display History

## Behaviour

`app/ui/app/src/uh/locksHistory.ts` implements the redacted mutation history for the toy-lock system: every lock create/remove/unlock/failed-attempt/ladder-cleared event is recorded as an append-only entry (a removal is itself a new entry, never a rewrite of an earlier one) with which lock, which action, when, and an optional short factual note -- never a credential-shaped value. The module's own header comment is explicit about scope: this is the "secret-display-history" contract as it applies to the toy-lock system's own create/edit/remove/rename mutations specifically, not the whole app's document-level local Git history, which is a separate, larger universal feature owned elsewhere and not claimed here.

Redaction is structural, not a convention a caller could accidentally violate: `locksHistory.dom.test.tsx`'s "never carries a credential-shaped field -- the input type structurally forbids it" proves the `LockHistoryEntry` type itself has no field a password, hash, salt, TOTP secret, or submitted code could be passed through -- there is no runtime filter to bypass because there is nowhere to put the value in the first place. The list carries real search: "search composes text, action filter, and date range" and "regex search is opt-in and an invalid pattern matches nothing" prove the same plain-text-default/regex-opt-in contract every other search surface in this app follows. Export is a redacted plain-text summary that names what it omits ("export is a redacted plain-text summary naming what it omits"), rather than a raw dump of the stored entries.

As with `toy-locks.md`, this history lives in the renderer's own local storage rather than the operating-system credential vault or a Git-backed local repository -- a disclosed, scoped choice matching the toy lock's own "self-imposed speed bump" framing, not the fuller universal document-history contract's Git-backed guarantee.

## Configuration

TODO(secret-display-history): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(secret-display-history): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(secret-display-history): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(secret-display-history): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(secret-display-history): link the related features, the prerequisites, and the natural next article a reader should open.
