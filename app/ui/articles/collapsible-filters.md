# Collapsible Filters

## Behaviour

The Settings screen's search — the control that filters which of the six setting cards are shown — is collapsible. It starts expanded by default (`SettingsScreen.tsx`'s `useState(true)` for `searchExpanded`), since it is an actively-used filtering control on this screen rather than a passive collection-description panel; the collapse affordance itself is fully implemented and independently keyboard- and screen-reader-operable regardless.

An `IconButton` (the search glyph) sits beside the field with `aria-expanded` reflecting the current state and a localized accessible label that changes with it: `"Collapse search"` (`t("collapseSearch")`) while expanded, `"Expand search"` (`t("expandSearch")`) while collapsed. Toggling it *removes the `SearchField` and the regex-builder `Popover` from the DOM entirely* when collapsed — not merely visually hidden — and restores them, with the exact query and regex-mode state intact, when re-expanded, because the underlying `query`/`regex` React state lives in the parent component and is never torn down by collapsing; only the rendered input is withheld. Whatever filtered card selection the search already applied stays in effect on the six-card list the whole time, whether the field itself is currently shown or hidden.

## Configuration

The collapsed/expanded state is ephemeral UI state for this session (not persisted across restarts) — toggled purely by the `IconButton`, with no separate settings-surface configuration.

## Failure modes

There is no failure mode specific to collapsing: the search query and any active filter remain applied regardless of whether the field is visible, so collapsing can never silently discard an in-progress filter or leave the visible card list in a state that disagrees with the (now-hidden) query.

## Security considerations

Not applicable — this is a pure client-side display-state toggle with no security-relevant behavior.

## Verification

- Focused test: `app/ui/app/src/screens/SettingsScreen.dom.test.tsx`, `"collapses and re-expands the search field via the toggle, without losing the query"` — types a query, confirms the resulting filter took effect, collapses (asserting the field leaves the DOM entirely via `queryByLabelText` returning null, and that the toggle's accessible name/`aria-expanded` flip to the collapsed state), then re-expands and confirms both the exact prior query text and the filtered result survived the round trip.
- Run: `cd app/ui/app && npx vitest run src/screens/SettingsScreen.dom.test.tsx`.
- Implementation: `app/ui/app/src/screens/SettingsScreen.tsx` (`searchExpanded` state, the `IconButton` toggle, and the conditional render of `SearchField`/`Popover`).

## Suggested articles

- `regex-builder.md` — the anchored regex-builder popover this same search field's trailing affordance opens.
- `accessibility.md` — the `aria-expanded` state and accessible-name-swap pattern this toggle follows.
- `settings-explanations-provenance.md` — the six cards this search filters, and how each one's own provenance line is rendered.
