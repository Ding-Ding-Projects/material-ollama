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
const SERVED_OUTPUT_PATH = path.join(REPO_ROOT, 'docs', 'landing-site', 'social-preview.png')
const LANDING_HTML_PATH = path.join(REPO_ROOT, 'docs', 'landing-site', 'index.html')

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function parseLandingMetadata(html) {
  const attributeMap = (tag) => Object.fromEntries(
    [...tag.matchAll(/\b([a-zA-Z:-]+)\s*=\s*["']([^"']*)["']/g)].map((match) => [match[1].toLowerCase(), match[2]]),
  )
  return {
    canonical: [...html.matchAll(/<link\b[^>]*\brel=["']canonical["'][^>]*>/gi)].map((match) => attributeMap(match[0])),
    meta: [...html.matchAll(/<meta\b[^>]*>/gi)].map((match) => attributeMap(match[0])),
  }
}

function metadataValues(parsed, key, value) {
  return parsed.meta.filter((attributes) => attributes[key] === value)
}

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

test('public landing metadata uses one absolute PNG and the served copy matches the root master', () => {
  // Parse the static HTML once. This deliberately rejects a source-only claim:
  // the crawler-facing markup, the real PNG dimensions, and the deployed copy
  // must all agree. Mutating any URL to /landing-site/, SVG, relative, or a
  // different dimension makes this test red before the original is restored.
  const html = readFileSync(LANDING_HTML_PATH, 'utf8')
  const forbiddenPrivatePhrase = String.fromCharCode(68, 97, 121, 32, 84, 101, 101, 116, 32, 72, 117, 105)
  assert.doesNotMatch(html, new RegExp(forbiddenPrivatePhrase.replace(/ /g, '\\s+')))
  const parsed = parseLandingMetadata(html)
  const canonical = parsed.canonical
  const ogUrl = metadataValues(parsed, 'property', 'og:url')
  const ogImages = metadataValues(parsed, 'property', 'og:image')
  const ogImageWidths = metadataValues(parsed, 'property', 'og:image:width')
  const ogImageHeights = metadataValues(parsed, 'property', 'og:image:height')
  const twitterImages = metadataValues(parsed, 'name', 'twitter:image')

  assert.equal(canonical.length, 1)
  assert.equal(ogUrl.length, 1)
  assert.equal(ogImages.length, 1)
  assert.equal(ogImageWidths.length, 1)
  assert.equal(ogImageHeights.length, 1)
  assert.equal(twitterImages.length, 1)

  const expectedUrl = 'https://ding-ding-projects.github.io/material-ollama/'
  const expectedImage = 'https://ding-ding-projects.github.io/material-ollama/social-preview.png'
  assert.equal(canonical[0].href, expectedUrl)
  assert.equal(ogUrl[0].content, expectedUrl)
  assert.equal(ogImages[0].content, expectedImage)
  assert.equal(twitterImages[0].content, expectedImage)
  assert.match(expectedImage, /^https:\/\/[^/]+\/[^?#]+\.png$/i)
  assert.equal(ogImageWidths[0].content, '1280')
  assert.equal(ogImageHeights[0].content, '640')
  assert.ok(!ogImages[0].content.toLowerCase().endsWith('.svg'))
  assert.ok(!twitterImages[0].content.toLowerCase().endsWith('.svg'))

  const rootImage = readFileSync(OUTPUT_PATH)
  const servedImage = readFileSync(SERVED_OUTPUT_PATH)
  assert.deepEqual(servedImage, rootImage)
  assert.deepEqual(rootImage.subarray(0, 8), PNG_SIGNATURE)
  assert.equal(rootImage.readUInt32BE(16), 1280)
  assert.equal(rootImage.readUInt32BE(20), 640)
})

test('social-preview.png is a real composited image, not a blank or near-solid placeholder', () => {
  const buf = readFileSync(OUTPUT_PATH)
  // A blank/placeholder PNG of this size would compress to a tiny file;
  // the real gradient+mark composite does not.
  assert.ok(buf.length > 10_000, `social-preview.png is only ${buf.length} bytes -- looks too small to be real`)
})
