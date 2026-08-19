# Handoff

Last updated: 2026-08-19. Written against the repository as it actually is, not
as it was planned. Every number below was measured, not remembered.

## What this project is right now

Material Ollama is a fork of `ollama/ollama` adding a desktop GUI layer: a Go
host (`app/`) that embeds a React SPA (`app/ui/app/`) and serves it to a native
WebView2 window over `127.0.0.1` behind a token cookie.

A Material Design 3 rewrite of that UI is **in progress and incomplete**. The
foundations have landed; the screens have not. Concretely: the design token
system, runtime theming, bundled fonts and icons, a cross-cutting
language/tone/accessibility layer, the settings store, the MD3 primitive
component set, and the model-store backend all exist. **The nine screens the
design specifies do not yet exist**, and the app still renders its original
pre-rewrite interface.

## Current state

- Default branch tip: see `git log -1 main`. Sixteen commits landed in the
  rewrite session that produced this handoff.
- Published baseline: **`v0.0.0-build.11`**, a non-draft release targeting
  commit `58ba7e87`, carrying 55 assets with no zero-byte asset, including
  `OllamaSetup.exe` (40,198,067 bytes), `SHA256SUMS.txt` and `install.ps1`.
  Verified by querying the release for its tag, draft flag, target commit and
  asset sizes.
- **That release contains only the first of the landed changes.** It targets
  `58ba7e87`; everything after it is on the default branch and not in any
  published release.

## What landed

| Area | State |
| --- | --- |
| Build pipeline colour fix | landed |
| Installer: system PATH, uninstall cleanup, per-user→machine migration guard | landed, **not compiled or run** |
| Cross-cutting layer (language modes, tone levels, restricted mode, vocabulary, narration) | landed, no consumers yet |
| MD3 token system + runtime theme generation | landed |
| Bundled fonts + icon sprite | landed (307 KB added) |
| Settings store: `UIPreferences`, schema v17, OS credential vault | landed |
| MD3 primitive components (21) | landed, **zero call sites** |
| Model store backend: hardware detection, fit verdicts, pull queue | landed, **no UI** |
| Nine MD3 screens | **not started** |
| App shell (title bar, tab strip, navigation rail) | in progress, unmerged |
| Docker container manager | in progress, unmerged |
| Catalog service, file converter, docs articles, capture harness | **not started** |

## Verification status — read this before trusting anything above

This session ran under a deliberate speed tradeoff: **no test suites, no
linting, no screenshots, and no runtime verification were performed on the
landed work.** "Landed" means the code compiles and was merged. It does not
mean it runs, and nobody has launched the application.

What *was* verified:

- The React build (`npm run build`, i.e. `tsc -b && vite build`) succeeds.
- `scripts/check-ui-css.mjs` passes all four checks against the emitted
  stylesheet. This guard was watched failing all four before the fix landed.
- The pre-existing test suite still passes: **4 test files, 27 tests**
  (`npx vitest run` in `app/ui/app`).
- The settings migration has two focused tests that pass
  (`TestMigrationV16ToV17`, `TestExportContainsNoSecrets`).

## Test inventory

- **React UI**: 4 files, 27 tests, runner `npx vitest run` in `app/ui/app`.
  Files: `components/StreamingMarkdownContent.test.tsx`,
  `utils/clipboard.test.ts`, `utils/fileValidation.test.ts`,
  `utils/vram.test.ts`.
  **Note the environment is `node`, not `jsdom`** — there is no DOM and no
  React Testing Library, so no component-interaction test is currently
  possible. Introducing one requires a Vitest projects split; the existing four
  files depend on the `node` environment and must keep it.
  `npm test` is **watch mode** and will hang any automated gate; use
  `npx vitest run`.
- **Go**: 18 `_test.go` files under `app/`. Runner `go test ./app/...`.
  Build-tagged `windows || darwin`.

### Checks that run against the built artifact rather than source

Only `scripts/check-ui-css.mjs`. It reads the emitted CSS in
`app/ui/app/dist/assets/*.css`, because the defect it guards is invisible from
both `vite.config.ts` and `src/index.css` — the source reads perfectly while
the shipped stylesheet is wrong. Everything else tests source.

## Boundaries and known problems

1. **Pushes do not trigger CI runs.** Sixteen commits were pushed; zero
   workflow runs were created. `gh workflow run` works immediately every time.
   The workflow is `state: active`, declares `on: push`, and the repository is
   neither archived nor disabled. This points at an account- or billing-level
   Actions restriction not visible through the API. **Every build in this
   session was dispatched by hand.** Until this is resolved, pushing does not
   produce a build.

2. **`gh` resolves `:owner/:repo` to the wrong repository.** This checkout has
   an `upstream` remote pointing at `ollama/ollama`, and `gh` selects it.
   `gh api repos/:owner/:repo --jq .full_name` returns `ollama/ollama`. Every
   `gh` invocation must pass `-R Ding-Ding-Projects/material-ollama`
   explicitly, or it silently reports on the upstream project. Prove pushes
   with `git ls-remote origin` rather than the API.

3. **Building `app/ui` requires CGO.** `app/ui` transitively imports
   `x/mlxrunner/mlx`, whose `array.go` and `compile.go` are cgo files. With
   `CGO_ENABLED=0` (the default when no C compiler is on `PATH`) Go excludes
   them and the build fails with `undefined: Array`, `undefined: Compile1`,
   `undefined: Shapeless`. **This is not a broken tree** — it is a missing C
   toolchain. The release build uses the pinned llvm-mingw dependency.

4. **The feature inventory is entirely unverified.** `docs/features/uh-completeness/inventory.json`
   holds 85 features across two surfaces; **all 170 rows are `missing` with
   every evidence field `null`.** The referenced article directory
   `docs/features/uh-completeness/articles/` does not exist, so all 85 article
   paths dangle.

5. **`scripts/check-uh-inventory.mjs` cannot detect false evidence.** It checks
   only `typeof x === 'string' && x.trim() !== ''`. A row can be marked
   `verified` with evidence strings naming files that do not exist and it will
   pass. It is also wired into nothing — no root `package.json`, no hook, and
   the release workflow never calls it.

6. **The new lint rule reports 149 violations.** `uh/no-unlocalized-text` flags
   raw user-facing strings in screens that have not migrated, against a
   pre-existing baseline of 44 problems. This is expected and is the migration
   progress counter; it should reach zero as screens convert. Lint is not gated
   anywhere, so nothing automated is affected.

7. **The installer changes are uncompiled.** `app/ollama.iss` gained system-PATH
   support, uninstall-time PATH removal and a migration guard. Inno Setup was
   not run, and no install, upgrade or uninstall was performed.

8. **Two lanes are unmerged and in progress**: the app shell and the Docker
   container manager. See the branch list.

## Next actions, in the order they unblock the most

1. Resolve the CI push trigger (item 1). Everything else is slower without it.
2. Land the app shell and Docker lanes.
3. Build the nine screens against the backends that already exist.
4. Harden `check-uh-inventory.mjs` so evidence must resolve on disk, with
   negative regressions proving each new assertion fires.
5. Add DOM-capable test infrastructure via a Vitest projects split, keeping the
   existing four files on the `node` environment.
6. Write the 85 documentation articles; add a bundling guard that fails when a
   file on disk is missing from the bundle.
7. Build the capture harness. Note the window class is **`webview`** with title
   `Ollama` — `Chrome_WidgetWin_1` is the WebView2 render widget underneath,
   and the tray window is `OllamaClass` with an empty title. Resolve by class
   and title, never by index.

## Build

```
cd app/ui/app && npm install && npm run build     # React SPA into dist/
node scripts/check-ui-css.mjs                     # guard the emitted CSS
scripts/build_windows.ps1 app                     # desktop app (needs CGO)
```

`app/ui/app/dist` must exist before the Go build; `app/ui/app.go` embeds it
with `//go:embed app/dist`.
