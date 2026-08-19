# Regex Builder

## Behaviour

The Toolbox screen's "Regex lab" section (`app/ui/app/src/screens/toolbox/RegexLabSection.tsx`, mounted at `/toolbox`) is a real, fully client-side pattern lab wired to the shared `RegexBuilder` primitive (`app/ui/app/src/components/md3/RegexBuilder.tsx`, 619 lines). It offers guided construction (insert-a-construct chips for character classes, anchors, and quantifiers), a raw pattern editor with `g/i/m/s/u` flag toggles, a bounded live-match evaluator against sample text, and a truncation notice when the match count exceeds `REGEX_MAX_MATCHES` -- the exact cap `RegexBuilder.dom.test.tsx` proves against a 3000-match adversarial input, alongside a catastrophic-backtracking timeout test and input-length caps on both the pattern and the sample text.

Two real, independent consumers exercise the one shared primitive rather than it being built and left dark: the demo `SearchField`'s trailing `.* ` affordance calls `onOpenBuilder`, which scrolls to and focuses the builder below via its imperative handle -- the same `onOpenBuilder`/`onToggleRegex` contract `command-palette.md` documents for the inline toggle mode -- and the builder's own "Apply to search" action writes the built pattern back into that search field with a confirming, non-blocking snackbar. Nothing here touches the network; the screen's own subtitle says so ("Local utilities. Nothing here touches the network.").

As of this article the anchored, per-field placement described in the canonical contract (a builder popover attached to *every* search bar, dropdown, and context-menu filter across the app) is not yet built -- this is the one dedicated lab screen, not yet the universal per-field affordance. `SearchField`'s `onToggleRegex` inline mode (used by the command palette) is the only other shipped consumer today.

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
