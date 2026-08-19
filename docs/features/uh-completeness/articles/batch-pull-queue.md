# Batch Pull Queue

## Behaviour

The pull queue is real and server-owned. `app/ui/models.go` implements `POST /api/v1/models/pull` (enqueue), `GET /api/v1/models/pull/queue` (list), `GET /api/v1/models/pull/events` (a live event stream), and `POST /api/v1/models/pull/{id}/pause|resume|cancel`, backed by a `modelsManager` that persists its queue state to `modelsQueuePath()` (`%LOCALAPPDATA%\Ollama\model-pull-queue.json` on Windows/`~/Library/Application Support/Ollama/model-pull-queue.json` elsewhere) so a pull genuinely outlives the HTTP request that started it. The frontend's `PullQueueCard.tsx` renders each item's state (`Queued`/`Downloading`/`Paused`/`Failed`/`Canceled`), a live percentage and byte count while downloading, and pause/resume/cancel controls -- including the "cancel, keep partial data" vs. "cancel, delete partial data" distinction the shared instructions require for a resumable download.

One honest detail worth stating plainly: `PullQueueCard` returns `null` when there are no active items, so the card is invisible on an idle Models screen -- the `models.png` capture used elsewhere in this inventory shows the screen with an empty queue, and does not itself demonstrate the queue in action. No dedicated test (frontend or backend) exercises the pull-queue code path yet, which is why this row stays `in-progress` rather than `verified` despite the implementation being real and substantial.

## Configuration

TODO(batch-pull-queue): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(batch-pull-queue): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(batch-pull-queue): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(batch-pull-queue): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(batch-pull-queue): link the related features, the prerequisites, and the natural next article a reader should open.
