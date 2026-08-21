# Config Profiles

## Behaviour

`app/ui/config_profiles.go` (425 lines) is a real configuration-profile manager: `NewConfigProfileManager` resolves an OS config directory and persists profile state to `config-profiles.json` there (L74-L92), tracking each `envconfig` value's baseline, whether it has been overridden, and whether the override came from this app or an external source. The Developer Tools screen's `ConfigProfilesPanel.tsx` (422 lines) renders that state against the same live capability registry `gui-capability-registry.md` describes: a filterable list of every configuration option with its current/baseline value, a "profiles" section for saving and applying named sets of overrides, and an explicit confirmation dialog (`applyDialogBody`) before an override is actually applied.

This panel sits below the fold in the `devtools.png` capture used elsewhere in this inventory (the capture shows only the "CLI ↔ GUI parity" panel above it on the same scrolling page), so no capture evidence backs this row yet even though the implementation is real and substantial -- attaching that capture anyway, the way `app-display-name` and `batch-pull-queue` were correctly refused it elsewhere in this inventory, would be exactly the over-claiming this inventory exists to catch. Creating a profile posts through `createConfigProfile()` (`app/ui/app/src/api.ts`) to `POST /api/v1/config/profiles`, and only a name is required before the "Create profile" button enables.

## Test coverage

`ConfigProfilesPanel.dom.test.tsx` stubs `fetch` directly (not `@/api`) so the real `createConfigProfile()` request shape is exercised, and asserts: typing a name into the "Name" field and clicking "Create profile" posts to `/api/v1/config/profiles` with that exact trimmed name in the body, and the panel then shows the real "Profile saved." status from the mutation's `onSuccess`; the "Create profile" button stays disabled until a name is entered; and the configuration-override search field narrows the list to matches and shows the real "No configuration options match." empty state for a query nothing satisfies.

## Configuration

TODO(config-profiles): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(config-profiles): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(config-profiles): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/devtools/ConfigProfilesPanel.dom.test.tsx::posts a real create-profile request with the typed name and shows the saved status` (plus its two sibling cases in the same file).
- Built-artifact proof: not yet attached -- no capture in this inventory's manifest shows the Config Profiles panel itself; `devtools.png` shows only the CLI parity panel above it.
- Capture evidence: not yet attached, for the same reason. Recapturing `/devtools` scrolled to this panel (or as a separate screen state) would close this gap honestly.

## Suggested articles

TODO(config-profiles): link the related features, the prerequisites, and the natural next article a reader should open.
