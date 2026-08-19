# Accessibility

## Behaviour

`app/ui/app/src/uh/` carries four small, independently reusable, directly-tested accessibility primitives this lane's own surfaces (Toolbox, Status, Locks, Exports, Bulk) build on top of. `a11yFocusTrap.ts`'s focus trap hook exists specifically for the overlays this lane owns that are not built on Headless UI's `<Dialog>` (which already provides trapping for the shared `md3/` primitives this lane cannot edit) -- `a11yFocusTrap.dom.test.tsx`'s five tests prove focus lands inside the container on activation, Tab wraps from the last focusable element back to the first, Shift+Tab wraps from the first back to the last, middle items cycle normally, and focus returns to the trigger element on deactivation.

`a11yLayoutAudit.ts` is a real, runnable layout audit rather than a manual checklist: two independent checks (page-level -- nothing forces `<html>`/`<body>` wider than the viewport -- and element-level -- any element whose content is genuinely wider than its box has its own `overflow-x` handling it) proven by `a11yLayoutAudit.dom.test.tsx`'s eight cases, including that a table which scrolls in its own container is correctly found clean, that `overflow-x: hidden` still counts as a violation (clipping is not the same as scrolling), and that the page-level check flips true the moment the document genuinely grows wider than the viewport. `a11yScrollRegion.tsx`'s `WideContentScroller` is the shipped fix the audit's own header comment names: it bounds itself to a real max-height and scrolls (`overflow-y: auto`) rather than clipping or growing unbounded, derives that bound live from a short viewport rather than a fixed constant, carries a real accessible region name from its caller, and is directly proven to be exactly what makes `a11yLayoutAudit` stop flagging a violation once it's used ("is exactly what a11yLayoutAudit flags as a violation when it's NOT used").

`a11yRovingTabindex.ts` backs every arrow-key-navigable list and toolbar this lane ships (bulk-selectable lists, the tab groups panel): only the active item carries `tabIndex={0}`, every other item `-1`; arrow keys move both the tab stop and real DOM focus in the caller's chosen orientation (vertical or horizontal); Home/End jump to the first/last item; clicking an item makes it the new tab stop exactly as arrow navigation would; and the active index is reported back through `onActiveIndexChange` so a caller can stay in sync -- all seven cases in `a11yRovingTabindex.dom.test.tsx`.

## Configuration

TODO(accessibility): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(accessibility): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(accessibility): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(accessibility): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(accessibility): link the related features, the prerequisites, and the natural next article a reader should open.
