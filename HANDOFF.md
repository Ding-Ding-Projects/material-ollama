# Handoff

Last updated: 2026-08-21. Written against the current local baseline
`033efdecd8d29e1a8296c3bc37384cc35c40b360`. Release and publication remain
pending; the published baseline is recorded separately below.
Every number below was measured by a committed script in this session, not
remembered.

## 2026-08-20 root-build correction

- `build.bat` now consumes `/s` and `--silent`, recognizes `SILENT=1`, and forwards only named build steps.
- Focused contract: `node --test scripts/test/root-build-entrypoint.test.mjs`.
- Runtime proof uses the real root build path; installer install/uninstall evidence is outside this build-entrypoint correction.

## What this project is right now

Material Ollama is a fork of `ollama/ollama` adding a desktop GUI layer: a Go
host (`app/`) that embeds a React SPA (`app/ui/app/`) and serves it to a native
WebView2 window over `127.0.0.1` behind a token cookie.

A Material Design 3 rewrite of that UI has largely landed. The app shell
(title bar, browser-style tab strip, navigation rail), the MD3 token system
with runtime OKLCh theming, bundled fonts and an icon sprite, a cross-cutting
language/tone/restricted-mode layer, the settings store, the model-store
backend, a Docker container manager backend, a file-converter backend, an
authenticator backend, a model catalog service, and nine user-facing screens
all exist in the tree and use real endpoints where wired. The file converter,
authenticator, and local suite manager do not yet have their user-facing
screens wired into the navigation. **It is not finished** — see Boundaries.

## Current state

- Published baseline: **`v0.0.0-build.18`**, targeting commit
  [`3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f`](https://github.com/Ding-Ding-Projects/material-ollama/commit/3b33fc66c42c82b3d9fe0bfb012f85e68fc6ea6f).
- Local work after that baseline is not published. No release, installer, or
  remote verification is claimed by this handoff.
- **Line count:** `node scripts/count-lines.mjs` reported 1,610 included files,
  486,437 total lines, and 424,482 non-blank lines. The breakdown was 854
  source files (292,906 / 253,252 non-blank), 446 test files (170,363 /
  153,450 non-blank), and 310 styles/markup files (23,168 / 17,780
  non-blank). Surviving-line attribution was 74,128 agent-attributed,
  412,309 other-attributed, and 0 unknown. Vendored sources, third-party
  trees, dependency directories, generated build output, and lockfiles were
  excluded by the script.
- **Inventory self-test:** `node scripts/check-uh-inventory.mjs --self-test`
  passed 28 guard cases; all 26 declared guard codes were observed failing at
  least once before restoration, and the inventory structure passed.
- **Sanitized-copy test:** `node --test
  scripts/test/sanitized-instruction-copy.test.mjs` passed 4 tests.
- **Docs bundle:** `node scripts/check-docs-bundle.mjs` passed with 85 staged
  articles matching all 85 inventory features byte-for-byte; the companion
  `node site/scripts/build-docs-index.mjs` wrote 85 articles across 11
  categories.
- **Status pure tests:** the direct Vitest entrypoint ran
  `changelogEntries.test.ts`, `dateRange.test.ts`, and
  `dimSumSurprise.test.ts`: 3 files and 16 tests passed. The wider status
  subset was not promoted to green: its remaining DOM files stayed queued for
  more than a minute and the run was stopped after 3 of 12 files completed.
- **Go store package:** on the Windows/amd64 host,
  `go test ./app/store -count=1 -run '^TestConfigMigration$' -v` passed for
  the focused migration fixture, and `go test ./app/store -count=1` passed
  for the full store package.

## Inventory status, measured

| surface | verified | in-progress | missing | not-applicable |
| --- | ---: | ---: | ---: | ---: |
| desktop-app | 22 | 51 | 0 | 12 |
| landing-page | 0 | 0 | 85 | 0 |

Suite inventory: 21 areas — 13 covered, 8 partial, 0 missing.

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

5. **51 desktop-app rows remain `in-progress`.** Their evidence gaps remain
   recorded in the inventory; several are genuinely non-visual and have no
   honest screenshot.

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
step re-proved preconditions from scratch — the first by cleanup checking
whether every worktree was clean (it found 116 uncommitted files), the second
by re-reading the inventory counts instead of trusting an earlier report.

**Do not trust a lane's claim that it committed.** Check
`git log <base>..<branch>` and the worktree's own `git status`.

## Next actions, in the order they unblock the most

1. Resolve the CI push trigger. Everything is slower without it.
2. Lift the 51 remaining `in-progress` desktop rows: add the missing focused
   checks and attach captures only where a capture actually shows the feature.
3. Bring the landing page onto the contract, or record its rows
   `not-applicable` with real reasons if the site is deliberately out of scope.
4. Upload `social-preview.png`.

## Build

```
cd app/ui/app && npm install && npm run build
node scripts/check-ui-css.mjs
scripts/build_windows.ps1 app          # needs CGO + llvm-mingw on PATH
node scripts/check-uh-inventory.mjs --self-test
```

`app/ui/app/dist` must exist before any Go build in that package
(`//go:embed app/dist`).
