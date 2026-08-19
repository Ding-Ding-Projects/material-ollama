# Context Menu Shortcuts

## Behaviour

`app/ui/app/src/components/shell/TabContextMenu.tsx` (116 lines) is the tab strip's right-click menu, a hand-built sibling of the shared `@/components/md3/ContextMenu` primitive that mirrors its overlay contract exactly (paints its own surface, clamps to the viewport after mount rather than clipping, closes on Escape or an outside click, restores focus to the tab strip on close) with one addition: a right-aligned, monospace `shortcut` column shown only for the items that carry one. Each `TabContextMenuItemDef.shortcut` is set only when that exact shortcut genuinely fires in that exact context -- `AppShell.tsx`'s `buildTabMenuItems` sets it on the "Close tab" item only when the right-clicked tab is the *active* tab (`isActiveTab ? closeActiveTabShortcutLabel : undefined`), because Ctrl+W only ever closes the active tab, and showing the shortcut on a right-clicked background tab would be a lie about what pressing it actually does.

The one real, wired keyboard shortcut behind that column is Ctrl+W (⌘W on macOS, detected via `navigator.platform`/`navigator.userAgent` in `useCloseActiveTabShortcutLabel`), implemented in `useShellKeyboardShortcuts.ts`'s `useShellCloseActiveTabShortcut`: a single `window`-level `keydown` listener that fires only on Ctrl/Cmd+W with no Shift/Alt held, calling the caller's `onCloseActiveTab`. The file's own doc comment states the scope deliberately: kept to one shortcut rather than inventing several without a real, widely-recognized convention behind them.

The rest of the tab context menu's items (pin/unpin, move into group, remove from group, reorder within group, close others, close to the right) carry no `shortcut` value and so render with no shortcut column at all, honestly, rather than a placeholder dash.

## Configuration

TODO(context-menu-shortcuts): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(context-menu-shortcuts): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(context-menu-shortcuts): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(context-menu-shortcuts): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(context-menu-shortcuts): link the related features, the prerequisites, and the natural next article a reader should open.
