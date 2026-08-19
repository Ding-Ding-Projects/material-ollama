# App Display Name

## Behaviour

`AppearanceCard.tsx` renders a real, debounced text field (`DebouncedTextField`) bound to `preferences.appearance.appName`, with the standard `SettingRow` provenance line so a user can see whether the field currently holds a stored value or the shipped empty default. `applyAppName` PATCHes `/api/v1/uh/preferences` with the typed value, and the card's "Reset" action clears it back to `""` alongside the rest of appearance.

That write half is real; the read half is not yet wired to anything. A repository-wide check shows `preferences.appearance.appName` is referenced only inside the Settings screen's own files (`AppearanceCard.tsx`, `types.ts`) -- nowhere else in the app consumes it. The app's actual title bar (`app/ui/app/src/components/shell/AppShell.tsx`) renders a hardcoded `const APP_NAME = "Material Ollama"` constant, not this preference, and the same file's own `<AppMark title={APP_NAME} />` call passes that same fixed constant rather than reading the stored `appName`. So today, typing a custom name into this field persists it durably, but nothing in the app's own chrome, notifications, or window title ever displays it -- the rename does not yet reach the surfaces the canonical contract requires ("its title bar, an About surface, its notifications and anywhere else it introduces itself").

Per the canonical contract's decoupling requirement, at least the write half is safe by construction: `appearance.appName` lives only in the `UIPreferences` JSON blob and is never read by the application's package identifier, data directory, installer identity, or update feed -- there is no code path from it to any of those identity-bearing values, so wiring the read half in later cannot retroactively break that separation.

## Configuration

TODO(app-display-name): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(app-display-name): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(app-display-name): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(app-display-name): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(app-display-name): link the related features, the prerequisites, and the natural next article a reader should open.
