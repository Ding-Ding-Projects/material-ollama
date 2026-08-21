# Blank Slate Presets

## Behaviour

`app/ui/app/src/components/locks/LockWizard.tsx` -- the anchored "Lock this element…" wizard `toy-locks.md` describes -- is this codebase's real implementation of the blank-slate presets contract: rather than opening to an empty method/duration form, it offers three named, derived starting points (`PRESETS`: "Quick password" -> password method, surface-only duration; "Session TOTP" -> TOTP method, until-app-closes duration; "Timed password" -> password method, 15-minute duration), each stating exactly what it sets before the user commits to it (`presetQuickPasswordDetail` etc.), and each fully editable and re-appliable afterward through the same form the presets populate -- applying a preset is a normal, undoable action rather than a special one-time operation, matching the contract's "the result is fully editable... applying a preset is a normal recorded action" requirement.

The wizard's own doc comment states its presets are "the blank-slate presets contract's derived starting points" -- i.e. each preset's method/duration combination is derived from the same real `LockMethod`/`LockDurationChoice` types `locksStore.ts` uses everywhere else, never an invented value dressed up as a default; a preset and the wizard's own manual controls can never disagree about what the underlying defaults mean, because they share one type.

## Test coverage

`LockWizard.dom.test.tsx` now exercises the real preset wiring: before any preset is applied, the wizard starts on the Password method radio and the "While this stays open" duration; clicking "Session code lock" flips both controls together in one click (the method radio group to "Authenticator code", the duration `<select>`'s value to `"untilClose"`), proving a preset drives both real controls rather than being a static label; and a third case manually selects TOTP first, then applies "Quick password lock" and asserts the preset genuinely overrides the manual choice outright (Password becomes checked, Authenticator code becomes unchecked, duration returns to `"surface"`) rather than merging with it or being ignored.

## Configuration

TODO(blank-slate-presets): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(blank-slate-presets): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(blank-slate-presets): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/components/locks/LockWizard.dom.test.tsx::applying the Session code preset switches both the method and duration controls together` (plus its two sibling cases in the same file).
- Built-artifact proof: not yet attached -- the wizard only opens after a "Lock this element…" context-menu action, and none of the 12 real captures in this inventory's manifest happened to be taken with it open.
- Capture evidence: not yet attached, for the same reason. A dedicated capture of the open `LockWizard` showing its three presets would close this gap honestly.

## Suggested articles

TODO(blank-slate-presets): link the related features, the prerequisites, and the natural next article a reader should open.
