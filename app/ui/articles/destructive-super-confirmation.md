# Destructive Super Confirmation

## Behaviour

`app/ui/app/src/components/md3/ConfirmDialog.tsx` is the destructive-action gate shipped in the desktop app today. It is a real, functional `alertdialog` (via Headless UI's `Dialog`) that names the exact title and body text the caller supplies, and keeps its action button both visually and functionally inert -- `disabled`, styled `bg-surface-highest text-outline` with `cursor-not-allowed` -- until the user types one exact caller-supplied keyword (`DELETE`, `REMOVE`, `RESET`, or `CLEAR`) into a text field, compared case-insensitively after trimming; only then does the button arm (`bg-error text-white`) and become clickable. Closing the dialog resets the typed text via a `useEffect` keyed on `open`, so a reopened dialog never starts pre-armed.

This is no longer an unwired component: `app/ui/app/src/screens/models/ModelCard.tsx` (L85-L101) is a real caller, wiring `ConfirmDialog` into the model-delete flow with the `removeModelTitle`/`removeModelBodyIntro`/`removeModelBodyWarning` dictionary keys and `keyword="REMOVE"`. What is still missing against the fuller canonical contract is the **two independently operated key controls plus a full-range confirmation slider** (with its dramatic-but-non-blocking animation, a distinct completion animation, and an always-available emergency-exit control) -- today's gate is the simpler type-the-exact-keyword pattern, and its own "Cancel"/"Type {keyword} to confirm" strings are hardcoded English rather than routed through the `uh` dictionary.

## Configuration

TODO(destructive-super-confirmation): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(destructive-super-confirmation): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(destructive-super-confirmation): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(destructive-super-confirmation): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(destructive-super-confirmation): link the related features, the prerequisites, and the natural next article a reader should open.
