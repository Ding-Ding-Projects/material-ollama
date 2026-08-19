# Harness Profiles

## Behaviour

The "Launch" screen (`app/ui/app/src/screens/LaunchScreen.tsx` + `LaunchIntegrationCard.tsx`) lists installed and not-installed coding-agent harnesses (Claude Code, ChatGPT, Hermes Agent, OpenClaw, and Codex) with a copyable launch command and an install hint when a harness's binary was not found on this machine -- exactly what the `launch.png` capture used elsewhere in this inventory shows. Selecting Codex opens the dedicated harness screen at `/codex` (`app/ui/app/src/components/CodexHarness.tsx`, 332 lines; captured in `codex.png`), which is the real allowlisted-orchestration implementation the canonical contract describes: `app/ui/codex.go`'s `validateCodexProfile` rejects any executable outside a resolved allowlist and any argument-shell-concatenation attempt (the screen's own "Arguments are passed as individual tokens. Shell concatenation and environment expansion are rejected." copy is literally true of the backend), profiles are named and saved through `saveProfile`, and every launch goes through a `preflight` step before a real process starts.

Saved profiles persist to `codexHistoryPath()` (`%LOCALAPPDATA%\Ollama\codex-harness.json` on Windows) via `persistLocked`'s atomic temp-file-then-rename write. `LaunchIntegrationCard.tsx` is properly localized through the `launch` dictionary namespace (`t("launchAction")`, `t("installedBadge")`, etc.), but `CodexHarness.tsx` itself renders plain hardcoded English strings -- no `useT`/`Txt` import was found in that file -- so the harness-detail screen's own copy does not yet participate in language mode or funny-level styling. The card's Launch button is `disabled` purely off `integration.installed`, with its `title` and a visible "Install hint:" line both set from the exact same `integration.installHint` the backend reports -- there is no separate, potentially-drifting copy of the reason.

## Test coverage

`LaunchIntegrationCard.dom.test.tsx` renders the card standalone with a fixture `LaunchIntegration` and asserts: clicking "Launch" on an installed harness calls `onLaunch` with that exact integration (not a stale closure or the wrong row); and an uninstalled harness disables the Launch button, sets its `title` to the real install hint text, and renders the same hint again in the visible "Install hint:" line plus the "Not installed" badge -- proving the disabled reason is genuinely surfaced rather than only logged. No dedicated test yet covers `CodexHarness.tsx`'s own allowlisting/preflight code path or `codex.go`'s `validateCodexProfile`.

## Configuration

TODO(harness-profiles): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(harness-profiles): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(harness-profiles): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

- Focused test: `app/ui/app/src/screens/launch/LaunchIntegrationCard.dom.test.tsx::disables Launch and names the exact install hint for an uninstalled harness` (plus its sibling case in the same file).
- Built-artifact proof: `docs/features/uh-completeness/captures/manifest.json#captures.3.artifact.sha256`.
- Capture evidence: `docs/features/uh-completeness/captures/images/codex.png`, showing the real Codex CLI Harness detail screen with its Profiles/Discovery/Guided invocation sections.

## Suggested articles

TODO(harness-profiles): link the related features, the prerequisites, and the natural next article a reader should open.
