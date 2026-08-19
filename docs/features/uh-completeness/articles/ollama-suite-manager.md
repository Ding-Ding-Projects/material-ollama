# Ollama Suite Manager

## Behaviour

This is the umbrella row over the whole local Ollama suite manager the app is built around; its sub-features each carry their own inventory row and article, and this row describes the whole rather than duplicating them. All API access is real and local: `app/ui/models.go`/`catalog.go`/`hardware.go` talk to Ollama's own HTTP API on `127.0.0.1` through this app's privileged main-process boundary, never an unofficial proxy or a cloud model service.

The **Model Store** (`model-store.md`, verified) and **Hardware Fit** (`hardware-fit.md`, verified) are both shipped and captured working in the packaged build (`models.png`): a real, refreshable catalog with a partial-failure verdict (`TestRunCatalogRefresh_OneFailingTagPageYieldsPartialVerdict`) combined with a real, evidence-backed fit verdict computed from measured system RAM/VRAM/free disk rather than guessed from a model's name (`TestComputeFitVerdict_FitsFreeVRAMYieldsRunsWell`). The **batch pull queue** (`batch-pull-queue.md`) exists as a real, cancellable download queue backed by `app/ui/models.go`, though a genuinely empty queue renders no card at all -- so its own row cannot yet claim a positive capture showing it in a populated state. **Local chat sessions** (`local-chat-sessions.md`) persist through `app/store/database.go` with cascading deletion proven by `TestChatDeletionWithCascade`. **Harness profiles** (`harness-profiles.md`) launch real external coding-agent CLIs (Codex, and others) through `app/ui/codex.go`, allowlisted rather than accepting an arbitrary shell command.

Not yet part of this suite: the Model Store's exhaustive multi-page catalog completeness verdict, a batch pull cart with per-item byte-accurate progress, and a chat session's full redacted export are canonical contract pieces this pass found no evidence for and does not claim.

## Configuration

TODO(ollama-suite-manager): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(ollama-suite-manager): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(ollama-suite-manager): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(ollama-suite-manager): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(ollama-suite-manager): link the related features, the prerequisites, and the natural next article a reader should open.
