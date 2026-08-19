# Cli Gui Parity

## Behaviour

The Developer Tools screen's "CLI ↔ GUI parity" panel (`app/ui/app/src/screens/devtools/CommandParityPanel.tsx`, mounted at `/devtools`) is real and is exactly what the `devtools.png` capture used elsewhere in this inventory shows: a filterable table of every command the CLI's live Cobra command tree understands, sourced from `GET /api/v1/capabilities` (`app/ui/capabilities.go`). Hidden commands (ones with no menu entry of their own) carry a distinct "hidden" badge rather than being silently omitted, matching the panel's own stated intent ("they're included on purpose, not a leak"). The filter field ("Filter by name, use, alias, or description...") carries the same `.* ` regex affordance every other search field in the app exposes, and an invalid pattern is caught and treated as "no matches" rather than thrown.

The registry is rebuilt from the live `cobra.Command`/`pflag.Flag` tree on every request rather than hand-maintained or cached, which is the whole point: a command the CLI adds is a command the GUI panel shows the next time it loads, with no separate list to keep in sync. No dedicated test exercises `capabilities.go` or this panel yet.

## Configuration

TODO(cli-gui-parity): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(cli-gui-parity): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(cli-gui-parity): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(cli-gui-parity): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(cli-gui-parity): link the related features, the prerequisites, and the natural next article a reader should open.
