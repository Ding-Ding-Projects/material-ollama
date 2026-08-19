# Local Version History

## Behaviour

The Status screen's Local History card (`app/ui/app/src/screens/status/LocalHistoryCard.tsx`, 198 lines) is a real append-only event log backed by `app_events` (schema v18), read through `GET /api/v1/history` and written through `POST /api/v1/history` (`useHistoryEvents.ts`) -- a genuine round trip through the server rather than an optimistic client-side splice, so the rendered list always matches what was actually persisted. `LocalHistoryCard.dom.test.tsx` proves the list renders real events from that endpoint, derives its action filter from the real events present rather than a hard-coded list ("derives the action filter from the real events, not a hard-coded list"), filters correctly once an action is selected, records a new checkpoint through the real POST endpoint and shows it in the list immediately, and renders an honest empty state when there is no history yet.

Deriving the filter's action set from the data itself (rather than a static enum) is exactly the discipline the shared instructions ask for -- a hand-picked list of actions would drift the moment a new action type is recorded elsewhere in the app; reading it from the real events cannot drift, because it has nothing else to agree with.

Not yet found in this codebase: diff/restore of a specific historical snapshot, revision labeling, and retention/pruning controls -- this card is a real, append-only, filterable log, but not yet the fuller "browse, diff, restore, label, prune" history manager the canonical contract also describes.

## Configuration

TODO(local-version-history): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(local-version-history): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(local-version-history): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(local-version-history): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(local-version-history): link the related features, the prerequisites, and the natural next article a reader should open.
