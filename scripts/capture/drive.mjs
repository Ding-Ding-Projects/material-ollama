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
  cdpDiscoverPageTarget,
  cdpConnect,
  cdpEvaluate,
  cdpWaitForCaptureMarker,
} from './lib.mjs'

const DESKTOP_NAME = 'mo-capture-drive'
const SETTLE_AFTER_WINDOW_MS = 2_500 // let React finish its first real paint + data fetch

// Same shape as app/ui/app/src/theme/scheme.ts's DEFAULT_APPEARANCE, with
// theme flipped to "dark" -- written straight into localStorage under
// APPEARANCE_STORAGE_KEY ("mo-appearance") over CDP, then the page is
// reloaded so both boot.ts's pre-paint script and ThemeProvider.tsx pick it
// up fresh. Kept as a literal here (not imported) because scheme.ts lives
// under app/ui/app/src, outside this lane's allowed paths, and the shape is
// small and stable enough to duplicate deliberately -- see the dark-theme
// capture's own comment below for why this exact mechanism was chosen.
const DARK_APPEARANCE_JSON = JSON.stringify({ seed: '#8a5a00', theme: 'dark', radius: 16, overrides: {} })

// The desktop window's minimum size is hard-enforced natively --
// app/cmd/app/webview.go calls `wv.SetSize(800, 600, webview.HintMin)`,
// which Win32 honors via WM_GETMINMAXINFO (see app/webview/webview.h) no
// matter what a capture script asks for. A real OS-level resize can
// therefore never produce a genuinely narrow (down to ~375px) capture; the
// only way to render this build's actual DOM/CSS at that width is CDP's
// own viewport override, independent of the real window frame.
const NARROW_VIEWPORT = { width: 375, height: 812, deviceScaleFactor: 1, mobile: false }

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

// Extra capture states the release gate names as missing from the base
// per-route matrix above: a dark-theme pass, a dialog/overlay pass, and a
// narrow-layout pass. Each drives the running app over CDP to reach the
// state (see each function's own header comment below for exactly how and
// why), then captures it -- PrintWindow for the first two, CDP's own
// Page.captureScreenshot for the narrow one, since that state is
// physically unreachable by resizing the real OS window. References to
// captureDarkTheme/captureCommandPalette/captureNarrowLayout below resolve
// fine despite this constant appearing before their textual definitions --
// `async function` declarations are hoisted, and this array is not read
// until main() runs, well after module evaluation has finished.
const EXTRA_CAPTURES = [
  { id: 'models-dark', route: '/models', run: (...args) => captureDarkTheme(...args) },
  { id: 'command-palette', route: '/models', run: (...args) => captureCommandPalette(...args) },
  { id: 'launch-narrow', route: '/launch', run: (...args) => captureNarrowLayout(...args) },
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

/** Shared blankness/dimension check for the extra captures below --
 * identical contract to captureScreen()'s inline validation, factored out
 * because all three extra captures need it and none of them share
 * captureScreen()'s fixed-window-size assumption. */
function validateCapture(imagePath, { expectedWidth, expectedHeight, cliPath, label }) {
  const py = resolveCheapRoute({ cliOverride: cliPath }).pythonPath
  const validateArgs = [
    path.join(repoRoot, 'scripts/capture/validate_capture.py'),
    '--path',
    imagePath,
    '--expected-width',
    String(expectedWidth),
    '--expected-height',
    String(expectedHeight),
  ]
  const validateResult = spawnSync(py, validateArgs, { encoding: 'utf8' })
  let validation
  try {
    validation = JSON.parse(validateResult.stdout.trim())
  } catch {
    validation = {
      ok: false,
      reasons: [`validator produced no parseable output: ${validateResult.stdout} ${validateResult.stderr}`],
    }
  }
  if (!validation.ok) {
    throw new Error(`Blankness/dimension validation FAILED for ${label}: ${JSON.stringify(validation.reasons)}`)
  }
  return validation
}

/**
 * Dark-theme capture: the /models screen, re-themed to dark and re-
 * captured via the SAME Win32 PrintWindow method every other capture in
 * this harness uses -- CDP is used only to flip the theme, never to take
 * the picture. Mechanics:
 *   1. Launch /models normally (identical to captureScreen()).
 *   2. Connect CDP, write the dark Appearance into localStorage under the
 *      key boot.ts/ThemeProvider.tsx both read (APPEARANCE_STORAGE_KEY =
 *      "mo-appearance"), then Page.reload() so boot.ts's pre-paint script
 *      re-runs and sets document.documentElement.dataset.theme = "dark"
 *      before React ever mounts (see app/ui/app/src/theme/boot.ts).
 *   3. Poll for the models screen's own data-capture-ready marker to
 *      reappear post-reload (proves the reload actually completed and
 *      React remounted), plus one more fixed settle for the theme's own
 *      transition/paint.
 *   4. PrintWindow screenshot, exactly like every other screen here.
 * A localStorage write + reload was chosen over clicking the real
 * "dark"/"light" segmented control in Settings because that control lives
 * on a different route than /models, and clicking blind window
 * coordinates from outside the process is far less reliable than driving
 * the exact mechanism the app's own code already uses to persist and
 * re-apply the setting.
 */
async function captureDarkTheme({ cliPath, git, uiSourceHash, onPidLaunched }) {
  const route = '/models'
  const id = 'models-dark'
  const runId = tmpRunId(`capture-${id}`)
  const profileDir = makeScratchProfileDir(runId)
  const cdpPort = 19_420

  const pid = launchScreenReliable({ desktopName: DESKTOP_NAME, route, profileDir, cdpPort, cliPath })
  if (onPidLaunched) onPidLaunched(pid)
  let cdp
  try {
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })
    const win = resolveAppWindow({ desktopName: DESKTOP_NAME, pid, timeoutMs: 20_000, cliPath })
    sleepMs(SETTLE_AFTER_WINDOW_MS)

    const target = await cdpDiscoverPageTarget(cdpPort, { timeoutMs: 15_000 })
    cdp = cdpConnect(target)
    await cdp.ready

    await cdpEvaluate(
      cdp,
      `localStorage.setItem('mo-appearance', ${JSON.stringify(DARK_APPEARANCE_JSON)})`,
    )
    await cdp.send('Page.enable', {})
    await cdp.send('Page.reload', { ignoreCache: false })
    await cdpWaitForCaptureMarker(cdp, 'models', { timeoutMs: 20_000 })
    sleepMs(800) // let the reloaded scheme's own paint/transition settle

    const themeAfter = await cdpEvaluate(cdp, `document.documentElement.dataset.theme`)
    if (themeAfter !== 'dark') {
      throw new Error(`Theme flip did not take effect: document.documentElement.dataset.theme = ${JSON.stringify(themeAfter)}`)
    }

    const imageDir = path.join(CAPTURE_DIR, 'images')
    mkdirSync(imageDir, { recursive: true })
    const imagePath = path.join(imageDir, `${id}.png`)
    cheap('screenshot', { hwnd: win.handle, output_path: imagePath }, { cliPath })
    const validation = validateCapture(imagePath, { expectedWidth: win.width, expectedHeight: win.height, cliPath, label: id })

    const stat = statSync(imagePath)
    return {
      id,
      screen: id,
      route,
      theme: 'dark',
      commit: git.commit,
      dirty: git.dirty,
      uiSourceHash,
      artifact: {
        path: path.relative(repoRoot, BUILT_EXE_PATH).replace(/\\/g, '/'),
        sha256: sha256File(BUILT_EXE_PATH),
        bytes: statSync(BUILT_EXE_PATH).size,
      },
      captureMethod:
        'cheap-route screenshot(hwnd) -- Win32 PrintWindow, background capture on an off-screen desktop; ' +
        'theme flipped to dark beforehand via CDP Runtime.evaluate (localStorage["mo-appearance"]) + Page.reload',
      resolvedUrl: `http://127.0.0.1:${port}${route}`,
      window: { class: win.class, title: win.title, width: win.width, height: win.height, handle: win.handle },
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
      // Same screen, same content as the light-theme "models" capture --
      // only the color scheme differs, so the same feature ids genuinely
      // apply.
      features: ['model-store', 'hardware-fit', 'batch-pull-queue', 'regex-builder'],
    }
  } finally {
    if (cdp) cdp.close()
    killPidTree(pid, { cliPath })
  }
}

/**
 * Command-palette (dialog/overlay) capture: /models with the command
 * palette opened via Ctrl+Shift+F, captured with the same PrintWindow
 * method as every other screen. The keypress is dispatched as a synthetic
 * `KeyboardEvent` on `window` over CDP rather than a background window-
 * message keystroke -- app/ui/app/src/components/shell/AppShell.tsx's
 * palette shortcut is a plain `window.addEventListener("keydown", ...)`
 * checking `event.ctrlKey && event.shiftKey && event.key === "F"`, so a
 * same-shaped synthetic event is exactly what that listener is written to
 * handle, and it sidesteps the "modifier chords via generic window-message
 * keystrokes are unreliable" problem entirely by never going through
 * window messages at all.
 */
async function captureCommandPalette({ cliPath, git, uiSourceHash, onPidLaunched }) {
  const route = '/models'
  const id = 'command-palette'
  const runId = tmpRunId(`capture-${id}`)
  const profileDir = makeScratchProfileDir(runId)
  const cdpPort = 19_421

  const pid = launchScreenReliable({ desktopName: DESKTOP_NAME, route, profileDir, cdpPort, cliPath })
  if (onPidLaunched) onPidLaunched(pid)
  let cdp
  try {
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })
    const win = resolveAppWindow({ desktopName: DESKTOP_NAME, pid, timeoutMs: 20_000, cliPath })
    sleepMs(SETTLE_AFTER_WINDOW_MS)

    const target = await cdpDiscoverPageTarget(cdpPort, { timeoutMs: 15_000 })
    cdp = cdpConnect(target)
    await cdp.ready

    await cdpEvaluate(
      cdp,
      `window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F', ctrlKey: true, shiftKey: true, bubbles: true }))`,
    )
    await cdpWaitForCaptureMarker(cdp, 'command-palette', { timeoutMs: 10_000 })
    sleepMs(600) // let the Headless UI dialog's own open transition finish

    const imageDir = path.join(CAPTURE_DIR, 'images')
    mkdirSync(imageDir, { recursive: true })
    const imagePath = path.join(imageDir, `${id}.png`)
    cheap('screenshot', { hwnd: win.handle, output_path: imagePath }, { cliPath })
    const validation = validateCapture(imagePath, { expectedWidth: win.width, expectedHeight: win.height, cliPath, label: id })

    const stat = statSync(imagePath)
    return {
      id,
      screen: id,
      route,
      dialog: 'command-palette',
      commit: git.commit,
      dirty: git.dirty,
      uiSourceHash,
      artifact: {
        path: path.relative(repoRoot, BUILT_EXE_PATH).replace(/\\/g, '/'),
        sha256: sha256File(BUILT_EXE_PATH),
        bytes: statSync(BUILT_EXE_PATH).size,
      },
      captureMethod:
        'cheap-route screenshot(hwnd) -- Win32 PrintWindow, background capture on an off-screen desktop; ' +
        'command palette opened beforehand via a synthetic Ctrl+Shift+F KeyboardEvent dispatched over CDP',
      resolvedUrl: `http://127.0.0.1:${port}${route}`,
      window: { class: win.class, title: win.title, width: win.width, height: win.height, handle: win.handle },
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
      features: ['command-palette'],
    }
  } finally {
    if (cdp) cdp.close()
    killPidTree(pid, { cliPath })
  }
}

/**
 * Narrow-layout capture: /launch (its harness-card grid is
 * `grid gap-4 sm:grid-cols-2`, so it has an actual Tailwind breakpoint to
 * cross) rendered at a 375x812 viewport. Unlike the other two extra
 * captures, this one is NOT a PrintWindow shot: the real OS window has a
 * hard-enforced 800x600 minimum (app/cmd/app/webview.go's
 * `wv.SetSize(800, 600, webview.HintMin)`, honored via WM_GETMINMAXINFO --
 * see app/webview/webview.h), so no amount of resize_window-style Win32
 * resizing can ever make the actual window narrower than that. The only
 * way to render this build's real DOM/CSS at a genuinely narrow width is
 * CDP's own Emulation.setDeviceMetricsOverride + Page.captureScreenshot,
 * which captures the emulated viewport directly rather than the window
 * frame. This is still the real built app's real rendering, over the real
 * running WebView2 instance -- just a different (CDP-native) capture
 * mechanism than PrintWindow, used only because the alternative is
 * physically impossible against this build.
 *
 * What it actually shows is left to speak for itself in features[]: the
 * left tab rail does not collapse to icons at this width (the
 * `responsive-layout-and-sizing` contract's own requirement), and page
 * content clips/wraps rather than reflowing -- i.e. this capture is
 * evidence the contract is NOT yet met here, not evidence that it is, so
 * `responsive-layout-and-sizing` is deliberately left out of features[].
 */
async function captureNarrowLayout({ cliPath, git, uiSourceHash, onPidLaunched }) {
  const route = '/launch'
  const id = 'launch-narrow'
  const runId = tmpRunId(`capture-${id}`)
  const profileDir = makeScratchProfileDir(runId)
  const cdpPort = 19_422

  const pid = launchScreenReliable({ desktopName: DESKTOP_NAME, route, profileDir, cdpPort, cliPath })
  if (onPidLaunched) onPidLaunched(pid)
  let cdp
  try {
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })
    const win = resolveAppWindow({ desktopName: DESKTOP_NAME, pid, timeoutMs: 20_000, cliPath })
    sleepMs(SETTLE_AFTER_WINDOW_MS)

    const target = await cdpDiscoverPageTarget(cdpPort, { timeoutMs: 15_000 })
    cdp = cdpConnect(target)
    await cdp.ready

    await cdp.send('Emulation.setDeviceMetricsOverride', NARROW_VIEWPORT)
    sleepMs(600) // let the emulated viewport's own reflow settle
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })

    const imageDir = path.join(CAPTURE_DIR, 'images')
    mkdirSync(imageDir, { recursive: true })
    const imagePath = path.join(imageDir, `${id}.png`)
    writeFileSync(imagePath, Buffer.from(shot.data, 'base64'))
    const validation = validateCapture(imagePath, {
      expectedWidth: NARROW_VIEWPORT.width,
      expectedHeight: NARROW_VIEWPORT.height,
      cliPath,
      label: id,
    })

    const stat = statSync(imagePath)
    return {
      id,
      screen: id,
      route,
      viewport: { width: NARROW_VIEWPORT.width, height: NARROW_VIEWPORT.height },
      commit: git.commit,
      dirty: git.dirty,
      uiSourceHash,
      artifact: {
        path: path.relative(repoRoot, BUILT_EXE_PATH).replace(/\\/g, '/'),
        sha256: sha256File(BUILT_EXE_PATH),
        bytes: statSync(BUILT_EXE_PATH).size,
      },
      captureMethod:
        'CDP Page.captureScreenshot with Emulation.setDeviceMetricsOverride(375x812) -- the desktop window has a ' +
        'hard 800x600 minimum (app/cmd/app/webview.go webview.HintMin), so the real OS window cannot itself be ' +
        'resized this narrow; this is the real built app rendering its real DOM/CSS at an emulated viewport, not a ' +
        'PrintWindow capture of the actual (816x639) window frame',
      resolvedUrl: `http://127.0.0.1:${port}${route}`,
      window: { class: win.class, title: win.title, width: win.width, height: win.height, handle: win.handle },
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
      // Deliberately empty -- see the function header comment: this
      // capture is evidence the responsive-layout-and-sizing contract is
      // NOT yet met at this width, not evidence that it is.
      features: [],
    }
  } finally {
    if (cdp) cdp.close()
    killPidTree(pid, { cliPath })
  }
}

async function main() {
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

  console.error(`drive.mjs: capturing ${SCREENS.length} screens + ${EXTRA_CAPTURES.length} extra states at commit ${git.commit} (dirty=${git.dirty})`)

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

  for (const extra of EXTRA_CAPTURES) {
    console.error(`drive.mjs: capturing ${extra.id}...`)
    try {
      const entry = await extra.run({
        cliPath,
        git,
        uiSourceHash: stamp.uiSourceHash,
        onPidLaunched: (pid) => launchedPids.push(pid),
      })
      captures.push(entry)
      console.error(
        `drive.mjs: OK ${extra.id} -- ${entry.image.width}x${entry.image.height}, ${entry.image.distinctColors} colors, sha256=${entry.image.sha256.slice(0, 12)}...`,
      )
    } catch (err) {
      console.error(`drive.mjs: FAILED ${extra.id}: ${err.message}`)
      errors.push({ id: extra.id, route: extra.route, error: err.message })
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
  console.error(`drive.mjs: ${captures.length}/${SCREENS.length + EXTRA_CAPTURES.length} captures produced, ${errors.length} failed.`)

  if (errors.length > 0) process.exitCode = 1
}

main().catch((err) => {
  // main() is async now (the extra CDP-driven captures need real await),
  // so an error thrown before/between the per-screen try/catch blocks
  // (e.g. runPreflight, ensureTrayHost) would otherwise surface as a bare
  // Node "unhandled promise rejection" instead of this script's own clear
  // error reporting -- print it the same way every other failure here is
  // printed, then exit non-zero exactly as a synchronous throw would have.
  console.error(`drive.mjs: FAILED: ${err.stack || err.message}`)
  process.exit(1)
})
