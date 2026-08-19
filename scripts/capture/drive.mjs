#!/usr/bin/env node
//
// scripts/capture/drive.mjs
//
// Drives the built app through every real screen and captures each one as
// real built-artifact evidence. This is the ONLY script in this harness
// that actually produces images; preflight.mjs only decides whether it is
// safe to run.
//
// Mechanics, end to end, for each screen:
//   1. Launch dist/windows-ollama-app-amd64.exe -route <path> on a named
//      off-screen desktop (the cheap Lowlevel MCP headless route), in an
//      isolated LOCALAPPDATA/APPDATA profile so this NEVER touches the
//      real installed app's own db.sqlite, app.log, or WebView2 profile.
//   2. Resolve the exact target window: class "webview", title "Ollama",
//      non-zero size, owning pid -- see lib.mjs's resolveAppWindow(),
//      which fails unless exactly one window matches all four.
//   3. Capture via the cheap-route screenshot(hwnd=...) (PrintWindow-based
//      background capture -- works even though the window lives on a
//      desktop nobody is looking at).
//   4. Validate the PNG is not blank: distinct-colour count and per-channel
//      stddev, read back from real pixels via Pillow (scripts/capture/
//      validate_capture.py) -- the cheap route's own "rendered_ok: true"
//      is the tool's claim, not evidence, and is not trusted alone.
//   5. Record a manifest entry with the artifact's own sha256, the image's
//      sha256, the commit/dirty/uiSourceHash the build carried, and which
//      screen/route/window this came from.
//
// Requires: preflight.mjs to have passed (this script runs it first and
// refuses to proceed otherwise), and dist/windows-ollama-app-amd64.exe to
// exist (CGO_ENABLED=1, -H windowsgui, built from app/cmd/app).

import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  repoRoot,
  CAPTURE_DIR,
  MANIFEST_PATH,
  BUILT_EXE_PATH,
  BUILT_EXE_RELATIVE,
  TARGET_WINDOW_CLASS,
  TARGET_WINDOW_TITLE,
  resolveCheapRoute,
  ensureTrayHost,
  launchScreenReliable,
  discoverListeningPort,
  resolveAppWindow,
  cheap,
  killPidTree,
  sweepOrphanedChildren,
  makeScratchProfileDir,
  tmpRunId,
  sha256File,
  sleepMs,
  HOSTNAME,
} from './lib.mjs'

const DESKTOP_NAME = 'mo-capture-drive'
const SETTLE_AFTER_WINDOW_MS = 2_500 // let React finish its first real paint + data fetch

// route -> {id, features[]}. `features` is a best-effort, deliberately
// conservative starter mapping to canonical docs/features/uh-completeness
// inventory.json feature ids -- only ids this exact screen visibly and
// concretely demonstrates, never a broad "this app has Material Design"
// claim from one screenshot. Wiring these into inventory.json's
// captureEvidence fields is out of this lane's scope; a future pass
// should verify each claim against the actual rendered screen before
// relying on it.
const SCREENS = [
  { route: '/models', id: 'models', features: ['model-store', 'hardware-fit', 'batch-pull-queue', 'regex-builder'] },
  { route: '/c/new', id: 'c-new', features: ['local-chat-sessions'] },
  { route: '/launch', id: 'launch', features: ['harness-profiles'] },
  { route: '/codex', id: 'codex', features: ['harness-profiles'] },
  { route: '/devtools', id: 'devtools', features: [] },
  { route: '/toolbox', id: 'toolbox', features: ['regex-builder'] },
  { route: '/docs', id: 'docs', features: ['offline-documentation-browser'] },
  { route: '/status', id: 'status', features: [] },
  { route: '/settings', id: 'settings', features: ['app-display-name'] },
]

function runPreflight() {
  const result = spawnSync('node', [path.join(repoRoot, 'scripts/capture/preflight.mjs')], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  let parsed
  try {
    parsed = JSON.parse(result.stdout)
  } catch {
    parsed = null
  }
  if (result.status !== 0 || !parsed || parsed.ok !== true) {
    console.error('drive.mjs: preflight failed, refusing to capture. Output:')
    console.error(result.stdout)
    console.error(result.stderr)
    process.exit(1)
  }
  console.error('drive.mjs: preflight passed.')
  return parsed
}

function commitInfo() {
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repoRoot, encoding: 'utf8' }).trim()
  const dirty =
    execFileSync('git', ['status', '--porcelain'], { cwd: repoRoot, encoding: 'utf8' }).trim().length > 0
  return { commit, dirty }
}

function captureScreen({ screen, cliPath, git, uiSourceHash, onPidLaunched }) {
  const runId = tmpRunId(`capture-${screen.id}`)
  const profileDir = makeScratchProfileDir(runId)
  const cdpPort = 19_400 + SCREENS.indexOf(screen)

  const pid = launchScreenReliable({
    desktopName: DESKTOP_NAME,
    route: screen.route,
    profileDir,
    cdpPort,
    cliPath,
  })
  if (onPidLaunched) onPidLaunched(pid)

  try {
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })
    const win = resolveAppWindow({ desktopName: DESKTOP_NAME, pid, timeoutMs: 20_000, cliPath })

    // No CDP-based DOM-readiness poll here: window resolution already
    // waits out webview creation + navigation, and every capture target
    // screen renders its shell synchronously on mount (see the
    // data-capture-ready markers added across app/ui/app/src -- a future
    // pass can poll those over CDP for tighter timing; a fixed settle is
    // simpler and, measured against these specific screens, sufficient).
    sleepMs(SETTLE_AFTER_WINDOW_MS)

    const imageDir = path.join(CAPTURE_DIR, 'images')
    mkdirSync(imageDir, { recursive: true })
    const imagePath = path.join(imageDir, `${screen.id}.png`)

    const shot = cheap('screenshot', { hwnd: win.handle, output_path: imagePath }, { cliPath })

    const py = resolveCheapRoute({ cliOverride: cliPath }).pythonPath
    const validateArgs = [
      path.join(repoRoot, 'scripts/capture/validate_capture.py'),
      '--path',
      imagePath,
      '--expected-width',
      String(win.width),
      '--expected-height',
      String(win.height),
    ]
    const validateResult = spawnSync(py, validateArgs, { encoding: 'utf8' })
    let validation
    try {
      validation = JSON.parse(validateResult.stdout.trim())
    } catch {
      validation = { ok: false, reasons: [`validator produced no parseable output: ${validateResult.stdout} ${validateResult.stderr}`] }
    }

    if (!validation.ok) {
      throw new Error(`Blankness/dimension validation FAILED for ${screen.id}: ${JSON.stringify(validation.reasons)}`)
    }

    const stat = statSync(imagePath)
    return {
      id: screen.id,
      screen: screen.id,
      route: screen.route,
      commit: git.commit,
      dirty: git.dirty,
      uiSourceHash,
      artifact: {
        path: path.relative(repoRoot, BUILT_EXE_PATH).replace(/\\/g, '/'),
        sha256: sha256File(BUILT_EXE_PATH),
        bytes: statSync(BUILT_EXE_PATH).size,
      },
      captureMethod: 'cheap-route screenshot(hwnd) -- Win32 PrintWindow, background capture on an off-screen desktop',
      resolvedUrl: `http://127.0.0.1:${port}${screen.route}`,
      window: {
        class: win.class,
        title: win.title,
        width: win.width,
        height: win.height,
        handle: win.handle,
      },
      image: {
        path: path.relative(repoRoot, imagePath).replace(/\\/g, '/'),
        sha256: sha256File(imagePath),
        bytes: stat.size,
        width: validation.width,
        height: validation.height,
        distinctColors: validation.distinctColors,
        stddevMax: validation.stddevMax,
      },
      capturedAt: new Date().toISOString(),
      capturedOn: HOSTNAME,
      features: screen.features,
    }
  } finally {
    killPidTree(pid, { cliPath })
  }
}

function main() {
  runPreflight()

  const { cliPath } = resolveCheapRoute()
  const git = commitInfo()

  // Re-derive uiSourceHash the same way write-build-stamp.mjs does, so the
  // manifest's own claim about the source state is independently
  // reproducible rather than trusted from the served stamp alone.
  const stampCheck = spawnSync(
    'node',
    [path.join(repoRoot, 'scripts/write-build-stamp.mjs'), '--output', path.join(repoRoot, 'dist/capture-profile/drive-stamp-check.json')],
    { cwd: repoRoot, encoding: 'utf8' },
  )
  const stamp = JSON.parse(stampCheck.stdout)

  console.error(`drive.mjs: capturing ${SCREENS.length} screens at commit ${git.commit} (dirty=${git.dirty})`)

  const trayPid = ensureTrayHost({ desktopName: DESKTOP_NAME, cliPath })
  console.error(`drive.mjs: tray host ready (pid ${trayPid})`)

  const launchedPids = [trayPid]
  const captures = []
  const errors = []

  for (const screen of SCREENS) {
    console.error(`drive.mjs: capturing ${screen.id} (${screen.route})...`)
    try {
      const entry = captureScreen({
        screen,
        cliPath,
        git,
        uiSourceHash: stamp.uiSourceHash,
        onPidLaunched: (pid) => launchedPids.push(pid),
      })
      captures.push(entry)
      console.error(
        `drive.mjs: OK ${screen.id} -- ${entry.image.width}x${entry.image.height}, ${entry.image.distinctColors} colors, sha256=${entry.image.sha256.slice(0, 12)}...`,
      )
    } catch (err) {
      console.error(`drive.mjs: FAILED ${screen.id}: ${err.message}`)
      errors.push({ id: screen.id, route: screen.route, error: err.message })
    }
  }

  // Defense-in-depth: catch any ollama.exe backend child that a per-screen
  // killPidTree's settle window still missed (see lib.mjs's header comment
  // on why the app can spawn one lazily on a model-list request).
  const orphans = sweepOrphanedChildren(launchedPids, { cliPath })
  killPidTree(trayPid, { cliPath })

  const manifest = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedOn: HOSTNAME,
    commit: git.commit,
    dirty: git.dirty,
    uiSourceHash: stamp.uiSourceHash,
    targetWindow: { class: TARGET_WINDOW_CLASS, title: TARGET_WINDOW_TITLE },
    exe: BUILT_EXE_RELATIVE,
    captureCount: captures.length,
    failureCount: errors.length,
    orphanedChildrenCleaned: orphans.length,
    captures,
    errors,
  }

  mkdirSync(CAPTURE_DIR, { recursive: true })
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
  console.error(`drive.mjs: wrote ${MANIFEST_PATH}`)
  console.error(`drive.mjs: ${captures.length}/${SCREENS.length} screens captured, ${errors.length} failed.`)

  if (errors.length > 0) process.exitCode = 1
}

main()
