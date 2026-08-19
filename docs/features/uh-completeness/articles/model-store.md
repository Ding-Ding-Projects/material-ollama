# Model Store

## Behaviour

The Models screen (`app/ui/app/src/screens/ModelsScreen.tsx`, mounted at `/models`, the app's default route) is a real, built screen today -- not the `PlaceholderScreen` an earlier draft of this article described. It renders the live hardware-fit card (see `hardware-fit.md`), the installed/running model list with real digests, parameter counts, and fit badges (`ModelCard.tsx`), and a "Model store" catalog section (`CatalogSection.tsx`) that is a deliberately honest placeholder for the full canonical catalog browser: it states plainly that "there is no catalog service yet" (from the frontend's point of view) and offers the one thing that is actually true today -- typing an exact model reference (e.g. `llama3.3:70b`) and queuing a real pull for it via `POST /api/v1/models/pull`.

That "no catalog yet" framing describes the frontend only. `app/ui/catalog.go` (1268 lines) is a real, substantial backend model catalog: it tries the Docker-Distribution-v2 `_catalog`/`tags/list` routes first on every refresh, falls back to scraping `ollama.com/library`'s HTML when (as verified live) those routes are unimplemented, resolves each model's exact installed size via `GET /v2/<repo>/manifests/<tag>`, caches the result at `catalogStatePath()` (`%LOCALAPPDATA%\Ollama\model-catalog.json` on Windows), and is proven by `catalog_test.go`'s `TestRunCatalogRefresh_OneFailingTagPageYieldsPartialVerdict` to report an honest "partial" completeness verdict -- never a false "complete" -- when part of a refresh fails. Nothing in the frontend (`api.ts`, the model-store hooks) calls that backend's `/api/v1/models/catalog` route family yet, so the exhaustive catalog the canonical contract describes exists and is tested on the server, but is not reachable through the app's UI today; the quick-pull-by-exact-name flow is what a user actually sees.

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
