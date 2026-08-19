# Scheduled Settings

## Behaviour

The Settings screen's Advanced card (`app/ui/app/src/screens/Settings/AdvancedCard.tsx`) offers a real schedule editor: a native `<input type="time">` plus an action `Select` (dark theme / light theme / turn School mode on -- `SCHEDULE_KIND_KEY`), an "Add" action that appends a `{time, kind}` `ScheduleRule` to `preferences.schedules` and PATCHes it to `/api/v1/uh/preferences`, and per-row removal. The list is real and reflects the real stored array -- an honest empty state ("no schedules yet") when `preferences.schedules` is empty (guarded with `?? []` against a `null` value from the server), and each row is individually removable via `removeRule`.

Measured against the fuller canonical contract, this is a genuine but partial implementation. What exists: a native time picker, a kind/action selector, real persistence through the already-shipped preferences PATCH endpoint, and a real empty state. What does not exist yet: weekday selection (every day vs. specific days), a start/end date range, explicit timezone/DST disclosure, cross-midnight window semantics, deterministic multi-rule precedence documentation, and the local/HTTPS-API/Home Assistant source contract described in `external-settings-sources.md` -- every rule here is a fixed local action (dark/light/school-on), not one that can be driven by an external source.

As with the rest of the Settings screen, the real `/settings` route currently crashes before a user can reach this card in the packaged build.

## Test coverage

`AdvancedCard.dom.test.tsx` now exercises the schedule editor directly (mounted standalone, not through the whole `SettingsScreen`): starting from the real empty state ("No scheduled rules yet."), picking a time and an action and clicking "Add rule" makes the empty state disappear and a new row appear whose text combines the exact typed time and the chosen action's label -- proving both controls and the add action are wired to the same `ScheduleRule` rather than merely rendered; and starting from two pre-existing rules, removing one by its specific "Remove rule — <time>" button leaves the other rule in place, proving `removeRule` targets the clicked row's index and not, say, always the first or last item.

## Configuration

TODO(scheduled-settings): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(scheduled-settings): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(scheduled-settings): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/AdvancedCard.dom.test.tsx::adds a rule with the picked time and action, and it appears in the real list` (plus its sibling removal case in the same file).
- Built-artifact proof: not yet attached -- `settings.png` shows only the General card; the Advanced card holding this schedule editor sits further down the same scrolling page.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the Advanced card's schedule list would close this gap honestly.

## Suggested articles

TODO(scheduled-settings): link the related features, the prerequisites, and the natural next article a reader should open.
