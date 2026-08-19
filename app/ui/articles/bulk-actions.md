# Bulk Actions

## Behaviour

`app/ui/app/src/components/bulk/useBulkSelection.ts` is the one selection engine every bulk-capable list in this lane is built from: click and shift-click-range selection, a keyboard equivalent, and a `scope` (`"none" | "page" | "all"`) that makes "select this page" and "select every match" two genuinely distinct, honestly-labeled actions rather than one ambiguous button -- `useBulkSelection.dom.test.ts`'s twelve tests prove range selection works in both click directions, deselecting one id out of an "all matching" selection keeps the count exact even beyond the loaded page (via an `excludedIds` set rather than re-deriving from scratch), and `invert()` produces the exact complement of the prior selection for every id in the known universe, including from a page-scoped selection carrying an exclusion. `useBulkActionRunner.ts` runs a batch honestly: it reports progress after each item settles, states a partial outcome truthfully rather than letting one real failure turn the whole batch red or green, lets an in-flight item finish before marking the rest cancelled (never aborting mid-write), and resets cleanly between runs (`useBulkActionRunner.dom.test.ts`'s six tests).

`BulkSelectableList.tsx` is the real, reusable list shell: an honest empty state, click-to-toggle, shift-click ranges, a keyboard equivalent (arrow keys roam, Space toggles), roving-tabindex (only one checkbox is a Tab stop at a time, matching the shared accessibility contract), and -- proven directly -- it renders a caller-supplied rich control per row rather than printed text, satisfying the "rich controls" contract at the row level. `BulkSelectableList.logSurfaces.dom.test.tsx` proves this generality is not theoretical: the same list genuinely multi-selects and bulk-dismisses real notification-shaped rows, and multi-selects and bulk-exports real local-version-history-shaped rows -- "a real bulk action (dismiss) actually removes the selected notifications, not just the illusion of it".

`BulkActionBar.tsx` says plainly which scope a count refers to ("on this page" vs. "across every match", never an ambiguous bare number), and offers three distinct action shapes matching the "say what will happen before it happens" contract: a plain action that runs immediately, a `{kind:"preview"}` action that shows the exact affected count and requires a confirm click (`BulkActionPreviewDialog.tsx` -- also distinguishes "will change" from merely "selected" when some items would be skipped, and says why), and a `{kind:"destructive"}` action that stays inert until the exact confirmation keyword is typed, matching the destructive-super-confirmation discipline used everywhere else in this app.

## Configuration

TODO(bulk-actions): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(bulk-actions): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(bulk-actions): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(bulk-actions): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(bulk-actions): link the related features, the prerequisites, and the natural next article a reader should open.
