# Tab Docking Overflow

## Behaviour

`TabStrip.tsx`'s `TabDock` type (`"left" | "right" | "top" | "bottom"`) genuinely docks the strip to any of the four edges, left by default; docking is an orientation change, never a rotation -- nothing in the file rotates a label. The chosen edge is real, not cosmetic: `vertical = dock === "left" || dock === "right"` drives both the layout classes and the keyboard axis, and all four combinations are exercised directly by `TabStrip.dom.test.tsx` ("left dock (vertical): ArrowDown/ArrowUp move the active tab, ArrowLeft/ArrowRight do nothing", "top dock (horizontal): ArrowRight/ArrowLeft move the active tab, ArrowUp/ArrowDown do nothing", "right dock also moves with Up/Down (mirrors left, not top)", "bottom dock also moves with Left/Right (mirrors top, not left)"). The chosen dock persists across restarts via the `material-ollama:tab-dock` localStorage key (`loadDock`/`saveDock`).

Overflow is handled by an always-rendered anchored search popover (`overflowPanel`, backed by `TabOverflowSearch.tsx`) rather than only appearing once tabs overflow -- "search the current strip" is one of the tab system's four required discovery searches regardless of whether anything is actually clipped. A `ResizeObserver` (`hasOverflow` state) additionally gives the trigger button a tonal highlight the moment the strip's `scrollWidth`/`scrollHeight` genuinely exceeds its `clientWidth`/`clientHeight`, so the popover doubles as the overflow escape hatch without being gated on it.

What the canonical contract asks for and this lane does not yet deliver: automatic collapse to icon-only rows at narrow widths. `TabStripProps.railExpanded`/`onToggleRailExpanded` exist only as a *user-triggered* stand-in -- the code's own doc comment says so plainly ("a fixed rail has no viewport to react to"). The narrow-width capture (`captures/images/launch-narrow.png`, 375px) demonstrates the gap directly: neither the tab strip nor the adjacent destinations rail collapses at that width, and the routed content is squeezed down to roughly 95px with wrapped, clipped text. That capture is deliberately NOT cited as passing evidence for this row -- it documents the open gap, not a working narrow-width mode.

## Configuration

TODO(tab-docking-overflow): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(tab-docking-overflow): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(tab-docking-overflow): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(tab-docking-overflow): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(tab-docking-overflow): link the related features, the prerequisites, and the natural next article a reader should open.
