# Notifications

## Behaviour

`app/ui/app/src/components/md3/Snackbar.tsx`'s `SnackbarProvider`/`useSnackbar()` is the app's real non-blocking toast mechanism: `show(text, durationMs?)` queues a message (only one visible at a time; later calls queue rather than stack), and each one auto-dismisses after a fixed 4000ms unless a caller passes a different duration. Real call sites exist today -- `app/ui/app/src/screens/toolbox/RegexLabSection.tsx` confirms "Applied to the search field above." after applying a built pattern, and both `ConfigProfilesPanel.tsx` and `LaunchScreen.tsx` use the same `useSnackbar()` hook for their own confirmations.

Measured against the canonical contract, two gaps are worth stating plainly: the toast renders `fixed bottom-6 left-1/2 -translate-x-1/2` (bottom-**center**), not the required bottom-left/bottom-right screen corner; and every toast shares the same fixed 4000ms auto-dismiss regardless of severity, rather than errors and warnings persisting until the user dismisses them. There is no notification history behind this component -- see `notification-center.md` for the separate surface that does keep one.

## Test coverage

`Snackbar.dom.test.tsx` uses fake timers to prove the queueing contract stated above is real, not just documented: firing two `show()` calls back to back renders only the first message's text in the `status`/`aria-live="polite"` region, with the second message absent from the DOM entirely (not hidden -- queued); advancing past the first message's duration dequeues it and the same status region then shows the second message; and advancing past the second message's own duration removes the status region altogether, proving auto-dismiss actually clears the queue rather than leaving a stale toast behind.

## Configuration

TODO(notifications): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(notifications): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(notifications): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/components/md3/Snackbar.dom.test.tsx::shows two queued messages one at a time, not stacked together` (plus its sibling case in the same file).
- Built-artifact proof: not yet attached -- a toast is only ever on screen for the seconds after a triggering action, and none of the 12 real captures in this inventory's manifest happened to be taken while one was visible.
- Capture evidence: not yet attached, for the same reason. A dedicated capture taken immediately after an action that calls `useSnackbar().show()` (e.g. applying a regex pattern in the Toolbox) would close this gap honestly.

## Suggested articles

TODO(notifications): link the related features, the prerequisites, and the natural next article a reader should open.
