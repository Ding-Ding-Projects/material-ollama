# Cli Gui Parity

## Behaviour

The Developer Tools screen's "CLI ↔ GUI parity" panel (`app/ui/app/src/screens/devtools/CommandParityPanel.tsx`, mounted at `/devtools`) is real and is exactly what the `devtools.png` capture used elsewhere in this inventory shows: a filterable table of every command the CLI's live Cobra command tree understands, sourced from `GET /api/v1/capabilities` (`app/ui/capabilities.go`). Hidden commands (ones with no menu entry of their own) carry a distinct "hidden" badge rather than being silently omitted, matching the panel's own stated intent ("they're included on purpose, not a leak"). The filter field ("Filter by name, use, alias, or description...") carries the same `.* ` regex affordance every other search field in the app exposes, and an invalid pattern is caught and treated as "no matches" rather than thrown.

The registry is rebuilt from the live `cobra.Command`/`pflag.Flag` tree on every request rather than hand-maintained or cached, which is the whole point: a command the CLI adds is a command the GUI panel shows the next time it loads, with no separate list to keep in sync. Each row's `guiRoute` decides whether it renders as a real `<Link>` (only when the route starts with `models`, per `./lib.ts`'s `isRoutedGuiRoute`) or as an honest, non-interactive path label — a command whose GUI screen does not exist yet is still shown, just not pretended to be clickable.

## Test coverage

`CommandParityPanel.dom.test.tsx` renders the panel with two fixture commands whose `guiRoute` values (`chat/run`, `service`) both fall outside the routed `models` prefix, so the panel takes its plain-span branch rather than mounting `@tanstack/react-router`'s `<Link>` (which throws outside a real `RouterProvider` — there is no router harness in this test file, deliberately, since the unrouted path is the one this contract actually needs proven). It asserts: neither command's GUI-route label exposes a `link` role; exactly one "Hidden" row badge renders for the one command marked `hidden: true`; typing into the search field narrows the list to the matching command and hides the rest; and a query nothing matches shows the real "No commands match." empty state rather than an empty list with no explanation.

## Configuration

TODO(cli-gui-parity): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(cli-gui-parity): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(cli-gui-parity): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/devtools/CommandParityPanel.dom.test.tsx::filters the command list to matches of the typed query` (plus its three sibling cases in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.4.artifact.sha256`, resolving into the manifest entry for the `devtools` capture built from `dist/windows-ollama-app-amd64.exe`.
- Capture evidence: `docs/features/uh-completeness/captures/images/devtools.png`, a real screenshot of the `/devtools` screen taken from that built executable on an off-screen desktop, showing the "CLI ↔ GUI parity" panel with its command count, hidden count, and search field.

## Suggested articles

TODO(cli-gui-parity): link the related features, the prerequisites, and the natural next article a reader should open.
