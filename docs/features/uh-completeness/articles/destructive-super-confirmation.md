# Destructive Super Confirmation

## Behaviour

`app/ui/app/src/components/md3/ConfirmDialog.tsx` is the destructive-action
gate currently shipped in the desktop app. It is a real, functional
`alertdialog` (via Headless UI's `Dialog`) that names the exact title and
body text the caller supplies, and it keeps its action button both
visually and functionally inert -- `disabled`, styled as
`bg-surface-highest text-outline` with a `cursor-not-allowed` state --
until the user types one exact caller-supplied keyword (`DELETE`, `REMOVE`,
`RESET`, or `CLEAR`) into a text field, compared case-insensitively after
trimming. Only once that comparison matches does the button arm (turning
`bg-error text-white`) and become clickable; clicking it while unarmed does
nothing, because `handleConfirm` returns early when `!armed`. Closing the
dialog (Cancel, the backdrop, or unmounting) resets the typed text via a
`useEffect` keyed on `open`, so a dialog reopened later never starts
pre-armed from a previous session.

This is a real, working confirmation gate today -- nothing about it is
decorative -- but it implements the *keyword-typing* pattern rather than
the fuller **two independently operated key controls plus a full-range
confirmation slider** the shared canonical contract for destructive-action
super confirmation describes (with its dramatic-but-non-blocking slider
animation, distinct completion animation, and always-available emergency
exit control). As of this article, no caller in the codebase has been
found wiring `ConfirmDialog` into an actual destructive action (a model
delete, a chat delete, a config-profile delete) yet, so both the component
and its real call sites remain open work; `models-delete` (see
`model-store.md`) and chat/config-profile deletion are the most likely
first callers once that wiring lands.

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
