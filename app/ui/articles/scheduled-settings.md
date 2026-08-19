# Scheduled Settings

## Behaviour

The Settings screen's Advanced card (`app/ui/app/src/screens/Settings/AdvancedCard.tsx`) offers a real schedule editor: a native `<input type="time">` plus an action `Select` (dark theme / light theme / turn School mode on -- `SCHEDULE_KIND_KEY`), an "Add" action that appends a `{time, kind}` `ScheduleRule` to `preferences.schedules` and PATCHes it to `/api/v1/uh/preferences`, and per-row removal. The list is real and reflects the real stored array -- an honest empty state ("no schedules yet") when `preferences.schedules` is empty (guarded with `?? []` against a `null` value from the server), and each row is individually removable via `removeRule`.

Measured against the fuller canonical contract, this is a genuine but partial implementation. What exists: a native time picker, a kind/action selector, real persistence through the already-shipped preferences PATCH endpoint, and a real empty state. What does not exist yet: weekday selection (every day vs. specific days), a start/end date range, explicit timezone/DST disclosure, cross-midnight window semantics, deterministic multi-rule precedence documentation, and the local/HTTPS-API/Home Assistant source contract described in `external-settings-sources.md` -- every rule here is a fixed local action (dark/light/school-on), not one that can be driven by an external source.

No test file exercises `AdvancedCard.tsx`'s schedule-adding behavior directly; `SettingsScreen.dom.test.tsx` mounts the card as part of the whole screen but does not assert on the schedule list specifically. As with the rest of the Settings screen, the real `/settings` route currently crashes before a user can reach this card in the packaged build.

## Configuration

TODO(scheduled-settings): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(scheduled-settings): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(scheduled-settings): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(scheduled-settings): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(scheduled-settings): link the related features, the prerequisites, and the natural next article a reader should open.
