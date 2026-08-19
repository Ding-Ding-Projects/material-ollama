# Long Operation Progress

## Behaviour

The file converter's job queue (`ConvertJobRow.tsx`, `file-converter.md`) shows a job's real progress rather than a bare spinner: a real `ProgressBar` bound to `job.state` -- an indeterminate sweep (the value-less mode) while genuinely `running`, 100% once `completed`, 0% otherwise -- and the row's own doc comment states plainly that this state-driven approach is deliberate, "exactly the 'simulated progress' this build's contract forbids." Every submitting/cancel/delete/retry action on a job row is disabled while that job is `busy`, and the shared `useConvertQueue.ts` drives updates through a live SSE stream rather than polling, so the displayed state tracks the real backend job rather than a client-side guess.

The bulk job queue (`ConvertJobQueue.tsx`) reviews what a bulk cancel/remove/clear-finished action is about to affect -- a real, current "N selected" count -- before running it, matching the shared bulk-actions "say what will happen before it happens" rule for a long-running operation specifically. TOTP account creation (`built-in-authenticator.md`) and lock creation (`toy-locks.md`) both show a `loading`/`submitting` state on their own confirm buttons via the shared `Button`'s `loading` prop, disabling re-submission for the duration of the real network round trip.

Not verified in this pass: whether every long operation in the app offers a genuine cancel path mid-flight (the converter queue does, via `onCancel`; other surfaces were not audited for this specifically).

## Configuration

TODO(long-operation-progress): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(long-operation-progress): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(long-operation-progress): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(long-operation-progress): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(long-operation-progress): link the related features, the prerequisites, and the natural next article a reader should open.
