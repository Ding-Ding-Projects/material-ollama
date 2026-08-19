# Tab Bulk Close

## Behaviour

`app/ui/app/src/components/shell/tabBulkClose.ts` implements "close tabs containing text" and "close tabs NOT containing text" as two directions of exactly one `selectBulkClose` function sharing one match predicate (`tabQueryMatches` from `tabSearch.ts`), so the two directions can never quietly disagree about what counts as a match -- proven directly by `tabBulkClose.test.ts`'s "the inverse predicate agrees with its positive form: containing and notContaining partition the full set" and "agrees for a regex query too, including a pattern that matches nothing". An empty query closes nothing in either direction ("never runs on an empty query"), and a malformed regex pattern matches nothing rather than throwing ("an invalid regex pattern matches nothing rather than throwing").

Pinned tabs are excluded by default and reported separately rather than silently dropped -- `selectBulkClose` returns both `toClose` and `excludedPinned`, and `tabBulkClose.test.ts` ("excludes pinned matches by default and reports them separately, in both directions") proves the exclusion applies identically whichever direction is selected. The dialog itself, `TabBulkCloseDialog.tsx`, shows the exact affected count and a reviewable chip preview before anything closes (`result.toClose.map(...)`), an explicit `includePinned` switch to opt into closing pinned tabs too, and an honest count of what got excluded and why (`bulkCloseExcludedNote`) -- matching the shared bulk-actions contract's "say what will happen before it happens" rule. The confirm button is disabled whenever nothing would actually close.

Nothing about which tabs are selected for bulk close is persisted: `TabBulkCloseDialog.tsx` resets its mode, query, and `includePinned` flag every time the dialog opens (a `useEffect` keyed on `open`), so a prior bulk-close session never carries over into the next one.

## Configuration

TODO(tab-bulk-close): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(tab-bulk-close): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(tab-bulk-close): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(tab-bulk-close): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(tab-bulk-close): link the related features, the prerequisites, and the natural next article a reader should open.
