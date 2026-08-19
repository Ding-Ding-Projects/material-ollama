#!/usr/bin/env node
// scripts/test/shared-link-embed.test.mjs
//
// Proves social-preview.png (committed at the repository ROOT --
// deliberately, see docs/features/uh-completeness/articles/
// shared-link-embed.md for why root rather than nested) is real,
// current, and a genuine derivative of this project's own mark, not a
// stray or stale file.
//
// Run with: node --test scripts/test/shared-link-embed.test.mjs

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const GENERATOR = path.join(REPO_ROOT, 'scripts', 'build-social-preview.mjs')
const OUTPUT_PATH = path.join(REPO_ROOT, 'social-preview.png')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

test('social-preview.png exists at the repository root (not nested under docs/ or assets/)', () => {
  assert.ok(
    existsSync(OUTPUT_PATH),
    'social-preview.png must exist at the repository root for the manual GitHub Social Preview upload step',
  )
})

test('social-preview.png is a genuine, correctly-sized PNG', () => {
  const buf = readFileSync(OUTPUT_PATH)
  assert.deepEqual(buf.subarray(0, 8), PNG_SIGNATURE)
  const chunkType = buf.toString('ascii', 12, 16)
  assert.equal(chunkType, 'IHDR')
  const width = buf.readUInt32BE(16)
  const height = buf.readUInt32BE(20)
  // GitHub's own recommended social-preview size.
  assert.equal(width, 1280)
  assert.equal(height, 640)
})

test('social-preview.png is byte-identical to what the generator currently produces from the real app mark', () => {
  // --check re-derives the whole card from app/assets/material-ollama-
  // mark.svg and app/ui/app/public/icons/icon-512.png right now and
  // diffs against the committed file -- proving this is a genuine,
  // current derivative rather than a hand-placed or stale image.
  const result = execFileSync('node', [GENERATOR, '--check'], { cwd: REPO_ROOT, encoding: 'utf8' })
  const parsed = JSON.parse(result)
  assert.equal(parsed.ok, true, `social-preview.png is stale: ${JSON.stringify(parsed)}`)
})

test('social-preview.png is a real composited image, not a blank or near-solid placeholder', () => {
  const buf = readFileSync(OUTPUT_PATH)
  // A blank/placeholder PNG of this size would compress to a tiny file;
  // the real gradient+mark composite does not.
  assert.ok(buf.length > 10_000, `social-preview.png is only ${buf.length} bytes -- looks too small to be real`)
})
