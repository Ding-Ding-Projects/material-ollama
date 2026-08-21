# Gui Capability Registry

## Behaviour

`app/ui/capabilities.go` (284 lines) is the registry itself: `CommandFlag`/`CommandInfo`-shaped structs built by walking the live `cobra.Command` tree and its `pflag.Flag`s (name, shorthand, type, default value, whether it is persistent or hidden), versioned by a `CapabilityRegistryVersion` constant that is incremented whenever the JSON shape changes. `GET /api/v1/capabilities` serves it, and the Developer Tools screen's header (`app/ui/app/src/screens/DevToolsScreen.tsx`) renders the resulting counts as real badges -- "19 commands", "4 hidden", "36 configuration options" in the `devtools.png` capture used elsewhere in this inventory -- computed from the actual registry response (`registry.commands.length`, etc.), not hardcoded numbers.

The configuration half (`ConfigurationPanel.tsx`, stacked below the parity table on the same screen) lists every effective configuration value with its provenance, and `ConfigProfilesPanel.tsx` (see `config-profiles.md`) is built directly on this same registry response. Nothing about the registry is cached to disk; it is recomputed from the live command tree on every request. Each command's `GUIRoute` is decided by `commandGUIRoute()`, the one function that maps a Cobra command's path to the route string the parity panel later uses to decide whether to render a real link (see `cli-gui-parity.md`) -- an unrecognised command falls to its `default` branch, which prefixes hidden commands with `developer/commands/` instead of the plain `commands/` prefix a visible unmatched command gets, so a hidden command's route stays distinguishable from a visible one even when neither has a dedicated case in the switch.

## Test coverage

`capabilities_test.go` calls `commandGUIRoute` directly (no HTTP server or Cobra tree construction needed, since it is a pure function of a path and a hidden flag) and asserts: an unrecognised hidden command gets the `developer/commands/...` prefix while the same unrecognised command with `hidden=false` gets the plain `commands/...` prefix, proving the branch is actually conditioned on the hidden flag; and that the known alias groups (`list`/`ls`/`ps` all sharing `models`; `pull`/`push` sharing the distinct `models/transfer`) resolve to the single GUIRoute each screen's link logic expects.

## Configuration

TODO(gui-capability-registry): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(gui-capability-registry): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(gui-capability-registry): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/capabilities_test.go::TestCommandGUIRoute_HiddenUnknownCommandGetsDeveloperPrefix` (plus its sibling `TestCommandGUIRoute_KnownAliasesShareOneRoute` in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.4.artifact.sha256`.
- Capture evidence: `docs/features/uh-completeness/captures/images/devtools.png`, showing the real `commandsCount`/`hiddenCount`/`optionsCount` badges computed from the live registry response.

## Suggested articles

TODO(gui-capability-registry): link the related features, the prerequisites, and the natural next article a reader should open.
