#!/usr/bin/env node
// scripts/capture/audit-network.mjs
//
// Real built-artifact evidence for the no-network-privacy contract: launch
// the real dist/windows-ollama-app-amd64.exe on a named off-screen desktop
// (same harness, same isolation as drive.mjs's screenshot captures), open
// a CDP connection, enable the Network domain, and record every single
// HTTP(S) request the running app makes -- across several real screens,
// each of which fires its own real data fetches (hardware snapshot,
// installed/running models, settings, release info, history, and so on) --
// then assert every recorded request resolved to a loopback host.
//
// This is NOT a claim that the app can never reach the network under any
// circumstance (a model pull, for instance, legitimately fetches from
// registry.ollama.ai) -- it is a claim about what the app's OWN chrome and
// screens request merely by being open and idle, which is the surface the
// no-network-privacy contract is actually about. See
// docs/features/uh-completeness/articles/no-network-privacy.md.
//
// Writes its result into docs/features/uh-completeness/captures/
// manifest.json's top-level `networkAudit` field, alongside (not
// replacing) the existing per-screen `captures` array -- run this AFTER
// drive.mjs, or standalone; either way it only ever adds/updates that one
// field and leaves `captures` untouched.
//
// Usage: node scripts/capture/audit-network.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  repoRoot,
  CAPTURE_DIR,
  MANIFEST_PATH,
  BUILT_EXE_PATH,
  BUILT_EXE_RELATIVE,
  resolveCheapRoute,
  ensureTrayHost,
  launchScreenReliable,
  discoverListeningPort,
  resolveAppWindow,
  killPidTree,
  sweepOrphanedChildren,
  makeScratchProfileDir,
  tmpRunId,
  sha256File,
  sleepMs,
  HOSTNAME,
  cdpDiscoverPageTarget,
  cdpConnect,
  cdpWaitForCaptureMarker,
  cdpRecordNetworkRequests,
  assertLoopbackOnly,
} from './lib.mjs'

const DESKTOP_NAME = 'mo-capture-network-audit'
const CDP_PORT = 19_500
const SETTLE_AFTER_NAV_MS = 2_500

// A handful of real screens, each of which fires its own distinct set of
// real fetches on mount -- deliberately not just "/models" alone, since
// the whole point is observing what THIS app's chrome actually requests,
// and different screens request different things (Settings reads
// preferences+settings+inference-compute; Status reads release+history;
// Docs reads the offline-docs inventory; and so on).
const ROUTES_TO_VISIT = [
  { route: '/models', captureId: 'models' },
  { route: '/settings', captureId: 'settings' },
  { route: '/status', captureId: 'status' },
  { route: '/docs', captureId: 'docs' },
  { route: '/toolbox', captureId: 'toolbox' },
]

function git(argv) {
  return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' }).trim()
}

async function main() {
  if (!existsSync(BUILT_EXE_PATH)) {
    console.error(`audit-network.mjs: missing ${BUILT_EXE_RELATIVE}. Build it before auditing.`)
    process.exit(1)
  }

  const { cliPath } = resolveCheapRoute()
  const commit = git(['rev-parse', 'HEAD'])
  const dirty = git(['status', '--porcelain']).length > 0

  const trayPid = ensureTrayHost({ desktopName: DESKTOP_NAME, cliPath })
  const runId = tmpRunId('network-audit')
  const profileDir = makeScratchProfileDir(runId)
  const launchedPids = [trayPid]

  let pid
  let cdp
  let recorded = []
  const visitedRoutes = []
  try {
    pid = launchScreenReliable({
      desktopName: DESKTOP_NAME,
      route: ROUTES_TO_VISIT[0].route,
      profileDir,
      cdpPort: CDP_PORT,
      cliPath,
    })
    launchedPids.push(pid)
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })
    resolveAppWindow({ desktopName: DESKTOP_NAME, pid, timeoutMs: 20_000, cliPath })
    sleepMs(SETTLE_AFTER_NAV_MS)

    const target = await cdpDiscoverPageTarget(CDP_PORT, { timeoutMs: 15_000 })
    cdp = cdpConnect(target)
    await cdp.ready
    await cdp.send('Page.enable', {})

    // cdpRecordNetworkRequests enables the Network domain and returns the
    // live array it will keep pushing into as events arrive -- `recorded`
    // IS that array, not a copy, so everything from here on is captured.
    // Two lanes wrote this helper independently; the surviving one returns
    // {requests, stop} where `requests` is the live array it keeps pushing
    // into, so `recorded` still IS that array. Elements are request objects,
    // not bare URL strings.
    recorded = (await cdpRecordNetworkRequests(cdp)).requests

    // Re-navigate to the FIRST route too (not just the remaining ones):
    // the app's initial load already happened before Network.enable was
    // sent above, so re-loading it is what actually puts its own fetches
    // (hardware, models installed/running, model catalog status, etc.)
    // inside the recording window rather than silently missing them.
    for (const { route, captureId } of ROUTES_TO_VISIT) {
      const url = `http://127.0.0.1:${port}${route}`
      await cdp.send('Page.navigate', { url })
      await cdpWaitForCaptureMarker(cdp, captureId, { timeoutMs: 20_000 })
      sleepMs(SETTLE_AFTER_NAV_MS)
      visitedRoutes.push(route)
    }

    // Give any late-firing async fetch (a debounced search, a background
    // poll) a final moment to land before the audit closes the socket.
    sleepMs(1_500)
  } finally {
    if (cdp) cdp.close()
    if (pid) killPidTree(pid, { cliPath })
    killPidTree(trayPid, { cliPath })
    sweepOrphanedChildren(launchedPids, { cliPath })
  }

  const uniqueUrls = [...new Set(recorded.map((r) => r.url).filter(Boolean))]
  // assertLoopbackOnly takes request objects (it reads .url off each), so it
  // gets the deduped records rather than the bare URL list used for reporting.
  const seen = new Set()
  const uniqueRecords = recorded.filter((r) => r.url && !seen.has(r.url) && seen.add(r.url))
  const assertion = assertLoopbackOnly(uniqueRecords)

  const audit = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generatedOn: HOSTNAME,
    commit,
    dirty,
    artifact: {
      path: path.relative(repoRoot, BUILT_EXE_PATH).replace(/\\/g, '/'),
      sha256: sha256File(BUILT_EXE_PATH),
      bytes: statSync(BUILT_EXE_PATH).size,
    },
    method:
      "CDP Network domain (Network.requestWillBeSent) recorded live while navigating the real running app " +
      "through several real screens on a named off-screen desktop; every recorded request URL classified by " +
      "scripts/capture/lib.mjs's classifyRequestUrl()/assertLoopbackOnly().",
    routesVisited: visitedRoutes,
    requestCount: uniqueUrls.length,
    ok: assertion.ok,
    offenders: assertion.offenders,
    // The full URL list is real evidence, not just the count -- every one
    // resolves to 127.0.0.1 on this run, which is what makes it safe to
    // record verbatim (no secret, no external host, no personal data).
    requestUrls: uniqueUrls,
  }

  if (!existsSync(CAPTURE_DIR)) mkdirSync(CAPTURE_DIR, { recursive: true })
  let manifest = {}
  if (existsSync(MANIFEST_PATH)) {
    manifest = JSON.parse(readFileSync(MANIFEST_PATH, 'utf8'))
  }
  manifest.networkAudit = audit
  writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')

  console.error(
    `audit-network.mjs: ${uniqueUrls.length} unique requests recorded across ${visitedRoutes.length} routes, ` +
      `ok=${assertion.ok}${assertion.offenders.length > 0 ? `, offenders=${JSON.stringify(assertion.offenders)}` : ''}. ` +
      `Wrote ${path.relative(repoRoot, MANIFEST_PATH)}.`,
  )
  process.exit(assertion.ok ? 0 : 1)
}

main().catch((err) => {
  console.error(`audit-network.mjs: FAILED: ${err.stack || err.message}`)
  process.exit(1)
})
