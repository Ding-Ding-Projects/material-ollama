# Command Palette

## Behaviour

`Ctrl+Shift+F` opens a non-modal `Dialog` (`app/ui/app/src/components/shell/
CommandPalette.tsx`) sized `md`, titled with the shared "Command palette"
copy key, and containing one `SearchField` plus a scrollable `ListItem`
result list. Typing filters the app's registered destinations
(`app/ui/app/src/components/shell/destinations.ts`) by their localized
label: plain-text substring matching (case-insensitive) is the default
behavior, matching the shared regex-builder contract's "plain text is the
default, regex is an explicit opt-in" rule. The `SearchField`'s trailing
`.* ` affordance toggles a real regex mode on the same query string --
`new RegExp(query, "i")` tested against each destination's localized label
-- rather than opening a separate anchored builder; an invalid pattern
(a `RegExp` constructor throw) is caught and treated as "zero matches"
rather than crashing the palette or leaking a JS exception to the console.

Selecting a result (mouse click or Enter while focused) calls the parent's
`onSelect(id)` with the destination's id, clears the query and regex-mode
state, and closes the dialog. The dialog itself follows the app's normal
overlay contract: `Escape` and the backdrop close it, and it is a real
`Dialog` primitive rather than a bespoke overlay, so it inherits that
primitive's focus trapping and return-focus-on-close behavior. An empty
result set renders an explicit localized "no matches" message rather than
a blank list.

As of this article, the palette's scope is the destination list only --
teleporting to a specific settings row, appearance-editor control, or
documentation article inside a destination (rather than just opening that
destination's screen) is the fuller "rows are rich controls, teleport to
the exact element" behavior the shared canonical contract also describes,
and is not yet built; see `rich-controls.md`.

## Configuration

TODO(command-palette): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(command-palette): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(command-palette): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(command-palette): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(command-palette): link the related features, the prerequisites, and the natural next article a reader should open.
