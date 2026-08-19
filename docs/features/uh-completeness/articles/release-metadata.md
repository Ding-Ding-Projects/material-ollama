# Release Metadata

## Behaviour

Resolving a release's version, commit, and dim-sum code name is a build-pipeline step, not an in-app feature. `scripts/release-metadata.mjs` is the real implementation, invoked at `release.yaml` line 127 to write `release-metadata.json`, which a later step also copies into the packaged app's own resources specifically so the app's (currently unbuilt) Status screen could report a real version and commit offline once that screen exists -- see `project-status.md` for why that screen itself is out of scope for this row.

## Configuration

TODO(release-metadata): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(release-metadata): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(release-metadata): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(release-metadata): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(release-metadata): link the related features, the prerequisites, and the natural next article a reader should open.
