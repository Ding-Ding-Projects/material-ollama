# Handoff: Material Ollama — MD3 Desktop App Rewrite

## Overview
A complete Material Design 3 rewrite of the Ollama desktop app UI (Go/webview host + React UI at `app/ui/app/` in the `material-ollama` repo), extended with the full shared feature contract from `docs/features/uh-completeness/inventory.json` (85 rows). The Model Store is the home screen; Chat is the second screen. Everything is a working interactive prototype backed by localStorage.

## About the Design Files
`Material Ollama.dc.html` is a **design reference created in HTML** — a working prototype showing intended look and behavior, not production code. The task is to **recreate this design inside the existing codebase**: keep the Go/webview host and the React + Vite + Tailwind UI at `app/ui/app/`, replacing the current Tailwind-neutral styling with the MD3 token system below. Do not migrate to Electron (recorded project decision).

## Fidelity
**High-fidelity.** Colors, typography, spacing, radii, and interactions are final intent. Recreate pixel-perfectly, generating the color scheme from the seed at runtime as described in Design Tokens.

## Architecture mapping to the existing codebase
- Router: keep TanStack Router. New routes: `/models` (index redirect target), `/c/$chatId`, `/launch`, `/codex`, `/devtools`, `/toolbox`, `/docs`, `/status`, `/settings`.
- Existing components to restyle, not rewrite: `ChatSidebar.tsx`, `Chat.tsx`, `ChatForm.tsx`, `ModelPicker.tsx`, `Settings.tsx`, `CodexHarness.tsx`, `CLIConfigPanel.tsx`, `LaunchCommands.tsx`, `layout/layout.tsx`.
- CLI parity data comes from `app/ui/capabilities.go` (`CommandCapability`, incl. `Hidden` + `GUIRoute`); config profiles from `app/ui/config_profiles.go`.
- Settings persistence goes through the existing Go settings API (`getSettings`/`updateSettings`); new shared settings extend the `Settings` type (language mode, funny levels, emoji, school mode {on,name,pin}, narration, appearance, vocabulary, schedules).
- Feature inventory (Docs screen) reads `docs/features/uh-completeness/inventory.json`; each implemented row must be flipped from `missing` to `verified` with real evidence per the fail-closed contract, checked by `scripts/check-uh-inventory.mjs --require-complete`.

## Screens
1. **App shell** — 44px title bar (app glyph + user-renamable app name, school-mode pill when active, Search pill w/ ⇧⌘F hint, notification bell w/ unread dot) → 38px browser-style tab strip (tabs = open screens: icon, label, group dot, pin glyph, close ×; “Close all” at right; right-click menu with pin/group/close-others/close-right/close, and the menu itself has a filter field + regex builder) → 84px MD3 navigation rail (9 destinations, active = filled icon in secondary-container pill).
2. **Models (home)** — headline + search (plain/regex toggle + builder), hardware-fit bar (RAM/VRAM GB inputs; per-model badge: “Fits in VRAM” tertiary-container / “Fits in RAM” secondary-container / “Too big” error-container), pull queue card (progress bar, pause/resume, cancel), catalog grid `repeat(auto-fill,minmax(290px,1fr))` of model cards (mono name, fit badge, description, capability chips, size, Pull tonal button or Installed + delete-behind-super-confirm), “Pull all shown” batch action.
3. **Chat** — 250px drawer (New chat tonal FAB-style button 14/16px padding r16, search pill w/ regex builder, Today/This week/Older groups, right-click rename/delete, “Clear all chats” bulk action) + conversation (user bubbles: primary-container r20/20/4/20; assistant: plain text beside app glyph, typewriter streaming + 3-dot pulse) + input card (surface-container-high, r28, chips: model picker/Think/Web search; 42px filled send button r14). Chat replies call the local model (in prototype: `window.claude.complete` stand-in honoring language mode + funny level).
4. **Launch** — grid of 10 harness cards (Claude Code, ChatGPT, Hermes Agent, OpenClaw, OpenCode, Codex, Copilot CLI, Droid, DeepSeek Harness, Pi) each with mono command `ollama launch <slug> --model <current>` and a Launch button.
5. **Codex CLI harness** — profile chips (Quick fix / Full run / Dry run → argv), working dir + prompt fields, live argv preview, preflight checklist (binary, sandbox, dir, rollback checkpoint), Run streams log lines into a dark terminal card, Cancel rolls back, bounded redacted history (12 runs), external-editor handoff.
6. **Developer** — CLI–GUI parity table (all 16 commands incl. hidden `runner`/`agent-tui` with red “hidden” badge, each linking to its GUI surface) + config profiles (snapshot/apply/delete) + command search w/ regex.
7. **Toolbox** — Regex lab (pattern/flags/test text, live match chips, error line, opens full builder), File converter (queue name→format, animated per-file progress, local-only disclosure), Built-in authenticator (real RFC 6238 TOTP via WebCrypto HMAC-SHA1, 30s countdown bar, base32 pairing + otpauth URI for QR, removal behind super-confirm).
8. **Docs** — offline documentation browser: 300px drawer listing all 85 contract features in 7 groups, search w/ regex builder, article pane (category eyebrow, 26px title, body, offline note).
9. **Status** — release card (v0.0.0-build.10, commit 7e45123e, code name Bamboo shoot har gow · 筍尖蝦餃, unsigned-by-policy line), dim sum release catalog list, changelog viewer w/ date filter, local version history (auto-recorded settings/actions, exportable), support tickets (fully local, unmissable disclosure line, open→looking→resolved).
10. **Settings** — searchable cards (search w/ regex builder; cards filter live): General (Cloud, Auto-update, Expose, Agent, Tools, emoji toggle switches; model location; context-length chips 4k–256k), Language & voice (EN/粵/Both segmented control; two funny-level sliders 0–4 with labels Deadpan→Full comedy / 正經→爆笑; “voice, never facts” note; narration toggle + language + real speechSynthesis voice picker + rate; personal vocabulary find→replace chips), School mode card (renamable, PIN, honest speed-bump copy; on = hides Cantonese/humor/vocab/dim-sum everywhere, exit via PIN dialog), Appearance (7 seed swatches + free hex, light/dark/auto, corner-radius slider 4–28, app display name, 4 logo glyphs, infinite color translator → any CSS color → hex/rgb/oklch + “Use as seed”, scheduled changes time+action list), Data & privacy (export settings/chats JSON, reset behind super-confirm, no-network statement).
11. **Overlays** — command palette (Ctrl+Shift+F, screens/actions/exports/easter-egg, regex toggle + builder), notification center (top-right sheet, clear all), destructive super-confirmation (typed keyword arms the error-filled button), school-mode unlock (PIN, honest reset line), dim sum surprise card (exact bilingual dish name, tertiary circle icon), regex builder dialog (pattern, flag chips g/i/m/s/u, 21 insert chips incl. lookarounds and \p{Script=Han}, editable test text seeded from the target list, live match chips, Apply-to-search), context menu w/ search, snackbar toasts (inverse-surface).

## Cross-cutting behavior (the shared feature contract)
- **Language modes**: en / yue / both on every label via a `t(key)` dictionary; bilingual renders “EN · 粵”.
- **Funny levels**: per-language 0–4; styles notifications/dialog copy (suffix + optional emoji); facts never change. School mode forces English and level 0.
- **School mode**: renamable, PIN-locked off-switch, hides (not disables) all Cantonese/humor/dim-sum surfaces live; honest non-security copy; cleared by wiping local data by design.
- **Narration**: off by default; speaks notifications via SpeechSynthesis; language en/yue(zh-HK)/both; voice list from `getVoices()`; serialized, cancel-before-speak.
- **Every search field** (chats, models, settings, docs, palette, dev commands, context menus) supports plain + regex and opens the shared builder seeded with the real data it filters.
- **Super-confirmation** for anything destructive (typed keyword: DELETE/REMOVE/RESET/CLEAR).
- **Notifications**: toast + reviewable center, bulk clear; every long operation reports completion there.
- **Local version history** records every meaningful change; exportable JSON.
- **Persistence**: one localStorage document (`materialOllama.v2`) → in production, the Go settings store + per-feature stores.
- **Dim sum**: 10-dish catalog (ids hk-dish-0001…0010), ~10% surprise on New Chat + palette command; fully absent under school mode.
- Repo/release-level contract rows (vocabulary hash lock, sanitized instruction copy, build scripts, dependency bootstrap, unsigned release policy, release line count, capture manifest, cheap transfer, landing-page boundary, status hub/discord/tidbyt bridges, forge publishing, browser-extension capture, shared-link embed) are **documented in the Docs screen** as repo contracts, not app UI — implement them in CI/release tooling per the inventory.

## Design Tokens
Scheme is **generated at runtime from a seed color** (default `#8a5a00`, warm amber). Convert seed → OKLCh hue h and chroma c (clamped 0.06–0.13), then:
- Light: primary oklch(.48 c h), on-primary (.995 .005 h), primary-container (.90 c*.45 h), on-primary-container (.25 c*.6 h); secondary c*.35; tertiary hue h+60, c*.8; error oklch(.50 .19 27); background (.985 .007 h); surface-container-lowest (.997)/low (.97)/base (.955)/high (.94)/highest (.92); on-surface (.22 .015 h); on-surface-variant (.42); outline (.55); outline-variant (.82); inverse-surface (.27).
- Dark: primary (.80 c*.9 h), on-primary (.28), primary-container (.38), on-pc (.92); background (.165 .012 h); containers .20–.30; on-surface (.93); outline (.62)/variant (.36).
- Radius token `--r` user-set 4–28px (default 16). Full-round 999px for pills/chips/buttons.
- Elevation: e1 `0 1px 2px rgba(0,0,0,.25), 0 1px 3px 1px rgba(0,0,0,.12)`; e2 `0 2px 6px 2px rgba(0,0,0,.14), 0 1px 2px rgba(0,0,0,.25)`.

## Typography
- UI: **Roboto Flex** (fallback Noto Sans HK for Cantonese glyphs, then system).
- Code/IDs: **Roboto Mono** 10.5–13.5px.
- Scale: page title 24/600, dialog title 18/600, card section label 13/600 primary color, body 13–14.5, helper 11–12.5 on-surface-variant, nav rail label 10.5/500, tab label 12.5.
- Icons: **Material Symbols Outlined**, 14–22px inline, FILL 1 for active rail item.

## Interactions & motion
- Overlays animate in with 120–220ms ease translateY(8px)+fade (`mo-in`); typing dots 1.2s staggered opacity pulse; switch knob/left 150ms; progress bars width .3s.
- Enter sends chat (Shift+Enter newline); Esc closes overlays; Ctrl/Cmd+Shift+F toggles palette.
- Hover states: transparent → surface-container-high/highest; destructive hover → error-container.

## State management (production)
- Settings (incl. shared settings) via the existing settings API; chats via existing chat store; pulls via the Ollama pull API with real progress events; TOTP secrets in OS keychain, never in exports; version history + tickets + notifications in local app data.

## Assets
No raster assets. Fonts + icons from Google Fonts (bundle locally for the packaged app). Logo is a Material Symbol glyph chosen by the user (raven/pets/neurology/spa) — replace with the real app icon set at package time.

## Files
- `Material Ollama.dc.html` — the full working prototype (template + logic in one file).
