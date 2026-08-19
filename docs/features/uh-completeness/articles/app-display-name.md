# App Display Name

## Behaviour

`AppearanceCard.tsx` renders a real, debounced text field (`DebouncedTextField`) bound to `preferences.appearance.appName`, with the standard `SettingRow` provenance line so a user can see whether the field currently holds a stored value or the shipped empty default. `applyAppName` PATCHes `/api/v1/uh/preferences` with the typed value, and the card's "Reset" action clears it back to `""` alongside the rest of appearance.

That write half is real; the read half is not yet wired to anything. A repository-wide check shows `preferences.appearance.appName` is referenced only inside the Settings screen's own files (`AppearanceCard.tsx`, `types.ts`) -- nowhere else in the app consumes it. The app's actual title bar (`app/ui/app/src/components/shell/AppShell.tsx`) renders a hardcoded `const APP_NAME = "Material Ollama"` constant, not this preference, and the same file's own `<AppMark title={APP_NAME} />` call passes that same fixed constant rather than reading the stored `appName`. So today, typing a custom name into this field persists it durably, but nothing in the app's own chrome, notifications, or window title ever displays it -- the rename does not yet reach the surfaces the canonical contract requires ("its title bar, an About surface, its notifications and anywhere else it introduces itself").

Per the canonical contract's decoupling requirement, at least the write half is safe by construction: `appearance.appName` lives only in the `UIPreferences` JSON blob and is never read by the application's package identifier, data directory, installer identity, or update feed -- there is no code path from it to any of those identity-bearing values, so wiring the read half in later cannot retroactively break that separation.

## Test coverage

`AppearanceCard.dom.test.tsx` exercises the write half directly: typing into the "App display name" field does not commit immediately (the provenance line still reads the compiled-in default at that instant, proving `DebouncedTextField`'s debounce is real rather than decorative); after the real 600ms debounce elapses, the provenance line updates to "Currently your saved value: My Llama"; and a sibling case starts from a stored custom name, clicks "Reset to \"Material Ollama\"", and asserts both that the provenance line returns to the compiled-in default and that the Reset button itself disables once the name really is empty again. No test covers the read half, because -- as this article says above -- there is no read half to cover yet.

## Configuration

TODO(app-display-name): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(app-display-name): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(app-display-name): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/Settings/AppearanceCard.dom.test.tsx::debounce-commits a typed name and the provenance line reflects the stored value` (plus its sibling reset case in the same file).
- Built-artifact proof: deliberately not attached. `settings.png` (this inventory's Settings capture) shows only the General card's "Model location" and "Expose to network" rows -- the Appearance card holding this control sits further down the same scrolling page and is not in frame. Attaching `settings.png` anyway, on the strength of it merely being *a* Settings screenshot, would be exactly the over-claiming this inventory's evidence discipline exists to refuse.
- Capture evidence: not yet attached, for the same reason. Recapturing `/settings` scrolled to the Appearance card's "App display name" row would close this gap honestly.

## Suggested articles

TODO(app-display-name): link the related features, the prerequisites, and the natural next article a reader should open.
