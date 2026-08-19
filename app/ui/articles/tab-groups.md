# Tab Groups

## Behaviour

`useShellTabs.ts` supports real, named, multi-tab groups: `createGroup(name)` assigns the next of six fixed `GROUP_COLORS`, `renameGroup`/`setGroupColor`/`toggleGroupCollapsed`/`removeGroup` manage them, and `moveTabToGroup` runs every mutation through `regroup()`, which physically clusters a group's members contiguously in the `tabs` array at the position of the group's first (lowest-index) member -- exactly how a real browser visually clusters a tab the instant it joins a group, while leaving ungrouped tabs and each group's own relative order otherwise untouched. `TabStrip.tsx` renders each contiguous run as one visual block (`buildBlocks`); a collapsed group renders a single summary chip instead of its members and is reached by ordinary Tab order rather than the tablist's arrow-key cycle, which only ever moves between real, individually activatable tabs (`visibleTabs` filters out anything inside a collapsed group). Both states are covered directly: `TabStrip.dom.test.tsx`'s "renders every group member as a real tab when expanded" and "collapsing a group hides its member tabs and shows one summary chip instead".

The dedicated groups manager, `TabGroupsPanel.tsx` (214 lines, wired into `AppShell.tsx`), lists every group with its own member list, its own search field, and a group-by-name search across the whole panel -- covered by `TabGroupsPanel.dom.test.tsx`'s four tests, including that filtering one group's members never touches a sibling group's members, and that collapsing a group hides its member list and search field entirely. Moving a tab into a group happens through `TabMoveToGroupPicker.tsx`, an anchored picker (never an inlined menu list) reached from the tab context menu's single "Move… into group…" entry.

Group membership now survives a restart: `useShellTabs.ts` persists `groups` and a `DestinationId -> groupId` membership map (alongside pinned state) to the `material-ollama:tab-layout` localStorage key on every change, with a guarded loader (`loadLayout`) that discards any group reference in the stored membership map that doesn't correspond to a real stored group.

## Configuration

TODO(tab-groups): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(tab-groups): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(tab-groups): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(tab-groups): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(tab-groups): link the related features, the prerequisites, and the natural next article a reader should open.
