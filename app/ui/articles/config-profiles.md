# Config Profiles

## Behaviour

`app/ui/config_profiles.go` (425 lines) is a real configuration-profile manager: `NewConfigProfileManager` resolves an OS config directory and persists profile state to `config-profiles.json` there (L74-L92), tracking each `envconfig` value's baseline, whether it has been overridden, and whether the override came from this app or an external source. The Developer Tools screen's `ConfigProfilesPanel.tsx` (422 lines) renders that state against the same live capability registry `gui-capability-registry.md` describes: a filterable list of every configuration option with its current/baseline value, a "profiles" section for saving and applying named sets of overrides, and an explicit confirmation dialog (`applyDialogBody`) before an override is actually applied.

This panel sits below the fold in the `devtools.png` capture used elsewhere in this inventory (the capture shows only the "CLI ↔ GUI parity" panel above it on the same scrolling page), so no capture evidence backs this row yet even though the implementation is real and substantial. No dedicated test exercises `config_profiles.go` or `ConfigProfilesPanel.tsx`.

## Configuration

TODO(config-profiles): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(config-profiles): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(config-profiles): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(config-profiles): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(config-profiles): link the related features, the prerequisites, and the natural next article a reader should open.
