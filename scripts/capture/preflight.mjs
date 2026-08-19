#!/usr/bin/env node
//
// scripts/capture/preflight.mjs
//
// Fails closed before drive.mjs is allowed to spend time (and produce
// evidence that could be wrong) on a multi-screen capture run. Four
// checks, each one an actual reason a capture run would be worthless:
//
//   1. Dirty tree for UI source paths -- a capture of uncommitted work
//      cannot be tied to the commit the manifest records.
//   2. Missing dist/windows-ollama-app-amd64.exe -- nothing to launch.
//   3. Another capture-harness instance already running -- launching a
//      second one against the same isolated profile would corrupt it and
//      produce misattributed evidence.
//   4. The one that actually catches a stale build: launch the real exe,
//      fetch its own served /build-stamp.json (unauthenticated -- see
//      app/ui/app.go's mux.Handle("GET /", ...) sitting outside the token
//      wrapper in app/ui/ui.go's handle() closure), and compare its
//      commit + uiSourceHash against what HEAD and the working tree
//      recompute to *right now*. A stale `dist/` (built before the latest
//      source edit, or before the latest commit) produces perfectly green
//      captures of yesterday's interface with today's commit SHA printed
//      underneath them -- a timestamp check cannot catch that; only
//      re-deriving both hashes and comparing content can.
//
// Exit 0 and prints {"ok": true, ...} when every check passes. Exit 1 and
// prints {"ok": false, "failures": [...]} otherwise -- drive.mjs (and any
// human running this by hand) must refuse to proceed on a non-zero exit.

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import {
  BUILT_EXE_PATH,
  BUILT_EXE_RELATIVE,
  repoRoot,
  findRunningCaptureProcesses,
  ensureTrayHost,
  launchScreenReliable,
  discoverListeningPort,
  killPidTree,
  makeScratchProfileDir,
  tmpRunId,
  resolveCheapRoute,
} from './lib.mjs'
import { UI_SOURCE_SCOPE } from '../write-build-stamp.mjs'

const PREFLIGHT_DESKTOP = 'mo-capture-preflight'

function git(argv) {
  return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8' })
}

function checkDirtyTree() {
  const out = git(['status', '--porcelain', '--', ...UI_SOURCE_SCOPE]).trim()
  if (out) {
    return {
      ok: false,
      check: 'dirty-ui-source-tree',
      detail: `UI source paths have uncommitted changes:\n${out}`,
    }
  }
  return { ok: true, check: 'dirty-ui-source-tree' }
}

function checkExeExists() {
  if (!existsSync(BUILT_EXE_PATH)) {
    return {
      ok: false,
      check: 'built-exe-exists',
      detail: `Missing ${BUILT_EXE_RELATIVE}. Build it (CGO_ENABLED=1, windowsgui) before capturing.`,
    }
  }
  return { ok: true, check: 'built-exe-exists', detail: BUILT_EXE_PATH }
}

function checkNoRunningInstance() {
  const procs = findRunningCaptureProcesses()
  if (procs.length > 0) {
    return {
      ok: false,
      check: 'no-running-instance',
      detail: `${procs.length} instance(s) of ${path.basename(BUILT_EXE_PATH)} already running: ${JSON.stringify(procs)}`,
    }
  }
  return { ok: true, check: 'no-running-instance' }
}

function recomputeExpectedStamp() {
  // Reuse write-build-stamp.mjs's own logic by shelling out to it with
  // --output pointed at a throwaway path, rather than re-implementing the
  // hash so the two scripts cannot silently drift apart.
  const scratchOut = path.join(repoRoot, 'dist', 'capture-profile', `preflight-expected-${Date.now()}.json`)
  execFileSync('node', [path.join(repoRoot, 'scripts', 'write-build-stamp.mjs'), '--output', scratchOut], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  const stamp = JSON.parse(readFileSync(scratchOut, 'utf8'))
  return stamp
}

async function checkServedStampMatchesHead({ cliPath }) {
  const expected = recomputeExpectedStamp()

  const trayPid = ensureTrayHost({ desktopName: PREFLIGHT_DESKTOP, cliPath })
  const runId = tmpRunId('preflight')
  const profileDir = makeScratchProfileDir(runId)
  const cdpPort = 19311

  let pid
  try {
    pid = launchScreenReliable({ desktopName: PREFLIGHT_DESKTOP, route: '/models', profileDir, cdpPort, cliPath })
    const port = discoverListeningPort(pid, { timeoutMs: 20_000 })

    // Static files (including build-stamp.json) are served outside the
    // token-checking wrapper -- see app/ui/app.go's appHandler() and
    // ui.go's mux.Handle("GET /", ...) registration, which sits before
    // the auth-checked API routes. No cookie is sent or needed here.
    const res = await fetch(`http://127.0.0.1:${port}/build-stamp.json`)
    if (!res.ok) {
      return {
        ok: false,
        check: 'served-stamp-matches-head',
        detail: `GET /build-stamp.json returned HTTP ${res.status} from the running app`,
      }
    }
    const served = await res.json()

    const mismatches = []
    if (served.commit !== expected.commit) {
      mismatches.push(`commit: served=${served.commit} expected(HEAD)=${expected.commit}`)
    }
    if (served.uiSourceHash !== expected.uiSourceHash) {
      mismatches.push(`uiSourceHash: served=${served.uiSourceHash} expected(recomputed)=${expected.uiSourceHash}`)
    }
    if (served.dirty === true) {
      mismatches.push('served stamp itself records dirty=true (built from an uncommitted tree)')
    }

    if (mismatches.length > 0) {
      return {
        ok: false,
        check: 'served-stamp-matches-head',
        detail:
          `The running build's own /build-stamp.json does not match HEAD + the current working tree -- ` +
          `dist/ is stale and must be rebuilt (npm run build; node scripts/write-build-stamp.mjs; go build ...). ` +
          mismatches.join('; '),
      }
    }
    return { ok: true, check: 'served-stamp-matches-head', detail: { served, expected } }
  } finally {
    if (pid) killPidTree(pid, { cliPath })
    killPidTree(trayPid, { cliPath })
  }
}

async function main() {
  const { cliPath } = resolveCheapRoute()
  const results = []

  results.push(checkDirtyTree())
  results.push(checkExeExists())
  results.push(checkNoRunningInstance())

  // Only attempt the launch-and-verify check if the static checks passed
  // -- launching a missing exe or racing a second instance would just
  // produce a confusing secondary failure on top of the real one.
  if (results.every((r) => r.ok)) {
    results.push(await checkServedStampMatchesHead({ cliPath }))
  } else {
    results.push({ ok: false, check: 'served-stamp-matches-head', detail: 'skipped -- earlier check(s) failed' })
  }

  const failures = results.filter((r) => !r.ok)
  const output = { ok: failures.length === 0, results, failures }
  console.log(JSON.stringify(output, null, 2))
  process.exit(output.ok ? 0 : 1)
}

main().catch((err) => {
  console.log(JSON.stringify({ ok: false, error: `${err.stack || err.message}` }, null, 2))
  process.exit(1)
})
