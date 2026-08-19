# Regex Builder

## Behaviour

The shared `SearchField` primitive (`app/ui/app/src/components/md3/
SearchField.tsx`) is where every search bar in the app is meant to expose
regex, and it does so with a trailing Roboto Mono `.* ` affordance rendered
after the input. That affordance is deliberately dual-mode, chosen by which
prop a caller passes: when `onToggleRegex` is supplied, the `.* ` button
flips the field's own query string between plain-text and regex
interpretation in place (`aria-pressed` reflects the current mode, and the
button gets a filled `secondary-container` treatment while armed) -- this
is the mode the command palette uses today (see `command-palette.md`).
When only `onOpenBuilder` is supplied instead, the same affordance opens a
separate, fuller builder surface rather than toggling inline. Plain text is
always the default; a caller has to pass one of the two regex props at all
for the affordance to render, and the field falls back to ordinary
substring search with neither.

The regex engine underneath both modes is JavaScript's native `RegExp`,
constructed with the `i` (case-insensitive) flag against the field's raw
query string, and a pattern that fails to compile is caught and treated as
"zero matches" rather than thrown at the caller -- see the command
palette's own regex-mode filtering for the concrete implementation of that
contract.

As of this article, only the inline plain/regex toggle (`onToggleRegex`)
is wired into a shipped surface -- the command palette. The full anchored
regex builder popover the shared canonical contract requires everywhere
(guided construction for literals, character classes, anchors, groups,
alternation, and quantifiers; a raw pattern editor; live sample-text
matches and capture groups; explicit engine/dialect and escaping-rule
disclosure; copy/export) does not exist yet as a component, `onOpenBuilder`
has no current caller, and the toolbox screen's planned "Regex lab / Open
full builder" entry point (see the `regexLab` and `openBuilder` dictionary
keys already reserved in `app/ui/app/src/uh/dict/tools.dict.ts`) is still
the placeholder screen described in `offline-documentation-browser.md`'s
sibling `toolbox` route.

## Configuration

TODO(regex-builder): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(regex-builder): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(regex-builder): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(regex-builder): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(regex-builder): link the related features, the prerequisites, and the natural next article a reader should open.
