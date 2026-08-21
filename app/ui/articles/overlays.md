# Overlays

## Behaviour

`app/ui/app/src/components/locks/AnchoredPanel.tsx` is the one non-modal anchored overlay primitive every toy-lock surface builds on (the lock wizard, the unlock prompt, the ladder), and its own doc comment states the contract it follows explicitly: paints its own surface (`OVERLAY_SURFACE`/`OVERLAY_RADIUS`, never transparent), tracks its anchor's *live* bounding rect rather than freezing at the position it opened at, and reuses the exact viewport-clamped, Escape/outside-click-to-close mechanism `ContextMenu`/`TabContextMenu` (`context-menu-shortcuts.md`) already implement -- explicitly built as a non-modal generalization of that same shape (arbitrary children instead of a fixed menu-item list, anchored to an element instead of a static point) rather than a second, independently-drifting implementation of the same rule.

`TabContextMenu.tsx` measures its own rendered size after mount and clamps its position so it never renders off the viewport edge (`useLayoutEffect`, `Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))`), closes on Escape or an outside click/right-click, and restores focus to the tab strip's active tab on close rather than dropping focus to `<body>`. `TabSearchField.tsx`'s regex-builder popover (`tab-discovery-searches.md`) follows the identical contract independently: its own doc comment states it is "a hand-built overlay (own surface, own radius, own elevation, viewport-bounded via a max-height + internal scroll, Escape and click-outside to close)" specifically because the shared `Popover` primitive cannot attach to a trigger it does not itself render.

Across these three independent implementations (`AnchoredPanel`, `TabContextMenu`, `TabSearchField`'s builder popover) the same four rules hold every time: paint an opaque surface, stay bounded by the viewport rather than clipping or hanging off it, close on Escape and outside click, and never cover the control that opened it.

## Test coverage

jsdom does not lay out real pixel dimensions on its own, but `getBoundingClientRect` can be stubbed to return fixed values -- `AnchoredPanel.dom.test.tsx` does exactly that (stubbing both the panel's own rect and its anchor's rect, plus `window.innerWidth`/`innerHeight`) to exercise the real clamping arithmetic in `AnchoredPanel.tsx`, not a re-implementation of it. It asserts: the panel renders nothing at all while `open` is false; with an anchor positioned so an unclamped panel would overflow a stubbed 400x300 viewport, the rendered panel's computed `left`/`top` land inside the viewport with the documented 8px margin on every edge; a click on the panel's own content never triggers `onClose`, while Escape and a click on the backdrop layer behind it each do, exactly once; and the panel carries `aria-modal="false"` and the caller's own `aria-label`. `TabContextMenu.tsx`'s own clamping and `TabSearchField.tsx`'s builder popover remain unverified by an automated geometry assertion -- see `tab-docking-overflow.md`'s note on the same jsdom limitation for `TabStrip`'s `ResizeObserver`.

## Configuration

TODO(overlays): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(overlays): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(overlays): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/components/locks/AnchoredPanel.dom.test.tsx::clamps its position inside the viewport rather than opening off-screen` (plus its three sibling cases in the same file).
- Built-artifact proof: not yet attached -- every anchored overlay this article describes is closed by default, and none of the 12 real captures in this inventory's manifest happened to be taken with one open (the `command-palette.png` capture shows a *different* overlay, the modal `CommandPalette` dialog, which does not build on `AnchoredPanel`).
- Capture evidence: not yet attached, for the same reason. A dedicated capture of an open `AnchoredPanel`-based surface (e.g. the lock wizard) would close this gap honestly.

## Suggested articles

TODO(overlays): link the related features, the prerequisites, and the natural next article a reader should open.
