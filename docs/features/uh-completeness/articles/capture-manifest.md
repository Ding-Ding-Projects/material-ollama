# Capture Manifest

## Behaviour

The capture harness that produces `docs/features/uh-completeness/captures/manifest.json` is a QA/evidence tool that drives the *built* application from the outside; it is not a surface the running app itself renders. `scripts/capture/drive.mjs`, `lib.mjs`, and `preflight.mjs` are the real implementation -- the same tooling that produced the nine real screenshots and the manifest this evidence pass cites as `builtArtifactProof`/`captureEvidence` for several other rows in this inventory.

## Configuration

TODO(capture-manifest): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(capture-manifest): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(capture-manifest): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(capture-manifest): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(capture-manifest): link the related features, the prerequisites, and the natural next article a reader should open.
