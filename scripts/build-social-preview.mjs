#!/usr/bin/env node
// scripts/build-social-preview.mjs -- generates the repository's shared-
// link embed graphic (social-preview.png, committed at the REPOSITORY
// ROOT so the manual GitHub "Social preview" upload step is "drag this
// file", not "find a file four directories deep" -- see
// docs/features/uh-completeness/articles/shared-link-embed.md).
//
// A real product-specific graphic, not a stock photo or a generic
// gradient-with-a-word-on-it: the actual app mark (the same vector master
// scripts/build-app-icon.mjs renders the packaged .ico from), composited
// with its own alpha channel (the mark's rounded-square background has
// transparent corners) onto a card filled with the mark's own two brand
// gradient stops -- so the result is unambiguously "this project's own
// logo," never an unrelated image standing in for it.
//
// Zero third-party dependencies, same discipline as build-app-icon.mjs:
// this reads the already-verified app/ui/app/public/icons/icon-512.png
// (a real PNG this repository already committed, generated and read-back-
// verified by build-app-icon.mjs) with a small hand-rolled PNG DECODER --
// deliberately narrow, matching exactly the encoder's own fixed output
// shape (8-bit RGBA, no interlacing, filter type 0/None on every
// scanline; see build-app-icon.mjs's encodePng) rather than a general
// PNG decoder, and re-encodes the composited card with the same PNG
// encoder shape. Both are read back and verified after writing, exactly
// like build-app-icon.mjs's own verifyIco step -- nothing here is trusted
// on say-so.
//
// Run with: node scripts/build-social-preview.mjs

import { readFileSync, writeFileSync } from "node:fs"
import { deflateSync, inflateSync } from "node:zlib"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

const MASTER_SVG_PATH = path.join(REPO_ROOT, "app", "assets", "material-ollama-mark.svg")
const SOURCE_ICON_PATH = path.join(REPO_ROOT, "app", "ui", "app", "public", "icons", "icon-512.png")
const OUTPUT_PATH = path.join(REPO_ROOT, "social-preview.png")

// GitHub's own recommended social-preview size.
const CARD_W = 1280
const CARD_H = 640
// The composited mark's on-card size and vertical centering -- leaves
// real quiet space on every side rather than filling the whole card.
const MARK_SIZE = 440

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

// ---------------------------------------------------------------------------
// Minimal PNG decode/encode -- narrow on purpose (see header comment).
// ---------------------------------------------------------------------------

function decodePng(buf) {
  for (let i = 0; i < 8; i++) {
    if (buf[i] !== PNG_SIGNATURE[i]) {
      throw new Error(`decodePng: ${SOURCE_ICON_PATH} does not start with the PNG signature at byte ${i}`)
    }
  }
  let offset = 8
  let width = null
  let height = null
  let bitDepth = null
  let colorType = null
  const idatChunks = []
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset)
    const type = buf.toString("ascii", offset + 4, offset + 8)
    const dataStart = offset + 8
    const data = buf.subarray(dataStart, dataStart + length)
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      bitDepth = data[8]
      colorType = data[9]
    } else if (type === "IDAT") {
      idatChunks.push(data)
    } else if (type === "IEND") {
      break
    }
    offset = dataStart + length + 4 // + CRC
  }
  if (width === null) throw new Error("decodePng: no IHDR chunk found")
  if (bitDepth !== 8 || colorType !== 6) {
    throw new Error(
      `decodePng: only 8-bit RGBA (bitDepth=8, colorType=6) is supported by this narrow decoder -- got ` +
        `bitDepth=${bitDepth}, colorType=${colorType}. This decoder deliberately does not handle every PNG ` +
        `variant; it only needs to read this project's own encodePng() output.`,
    )
  }
  const raw = inflateSync(Buffer.concat(idatChunks))
  const stride = width * 4
  const rgba = Buffer.alloc(stride * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    const filterType = raw[rowStart]
    if (filterType !== 0) {
      throw new Error(
        `decodePng: row ${y} uses filter type ${filterType}, but this narrow decoder only handles filter ` +
          `type 0 (None) -- the exact shape build-app-icon.mjs's own encodePng() always produces.`,
      )
    }
    raw.copy(rgba, y * stride, rowStart + 1, rowStart + 1 + stride)
  }
  return { width, height, rgba }
}

function encodePng(width, height, rgba) {
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type: RGBA
  ihdrData[10] = 0
  ihdrData[11] = 0
  ihdrData[12] = 0
  const ihdr = pngChunk("IHDR", ihdrData)
  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride)
  }
  const idat = pngChunk("IDAT", deflateSync(raw, { level: 9 }))
  const iend = pngChunk("IEND", Buffer.alloc(0))
  return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend])
}

function pngChunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii")
  const lenBuf = Buffer.alloc(4)
  lenBuf.writeUInt32BE(data.length, 0)
  const crcInput = Buffer.concat([typeBuf, data])
  const crcBuf = Buffer.alloc(4)
  crcBuf.writeUInt32BE(crc32(crcInput), 0)
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf])
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// ---------------------------------------------------------------------------
// Card composition
// ---------------------------------------------------------------------------

function hexToRgb(hex) {
  const n = Number.parseInt(hex.replace("#", ""), 16)
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff }
}

/** Pull this project's own two brand gradient stops straight out of the
 * committed master SVG -- the same <stop stop-color="#..."> pairs
 * build-app-icon.mjs's parseMasterSvg() reads -- so the card's background
 * can never silently drift from the mark's own real colors. */
function readBrandStops(svgText) {
  const stopMatches = [...svgText.matchAll(/<stop\s+offset="([\d.]+)"\s+stop-color="(#[0-9a-fA-F]{6})"\s*\/>/g)]
  if (stopMatches.length !== 2) {
    throw new Error(
      `readBrandStops: expected exactly 2 <stop> elements in ${MASTER_SVG_PATH}, found ${stopMatches.length}`,
    )
  }
  return stopMatches
    .map((m) => ({ offset: Number.parseFloat(m[1]), color: hexToRgb(m[2]) }))
    .sort((a, b) => a.offset - b.offset)
}

function lerp(a, b, t) {
  return a + (b - a) * t
}

/** Nearest-neighbor resize -- adequate for a source that is already a
 * clean supersampled raster (icon-512.png came from build-app-icon.mjs's
 * own 6x-oversampled box-filter pipeline), and simpler/more auditable
 * than a second box filter for one straightforward downscale. */
function resizeNearest(src, srcSize, dstSize) {
  const dst = Buffer.alloc(dstSize * dstSize * 4)
  for (let y = 0; y < dstSize; y++) {
    const sy = Math.min(srcSize - 1, Math.floor((y * srcSize) / dstSize))
    for (let x = 0; x < dstSize; x++) {
      const sx = Math.min(srcSize - 1, Math.floor((x * srcSize) / dstSize))
      const srcIdx = (sy * srcSize + sx) * 4
      const dstIdx = (y * dstSize + x) * 4
      src.copy(dst, dstIdx, srcIdx, srcIdx + 4)
    }
  }
  return dst
}

function buildCard() {
  const svgText = readFileSync(MASTER_SVG_PATH, "utf8")
  const stops = readBrandStops(svgText)
  const { width: srcSize, height: srcSizeH, rgba: srcRgba } = decodePng(readFileSync(SOURCE_ICON_PATH))
  if (srcSize !== srcSizeH) {
    throw new Error(`buildCard: expected a square source icon, got ${srcSize}x${srcSizeH}`)
  }

  const card = Buffer.alloc(CARD_W * CARD_H * 4)
  // Diagonal gradient across the whole card, using the mark's own two
  // brand stops -- t runs 0..1 along the card's diagonal.
  const diag = Math.hypot(CARD_W, CARD_H)
  for (let y = 0; y < CARD_H; y++) {
    for (let x = 0; x < CARD_W; x++) {
      const t = Math.min(1, Math.max(0, (x + y) / diag))
      const idx = (y * CARD_W + x) * 4
      card[idx] = Math.round(lerp(stops[0].color.r, stops[1].color.r, t))
      card[idx + 1] = Math.round(lerp(stops[0].color.g, stops[1].color.g, t))
      card[idx + 2] = Math.round(lerp(stops[0].color.b, stops[1].color.b, t))
      card[idx + 3] = 255
    }
  }

  const mark = resizeNearest(srcRgba, srcSize, MARK_SIZE)
  const offsetX = Math.round((CARD_W - MARK_SIZE) / 2)
  const offsetY = Math.round((CARD_H - MARK_SIZE) / 2)
  for (let y = 0; y < MARK_SIZE; y++) {
    for (let x = 0; x < MARK_SIZE; x++) {
      const markIdx = (y * MARK_SIZE + x) * 4
      const a = mark[markIdx + 3] / 255
      if (a <= 0) continue
      const cardX = offsetX + x
      const cardY = offsetY + y
      const cardIdx = (cardY * CARD_W + cardX) * 4
      // Standard "over" alpha compositing: the mark's rounded-square
      // background is opaque inside the rounded rect and fully
      // transparent at the corners, so this is what actually produces
      // the rounded-corner look against the gradient card.
      card[cardIdx] = Math.round(lerp(card[cardIdx], mark[markIdx], a))
      card[cardIdx + 1] = Math.round(lerp(card[cardIdx + 1], mark[markIdx + 1], a))
      card[cardIdx + 2] = Math.round(lerp(card[cardIdx + 2], mark[markIdx + 2], a))
    }
  }

  return card
}

function main() {
  const card = buildCard()
  const png = encodePng(CARD_W, CARD_H, card)

  const checkMode = process.argv.includes("--check")
  if (checkMode) {
    let existing
    try {
      existing = readFileSync(OUTPUT_PATH)
    } catch {
      console.log(JSON.stringify({ ok: false, reason: "social-preview.png does not exist at the repository root" }))
      process.exit(1)
    }
    if (!existing.equals(png)) {
      console.log(
        JSON.stringify({
          ok: false,
          reason:
            "committed social-preview.png is stale relative to the master SVG/icon it is generated from -- " +
            "re-run `node scripts/build-social-preview.mjs` and commit the result",
        }),
      )
      process.exit(1)
    }
    console.log(JSON.stringify({ ok: true, bytes: png.length }))
    return
  }

  writeFileSync(OUTPUT_PATH, png)

  // Read the just-written file back and independently re-decode it with
  // the SAME narrow decoder used to read the source icon -- proves the
  // encoder's output is genuinely readable, not merely "written," and
  // that its declared dimensions match what was actually requested.
  const readBack = decodePng(readFileSync(OUTPUT_PATH))
  if (readBack.width !== CARD_W || readBack.height !== CARD_H) {
    throw new Error(
      `verify: wrote ${OUTPUT_PATH} but read back ${readBack.width}x${readBack.height}, expected ${CARD_W}x${CARD_H}`,
    )
  }
  // Cheap non-blankness check: a real composited card has many distinct
  // colors (gradient + mark + antialiased edges); a blank/solid write
  // would not.
  const sampleColors = new Set()
  for (let i = 0; i < readBack.rgba.length; i += 4 * 997) {
    sampleColors.add(`${readBack.rgba[i]},${readBack.rgba[i + 1]},${readBack.rgba[i + 2]}`)
  }
  if (sampleColors.size < 10) {
    throw new Error(`verify: only ${sampleColors.size} distinct sampled colors -- output looks blank`)
  }

  console.log(
    `[build-social-preview] wrote ${path.relative(REPO_ROOT, OUTPUT_PATH)} (${CARD_W}x${CARD_H}, ` +
      `${png.length} bytes, ${sampleColors.size} distinct sampled colors, read-back verified)`,
  )
}

main()
