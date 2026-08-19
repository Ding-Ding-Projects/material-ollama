# Rich Controls

## Behaviour

`BulkSelectableList.tsx` (`bulk-actions.md`) accepts a `renderRichControl` render-prop per row and genuinely uses it: `BulkSelectableList.dom.test.tsx`'s "renders a caller-supplied rich control per row instead of printed text (the rich-controls contract)" proves the rendered control is a real, independently clickable element -- a click on it fires the caller's own handler and does *not* also toggle the row's selection checkbox, proving it is a genuine control rather than a decorative stand-in layered over the row's click target. `BulkSelectableList.logSurfaces.dom.test.tsx` proves this generality is exercised for real data shapes, not only a synthetic test harness: the same list renders real notification-shaped rows with a working dismiss action and real local-version-history-shaped rows with a working export action.

The command palette (`command-palette.md`) is the other place this contract is named explicitly in this codebase, and that article is honest that the palette itself does not yet do this: its own text states "teleporting to a specific settings row, appearance-editor control, or documentation article inside a destination... is not yet built." So today the rich-controls contract is real and proven at the list-row level (bulk-selectable lists), not yet at the command-palette-result level the fuller canonical contract also describes.

Every card on the Settings screen also embodies a narrower form of the same principle: `SettingRow.tsx` (`settings-explanations-provenance.md`) always renders the real, live-bound control (`Switch`, `Select`, `Slider`, `Chip`) for a setting rather than a printout of its current value -- there is no settings row in this lane that shows a value as inert text when a real control could be shown instead.

## Configuration

TODO(rich-controls): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(rich-controls): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(rich-controls): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(rich-controls): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(rich-controls): link the related features, the prerequisites, and the natural next article a reader should open.
