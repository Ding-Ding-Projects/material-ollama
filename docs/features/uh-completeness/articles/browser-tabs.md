# Browser Tabs

## Behaviour

`app/ui/app/src/components/shell/useShellTabs.ts` backs a real browser-style tab strip (`app/ui/app/src/components/md3/TabStrip.tsx`) rendered in the app shell: opening a destination reactivates its existing tab rather than duplicating it, tabs can be pinned (`togglePin`, excluded from `closeAllUnpinned`/`closeOthers`/`closeRight` by default), closed individually or in the three standard bulk shapes ("close all unpinned", "close others", "close to the right"), and given a per-tab color via `toggleGroup` (one of four fixed `GROUP_COLORS`). The router's current pathname is the single source of truth for which tab is active, so tab state can never drift from the URL. Tab labels come from `destinations.ts`'s typed `DestinationLabelKey` union, resolved through the `app` dictionary namespace for real bilingual labels ("Models"/"型號" etc.).

Measured against the fuller canonical contract, several pieces are not yet built: there is no overflow surface when tabs exceed the available width (the strip only scrolls horizontally, via plain CSS `overflow-x-auto`); `toggleGroup`'s "grouping" assigns an individual color to one tab at a time rather than creating a real named, multi-tab group; and none of tab order, pinned state, or group membership survives a restart -- everything lives in `useState` only. The four tab-discovery searches (current strip, in-group, group-by-name, and a master search across every open tab) have not been found anywhere in the codebase either.

## Configuration

TODO(browser-tabs): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(browser-tabs): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(browser-tabs): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(browser-tabs): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(browser-tabs): link the related features, the prerequisites, and the natural next article a reader should open.
