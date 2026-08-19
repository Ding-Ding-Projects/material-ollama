# Model Store

## Behaviour

The model store's server side is real and already routed independently of
the general Ollama reverse proxy: `GET /api/v1/models/installed`,
`GET /api/v1/models/running`, `POST /api/v1/models/pull`,
`GET /api/v1/models/pull/queue`, `GET /api/v1/models/pull/events`,
`POST /api/v1/models/pull/{id}/pause|resume|cancel`, and
`POST /api/v1/models/delete` are all implemented in `app/ui/models.go` and
registered in `app/ui/ui.go`'s `Handler()`. That file's own header comment
records why these are deliberately their own route set rather than proxy
allow-list additions: a proxied `DELETE /api/delete` would hand the
renderer unmediated model deletion with no server-side confirmation gate; a
pull has to outlive the HTTP request that started it, which a proxied
stream cannot do once the tab navigates or reloads; and the pull queue's
ordering, concurrency, and pause/resume/cancel state has to live on the
server, not be reconstructed per browser tab. `app/ui/hardware.go` supplies
the companion hardware snapshot endpoint (`GET /api/v1/hardware`) --
system RAM, detected GPU(s), and VRAM, each reported through a `ByteValue`
that carries an explicit confidence level (`measured`/`parsed`/`assumed`/
`unknown`) rather than silently coercing an unknown quantity to zero, which
is what the hardware-fit verdicts described in `hardware-fit.md` are built
from.

On the frontend, `src/hooks/useModels.ts` already calls the installed-model
endpoint through TanStack Query, merges it with featured/recommended
models, filters cloud models when cloud is disabled, and supports a search
query -- but `src/screens/ModelsScreen.tsx` (the screen actually mounted at
the app's default route) is still the shared `PlaceholderScreen`, whose own
comment says explicitly that "a real Model Store lane already has a
backend... this screen only claims the route and the honest not-built-yet
state; building the real UI is that lane's job." So today: hitting
`/api/v1/models/installed` or `/api/v1/hardware` directly returns real,
non-mocked data, and the query-layer plumbing to consume it exists, but no
shipped screen renders the catalog, the batch-pull cart, the per-item
progress, or the hardware-fit verdict a user would actually see.

## Configuration

TODO(model-store): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(model-store): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(model-store): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(model-store): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(model-store): link the related features, the prerequisites, and the natural next article a reader should open.
