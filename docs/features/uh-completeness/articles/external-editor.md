# External Editor

## Behaviour

`app/ui/app/src/components/exports/openInEditor.ts` implements the "open in VS Code" handoff for exported files, and is explicit about exactly what is and is not real today. It declares `window.materialOllamaExternalEditor` (`detectVsCode`/`openPathInVsCode`) as the narrow contract a future native bridge would need to satisfy, detects that contract at runtime, and uses it for real when present -- but no such bridge is wired up anywhere in this build yet, and the module's own header comment explains exactly why: this app's existing webview bridge and its existing server-side VS Code launch integration (`cmd/launch/vscode.go`) both exist for a different purpose (configuring VS Code's Copilot model picker, deliberately `Hidden: true`), and neither can honestly open "this exact file I just exported" -- with the webview bridge and Go backend outside this lane's allowed paths to extend.

What it honestly does today: reports `installed` with a real path when a bridge is present and finds VS Code, `not-installed` when a bridge is present and genuinely finds nothing, and a distinct `bridge-unavailable` state -- deliberately different from `not-installed`, because it says something different (VS Code might well be on this machine; the app just has no way to ask yet) -- when no bridge exists at all, exactly the current state of this build. `openInEditor.dom.test.tsx`'s eleven tests prove every one of those states is reported honestly rather than guessed, that a throwing bridge is treated as `bridge-unavailable` rather than a false `not-installed` claim, that launching genuinely calls the bridge with the exact path and kind when one is detected, and that launch failure is reported with the real error detail rather than throwing out of the caller.

The one action always available regardless of bridge state is the fallback the canonical contract requires: copying the exact path to the clipboard through the real Clipboard API, returning `false` rather than throwing when that API is unavailable or the write itself rejects (`writes the exact path through the real Clipboard API when available`, `returns false rather than throwing when the Clipboard API is unavailable`). Nothing in this module ever claims VS Code opened when it did not -- the module's own closing comment states that a button that silently no-ops is worse than one that isn't offered at all, and this implementation is built to that standard.

## Configuration

TODO(external-editor): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(external-editor): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(external-editor): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(external-editor): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(external-editor): link the related features, the prerequisites, and the natural next article a reader should open.
