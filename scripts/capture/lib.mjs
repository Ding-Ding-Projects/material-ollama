// scripts/capture/lib.mjs
//
// Shared plumbing for the capture harness (preflight.mjs, drive.mjs). Talks
// to the installed "cheap Lowlevel MCP headless route" CLI
// (lowlevel-computer-use-cheap.exe) as a one-shot subprocess per call --
// this is NOT a persistent daemon, so anything that needs to survive
// between calls (a headless desktop, a launched process) only survives
// because a real Windows process is still running on it. See the header
// comments on launchScreen() below for what that costs in practice.
//
// Every function here is Windows-only, by design: the whole point is
// driving a real win32 GUI app on a named off-screen desktop without ever
// touching the operator's visible desktop, cursor, or keyboard focus.

import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const scriptDir = path.dirname(fileURLToPath(import.meta.url))
export const repoRoot = path.resolve(scriptDir, '..', '..')

export const BUILT_EXE_RELATIVE = 'dist/windows-ollama-app-amd64.exe'
export const BUILT_EXE_PATH = path.join(repoRoot, BUILT_EXE_RELATIVE)
export const BUILT_EXE_BASENAME = path.basename(BUILT_EXE_RELATIVE)

export const CAPTURE_DIR = path.join(repoRoot, 'docs/features/uh-completeness/captures')
export const MANIFEST_PATH = path.join(CAPTURE_DIR, 'manifest.json')

// The window this app creates has class "webview" (registered in
// app/webview/webview.h's wc.lpszClassName = L"webview") and title "Ollama"
// (set via wv.SetTitle("Ollama") in app/cmd/app/webview.go). The
// Chrome_WidgetWin_1 you'll also see on the desktop is WebView2's own
// render-widget window, parented UNDER the real top-level window -- do not
// resolve by that class, you'll capture the wrong HWND.
export const TARGET_WINDOW_CLASS = 'webview'
export const TARGET_WINDOW_TITLE = 'Ollama'

/**
 * Resolve the cheap CLI + its bundled venv Python, in priority order:
 * explicit override -> env var -> PATH -> the documented default install
 * location. Throws with a clear, actionable message if none is found --
 * this harness has exactly one supported route and no visible-desktop
 * fallback, per the hard rules it runs under.
 */
export function resolveCheapRoute({ cliOverride } = {}) {
  const candidates = []
  if (cliOverride) candidates.push(cliOverride)
  if (process.env.LOWLEVEL_CHEAP_CLI) candidates.push(process.env.LOWLEVEL_CHEAP_CLI)
  candidates.push(
    path.join(
      process.env.LOCALAPPDATA || '',
      'lowlevel-computer-use-cheap-runtime',
      'Scripts',
      'lowlevel-computer-use-cheap.exe',
    ),
  )

  let cliPath = candidates.find((p) => p && existsSync(p))
  if (!cliPath) {
    // PATH lookup, last resort: only pay for it (and its noisy "not found"
    // stdout when it misses) when none of the documented locations panned
    // out. `where` writes straight to the child's inherited stdout even
    // under execFileSync's default 'pipe' stdio on this host, so it must
    // be explicitly silenced rather than merely wrapped in try/catch.
    try {
      const where = execFileSync('where', ['lowlevel-computer-use-cheap.exe'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      })
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter(Boolean)
      cliPath = where.find((p) => p && existsSync(p))
    } catch {
      // "where" exits non-zero when nothing matches; that's fine, it just
      // means none of the documented locations or PATH have it.
    }
  }
  if (!cliPath) {
    throw new Error(
      'Could not find lowlevel-computer-use-cheap.exe (the cheap Lowlevel MCP headless route). ' +
        'Set LOWLEVEL_CHEAP_CLI to its full path, or install it at the documented default location ' +
        '(%LOCALAPPDATA%\\lowlevel-computer-use-cheap-runtime\\Scripts\\lowlevel-computer-use-cheap.exe). ' +
        'This harness refuses to fall back to a visible-desktop or browser-plugin route.',
    )
  }
  const pythonPath = path.join(path.dirname(cliPath), 'python.exe')
  return { cliPath, pythonPath: existsSync(pythonPath) ? pythonPath : null }
}

/**
 * Run one cheap-route tool call as a fresh one-shot process and return its
 * parsed JSON result. Throws on a non-zero exit, unparseable stdout, or an
 * {"ok": false, ...} response -- callers that want to inspect a failure
 * without throwing should catch and read error.result.
 *
 * IMPORTANT: each call is a SEPARATE process with its own empty in-memory
 * desktop registry (see lowlevel_computer_use_mcp.server:_cheap_main -- it
 * calls the tool function directly via asyncio.run(), no daemon behind it).
 * A headless desktop created by one call is destroyed the instant that
 * process exits UNLESS something else (a launched GUI process) is still
 * running on it. In practice this means create_headless_desktop as a
 * standalone step is a no-op for this harness; launchScreen() below relies
 * on launch_on_headless_desktop's own "create if missing" behavior instead.
 */
export function cheap(tool, params = {}, { cliPath, env, timeoutMs = 30_000 } = {}) {
  const { cliPath: resolvedCli } = cliPath ? { cliPath } : resolveCheapRoute()
  const args = [tool]
  for (const [key, value] of Object.entries(params)) {
    args.push(`--${key}`, typeof value === 'string' ? value : JSON.stringify(value))
  }
  const result = spawnSync(resolvedCli, args, {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: env ?? process.env,
    windowsHide: true,
  })
  if (result.error) {
    throw new Error(`cheap ${tool} failed to spawn: ${result.error.message}`)
  }
  if (result.status === null) {
    throw new Error(`cheap ${tool} timed out after ${timeoutMs}ms (stderr: ${result.stderr?.slice(0, 500)})`)
  }
  const stdout = (result.stdout || '').trim()
  let parsed
  try {
    parsed = JSON.parse(stdout)
  } catch (err) {
    throw new Error(
      `cheap ${tool} produced non-JSON stdout (exit ${result.status}): ${stdout.slice(0, 500)} ` +
        `/// stderr: ${(result.stderr || '').slice(0, 500)} /// parse error: ${err.message}`,
    )
  }
  if (parsed.ok !== true) {
    const err = new Error(`cheap ${tool} reported failure: ${parsed.error ?? JSON.stringify(parsed)}`)
    err.result = parsed
    throw err
  }
  return parsed
}

/**
 * Find already-running processes matching our built exe's basename,
 * system-wide (process enumeration is desktop-agnostic, unlike window
 * enumeration -- a stray process from a crashed prior run is findable even
 * though its window lives on a headless desktop we can't otherwise see
 * into without a name). Never matches the REAL installed app: that ships
 * as "ollama app.exe", a different basename from our
 * windows-ollama-app-amd64.exe dev build, so this can never collide with
 * or report on a genuine user-facing instance.
 */
export function findRunningCaptureProcesses(exeBasename = BUILT_EXE_BASENAME) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `Get-CimInstance Win32_Process -Filter "Name = '${exeBasename.replace(/'/g, "''")}'" |`,
    '  Select-Object ProcessId, ExecutablePath, CommandLine |',
    '  ConvertTo-Json -Compress',
  ].join('\n')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  })
  if (result.status !== 0) return []
  const out = (result.stdout || '').trim()
  if (!out) return []
  const parsed = JSON.parse(out)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((r) => ({ pid: r.ProcessId, exePath: r.ExecutablePath, commandLine: r.CommandLine }))
}

/** Kill by exact PID only -- never by name, so a same-named unrelated process is never at risk. */
export function killPid(pid, { cliPath } = {}) {
  try {
    return cheap('kill_process', { pid, force: true }, { cliPath })
  } catch (err) {
    // Already gone is fine; anything else is worth surfacing.
    if (!/No process|not found/i.test(String(err.message))) throw err
    return null
  }
}

/**
 * Find live child processes of `pid` (by exact ParentProcessId, never by
 * name). app/server/server.go falls back to exec.LookPath("ollama.exe")
 * when no bundled binary is found beside the app exe, and on a machine
 * that also has the real Ollama installed and on PATH, our headless-
 * launched app WILL spawn that real `ollama.exe serve` as its model
 * backend -- confirmed directly: a smoke-test launch left an orphaned
 * `ollama.exe serve` (parent = our launched pid) running and holding a
 * lock on our own scratch profile's log file after the parent was killed.
 * Windows does not kill a process tree by default, so the parent alone is
 * not enough.
 */
export function findChildPids(parentPid) {
  const script = [
    '$ErrorActionPreference = "Stop"',
    `Get-CimInstance Win32_Process -Filter "ParentProcessId = ${Number(parentPid)}" |`,
    '  Select-Object ProcessId, Name |',
    '  ConvertTo-Json -Compress',
  ].join('\n')
  const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
    encoding: 'utf8',
    timeout: 15_000,
    windowsHide: true,
  })
  if (result.status !== 0) return []
  const out = (result.stdout || '').trim()
  if (!out) return []
  const parsed = JSON.parse(out)
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  return rows.map((r) => ({ pid: r.ProcessId, name: r.Name }))
}

/**
 * Kill `pid` and every child it has spawned, including one that has not
 * appeared yet: app/server/server.go starts the `ollama serve` backend
 * lazily (on first model-list/proxy request, which the /models screen
 * itself triggers), so a naive "check children once, then kill" can run
 * its child-lookup before that spawn lands and orphan it -- measured
 * directly: an `ollama.exe serve` child was still alive and holding a
 * lock on its own log file after killPid(parent) alone. Poll briefly for
 * a child to appear, kill whatever is found (before or after), then kill
 * the parent last so a child spawned in the gap is still attributable to
 * a still-listed ParentProcessId.
 *
 * Even this is not airtight against Windows process-creation not being
 * atomic: a child whose CreateProcess call was in flight at the exact
 * moment the parent got force-killed can still finish becoming a real
 * orphaned process after this function returns -- observed once, live,
 * across a real 9-screen run. sweepOrphanedChildren() below is the
 * end-of-run second pass that catches that; a fully airtight fix would
 * assign each launched process to a Windows Job Object with
 * JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE, which is out of scope here.
 */
export function killPidTree(pid, { cliPath, settleMs = 1_500, intervalMs = 200 } = {}) {
  const deadline = Date.now() + settleMs
  const seen = new Map()
  while (Date.now() < deadline) {
    for (const child of findChildPids(pid)) seen.set(child.pid, child)
    sleepMs(intervalMs)
  }
  for (const child of findChildPids(pid)) seen.set(child.pid, child)
  for (const child of seen.values()) killPid(child.pid, { cliPath })
  return killPid(pid, { cliPath })
}

/** Poll Get-NetTCPConnection for the loopback port a given pid is listening on. */
export function discoverListeningPort(pid, { timeoutMs = 15_000, intervalMs = 250 } = {}) {
  const deadline = Date.now() + timeoutMs
  const script = [
    '$ErrorActionPreference = "SilentlyContinue"',
    `Get-NetTCPConnection -OwningProcess ${pid} -State Listen |`,
    '  Where-Object { $_.LocalAddress -eq "127.0.0.1" } |',
    '  Select-Object -ExpandProperty LocalPort |',
    '  ConvertTo-Json -Compress',
  ].join('\n')
  while (Date.now() < deadline) {
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], {
      encoding: 'utf8',
      timeout: 10_000,
      windowsHide: true,
    })
    const out = (result.stdout || '').trim()
    if (out) {
      const parsed = JSON.parse(out)
      const ports = Array.isArray(parsed) ? parsed : [parsed]
      const port = ports.find((p) => Number.isInteger(p) && p > 0)
      if (port) return port
    }
    sleepMs(intervalMs)
  }
  throw new Error(`Timed out after ${timeoutMs}ms waiting for pid ${pid} to open a 127.0.0.1 listening port`)
}

/** Block for `ms` milliseconds. Shared by every poll loop below. */
export function sleepMs(ms) {
  spawnSync('powershell.exe', ['-NoProfile', '-Command', `Start-Sleep -Milliseconds ${ms}`], { timeout: ms + 5_000 })
}

/**
 * The app's tray icon setup (app/wintray/tray.go's initInstance) ends with
 * `return t.nid.add()`, which calls Shell_NotifyIconW(NIM_ADD). That shell
 * API needs a real notification-area host window (class "Shell_TrayWnd")
 * to talk to -- and a freshly created off-screen desktop has no shell of
 * its own, so it has none. Measured directly: launching the app's own
 * built exe on a bare headless desktop fails osRun() at
 * `wintray.NewTray()` with "Unable to init instance: Unspecified error"
 * every single time (verified via a throwaway program that called
 * wintray.NewTray() directly and logged each underlying Win32 call --
 * every call up through CreateWindowEx succeeded; the failure is
 * Shell_NotifyIconW at the very end of initInstance, which nothing on the
 * Go side is in a position to catch or report more precisely). Launching
 * a real `explorer.exe` on that SAME desktop first gives it its own
 * Shell_TrayWnd (confirmed by list_headless_windows -- explorer.exe
 * creates one at its normal ~1920x48 taskbar size), after which
 * wintray.NewTray() succeeds. This is not a workaround bolted onto the
 * app: it is providing the same kind of shell environment the app already
 * expects to find on a real interactive desktop, on the off-screen one
 * instead.
 *
 * This explorer.exe instance lives ONLY on the named off-screen desktop
 * (CreateProcessW's STARTUPINFO.lpDesktop pins it there) and is tracked
 * and killed by its own exact pid -- it is never the user's real Explorer
 * shell on their interactive desktop, and killing it cannot affect their
 * taskbar, desktop icons, or open windows.
 */

// Extra settle time after Shell_TrayWnd first appears. The window itself
// is one of explorer.exe's earliest creations, but its Shell_NotifyIconW
// RPC/COM endpoint is not reliably live the instant the window exists --
// measured directly and repeatedly: wintray.NewTray() (both this app's own
// build AND the officially shipped 0.32.14 binary) intermittently fails
// with "Unable to init instance: Unspecified error" against a headless
// desktop's Shell_TrayWnd even several seconds after it appears, then
// SUCCEEDS moments later against that exact same tray host with no other
// change -- this is a genuine race in the shell's own notification RPC
// startup on an off-screen desktop, not a bug in this app or in how it is
// launched here, and not something a fixed settle delay eliminates on its
// own. Empirically: a single ~4s gap between explorer.exe starting and the
// app launching failed; two more attempts 8-13s after explorer started
// both succeeded. This constant plus launchScreenReliable()'s retry loop
// below (which re-checks the tray host and backs off between attempts) is
// the combined mitigation -- treat either alone as insufficient.
const TRAY_HOST_SETTLE_MS = 10_000

export function ensureTrayHost({ desktopName, timeoutMs = 20_000, intervalMs = 300, cliPath }) {
  const already = desktopHasWindow({ desktopName, windowClass: 'Shell_TrayWnd', cliPath })
  if (already) return already.process_id

  const result = spawnSync(
    resolveCheapRoute({ cliOverride: cliPath }).cliPath,
    ['launch_on_headless_desktop', '--name', desktopName, '--command', 'C:\\Windows\\explorer.exe'],
    { encoding: 'utf8', timeout: 20_000, windowsHide: true },
  )
  if (result.status !== 0) {
    throw new Error(`Failed to launch the desktop's tray host (explorer.exe): ${result.stderr || result.stdout}`)
  }
  const parsed = JSON.parse((result.stdout || '').trim())
  if (parsed.ok !== true) throw new Error(`Failed to launch tray host: ${parsed.error}`)

  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const found = desktopHasWindow({ desktopName, windowClass: 'Shell_TrayWnd', cliPath })
    if (found) {
      sleepMs(TRAY_HOST_SETTLE_MS)
      return found.process_id
    }
    sleepMs(intervalMs)
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for explorer.exe to create Shell_TrayWnd on desktop "${desktopName}"`,
  )
}

function desktopHasWindow({ desktopName, windowClass, cliPath }) {
  try {
    const listed = cheap('list_headless_windows', { name: desktopName }, { cliPath })
    const match = (listed.windows || []).find((w) => w.class === windowClass)
    return match ?? null
  } catch {
    return null
  }
}

/**
 * Build an isolated env block for launching the app: separate LOCALAPPDATA
 * / APPDATA so the harness NEVER reads or writes the real installed app's
 * %LOCALAPPDATA%\Ollama\db.sqlite, app.log, or WebView2 profile, and a
 * WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS entry that opens a CDP debugging
 * port. webview.h creates its WebView2 environment with a null
 * ICoreWebView2EnvironmentOptions (see embed()'s
 * create_environment_with_options(nullptr, userDataFolder, nullptr, ...)
 * call), which is exactly the condition under which WebView2 honors this
 * env var -- no Go/C++ source change required for it to take effect.
 */
export function buildIsolatedEnv({ profileDir, cdpPort }) {
  const localAppData = path.join(profileDir, 'Local')
  const roamingAppData = path.join(profileDir, 'Roaming')
  mkdirSync(localAppData, { recursive: true })
  mkdirSync(roamingAppData, { recursive: true })
  return {
    ...process.env,
    LOCALAPPDATA: localAppData,
    APPDATA: roamingAppData,
    WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${cdpPort}`,
  }
}

/**
 * Launch the built app on a named off-screen desktop, opening `route` on
 * startup via the -route flag (app/cmd/app/app.go), with an isolated
 * profile. Returns the launched pid. Does NOT wait for the window to
 * appear -- call resolveAppWindow() next.
 */
export function launchScreen({ desktopName, route, profileDir, cdpPort, exePath = BUILT_EXE_PATH, cliPath }) {
  if (!existsSync(exePath)) {
    throw new Error(`Built app exe not found at ${exePath}. Build it before driving captures.`)
  }
  const env = buildIsolatedEnv({ profileDir, cdpPort })
  // CreateProcessW(lpEnvironment=None) in winio.launch_on_desktop() means
  // "inherit the CALLING process's environment" -- and since the cheap CLI
  // is a fresh one-shot process per call (see cheap() above), the env we
  // pass to *this* spawnSync call is exactly what the launched app inherits.
  const { cliPath: resolvedCli } = cliPath ? { cliPath } : resolveCheapRoute()
  const command = `"${exePath}" -route ${route}`
  // winio.launch_on_desktop() also passes lpCurrentDirectory=None, so the
  // launched app inherits THIS spawnSync call's cwd. Pin it to the exe's
  // own directory so app_windows.go's init()-time "developer mode" probe
  // (os.Getwd() + "dist/windows-<arch>/ollama.exe") resolves against a
  // real, known location instead of whatever directory happened to be
  // current when this script was invoked from -- verified necessary: an
  // unrelated checkout's stray dist/windows-amd64/ollama.exe was picked up
  // this way when cwd was left unset during manual testing.
  const result = spawnSync(resolvedCli, ['launch_on_headless_desktop', '--name', desktopName, '--command', command], {
    encoding: 'utf8',
    timeout: 20_000,
    env,
    cwd: path.dirname(exePath),
    windowsHide: true,
  })
  if (result.status !== 0) {
    throw new Error(`launch_on_headless_desktop failed (exit ${result.status}): ${result.stderr || result.stdout}`)
  }
  const parsed = JSON.parse((result.stdout || '').trim())
  if (parsed.ok !== true) throw new Error(`launch_on_headless_desktop reported failure: ${parsed.error}`)
  return parsed.pid
}

/**
 * Poll list_headless_windows on `desktopName` until EXACTLY ONE window
 * matches class=webview AND title=Ollama AND non-zero size AND the
 * launched pid. Never indexes into the window list -- a desktop this app
 * runs on typically also carries IME/Cicero/UAC helper windows (observed:
 * 10-13 extra entries for other apps under the same route), so "first
 * match" or "any match" is not good enough.
 */
export function resolveAppWindow({ desktopName, pid, timeoutMs = 30_000, intervalMs = 300, cliPath }) {
  const deadline = Date.now() + timeoutMs
  let lastWindows = []
  while (Date.now() < deadline) {
    let listed
    try {
      listed = cheap('list_headless_windows', { name: desktopName }, { cliPath })
    } catch {
      listed = null
    }
    if (listed) {
      lastWindows = listed.windows || []
      const matches = lastWindows.filter(
        (w) =>
          w.class === TARGET_WINDOW_CLASS &&
          w.title === TARGET_WINDOW_TITLE &&
          w.width > 0 &&
          w.height > 0 &&
          w.process_id === pid,
      )
      if (matches.length === 1) return matches[0]
      if (matches.length > 1) {
        throw new Error(
          `Ambiguous target window: ${matches.length} windows matched class/title/size/pid on desktop ` +
            `"${desktopName}" (pid ${pid}): ${JSON.stringify(matches)}`,
        )
      }
    }
    sleepMs(intervalMs)
  }
  throw new Error(
    `Timed out after ${timeoutMs}ms resolving the target window (class=${TARGET_WINDOW_CLASS} title=${TARGET_WINDOW_TITLE} ` +
      `pid=${pid}) on desktop "${desktopName}". Windows last seen there: ${JSON.stringify(lastWindows)}`,
  )
}

/** True if `pid` is a live process, checked independently of any window/port signal. */
export function isPidAlive(pid) {
  const result = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `[bool](Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue)`],
    { encoding: 'utf8', timeout: 10_000, windowsHide: true },
  )
  return (result.stdout || '').trim() === 'True'
}

/** Read the isolated profile's own app.log, or '' if it doesn't exist yet. */
export function readAppLog(profileDir) {
  const logPath = path.join(profileDir, 'Local', 'Ollama', 'app.log')
  try {
    return readFileSync(logPath, 'utf8')
  } catch {
    return ''
  }
}

/**
 * launchScreen() plus the liveness/retry discipline that makes the tray-
 * host race (see TRAY_HOST_SETTLE_MS above) a non-issue for callers: after
 * launching, check the PID directly rather than waiting out a full port-
 * discovery timeout against a process that may have already exited via
 * osRun()'s log.Fatalf -> os.Exit(1) on a failed wintray.NewTray(). On
 * that exact failure, retry with a fresh settle delay before giving up.
 */
export function launchScreenReliable({
  desktopName,
  route,
  profileDir,
  cdpPort,
  exePath = BUILT_EXE_PATH,
  cliPath,
  maxAttempts = 6,
  aliveCheckMs = 1_000,
  retryDelayMs = 5_000,
}) {
  let lastLog = ''
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const pid = launchScreen({ desktopName, route, profileDir, cdpPort, exePath, cliPath })
    sleepMs(aliveCheckMs)
    if (isPidAlive(pid)) return pid

    lastLog = readAppLog(profileDir)
    const trayFailure = /Unable to init instance/i.test(lastLog)
    if (attempt < maxAttempts && trayFailure) {
      // The tray host window existed but its notification RPC endpoint
      // was not yet reliably accepting calls (a genuine shell-side race,
      // not something this harness can force to settle deterministically
      // -- see TRAY_HOST_SETTLE_MS). Re-confirm it and back off before
      // retrying rather than hammering it immediately.
      ensureTrayHost({ desktopName, cliPath })
      sleepMs(retryDelayMs)
      continue
    }
    throw new Error(
      `App process (pid ${pid}) exited within ${aliveCheckMs}ms on attempt ${attempt}/${maxAttempts}. ` +
        `app.log:\n${lastLog || '(empty -- process likely never reached logging setup)'}`,
    )
  }
  throw new Error(`Exhausted ${maxAttempts} launch attempts for route ${route}. Last app.log:\n${lastLog}`)
}

export function sha256File(filePath) {
  return createHash('sha256').update(readFileSync(filePath)).digest('hex')
}

export function makeScratchProfileDir(runId) {
  const dir = path.join(repoRoot, 'dist', 'capture-profile', runId)
  rmSync(dir, { recursive: true, force: true })
  mkdirSync(dir, { recursive: true })
  return dir
}

export function tmpRunId(prefix) {
  return `${prefix}-${process.pid}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
}

export const HOSTNAME = os.hostname()

/**
 * Defense-in-depth for a whole multi-screen run: given every pid launched
 * during the session (app instances and the tray host), re-check for any
 * child that killPidTree's per-launch settle window still missed --
 * Windows keeps a process's ParentProcessId in its process-table entry
 * even after that parent has exited, so this still finds a straggler.
 * Call once at the very end of drive.mjs, after every per-screen
 * killPidTree has already run.
 */
export function sweepOrphanedChildren(launchedPids, { cliPath } = {}) {
  const killed = []
  for (const pid of launchedPids) {
    for (const child of findChildPids(pid)) {
      killPid(child.pid, { cliPath })
      killed.push(child)
    }
  }
  return killed
}
