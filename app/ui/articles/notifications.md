# Notifications

## Behaviour

`app/ui/app/src/components/md3/Snackbar.tsx`'s `SnackbarProvider`/`useSnackbar()` is the app's real non-blocking toast mechanism: `show(text, durationMs?)` queues a message (only one visible at a time; later calls queue rather than stack), and each one auto-dismisses after a fixed 4000ms unless a caller passes a different duration. Real call sites exist today -- `app/ui/app/src/screens/toolbox/RegexLabSection.tsx` confirms "Applied to the search field above." after applying a built pattern, and both `ConfigProfilesPanel.tsx` and `LaunchScreen.tsx` use the same `useSnackbar()` hook for their own confirmations.

Measured against the canonical contract, two gaps are worth stating plainly: the toast renders `fixed bottom-6 left-1/2 -translate-x-1/2` (bottom-**center**), not the required bottom-left/bottom-right screen corner; and every toast shares the same fixed 4000ms auto-dismiss regardless of severity, rather than errors and warnings persisting until the user dismisses them. There is no notification history behind this component -- see `notification-center.md` for the separate surface that does keep one.

## Configuration

TODO(notifications): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(notifications): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(notifications): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(notifications): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(notifications): link the related features, the prerequisites, and the natural next article a reader should open.
