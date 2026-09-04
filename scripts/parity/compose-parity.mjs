#!/usr/bin/env node
/**
 * Pair the reference and built captures: one labelled side-by-side and one
 * machine-readable visual diff per design-parity row.
 *
 * Reads both manifests, pairs them by row id, and drives
 * scripts/parity/compare_images.py for each pair. A row present on only one
 * side is reported as unpaired rather than skipped quietly -- a missing half is
 * exactly the state that would otherwise look like "nothing to do here".
 *
 * No threshold in here decides anything. The diff record describes the
 * difference; whether a row has parity is a judgement made against the
 * fifteen-point Material Design 3 audit by someone who looked at the pictures.
 *
 * Usage:
 *   node scripts/parity/compose-parity.mjs [--only id,id]
 */

import { spawnSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(here, '..', '..')
const capturesRoot = path.join(repoRoot, 'docs/features/design-parity/captures')

const { TUPLE } = await import(pathToFileURL(path.join(here, 'reference-lib.mjs')).href)
const { resolveCheapRoute } = await import(
  pathToFileURL(path.join(repoRoot, 'scripts/capture/lib.mjs')).href
)

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : fallback
}

async function readManifest(side) {
  const file = path.join(capturesRoot, side, 'manifest.json')
  if (!existsSync(file)) {
    throw new Error(
      `No ${side} manifest at ${path.relative(repoRoot, file)}. Capture that side first:\n` +
        `  node scripts/parity/capture-${side}.mjs`,
    )
  }
  return JSON.parse(await readFile(file, 'utf8'))
}

/**
 * Pillow is what the capture lane already depends on. Prefer the cheap route's
 * bundled interpreter, the same one validate_capture.py runs under, and fall
 * back to whatever `python` resolves to only if that is absent.
 */
function resolvePython() {
  const { pythonPath } = resolveCheapRoute()
  if (pythonPath && existsSync(pythonPath)) return pythonPath
  return 'python'
}

async function main() {
  const only = arg('--only')
  const wanted = only ? new Set(only.split(',').map((s) => s.trim())) : null

  const reference = await readManifest('reference')
  const built = await readManifest('built')

  const referenceById = new Map(reference.records.map((r) => [r.id, r]))
  const builtById = new Map(built.records.map((r) => [r.id, r]))
  const allIds = [...new Set([...referenceById.keys(), ...builtById.keys()])].sort()

  await mkdir(path.join(capturesRoot, 'side-by-side'), { recursive: true })
  await mkdir(path.join(capturesRoot, 'diff'), { recursive: true })

  const python = resolvePython()
  const tupleJson = JSON.stringify(TUPLE)
  const records = []
  const unpaired = []

  for (const id of allIds) {
    if (wanted && !wanted.has(id)) continue
    const ref = referenceById.get(id)
    const bui = builtById.get(id)
    if (!ref || !bui) {
      const missing = !ref ? 'reference' : 'built'
      unpaired.push({ id, missing })
      process.stdout.write(`UNPAIRED ${id}: no ${missing} capture\n`)
      continue
    }

    const sideBySide = path.join(capturesRoot, 'side-by-side', `${id}.png`)
    const diffImage = path.join(capturesRoot, 'diff', `${id}.png`)
    const result = spawnSync(
      python,
      [
        path.join(here, 'compare_images.py'),
        '--id', id,
        '--reference', path.join(repoRoot, ref.path),
        '--built', path.join(repoRoot, bui.path),
        '--side-by-side', sideBySide,
        '--diff-image', diffImage,
        '--tuple-json', tupleJson,
      ],
      { encoding: 'utf8', env: { ...process.env, PYTHONIOENCODING: 'utf-8' } },
    )
    if (result.status !== 0) {
      unpaired.push({ id, missing: 'comparison', reason: (result.stderr || result.stdout || '').trim().slice(0, 400) })
      process.stdout.write(`FAILED   ${id}: ${(result.stderr || result.stdout || '').trim().slice(0, 200)}\n`)
      continue
    }

    const record = JSON.parse(result.stdout)
    // Make the record's paths repo-relative so the evidence is portable.
    for (const key of ['referencePath', 'builtPath', 'sideBySidePath', 'diffImagePath']) {
      record[key] = path.relative(repoRoot, record[key]).split(path.sep).join('/')
    }
    const jsonPath = path.join(capturesRoot, 'diff', `${id}.json`)
    await writeFile(jsonPath, `${JSON.stringify(record, null, 2)}\n`)
    records.push(record)
    process.stdout.write(
      `paired   ${id}: ${record.differingPixels}/${record.pixelTotal} pixels differ ` +
        `(${(record.differingRatio * 100).toFixed(2)}%), max delta ${record.maxChannelDelta}\n`,
    )
  }

  const summary = {
    schemaVersion: 1,
    tuple: TUPLE,
    composedAt: new Date().toISOString(),
    referenceCapturedAt: reference.capturedAt,
    builtCapturedAt: built.capturedAt,
    builtArtifactSha256: built.builtArtifactSha256,
    paired: records.length,
    unpaired: unpaired.length,
    rows: records.map((r) => ({
      id: r.rowId,
      differingRatio: r.differingRatio,
      maxChannelDelta: r.maxChannelDelta,
      sideBySidePath: r.sideBySidePath,
      diffRecord: `docs/features/design-parity/captures/diff/${r.rowId}.json`,
    })),
    unpairedRows: unpaired,
  }
  const summaryPath = path.join(capturesRoot, 'pairs.json')
  await writeFile(summaryPath, `${JSON.stringify(summary, null, 2)}\n`)
  process.stdout.write(
    `\n${records.length} paired, ${unpaired.length} unpaired -> ${path.relative(repoRoot, summaryPath)}\n`,
  )
  process.exitCode = unpaired.length > 0 ? 1 : 0
}

await main()
