# Handoff

Last updated: 2026-08-21. Written against local commit
`b0b6a961473d026430a34a4f16f5d64843efeea5`. Release and publication remain
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
- Local work after that baseline is not published. No remote release or live
  Pages verification is claimed by this handoff.
- Local installer evidence for `b0b6a961473d026430a34a4f16f5d64843efeea5`:
  `build-installer.bat /s` produced `dist/OllamaSetup.exe` (472,056,790
  bytes; SHA-256
  `d6e9425f9bad7052811144be6a7aaaa93788d5242aa052beaf091d07164deae6`).
  Its signature status is `NotSigned`, and its PE version metadata carries
  the exact source commit. The recursive archive-coverage check covered 42
  nested payload files across the amd64 and arm64 archives.
- Final local checks at that commit: 79 script tests, the root inventory,
  suite, and design verifiers, `go test ./app/...`, and 459 UI tests across
  80 files all passed. Test-only console warnings are recorded in the task
  log; none changed the exit status.
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

1. **Pushes now do trigger CI runs; the earlier restriction has lifted.**
   Runs 32544293738 and 32544293950 (2026-08-22) were both `push`-triggered,
   so the account- or billing-level Actions restriction recorded here
   previously no longer applies. The workflow now filters to
   `push: branches: [main]` so a push to a side branch no longer mints a
   release; use `gh workflow run` for anything else.

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

6. **The canonical static landing source is ready locally, but live proof is
   pending.** `docs/landing-site/` is the Pages source and passed local
   desktop and mobile-emulation checks. The public root was still 404 before
   the final push, so no deployment is claimed until served-byte proof lands.

7. **`social-preview.png` needs a manual upload.** GitHub's social-preview
   setting has no API. It is committed at the repository root; a maintainer
   must upload it via Settings → General → Social preview.

8. **`app-display-name` is deliberately not verified.** The write-side UI is
   real, but `appName` has no readers — the title bar renders a hardcoded
   constant. The article says so rather than implying a working rename.

9. **Built-app capture is presently blocked by a user-owned installed
   instance.** The real capture preflight reaches the compiled app but its
   product-wide single-instance lock sends the isolated process to that
   existing instance. That process and profile were not stopped or inspected.
   Paired parity captures remain gaps, not evidence.

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

1. Push the integrated local work once, then verify the release and Pages
   workflows, their external assets, and the live Pages bytes.
2. Re-run the isolated built-app capture matrix after the existing installed
   instance is gone; record paired parity evidence or explicit row gaps.
3. Lift remaining `in-progress` desktop rows with focused checks and captures
   only where a capture actually demonstrates the feature.
4. Upload `social-preview.png` through Settings → General → Social preview.

## Build

```
cd app/ui/app && npm install && npm run build
node scripts/check-ui-css.mjs
scripts/build_windows.ps1 app          # needs CGO + llvm-mingw on PATH
node scripts/check-uh-inventory.mjs --self-test
```

`app/ui/app/dist` must exist before any Go build in that package
(`//go:embed app/dist`).
