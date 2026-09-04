# Design-parity audit findings

Recorded by looking at the 17 paired side-by-side captures at the comparison
tuple (816x639, scale 1, light, seed `#8a5a00`, radius 16px, School mode off,
tab dock top, frozen time `2026-01-01T00:00:00Z`).

Every finding below names the row and what is visible in that row's
`side-by-side/<id>.png`. Nothing here is inferred from source.

## Read the percentages carefully -- three of them measure the wrong thing

The pairing summary reports a full-frame differing ratio per row. For some rows
that number is not a design signal at all, and treating it as one would send the
next person chasing the wrong thing.

| Row | Reported | What the number actually is |
| --- | --- | --- |
| `shell` | 63.71% | The two sides photograph **different screens**. The reference's shell row shows Models; the built app opens on Chat. Nothing about the design is being compared. |
| `launch` | 58.68% | The built capture caught a **loading spinner** -- "Loading coding agents..." -- because the row's readiness assertion fired before the data arrived. Not a valid frame. |
| every `overlay-*` | 42%-100% | Dominated by the **background behind the overlay**, not the overlay. `overlay-notification-center` reports 42% while its panel is nearly pixel-identical; `overlay-command-palette` reports 100% because the scrim darkens every pixel. |

The fix for the overlay rows is a region-scoped diff. The diff record already
carries a 12x9 grid of per-cell ratios, so the data to do it is present.

## Defects -- these are contract violations, not preferences

**D1. Search fields are missing the regex-builder affordance.**
The reference renders two affordances inside each search field: `.*` and a
wrench. The built app renders only `.*`. Visible on `models`, `docs` and
`settings`. The shared contract requires every search bar to reach the full
builder, so this is a real gap rather than a styling choice.

**D2. The tab context menu has no filter search.**
`overlay-context-menu`: the reference menu opens with a "Filter menu..." field
and its own `.*` affordance at the head of the menu. The built menu has no
field at all. The contract requires every right-click menu to carry its own
search wired to the builder, with no exemption for short menus.

**D3. The tab context menu has no "Edit appearance..." item.**
Same capture. The reference lists it as the last item; the built menu ends at
"Close tab". The contract requires every context menu to expose
**Edit appearance...** and **Lock this element...**.

**D4. The app mark differs.**
Every row. The reference uses an amber outline llama mark; the built app uses a
purple rounded-square mark. Whatever the intended mark is, the two disagree on
every single screen.

**D5. The built title bar carries four controls the reference does not.**
Every row: a "Top" pill and three icon buttons (window, folder, magnifier) sit
between the app name and the search field. The reference title bar holds only
search and notifications.

**D6. Funny-level copy is leaking into a control label.**
`settings` and `overlay-school-mode-unlock`: the built title-bar search reads
**"Search Nice."** where every other row reads "Search". A funny level may style
copy, but a control's own label is what tells the user what the control does.

**D7. `developer` is a different structure entirely.**
The reference is a three-column table (Command | What it does | GUI surface).
The built app is an expandable list with trailing route chips. Both are
defensible designs; they are not the same design.

**D8. `docs` groups differently and starts empty.**
The reference groups articles by category (VOICE & LANGUAGE, SETTINGS SYSTEM),
carries a "Documentation" heading, and opens with an article already showing.
The built app groups alphabetically (A, B), has no heading, adds a per-item
"Written" status, and opens on "Select a feature to read its article."

**D9. `status` diverges in title and content.**
Reference: "Status & records", with a Current release card beside a Dim sum
release catalog card, then a changelog with a date picker. Built: "Status",
a decorative circular icon the reference does not have, and neither the
catalog card nor the changelog picker in frame.

**D10. The School-mode indicator is absent from the built title bar.**
`overlay-school-mode-unlock`: the reference shows a "School mode" pill in the
title bar plus a "School mode is on." indicator. The built app shows neither.

## Structural gaps -- the built app has no such surface

**G1. `overlay-school-mode-unlock` has no unlock overlay.**
The reference shows a proper dialog: lock icon, "Turn off School mode", a PIN
field, the honest "self-imposed speed bump, not a security boundary" line, the
"Clearing this app's local data resets the lock" recovery route, and
Cancel/Unlock. The built app has only an inline control on the Settings screen,
so this row photographs Settings. The row is declared as sharing that frame,
which is why the uniqueness guard did not fail it -- but a declared share is an
admission, not parity.

**G2. `overlay-dim-sum-surprise` is not an overlay.**
The reference shows a centred modal: the mark, "DIM SUM SURPRISE",
"Shrimp dumpling / har gow", body copy and a "Yum!" button. The built app
renders the card inline on Status, and in this frame it is not visible at all.

**G3. `overlay-snackbar` is unpaired on both sides.**
No trigger has been identified that leaves a snackbar with text in the document.

## Rows that are close

**`cli-harness` -- 34.81%, and most of it is honest state.**
Title, subtitle, segmented control, both fields, the command preview, the status
chip row and both buttons all match. The reference shows green ticks because its
fixture has the codex binary; this machine does not, so the built app correctly
shows warnings and disables Run. The built app additionally offers "Restore the
app profile if the launch fails", which the reference does not.

**`overlay-notification-center` -- panel anatomy matches.**
Title, "Clear all" action and the "Nothing here yet. Quiet llama." empty state
all line up. Position and shadow differ slightly.

**`overlay-destructive-confirmation` -- anatomy matches.**
Warning icon, title, body, type-REMOVE field, Cancel and a disabled destructive
action. The reference names the model in the title ("Remove llama3.3:latest?")
where the built app names it only in the body. The built dialog surface reads
greyer than the reference's.

Worth stating plainly: **neither side implements the two-key-plus-slider
super-confirmation gate** the shared contract requires for destructive actions.
Both use type-to-confirm. That is a contract gap on both sides, so it is not a
parity defect -- and it is not fixed by copying the reference either.

## Where the reference is wrong and the built app is right

Parity with the reference is not the goal where the reference contradicts the
shared contract. One clear case:

**`settings` provenance lines.** The built app renders "Currently the
compiled-in default: off" and "Currently your saved value: ..." beneath each
setting; the reference renders neither. The contract requires every settings
element to carry a truthful default-provenance line. The built app is more
correct here, and this is an approved deviation rather than a defect.

The built settings rows also place the switch below the label rather than to its
right, which is a genuine layout divergence and is recorded separately.

## What cannot be judged from these captures

Three of the fifteen audit components cannot honestly be assessed from a static
frame, and marking them conforming from one would be asserting something the
evidence does not carry:

- **motion** -- animations are disabled for determinism, by design. Must be
  audited from source or from a separate non-deterministic capture.
- **stateLayers** -- hover and pressed layers need interaction.
- **focus** -- no element is focused in these frames.

They stay `pending` with that reason rather than being waved through.

## Consequence for the inventory

No row reaches `verified` in this pass. D1 alone blocks every row that renders a
search field, and the strictness rule is explicit that a `defect` component
forbids `verified` -- a non-conforming primitive is something to fix, not
something to record and move past.
