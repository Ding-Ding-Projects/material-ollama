# Upstream merge status

This fork tracks `ollama/ollama`. This file records what the most recent merge
took, what it deliberately did not take, and why — so a gap reads as a decision
rather than as something nobody noticed.

## Current state

Merged through upstream `b68365a0` (2026-09-03). `LLAMA_CPP_VERSION` is `b10760`,
with the matching MLX and MLX-C bumps.

Verified at that merge: `go build ./app/...` clean, `go test ./app/...` 11/11
packages, `tsc -b --force` and `vite build` clean, 492/492 UI tests, 77/77 script
tests, and all three inventory gates plus the design-parity self-test.

## How conflicts are resolved

By file class, not case by case. The classes are stable, so the next merge should
follow the same rules rather than rediscovering them.

| Class | Resolution |
| --- | --- |
| Engine, server, model, middleware, api, llm, docs | Take upstream. We do not fork the engine. |
| The Material Design 3 UI | Keep ours. Upstream's presentation would undo the rewrite. |
| Our own workflows (`release.yaml`) | Keep ours — a full rewrite, unrelated to upstream's. |
| Generated files | Regenerate from source. Never hand-merge. |
| The desktop app host | By hand; both sides carry real changes. |

## Three resolutions a mechanical merge gets wrong

**Database schema versions collide.** Both sides used v17 and v18 for different
migrations: ours added `ui_preferences` and `app_events`, upstream added
`onboarding_version` and `claude_desktop_used`. Taking either side alone silently
drops two columns and leaves installed databases skipping migrations they need.
Upstream's are renumbered to **v19 and v20**, so all four apply in order and
`currentSchemaVersion` is 20. Any future upstream migration must be renumbered
the same way.

**`IsProcRunning` keeps ours.** Upstream defers every `CloseHandle` to function
exit; ours closes per iteration and grows the `EnumProcesses` buffer rather than
truncating it. See `.codex/verification/poke-guys/updater-isproc-enumprocesses-candidate.md`.

**The `-route` flag wins over upstream's startup routing.** Upstream added
`runInitialWindowsUI`, which sends a normal launch to `/connect`. An explicit
`-route` still takes precedence, because the capture harness launches a cold
process precisely to land on one exact screen.

## Deliberately not ported

Upstream's onboarding and Claude Desktop user interfaces are **not** in this
build. Nothing referenced them, and they are upstream's presentation rather than
Material Design 3 — wiring them in as they are would put non-M3 chrome on the
first screens a new user meets.

Removed: `AppSidebar.tsx`, `Onboarding.tsx`, `routes/connect.tsx`,
`routes/onboarding.tsx`, `ClaudeDesktopModelsSettings.tsx`, and the upstream test
files that exercise upstream's own `Settings` component.

Kept, so a later lane can port the screens without rebuilding the plumbing:
`lib/onboarding.ts`, `lib/claudeDesktop.ts`, the `useSettings` fields, the webview
types, and the whole store side — `onboarding_version` and `claude_desktop_used`
persist and migrate.

Porting them means rebuilding both surfaces from the components in
`app/ui/app/src/components/md3/`, not restoring the deleted files.
