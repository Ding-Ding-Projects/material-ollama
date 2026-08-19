# Gui Capability Registry

## Behaviour

`app/ui/capabilities.go` (284 lines) is the registry itself: `CommandFlag`/`CommandInfo`-shaped structs built by walking the live `cobra.Command` tree and its `pflag.Flag`s (name, shorthand, type, default value, whether it is persistent or hidden), versioned by a `CapabilityRegistryVersion` constant that is incremented whenever the JSON shape changes. `GET /api/v1/capabilities` serves it, and the Developer Tools screen's header (`app/ui/app/src/screens/DevToolsScreen.tsx`) renders the resulting counts as real badges -- "19 commands", "4 hidden", "36 configuration options" in the `devtools.png` capture used elsewhere in this inventory -- computed from the actual registry response (`registry.commands.length`, etc.), not hardcoded numbers.

The configuration half (`ConfigurationPanel.tsx`, stacked below the parity table on the same screen) lists every effective configuration value with its provenance, and `ConfigProfilesPanel.tsx` (see `config-profiles.md`) is built directly on this same registry response. Nothing about the registry is cached to disk; it is recomputed from the live command tree on every request. No dedicated test covers `capabilities.go` yet.

## Configuration

TODO(gui-capability-registry): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(gui-capability-registry): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(gui-capability-registry): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(gui-capability-registry): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(gui-capability-registry): link the related features, the prerequisites, and the natural next article a reader should open.
