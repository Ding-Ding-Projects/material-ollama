/**
 * checkEvidenceBytes has to be exercised against real bytes, or it is decoration.
 *
 * Every other assertion in check-design-parity.mjs reasons about the inventory
 * JSON alone, so a row could claim parity from a sha256 nothing ever wrote and
 * the guard would agree. checkEvidenceBytes is the half that opens the files --
 * and while no row is verified yet its loop body never executes, which is the
 * one state in which a guard reports clean forever without ever having run.
 *
 * So these build verified rows over the real captures on disk, prove that
 * baseline green, and then break it six ways. Watching the mutations go red is
 * the whole point: a guard nobody has seen fail proves nothing.
 */
import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

import { checkEvidenceBytes } from '../parity/check-design-parity.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const CAPTURES = 'docs/features/design-parity/captures'

const hashOf = (rel) => createHash('sha256').update(readFileSync(path.join(root, rel))).digest('hex')
const evidence = (rel) => ({ status: 'verified', path: rel, sha256: hashOf(rel) })

/** Two rows that really were captured, so the fixture cannot drift from reality. */
const PAIRED = ['models', 'docs']

const rowFor = (id) => ({
  id,
  status: 'verified',
  evidence: {
    referenceRaw: evidence(`${CAPTURES}/reference/${id}.png`),
    builtRaw: evidence(`${CAPTURES}/built/${id}.png`),
    sideBySide: evidence(`${CAPTURES}/side-by-side/${id}.png`),
    diff: evidence(`${CAPTURES}/diff/${id}.json`),
  },
})

const inventoryOf = (rows) => ({ fixedTuple: { width: 816, height: 639 }, rows })
const clone = (value) => JSON.parse(JSON.stringify(value))

const capturesPresent = PAIRED.every((id) =>
  ['reference', 'built', 'side-by-side'].every((dir) => existsSync(path.join(root, `${CAPTURES}/${dir}/${id}.png`))) &&
  existsSync(path.join(root, `${CAPTURES}/diff/${id}.json`)),
)

test('design-parity evidence bytes', { skip: capturesPresent ? false : 'paired captures not present in this checkout' }, async (t) => {
  const baseline = inventoryOf(PAIRED.map(rowFor))

  await t.test('a verified row over real captures passes', () => {
    const result = checkEvidenceBytes(baseline)
    assert.equal(result.verifiedRows, PAIRED.length)
    // Guard against the fixture quietly degrading into a no-op: if this ever
    // reads zero files, every mutation below stops testing anything.
    assert.equal(result.evidenceFiles, PAIRED.length * 4)
  })

  const mutations = [
    ['a hash nothing ever wrote', (v) => { v.rows[0].evidence.builtRaw.sha256 = 'f'.repeat(64) }],
    ['evidence citing a file that does not exist', (v) => { v.rows[0].evidence.sideBySide.path = `${CAPTURES}/built/does-not-exist.png` }],
    ['a capture that is not the tuple size', (v) => {
      // The side-by-side is 1640x663 -- two frames and the gutter. Passing one
      // off as a raw capture is exactly the substitution to refuse.
      const rel = `${CAPTURES}/side-by-side/${PAIRED[0]}.png`
      v.rows[0].evidence.builtRaw = { status: 'verified', path: rel, sha256: hashOf(rel) }
    }],
    ['two rows sharing one capture', (v) => { v.rows[1].evidence.builtRaw = clone(v.rows[0].evidence.builtRaw) }],
    ['a diff record computed from a different capture', (v) => {
      const rel = `${CAPTURES}/diff/${PAIRED[1]}.json`
      v.rows[0].evidence.diff = { status: 'verified', path: rel, sha256: hashOf(rel) }
    }],
    ['the tuple widened to fit whatever the pixels are', (v) => { v.fixedTuple = { width: 800, height: 600 } }],
  ]

  for (const [name, mutate] of mutations) {
    await t.test(`refuses ${name}`, () => {
      const mutated = clone(baseline)
      mutate(mutated)
      assert.throws(() => checkEvidenceBytes(mutated))
    })
  }
})
