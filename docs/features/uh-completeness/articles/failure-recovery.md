# Failure Recovery

## Behaviour

Several surfaces in this lane offer a real recovery route at the exact point a failure was discovered, rather than a bare error message with no next step. `TotpAccountRow.tsx`'s delete action shows the real failure and a retry route inline on the row itself when the delete call fails (`TotpAccountRow.dom.test.tsx`'s "shows the real failure and a retry route when the delete call fails"), rather than routing the user elsewhere to try again. `AuthenticatorSection.tsx` shows a real error banner with its own `errorRetry` button calling `refresh()` directly beside the list that failed to load. The file converter's job queue (`ConvertJobRow.tsx`, `long-operation-progress.md`) offers a real `onRetry` that re-queues a finished job's exact source/target pair through the same `createJob` path a fresh conversion uses, landing the retried job in the list immediately rather than waiting on the next SSE tick.

`app/ui/app/src/components/exports/openInEditor.ts` (`external-editor.md`) is the clearest example of the contract's honesty half: when the real recovery route (opening VS Code) is unavailable, it says so plainly (`bridge-unavailable` vs. `not-installed`, two distinct honest states) and offers the one recovery that IS always available -- copying the exact path to the clipboard -- rather than a route that looks like it works and silently does nothing.

### The guided-recovery contract: `RecoveryNotice` and its five real states

`app/ui/app/src/components/recovery/RecoveryNotice.tsx` is the one reusable "something the user needs is missing, stopped, unhealthy, or offline" surface every screen renders in place of a bare fetch error or a spinner that resolves to nothing -- this is the piece of the canonical Ollama-suite-manager contract ("Missing, stopped, unhealthy, incompatible, or offline Ollama states provide ... an in-app troubleshooter") that had no implementation at all before this lane; the `ollama-manager` suite-inventory row named it explicitly as the still-missing half of that feature. It carries, always: a machine-readable `state` id (rendered as `data-testid="recovery-notice-<state>"`, never shown to the user), a plain-language `title`/`explanation`, the server's own `reason`/`nextStep` facts rendered verbatim through `fact()` when the backend supplies them, and a `Retry` button wired to a real `onRetry` handler -- never a decorative one. An optional `action` renders a second, distinct control for a real in-app fix beyond "check again" (e.g. "Refresh catalog", "Probe GPU passthrough"). Severity is `error` (the design's real `error-container` tone, `role="alert"`) or `warning`/`info` (the same neutral `surface-high` tone `HardwareFitBar`/`CatalogSection` already use for a soft heads-up, `role="status"`) -- color never carries the only signal, and no notice anywhere in this lane links out to a web search.

Five state-specific hooks and notices are built on it, each against a real, already-registered backend route that had zero frontend consumer before this lane:

- **Ollama runtime not responding** (`OllamaHealthNotice.tsx` / `useOllamaHealthRecovery.ts`) checks `GET /api/version`, which `app/ui/ui.go` proxies straight through to the real Ollama server rather than answering from this app's own process -- so a "down" result means Ollama itself isn't responding. `fetchHealth()` (already in `src/api.ts`) supplies the check; this hook adds the checking/retrying state the notice needs and re-checks on demand.
- **No compute device detected yet** (`NoGpuNotice.tsx` / `useHardwareRecheck.ts`) renders only once a real `GET /api/v1/hardware` snapshot has loaded with an empty `devices` array -- never while it's still `undefined` (that's "haven't asked yet", not "found nothing"). Its copy deliberately never spells out the phrase "no GPU" anywhere, including inside a clarifying negation, so it can only ever say "not detected yet" -- exactly the honesty rule `hardware.go`'s own `HardwareDevice` doc comment states, and the exact wording a test asserts.
- **Docker / container GPU passthrough** (`DockerGpuNotice.tsx` / `useDockerGpuRecovery.ts`, wired into the Status screen) reads `GET /api/v1/docker/status` and offers a real "Probe GPU passthrough" action calling `POST /api/v1/docker/probe-gpu` -- both routes `app/ui/docker.go` already implemented with no UI at all. The notice renders Docker's own `Reason`/`NextStep` fields verbatim rather than re-describing WSL2/toolkit detection with parallel copy that could drift from what the backend actually determined.
- **Model catalog never fetched / incomplete** (`CatalogRecoveryNotice.tsx` / `useCatalogRecovery.ts`) reads `GET /api/v1/models/catalog/status` and offers a real "Refresh catalog" action calling `POST /api/v1/models/catalog/refresh`, then re-polls status once the refresh call returns. `CatalogSection.tsx`'s static "there is no catalog" copy predates this endpoint; this notice is silent once the verdict is `complete` and shows the server's own `reason` otherwise, whatever the verdict.
- **Pull-queue disk-space preflight refusal** (`PullRecoveryNotice.tsx` / `usePullRecovery.ts`) stands in for `useModelStore`'s `store.pull` on the Models screen's quick-pull control, calling the exact same real `POST /api/v1/models/pull` `enqueueModelPull` uses. A refusal whose text matches `models.go`'s real disk-space-floor shape ("needs at least ... free") gets disk-specific title/explanation; any other refusal gets generic "couldn't queue this pull" copy -- either way the server's exact message is shown verbatim via `reason`, never re-derived. Retry re-attempts the same model; a successful pull still appears in the live queue through the existing SSE stream regardless of which caller enqueued it.

`ModelsScreen.tsx` renders the Ollama-health, no-GPU, catalog, and pull/disk notices; `StatusScreen.tsx` renders the Docker/GPU notice -- the brief's "at minimum" requirement for both screens.

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
