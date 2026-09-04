#!/usr/bin/env node
/**
 * Capture the checked-in design reference, one PNG per design-parity row.
 *
 * The reference side of the parity comparison. It renders design/Material
 * Ollama.dc.html through scripts/design-reference/reference-renderer.mjs -- the
 * committed bytes, served verbatim, never a transcription -- and drives it with
 * the reference's own controls.
 *
 * Discipline this shares with scripts/capture/drive.mjs, for the same reasons:
 *
 *   - Exactly one CDP page target, or the run fails. Finding one acceptable
 *     target among several proves nothing about which page was captured.
 *   - The page reloads before every row. Some of the reference's overlays do
 *     not close on Escape, and a capture that inherits a stale dialog is a
 *     capture of the wrong state that nothing downstream would flag.
 *   - Every state is PROVED open before the shutter, never assumed. A step that
 *     silently did nothing must fail its row, not photograph the screen behind it.
 *   - Time is frozen and animation disabled before the first document script
 *     runs, so two captures of one state are identical rather than similar.
 *
 * Usage:
 *   node scripts/parity/capture-reference.mjs --cdp-port 9789 [--out <dir>] [--only id,id]
 *
 * The caller supplies the port of an already-running, already-isolated browser
 * on an off-screen desktop; launching it is the harness's job, not this
 * script's, so the isolation preflight lives in one place.
 */

import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const { cdpDiscoverPageTarget, cdpConnect, cdpEvaluate } = await import(
  pathToFileURL(path.join(repoRoot, 'scripts/capture/lib.mjs')).href
)
const { TUPLE, DETERMINISM_SCRIPT, FROZEN_TIME_ISO } = await import(
  pathToFileURL(path.join(here, 'reference-lib.mjs')).href
)
const { STATES } = await import(pathToFileURL(path.join(here, 'reference-states.mjs')).href)

const DEFAULT_OUT = path.join(repoRoot, 'docs/features/design-parity/captures/reference')

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** Poll an expression until it satisfies `check`, or fail loudly. */
async function waitFor(client, expression, check, { label, timeoutMs = 8_000, intervalMs = 150 }) {
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

async function captureState(client, state, outDir) {
  // Clear the reference's own persisted state, THEN reload. The reference
  // saves its current screen to localStorage, so without this a row inherits
  // whichever screen the previous row left selected -- which is how the
  // "shell" row once came out byte-identical to "settings". Reloading alone
  // does not help: the state survives the reload, that being its whole point.
  await cdpEvaluate(client, `(() => { try { window.localStorage.clear(); return 'OK' } catch { return 'OK' } })()`)
  await client.send('Page.reload', { ignoreCache: false })
  await waitFor(client, `document.readyState`, (v) => v === 'complete', { label: `${state.id}: page load` })
  await waitFor(client, `document.querySelectorAll('[aria-label="Main navigation"]').length`, (v) => Number(v) >= 1, {
    label: `${state.id}: reference rendered`,
  })

  // Prove the determinism injection actually ran on this document.
  const clock = await cdpEvaluate(client, `new Date().toISOString() + '|' + Math.random()`)
  if (!String(clock).startsWith('2026-01-01T00:00:00') || !String(clock).endsWith('|0')) {
    throw new Error(`${state.id}: determinism injection did not run (clock/random = ${clock})`)
  }

  for (const step of state.steps) {
    const result = await cdpEvaluate(client, step.expression)
    if (result !== 'OK') {
      throw new Error(`${state.id}: step "${step.label}" returned ${JSON.stringify(result)}, expected "OK"`)
    }
    await sleep(250)
  }

  // Prove the state actually arrived before the shutter opens.
  await waitFor(client, state.expect.expression, satisfies(state.expect), {
    label: `${state.id}: ${state.expect.label}`,
  })

  const { data } = await client.send('Page.captureScreenshot', {
    format: 'png',
    captureBeyondViewport: false,
    clip: { x: 0, y: 0, width: TUPLE.width, height: TUPLE.height, scale: TUPLE.scale },
  })
  const bytes = Buffer.from(data, 'base64')

  // Read the real IHDR rather than trusting the request: a clip that was
  // silently ignored would otherwise ship as evidence at the wrong size.
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
    path: path.relative(repoRoot, file).split(path.sep).join('/'),
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    width,
    height,
  }
}

async function main() {
  const cdpPort = Number(arg('--cdp-port', '9789'))
  const outDir = path.resolve(arg('--out', DEFAULT_OUT))
  const only = arg('--only')
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null
  const states = wanted ? STATES.filter((s) => wanted.has(s.id)) : STATES

  await mkdir(outDir, { recursive: true })

  const target = await cdpDiscoverPageTarget(cdpPort)
  const client = cdpConnect(target)
  await client.ready

  const records = []
  const failures = []
  try {
    // Page.enable FIRST. Without it addScriptToEvaluateOnNewDocument registers
    // and returns an identifier, and then simply never runs on the next
    // navigation -- no error anywhere. Every capture taken before this line
    // existed had a live clock, live animation and live randomness while
    // reporting itself as deterministic.
    await client.send('Page.enable', {})
    await client.send('Emulation.setDeviceMetricsOverride', {
      width: TUPLE.width, height: TUPLE.height, deviceScaleFactor: TUPLE.scale, mobile: false,
    })
    await client.send('Page.addScriptToEvaluateOnNewDocument', { source: DETERMINISM_SCRIPT })

    for (const state of states) {
      try {
        const record = await captureState(client, state, outDir)
        records.push(record)
        process.stdout.write(`captured ${record.id} -> ${record.path} (${record.bytes} bytes)\n`)
      } catch (error) {
        failures.push({ id: state.id, reason: error.message })
        process.stdout.write(`FAILED   ${state.id}: ${error.message}\n`)
      }
    }
  } finally {
    client.close()
  }

  // Two rows must never share bytes. A weak `expect` that is already true on
  // the screen behind an overlay lets a row photograph that screen and pass --
  // it happened on the first run of this script, where the School-mode unlock
  // row came out byte-identical to plain Settings. Identical bytes for two
  // different states is proof one of them never opened.
  const byHash = new Map()
  for (const record of records) {
    const seen = byHash.get(record.sha256)
    const state = STATES.find((st) => st.id === record.id)
    const declared = state?.sharesFrameWith
    if (seen && (declared === seen || STATES.find((st) => st.id === seen)?.sharesFrameWith === record.id)) {
      record.sharesFrameWith = seen
    } else if (seen) {
      const reason = `captured bytes are identical to ${seen} -- these are two different states, so one of them never opened`
      failures.push({ id: record.id, reason })
      process.stdout.write(`FAILED   ${record.id}: ${reason}
`)
    } else {
      byHash.set(record.sha256, record.id)
    }
  }
  // A row whose duplicate was DECLARED stays in the manifest, carrying the
  // declaration. Only an undeclared duplicate is dropped and failed -- the
  // first version of this filter dropped both kinds, so a legitimate shared
  // frame vanished from the record entirely and the manifest was quietly one
  // row short of the states it had captured.
  const failedIds = new Set(failures.map((f) => f.id))
  const unique = records.filter((r) => !failedIds.has(r.id))

  const manifest = {
    schemaVersion: 1,
    side: 'reference',
    tuple: TUPLE,
    frozenTime: FROZEN_TIME_ISO,
    capturedAt: new Date().toISOString(),
    referenceFile: 'design/Material Ollama.dc.html',
    captured: unique.length,
    failed: failures.length,
    records: unique,
    failures,
  }
  const manifestPath = path.join(outDir, 'manifest.json')
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`)
  process.stdout.write(`\n${records.length} captured, ${failures.length} failed -> ${path.relative(repoRoot, manifestPath)}\n`)
  process.exitCode = failures.length > 0 ? 1 : 0
}

await main()
