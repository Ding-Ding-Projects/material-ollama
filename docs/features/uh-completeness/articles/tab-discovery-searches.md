# Tab Discovery Searches

## Behaviour

All four required discovery searches (current tab strip, within one group, groups-by-name, and a master search across every open tab) are wired through exactly one shared match predicate, `tabQueryMatches`/`filterByTabQuery` in `app/ui/app/src/components/shell/tabSearch.ts` -- deliberately framework-free so it is testable without a DOM and reusable from every one of the four surfaces. Plain text is the default (case-insensitive substring), an empty query matches everything, and regex mode is an explicit opt-in that matches nothing (rather than throwing) on a pattern that is not yet valid mid-type. Each surface owns its own independent `TabSearchQuery` (text/regexMode/flags) so opening one search's builder can never leak into another's: `TabOverflowSearch.tsx` (current strip), `TabGroupsPanel.tsx` (in-group and groups-by-name, both in the same component), and `TabSearchDialog.tsx` (the master search across every open tab).

Every one of the four is built from the one shared `TabSearchField.tsx`: a plain `SearchField` for the default substring mode plus its own anchored panel holding the real `RegexBuilder` primitive, so the regex-builder contract's "every search field's own affordance" holds literally for the tab system too, not only for the dedicated Regex Lab. Typing directly into the field is always plain-text; regex only ever activates via "Apply" inside the anchored builder.

Direct test coverage today is uneven across the four: `TabGroupsPanel.dom.test.tsx` covers the in-group and groups-by-name searches directly ("filters the groups list by name", "filters one group's own member tabs without touching the other group's members", "an unmatched group-name query shows no group cards at all"), but neither `TabOverflowSearch.tsx` (current strip) nor `TabSearchDialog.tsx` (master search) has its own dedicated component test -- both inherit the shared `tabSearch.ts` predicate's correctness but are not independently exercised as rendered components.

## Configuration

TODO(tab-discovery-searches): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(tab-discovery-searches): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(tab-discovery-searches): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(tab-discovery-searches): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(tab-discovery-searches): link the related features, the prerequisites, and the natural next article a reader should open.
