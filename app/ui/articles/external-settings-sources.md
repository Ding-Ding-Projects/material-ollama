# External Settings Sources

## Behaviour

`AdvancedCard.tsx` renders a real, read-only view of the Ollama-compatible endpoints already tracked in `preferences.endpoints` (`EndpointPrefs{activeId, endpoints}`, `app/ui/app/src/screens/Settings/types.ts`): each configured `Endpoint` (id, kind, label, base URL, whether a token is set) is listed with its label and base URL, and the currently-active one carries an "Active" badge (`endpointActiveFact`). An honest empty state renders when no endpoints are configured.

This is visibility only, not the external-source contract the canonical feature describes. There is no UI anywhere in the codebase to add, edit, or remove an endpoint, no per-schedule-rule choice of "local data / validated HTTPS API / Home Assistant boolean entity" as a settings source, and no Home Assistant entity linking, token storage, or bounded-refresh/fallback machinery. `scheduled-settings.md`'s schedule rules are all fixed local actions and carry no source selection at all. `EndpointPrefs`/`Endpoint` are real, already-shipped Go types (`app/ui/app/src/screens/Settings/types.ts` mirrors them) that something else in the codebase evidently populates, but this card is a reader of that state, not an editor of it, and nothing here drives a scheduled setting from an external source.

## Configuration

TODO(external-settings-sources): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(external-settings-sources): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(external-settings-sources): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(external-settings-sources): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(external-settings-sources): link the related features, the prerequisites, and the natural next article a reader should open.
