# Forge Publishing

## Behaviour

Publishing a GitHub Release is a CI/release-process action that happens entirely outside the running desktop app -- a user never sees a "publish" button inside the app itself. `.github/workflows/release.yaml`'s `publish-release` job is the real implementation: it stages built assets, runs `gh release create` (or `gh release view` first, to avoid recreating an existing tag), `gh release upload` per asset, and a final `gh release edit` to record workflow timing once the release is live.

## Configuration

TODO(forge-publishing): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(forge-publishing): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(forge-publishing): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(forge-publishing): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(forge-publishing): link the related features, the prerequisites, and the natural next article a reader should open.
