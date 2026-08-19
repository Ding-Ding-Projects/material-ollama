# Browser Tabs

## Behaviour

`app/ui/app/src/components/shell/useShellTabs.ts` (442 lines) backs a real browser-style tab strip (`app/ui/app/src/components/md3/TabStrip.tsx`, 407 lines) rendered in the app shell: opening a destination reactivates its existing tab rather than duplicating it, tabs can be pinned (`togglePin`, excluded from `closeAllUnpinned`/`closeOthers`/`closeRight` by default), closed individually or in the three standard bulk shapes ("close all unpinned", "close others", "close to the right"), and joined to a group via `moveTabToGroup`. The router's current pathname is the single source of truth for which tab is active, so tab state can never drift from the URL. Tab labels come from `destinations.ts`'s typed `DestinationLabelKey` union, resolved through the `app` dictionary namespace for real bilingual labels ("Models"/"型號" etc.).

Persistence has moved beyond the docking edge alone: `useShellTabs.ts` now also persists the set of tab groups and, per `DestinationId` (not the ephemeral per-session tab id), each destination's group membership and pinned state, under the `material-ollama:tab-layout` localStorage key -- guarded throughout so a corrupt or foreign stored value degrades to the empty layout rather than throwing during render (`loadLayout`/`isTabGroupDef`). Deliberately NOT persisted: tab open/close state and order -- a tab is re-derived from whatever destination the router actually lands on every session, exactly as before this lane.

Measured against the fuller canonical contract, one piece remains genuinely unbuilt: there is still no automatic collapse of the tab strip to icon-only at narrow widths (see `tab-docking-overflow.md`) -- only a user-triggered `railExpanded` toggle exists as a documented stand-in, because a fixed rail has no viewport to react to on its own.

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
