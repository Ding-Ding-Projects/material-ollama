# Harness Profiles

## Behaviour

The "Launch" screen (`app/ui/app/src/screens/LaunchScreen.tsx` + `LaunchIntegrationCard.tsx`) lists installed and not-installed coding-agent harnesses (Claude Code, ChatGPT, Hermes Agent, OpenClaw, and Codex) with a copyable launch command and an install hint when a harness's binary was not found on this machine -- exactly what the `launch.png` capture used elsewhere in this inventory shows. Selecting Codex opens the dedicated harness screen at `/codex` (`app/ui/app/src/components/CodexHarness.tsx`, 332 lines; captured in `codex.png`), which is the real allowlisted-orchestration implementation the canonical contract describes: `app/ui/codex.go`'s `validateCodexProfile` rejects any executable outside a resolved allowlist and any argument-shell-concatenation attempt (the screen's own "Arguments are passed as individual tokens. Shell concatenation and environment expansion are rejected." copy is literally true of the backend), profiles are named and saved through `saveProfile`, and every launch goes through a `preflight` step before a real process starts.

Saved profiles persist to `codexHistoryPath()` (`%LOCALAPPDATA%\Ollama\codex-harness.json` on Windows) via `persistLocked`'s atomic temp-file-then-rename write. `LaunchIntegrationCard.tsx` is properly localized through the `launch` dictionary namespace (`t("launchAction")`, `t("installedBadge")`, etc.), but `CodexHarness.tsx` itself renders plain hardcoded English strings -- no `useT`/`Txt` import was found in that file -- so the harness-detail screen's own copy does not yet participate in language mode or funny-level styling. No dedicated test (Go or TypeScript) exercises the Codex harness code path yet.

## Configuration

TODO(harness-profiles): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(harness-profiles): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(harness-profiles): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(harness-profiles): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(harness-profiles): link the related features, the prerequisites, and the natural next article a reader should open.
