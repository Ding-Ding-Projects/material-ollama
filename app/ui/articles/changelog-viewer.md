# Changelog Viewer

## Behaviour

The Status screen's Changelog card (`app/ui/app/src/screens/status/ChangelogCard.tsx`) lists every entry from `changelogEntries.ts`'s hand-copied `CHANGELOG_ENTRIES` array -- each carrying a real, full 40-character commit SHA, an ISO author date, and the commit's exact unparaphrased subject line -- and links each one to its real GitHub commit URL (`commitUrl()`/`CHANGELOG_REPO_URL`). `changelogEntries.test.ts` proves the list is non-empty, every SHA is a genuine 40-character hex string with a real ISO date, no two entries share a SHA, the list is sorted newest-first matching `git log`'s own order, the built commit URL is correct, and the truncated 8-character short form is right. `ChangelogCard.dom.test.tsx` proves the rendered list links each entry to its real commit ("lists every real changelog entry, each linking to its real GitHub commit"), a plain-text search over subjects, an honest no-matches state, and date-range filtering (`DateRangeFilter.tsx`, backed by `dateRange.ts` and its own six-case test file covering open/closed/inverted bounds and date-only comparison of a full ISO timestamp).

The entries themselves are a static, hand-copied snapshot rather than a live query: `changelogEntries.ts`'s own doc comment states there is no changelog backend yet, and instructs a maintainer to regenerate the list by re-running `git log --no-merges --date=short --pretty=format:'%H|%ad|%s'` and pasting the output in. That snapshot has not been refreshed since it was written -- none of the seven feature-lane merge commits this evidence pass is documenting appear in it -- so the viewer today shows a real but stale history rather than the project's current one; refreshing that list is outside this evidence lane's allowed paths.

## Configuration

TODO(changelog-viewer): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(changelog-viewer): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(changelog-viewer): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(changelog-viewer): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(changelog-viewer): link the related features, the prerequisites, and the natural next article a reader should open.
