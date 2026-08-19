# Handoff

Last updated: 2026-08-19. Written against the repository as it actually is.
Every number below was measured in this session, not remembered.

## What this project is right now

Material Ollama is a fork of `ollama/ollama` adding a desktop GUI layer: a Go
host (`app/`) that embeds a React SPA (`app/ui/app/`) and serves it to a native
WebView2 window over `127.0.0.1` behind a token cookie.

A Material Design 3 rewrite of that UI has largely landed. The app shell
(title bar, browser-style tab strip, navigation rail), the MD3 token system
with runtime OKLCh theming, bundled fonts and an icon sprite, a cross-cutting
language/tone/restricted-mode layer, the settings store, the model-store
backend, a Docker container manager, a file converter, an authenticator, a
model catalog service, and nine screens all exist and are wired to real
endpoints. **It is not finished** — see Boundaries.

## Current state

- Default branch tip: `git log -1 main`.
- Published baseline: **`v0.0.0-build.18`**.
- **Desktop UI**: 367 tests across 53 files (`npx vitest run` in `app/ui/app`).
- **Go**: 9 packages pass (`go test ./app/...`, needs CGO).
- **Script tests**: all pass (`node --test "scripts/test/*.test.mjs"`).
- **Captures**: 12 real built-artifact captures, blankness-validated and
  sha256-verified, including dark theme, a dialog state and narrow layout.
- **Network audit**: a real CDP recording against the built app across 9
  screens — 182 requests, `allLoopback: true`, zero non-loopback offenders.

## Inventory status, measured

| surface | verified | in-progress | missing | not-applicable |
| --- | ---: | ---: | ---: | ---: |
| desktop-app | 16 | 57 | 0 | 12 |
| landing-page | 0 | 0 | 85 | 0 |

Suite inventory: 21 areas — 12 covered, 8 partial, 1 missing
(`guided-recovery`, which has no troubleshooter anywhere in the codebase).

## Verification posture

`scripts/check-uh-inventory.mjs` is a real fail-closed gate. It resolves every
evidence path on disk, matches `focusedCheck` test names **line-anchored** (so
a rename or a commented-out line fails), verifies `captureEvidence` sha256
against real bytes, and requires `missing` rows to carry null evidence. Its
`--self-test` runs 28 guard cases and asserts **every declared guard code was
observed failing at least once** — a guard nobody has watched fail proves
nothing.

Other artifact-level checks: `scripts/check-ui-css.mjs` reads the emitted
stylesheet (the defect it guards is invisible from both `vite.config.ts` and
`index.css`); `scripts/check-suite-inventory.mjs`; `scripts/check-docs-bundle.mjs`.

## Boundaries and known problems

1. **Pushes do not trigger CI runs.** Every build this session was dispatched
   by hand with `gh workflow run`. The workflow is `state: active` with
   `on: push`, the repository is neither archived nor disabled. This reads as
   an account- or billing-level Actions restriction not visible via the API.
   **Until it is fixed, pushing does not produce a build.**

2. **`gh` resolves `:owner/:repo` to `ollama/ollama`** because of the
   `upstream` remote. Every invocation needs
   `-R Ding-Ding-Projects/material-ollama` or it silently reports on the
   upstream project. Prove pushes with `git ls-remote origin`, not the API.

3. **Building `app/ui` requires CGO.** It transitively imports the cgo package
   `x/mlxrunner/mlx`; with `CGO_ENABLED=0` the build fails with
   `undefined: Array/Compile1/Shapeless`. That is a missing C toolchain, not a
   broken tree.

4. **The `.syso` filename suffix is load-bearing.** `ollama_windows_<arch>.syso`
   scopes the icon resource to one GOARCH. An unsuffixed `ollama.syso` is
   linked by *every* architecture and fails arm64 with
   `machine type x64 conflicts with arm64` while amd64 stays green.

5. **57 desktop-app rows remain `in-progress`.** The measured gaps: 46 need
   `builtArtifactProof` and `captureEvidence`, 24 need `focusedCheck`, 1 needs
   `localizedCopy`. Several are genuinely non-visual and have no honest
   screenshot.

6. **All 85 landing-page rows are `missing`.** The site at `site/` was scoped
   out for most of this work.

7. **`social-preview.png` needs a manual upload.** GitHub's social-preview
   setting has no API. It is committed at the repository root; a maintainer
   must upload it via Settings → General → Social preview.

8. **`app-display-name` is deliberately not verified.** The write-side UI is
   real, but `appName` has no readers — the title bar renders a hardcoded
   constant. The article says so rather than implying a working rename.

## A failure mode worth knowing about

**Twice this session a delegated lane reported that it had committed and had
not.** Merging that branch took an empty diff and reported success, which is
indistinguishable from the work landing. Both were caught only because a later
step re-proved preconditions from scratch — the first by mat day checking
whether every worktree was clean (it found 116 uncommitted files), the second
by re-reading the inventory counts instead of trusting an earlier report.

**Do not trust a lane's claim that it committed.** Check
`git log <base>..<branch>` and the worktree's own `git status`.

## Next actions, in the order they unblock the most

1. Resolve the CI push trigger. Everything is slower without it.
2. Build `guided-recovery` — the last genuinely missing suite area.
3. Lift the 57 `in-progress` rows: write the 24 missing focused tests, then
   attach captures only where a capture actually shows the feature.
4. Bring the landing page onto the contract, or record its rows
   `not-applicable` with real reasons if the site is deliberately out of scope.
5. Upload `social-preview.png`.

## Build

```
cd app/ui/app && npm install && npm run build
node scripts/check-ui-css.mjs
scripts/build_windows.ps1 app          # needs CGO + llvm-mingw on PATH
node scripts/check-uh-inventory.mjs --self-test
```

`app/ui/app/dist` must exist before any Go build in that package
(`//go:embed app/dist`).
