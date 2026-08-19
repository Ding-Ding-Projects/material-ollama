# Responsive Layout And Sizing

## Behaviour

Within a bounded region, wide-content containment is real and directly proven: `a11yLayoutAudit.ts`/`a11yScrollRegion.tsx` (`accessibility.md`) give any caller a scroll-contained region (`ScrollRegion`/`WideContentScroller`) rather than letting content overflow into its ancestors, and `a11yScrollRegion.dom.test.tsx`'s "keeps the whole page's own scrollWidth in check once wide content is properly contained" proves this actually prevents the page-level horizontal-scroll failure the audit's page-level check watches for. `ExportPreview.tsx` and every card built on `SettingRow.tsx` use this region for their own scrollable content.

At the window-chrome level, a genuine gap was found and is recorded honestly rather than silently: a real narrow-width capture (`captures/images/launch-narrow.png`, 375px, taken against the packaged build) shows that neither the outer tab strip nor the adjacent destinations rail collapses at that width -- both hold their normal desktop pixel widths, squeezing the routed content down to roughly 95px with wrapped, clipped text ("Launch a coding agent" wraps across four lines; button labels are cut off mid-word). `tab-docking-overflow.md` documents the same gap from the source side: `TabStripProps.railExpanded` exists only as a manual, user-triggered toggle, and the component's own doc comment says plainly that automatic narrow-width collapse is not implemented ("a fixed rail has no viewport to react to" on its own). This capture is cited here specifically as evidence of an open gap, not as passing evidence that responsive layout is complete.

## Configuration

TODO(responsive-layout-and-sizing): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(responsive-layout-and-sizing): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(responsive-layout-and-sizing): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(responsive-layout-and-sizing): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(responsive-layout-and-sizing): link the related features, the prerequisites, and the natural next article a reader should open.
