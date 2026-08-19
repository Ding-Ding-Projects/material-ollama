# Failure Recovery

## Behaviour

Several surfaces in this lane offer a real recovery route at the exact point a failure was discovered, rather than a bare error message with no next step. `TotpAccountRow.tsx`'s delete action shows the real failure and a retry route inline on the row itself when the delete call fails (`TotpAccountRow.dom.test.tsx`'s "shows the real failure and a retry route when the delete call fails"), rather than routing the user elsewhere to try again. `AuthenticatorSection.tsx` shows a real error banner with its own `errorRetry` button calling `refresh()` directly beside the list that failed to load. The file converter's job queue (`ConvertJobRow.tsx`, `long-operation-progress.md`) offers a real `onRetry` that re-queues a finished job's exact source/target pair through the same `createJob` path a fresh conversion uses, landing the retried job in the list immediately rather than waiting on the next SSE tick.

`app/ui/app/src/components/exports/openInEditor.ts` (`external-editor.md`) is the clearest example of the contract's honesty half: when the real recovery route (opening VS Code) is unavailable, it says so plainly (`bridge-unavailable` vs. `not-installed`, two distinct honest states) and offers the one recovery that IS always available -- copying the exact path to the clipboard -- rather than a route that looks like it works and silently does nothing.

Not yet found in this pass: a route that hands a git-push or similar failure to a local coding agent with an explicit prompt forbidding force-push/history-rewrite, which is one of the specific scenarios the canonical contract names.

## Configuration

TODO(failure-recovery): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(failure-recovery): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(failure-recovery): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(failure-recovery): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(failure-recovery): link the related features, the prerequisites, and the natural next article a reader should open.
