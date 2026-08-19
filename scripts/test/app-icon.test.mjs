#!/usr/bin/env node
// scripts/test/app-icon.test.mjs
//
// Independent proof for the packaged-app-icon contract row: the committed
// app/assets/app.ico is a genuine multi-resolution Windows icon carrying
// the exact 16/24/32/48/64/128/256px frame table the release gate
// requires, and every declared frame is real PNG-compressed icon data
// whose own IHDR dimensions agree with what the ICONDIRENTRY claims.
//
// Deliberately does NOT import scripts/build-app-icon.mjs's own verifyIco().
// A generator that verifies its own output with its own parser can still
// ship a broken generator and a broken verifier that agree with each
// other -- see the shared instructions' note on a duplicated pattern
// proving nothing about the original. This file re-derives the ICO/PNG
// parsing from the public file-format spec against the real committed
// bytes on disk, so it fails independently of whatever build-app-icon.mjs
// believes about itself.
//
// Run with: node --test scripts/test/app-icon.test.mjs

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import test from 'node:test'
import assert from 'node:assert/strict'

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ICO_PATH = path.join(REPO_ROOT, 'app', 'assets', 'app.ico')

const EXPECTED_SIZES = [16, 24, 32, 48, 64, 128, 256]
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

/** Parse an .ico's ICONDIR + ICONDIRENTRY table straight off raw bytes --
 * MS-ICO/BMP-style container, independent of any in-repo helper. */
function parseIcoHeader(buf) {
  const reserved = buf.readUInt16LE(0)
  const type = buf.readUInt16LE(2)
  const count = buf.readUInt16LE(4)
  const entries = []
  for (let i = 0; i < count; i++) {
    const off = 6 + i * 16
    const rawWidth = buf[off]
    const rawHeight = buf[off + 1]
    entries.push({
      width: rawWidth === 0 ? 256 : rawWidth,
      height: rawHeight === 0 ? 256 : rawHeight,
      bitCount: buf.readUInt16LE(off + 6),
      byteSize: buf.readUInt32LE(off + 8),
      dataOffset: buf.readUInt32LE(off + 12),
    })
  }
  return { reserved, type, count, entries }
}

/** Read a PNG's own IHDR width/height (first chunk after the 8-byte
 * signature: 4-byte length, 4-byte "IHDR", then 4-byte width, 4-byte
 * height, big-endian per the PNG spec). */
function readPngIhdr(frameBuf) {
  assert.deepEqual(
    frameBuf.subarray(0, 8),
    PNG_SIGNATURE,
    'frame does not start with the PNG signature',
  )
  const chunkType = frameBuf.subarray(12, 16).toString('ascii')
  assert.equal(chunkType, 'IHDR', `first chunk after the PNG signature was '${chunkType}', expected 'IHDR'`)
  return {
    width: frameBuf.readUInt32BE(16),
    height: frameBuf.readUInt32BE(20),
  }
}

test('app.ico exists and is a real ICONDIR (reserved=0, type=1/icon)', () => {
  const buf = readFileSync(ICO_PATH)
  const header = parseIcoHeader(buf)
  assert.equal(header.reserved, 0, 'ICONDIR.reserved must be 0')
  assert.equal(header.type, 1, 'ICONDIR.type must be 1 (icon, not 2/cursor)')
})

test('app.ico declares exactly 7 frames', () => {
  const buf = readFileSync(ICO_PATH)
  const header = parseIcoHeader(buf)
  assert.equal(header.count, EXPECTED_SIZES.length, `expected ${EXPECTED_SIZES.length} frames`)
  assert.equal(header.entries.length, EXPECTED_SIZES.length)
})

test('app.ico frame table is exactly 16/24/32/48/64/128/256px, in that order', () => {
  const buf = readFileSync(ICO_PATH)
  const header = parseIcoHeader(buf)
  const declaredSizes = header.entries.map((e) => {
    assert.equal(e.width, e.height, `frame is not square: ${e.width}x${e.height}`)
    return e.width
  })
  assert.deepEqual(declaredSizes, EXPECTED_SIZES)
})

test('every declared frame is real PNG data whose own IHDR matches the ICONDIRENTRY size', () => {
  const buf = readFileSync(ICO_PATH)
  const header = parseIcoHeader(buf)
  for (const [i, entry] of header.entries.entries()) {
    const frameBuf = buf.subarray(entry.dataOffset, entry.dataOffset + entry.byteSize)
    const ihdr = readPngIhdr(frameBuf)
    assert.equal(
      ihdr.width,
      entry.width,
      `frame #${i}: ICONDIRENTRY declares width ${entry.width} but embedded PNG IHDR says ${ihdr.width}`,
    )
    assert.equal(
      ihdr.height,
      entry.height,
      `frame #${i}: ICONDIRENTRY declares height ${entry.height} but embedded PNG IHDR says ${ihdr.height}`,
    )
    assert.equal(ihdr.width, EXPECTED_SIZES[i], `frame #${i} is not the expected ${EXPECTED_SIZES[i]}px size`)
  }
})

test('every frame is genuinely distinct compressed data, not one image repeated seven times', () => {
  // A generator that "packed" the same 256px raster into every declared
  // size would still satisfy every check above (correct header, correct
  // declared sizes, valid PNG-in-each-slot) while shipping a broken icon.
  // Frame byte length is a cheap, real signal that each frame is its own
  // encode: a 16px PNG and a 256px PNG of the same source art are never
  // the same number of bytes.
  const buf = readFileSync(ICO_PATH)
  const header = parseIcoHeader(buf)
  const byteSizes = header.entries.map((e) => e.byteSize)
  const distinct = new Set(byteSizes)
  assert.equal(distinct.size, byteSizes.length, `frame byte sizes are not all distinct: ${byteSizes.join(', ')}`)
  // Byte size must also increase monotonically with declared pixel size --
  // a genuine per-size PNG encode of the same source art costs more bytes
  // at 256px than at 16px, every time.
  for (let i = 1; i < header.entries.length; i++) {
    assert.ok(
      header.entries[i].byteSize > header.entries[i - 1].byteSize,
      `frame byte size did not increase from ${EXPECTED_SIZES[i - 1]}px (${header.entries[i - 1].byteSize}B) to ` +
        `${EXPECTED_SIZES[i]}px (${header.entries[i].byteSize}B)`,
    )
  }
})
