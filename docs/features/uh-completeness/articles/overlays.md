# Overlays

## Behaviour

`app/ui/app/src/components/locks/AnchoredPanel.tsx` is the one non-modal anchored overlay primitive every toy-lock surface builds on (the lock wizard, the unlock prompt, the ladder), and its own doc comment states the contract it follows explicitly: paints its own surface (`OVERLAY_SURFACE`/`OVERLAY_RADIUS`, never transparent), tracks its anchor's *live* bounding rect rather than freezing at the position it opened at, and reuses the exact viewport-clamped, Escape/outside-click-to-close mechanism `ContextMenu`/`TabContextMenu` (`context-menu-shortcuts.md`) already implement -- explicitly built as a non-modal generalization of that same shape (arbitrary children instead of a fixed menu-item list, anchored to an element instead of a static point) rather than a second, independently-drifting implementation of the same rule.

`TabContextMenu.tsx` measures its own rendered size after mount and clamps its position so it never renders off the viewport edge (`useLayoutEffect`, `Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin))`), closes on Escape or an outside click/right-click, and restores focus to the tab strip's active tab on close rather than dropping focus to `<body>`. `TabSearchField.tsx`'s regex-builder popover (`tab-discovery-searches.md`) follows the identical contract independently: its own doc comment states it is "a hand-built overlay (own surface, own radius, own elevation, viewport-bounded via a max-height + internal scroll, Escape and click-outside to close)" specifically because the shared `Popover` primitive cannot attach to a trigger it does not itself render.

Across these three independent implementations (`AnchoredPanel`, `TabContextMenu`, `TabSearchField`'s builder popover) the same four rules hold every time: paint an opaque surface, stay bounded by the viewport rather than clipping or hanging off it, close on Escape and outside click, and never cover the control that opened it. No dedicated test file exercises viewport-clamping geometry directly (jsdom does not lay out real pixel dimensions, the same limitation `tab-docking-overflow.md` notes for `TabStrip`'s own `ResizeObserver`), so this is proven by reading the implementation in this pass, not by an automated geometry assertion.

## Configuration

TODO(overlays): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(overlays): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(overlays): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(overlays): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(overlays): link the related features, the prerequisites, and the natural next article a reader should open.
