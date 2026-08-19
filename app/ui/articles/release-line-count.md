# Release Line Count

## Behaviour

Reporting the project's own line count is a release-notes concern, not an application feature -- there is no screen in the app that would show it. `scripts/count-lines.mjs` is the real, committed counter; the release workflow runs it and writes its output to `dist/line-count.md`, which the publish job later reads back in to build the GitHub Release body (see `forge-publishing.md`).

## Configuration

TODO(release-line-count): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(release-line-count): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(release-line-count): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(release-line-count): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(release-line-count): link the related features, the prerequisites, and the natural next article a reader should open.
