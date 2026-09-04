#!/usr/bin/env node
/**
 * Capture the real built application, one PNG per design-parity row.
 *
 * The built-app side of the pair. It launches the packaged
 * dist/windows-ollama-app-amd64.exe on a named off-screen desktop through the
 * cheap headless route, one cold process per row, with an isolated profile, and
 * captures through the app's own devtools endpoint at the exact comparison
 * tuple -- so both sides of every pair are the same rendered size with no
 * browser or window chrome in the frame.
 *
 * Same discipline as scripts/parity/capture-reference.mjs, for the same
 * reasons: exactly one CDP page target or the run fails; Page.enable before the
 * determinism injection, which is proved to have run before the shutter opens;
 * every state proved present before it is photographed; and two rows may never
 * share bytes unless the share is declared.
 *
 * Usage:
 *   node scripts/parity/capture-built.mjs [--out <dir>] [--only id,id]
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')

const lib = await import(pathToFileURL(path.join(repoRoot, 'scripts/capture/lib.mjs')).href)
const {
  BUILT_EXE_PATH,
  resolveCheapRoute,
  ensureTrayHost,
  launchScreenReliable,
  killPidTree,
  makeScratchProfileDir,
  tmpRunId,
  sha256File,
  cdpDiscoverPageTarget,
  cdpConnect,
  cdpEvaluate,
  sleepMs,
} = lib
const { TUPLE, DETERMINISM_SCRIPT, FROZEN_TIME_ISO } = await import(
  pathToFileURL(path.join(here, 'reference-lib.mjs')).href
)
const { BUILT_STATES } = await import(pathToFileURL(path.join(here, 'built-states.mjs')).href)

const DEFAULT_OUT = path.join(repoRoot, 'docs/features/design-parity/captures/built')
const DESKTOP_NAME = 'mo-parity-built'
const BASE_CDP_PORT = 9910

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

async function waitFor(client, expression, check, { label, timeoutMs = 15_000, intervalMs = 200 }) {
  const deadline = Date.now() + timeoutMs
  let last
  while (Date.now() < deadline) {
    last = await cdpEvaluate(client, expression)
    if (check(last)) return last
    await sleep(intervalMs)
  }
  throw new Error(`${label}: never satisfied within ${timeoutMs}ms (last value: ${JSON.stringify(last)})`)
}

function satisfies(expect) {
  if (typeof expect.equals === 'number') return (v) => Number(v) === expect.equals
  if (typeof expect.atLeast === 'number') return (v) => Number(v) >= expect.atLeast
  return (v) => Boolean(v)
}

async function captureState(state, { cliPath, runId, index, outDir, artifactSha }) {
  const profileDir = makeScratchProfileDir(`${runId}-${state.id}`)
  const cdpPort = BASE_CDP_PORT + index
  let pid = null
  let client = null
  try {
    pid = launchScreenReliable({
      desktopName: DESKTOP_NAME,
      route: state.resolvedRoute,
      profileDir,
      cdpPort,
      cliPath,
    })

    const target = await cdpDiscoverPageTarget(cdpPort, { timeoutMs: 30_000 })
    client = cdpConnect(target)
    await client.ready

    // Page.enable FIRST. Without it addScriptToEvaluateOnNewDocument registers,
    // returns an identifier, and then never runs -- with no error anywhere.
    await client.send('Page.enable', {})
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: TUPLE.width, height: TUPLE.height, deviceScaleFactor: TUPLE.scale, mobile: false,
    })
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: DETERMINISM_SCRIPT })
    await client.send('Page.reload', { ignoreCache: false })

    await waitFor(client, `document.readyState`, (v) => v === 'complete', { label: `${state.id}: page load` })

    const clock = await cdpEvaluate(client, `new Date().toISOString() + '|' + Math.random()`)
    if (!String(clock).startsWith('2026-01-01T00:00:00') || !String(clock).endsWith('|0')) {
      throw new Error(`${state.id}: determinism injection did not run (clock/random = ${clock})`)
    }

    for (const step of state.steps) {
      const result = await cdpEvaluate(client, step.expression)
      if (result !== 'OK') {
        throw new Error(`${state.id}: step "${step.label}" returned ${JSON.stringify(result)}, expected "OK"`)
      }
      await sleep(400)
    }

    await waitFor(client, state.expect.expression, satisfies(state.expect), {
      label: `${state.id}: ${state.expect.label}`,
    })

    const { data } = await client.send('Page.captureScreenshot', {
      format: 'png',
      captureBeyondViewport: false,
      clip: { x: 0, y: 0, width: TUPLE.width, height: TUPLE.height, scale: TUPLE.scale },
    })
    const bytes = Buffer.from(data, 'base64')
    const width = bytes.readUInt32BE(16)
    const height = bytes.readUInt32BE(20)
    if (width !== TUPLE.width || height !== TUPLE.height) {
      throw new Error(`${state.id}: captured ${width}x${height}, want ${TUPLE.width}x${TUPLE.height}`)
    }

    const file = path.join(outDir, `${state.id}.png`)
    await writeFile(file, bytes)
    return {
      id: state.id,
      kind: state.kind,
      screen: state.screenName,
      resolvedBuiltRoute: state.resolvedRoute,
      builtInteraction: state.builtInteraction,
      path: path.relative(repoRoot, file).split(path.sep).join('/'),
      sha256: createHash('sha256').update(bytes).digest('hex'),
      bytes: bytes.length,
      width,
      height,
      builtArtifactSha256: artifactSha,
    }
  } finally {
    if (client) client.close()
    if (pid) killPidTree(pid, { cliPath })
    sleepMs(500)
  }
}

async function main() {
  const outDir = path.resolve(arg('--out', DEFAULT_OUT))
  const only = arg('--only')
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null
  const states = wanted ? BUILT_STATES.filter((s) => wanted.has(s.id)) : BUILT_STATES

  if (!existsSync(BUILT_EXE_PATH)) {
    throw new Error(
      `No built artifact at ${BUILT_EXE_PATH}. Build it first:\n` +
        `  powershell -NoProfile -ExecutionPolicy Bypass -File scripts/build_windows.ps1 app`,
    )
  }
  const artifactSha = sha256File(BUILT_EXE_PATH)
  await mkdir(outDir, { recursive: true })

  const { cliPath } = resolveCheapRoute()
  ensureTrayHost({ desktopName: DESKTOP_NAME, cliPath })

  const runId = tmpRunId('parity-built')
  const records = []
  const failures = []
  let index = 0
  for (const state of states) {
    try {
      const record = await captureState(state, { cliPath, runId, index, outDir, artifactSha })
      records.push(record)
      process.stdout.write(`captured ${record.id} -> ${record.path} (${record.bytes} bytes)\n`)
    } catch (error) {
      failures.push({ id: state.id, reason: error.message })
      process.stdout.write(`FAILED   ${state.id}: ${error.message}\n`)
    }
    index += 1
  }

  // Two rows must never share bytes unless the share is declared. Identical
  // bytes for two different states is proof one of them never opened.
  const byHash = new Map()
  for (const record of records) {
    const seen = byHash.get(record.sha256)
    const declared = BUILT_STATES.find((s) => s.id === record.id)?.sharesFrameWith
    if (seen && declared === seen) {
      record.sharesFrameWith = seen
    } else if (seen) {
      const reason = `captured bytes are identical to ${seen} -- these are two different states, so one of them never opened`
      failures.push({ id: record.id, reason })
      process.stdout.write(`FAILED   ${record.id}: ${reason}\n`)
    } else {
      byHash.set(record.sha256, record.id)
    }
  }
  const failedIds = new Set(failures.map((f) => f.id))
  const unique = records.filter((r) => !failedIds.has(r.id))

  const manifest = {
    schemaVersion: 1,
    side: 'built',
    tuple: TUPLE,
    frozenTime: FROZEN_TIME_ISO,
    capturedAt: new Date().toISOString(),
    builtArtifact: path.relative(repoRoot, BUILT_EXE_PATH).split(path.sep).join('/'),
    builtArtifactSha256: artifactSha,
    captured: unique.length,
    failed: failures.length,
    records: unique,
    failures,
  }
  const manifestPath = path.join(outDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`\n${unique.length} captured, ${failures.length} failed -> ${path.relative(repoRoot, manifestPath)}\n`)
  process.exitCode = failures.length > 0 ? 1 : 0
}

await main()
