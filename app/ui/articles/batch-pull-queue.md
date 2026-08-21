# Batch Pull Queue

## Behaviour

The pull queue is real and server-owned. `app/ui/models.go` implements `POST /api/v1/models/pull` (enqueue), `GET /api/v1/models/pull/queue` (list), `GET /api/v1/models/pull/events` (a live event stream), and `POST /api/v1/models/pull/{id}/pause|resume|cancel`, backed by a `modelsManager` that persists its queue state to `modelsQueuePath()` (`%LOCALAPPDATA%\Ollama\model-pull-queue.json` on Windows/`~/Library/Application Support/Ollama/model-pull-queue.json` elsewhere) so a pull genuinely outlives the HTTP request that started it. The frontend's `PullQueueCard.tsx` renders each item's state (`Queued`/`Downloading`/`Paused`/`Failed`/`Canceled`), a live percentage and byte count while downloading, and pause/resume/cancel controls -- including the "cancel, keep partial data" vs. "cancel, delete partial data" distinction the shared instructions require for a resumable download.

One honest detail worth stating plainly: `PullQueueCard` returns `null` when there are no active items, so the card is invisible on an idle Models screen -- the `models.png` capture used elsewhere in this inventory shows the screen with an empty queue, and does not itself demonstrate the queue in action. Attaching that capture as evidence for this row anyway would be exactly the over-claiming this inventory's evidence discipline exists to refuse, so it stays unattached here even though it is otherwise a genuine capture of the very screen this feature lives on.

## Test coverage

`PullQueueCard.dom.test.tsx` proves the `null`-when-empty claim above directly (rendering with only a `completed` item and asserting the container is empty), then exercises the state-driven controls: a `downloading` item shows Pause but never Resume, and clicking it calls `onPause` with that item's real id; a `paused` item shows Resume but never Pause; and opening the Cancel menu on a `failed` item and choosing "Cancel — keep partial data" calls `onCancel(id, false)` -- and specifically never calls it with `deleteData: true` from that same entry, proving the keep/delete distinction is wired to the correct menu item rather than both entries sharing one handler. No dedicated backend test exercises `models.go`'s pull-queue endpoints yet.

## Configuration

TODO(batch-pull-queue): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(batch-pull-queue): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(batch-pull-queue): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/models/PullQueueCard.dom.test.tsx::renders nothing at all once every item has completed` (plus its three sibling cases in the same file).
- Built-artifact proof: deliberately not attached -- `models.png` captures an empty queue, which is the one state this card is guaranteed not to render.
- Capture evidence: not yet attached, for the same reason. A dedicated capture taken mid-pull (with at least one active queue item on screen) would close this gap honestly.

## Suggested articles

TODO(batch-pull-queue): link the related features, the prerequisites, and the natural next article a reader should open.
