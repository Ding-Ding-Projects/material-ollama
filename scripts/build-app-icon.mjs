#!/usr/bin/env node
// build-app-icon.mjs -- generates the packaged app icon from the committed
// vector master at app/assets/material-ollama-mark.svg.
//
// Zero third-party dependencies on purpose: this script is invoked by
// build.bat's release path (indirectly, via a maintainer re-running it
// whenever the master SVG changes) on a machine that may have no network
// access and no permission to add a new npm dependency to this lane's
// scope. Everything below is built from Node's own standard library --
// `zlib` for PNG deflate, `fs`/`path`/`url` for I/O -- plus a small
// hand-rolled rasterizer, PNG encoder, and multi-resolution ICO packer.
//
// Pipeline:
//   1. Read the master SVG and pull out its shapes with a tiny, deliberately
//      narrow reader (see parseMasterSvg below) -- NOT a general SVG engine.
//      It understands exactly the vocabulary the master file uses: one
//      <rect> (rounded background), a 2-stop <linearGradient>, two <line>s
//      (the connectors) and three <circle>s (the nodes). If the master
//      SVG's shape vocabulary ever changes, this parser is meant to fail
//      loudly rather than silently render something else.
//   2. Rasterize those shapes into one supersampled RGBA buffer
//      (MASTER_PX = 1536, i.e. 6x oversample of the 256-unit design grid).
//      Every requested output size divides 1536 evenly, so each one is
//      produced by an exact-integer box filter (premultiplied-alpha
//      average) over that one master raster -- no per-size re-rendering,
//      no size-dependent geometry drift.
//   3. Encode every requested size as a real PNG (IHDR/IDAT/IEND, 8-bit
//      RGBA, zlib-deflated scanlines with CRC32-checked chunks).
//   4. Pack the ICO_SIZES subset into one multi-resolution app.ico, using
//      PNG-compressed frames (valid for every size since Windows Vista;
//      Explorer, the taskbar, and Squirrel's installer icon all decode
//      this correctly) inside a standard ICONDIR/ICONDIRENTRY container.
//   5. Read the just-written app.ico back from disk byte-for-byte and
//      verify its own header: reserved==0, type==1 (icon), the frame
//      count matches what was requested, the width/height each
//      ICONDIRENTRY declares matches the *actual* embedded PNG's own
//      IHDR dimensions, and every frame's bytes genuinely start with the
//      PNG signature (so a PNG-renamed-.ico, or any other frame swap,
//      cannot silently ship). Any mismatch throws and exits non-zero --
//      this step exists specifically so nothing here can be trusted on
//      say-so.
//   6. Write the same rasters out as PNG derivatives for the web app
//      under app/ui/app/public/ (favicon.svg + vite.svg -- the file
//      index.html's existing `<link rel="icon" href="/vite.svg">` already
//      points at -- plus an icons/ set for future manifest/apple-touch
//      use), and print the full frame table that step 5 read back.
//
// Run with: node scripts/build-app-icon.mjs

import { readFileSync, writeFileSync, mkdirSync } from "node:fs"
import { deflateSync } from "node:zlib"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, "..")

const MASTER_SVG_PATH = path.join(REPO_ROOT, "app", "assets", "material-ollama-mark.svg")
const ICO_OUT_PATH = path.join(REPO_ROOT, "app", "assets", "app.ico")
const PUBLIC_DIR = path.join(REPO_ROOT, "app", "ui", "app", "public")
const PUBLIC_ICONS_DIR = path.join(PUBLIC_DIR, "icons")

// Supersample resolution the whole design is rendered at once. Every size
// in ICO_SIZES and WEB_SIZES below MUST divide this evenly -- the assertion
// at the bottom of buildSizeList() enforces that instead of letting a
// non-divisor silently round and skew the box filter.
const MASTER_PX = 1536

// Required by the release gate: 16/24/32/48/64/128/256px frames in one
// multi-resolution .ico.
const ICO_SIZES = [16, 24, 32, 48, 64, 128, 256]

// A conventional favicon/PWA-icon set for the web app. 512 is included for
// a future manifest.json; nothing currently references it, which is fine --
// it is generated once, deterministically, alongside everything else.
const WEB_SIZES = [16, 32, 48, 64, 128, 192, 256, 512]

function buildSizeList() {
  const all = Array.from(new Set([...ICO_SIZES, ...WEB_SIZES])).sort((a, b) => a - b)
  for (const size of all) {
    if (!Number.isInteger(MASTER_PX / size)) {
      throw new Error(
        `MASTER_PX=${MASTER_PX} is not evenly divisible by requested size ${size}px -- ` +
          `the box-filter downsample requires an exact integer factor for every size. ` +
          `Fix MASTER_PX or drop/replace ${size} in ICO_SIZES/WEB_SIZES.`,
      )
    }
  }
  return all
}

// ---------------------------------------------------------------------------
// 1. Master SVG reader -- narrow on purpose. See the header comment above.
// ---------------------------------------------------------------------------

function parseMasterSvg(svgText) {
  function must(regex, label) {
    const m = svgText.match(regex)
    if (!m) {
      throw new Error(
        `build-app-icon.mjs: could not find ${label} in ${MASTER_SVG_PATH}. ` +
          `This generator reads a fixed shape vocabulary (one <rect>, a 2-stop ` +
          `<linearGradient>, two <line>s, three <circle>s) -- if the master SVG's ` +
          `structure changed, update parseMasterSvg() in the same commit.`,
      )
    }
    return m
  }

  const num = (s) => {
    const v = Number.parseFloat(s)
    if (!Number.isFinite(v)) throw new Error(`build-app-icon.mjs: expected a number, got ${JSON.stringify(s)}`)
    return v
  }

  const gradM = must(
    /<linearGradient[^>]*id="([^"]+)"[^>]*x1="([-\d.]+)"[^>]*y1="([-\d.]+)"[^>]*x2="([-\d.]+)"[^>]*y2="([-\d.]+)"[^>]*gradientUnits="userSpaceOnUse"[^>]*>([\s\S]*?)<\/linearGradient>/,
    "the background <linearGradient>",
  )
  const gradId = gradM[1]
  const grad = {
    x1: num(gradM[2]),
    y1: num(gradM[3]),
    x2: num(gradM[4]),
    y2: num(gradM[5]),
  }
  const stopMatches = [...gradM[6].matchAll(/<stop\s+offset="([\d.]+)"\s+stop-color="(#[0-9a-fA-F]{6})"\s*\/>/g)]
  if (stopMatches.length !== 2) {
    throw new Error(
      `build-app-icon.mjs: expected exactly 2 <stop> elements inside the background gradient, found ${stopMatches.length}.`,
    )
  }
  grad.stops = stopMatches
    .map((m) => ({ offset: num(m[1]), color: hexToRgb(m[2]) }))
    .sort((a, b) => a.offset - b.offset)

  const rectM = must(
    /<rect\s+x="([-\d.]+)"\s+y="([-\d.]+)"\s+width="([-\d.]+)"\s+height="([-\d.]+)"\s+rx="([-\d.]+)"\s+fill="url\(#([^)]+)\)"\s*\/>/,
    "the background <rect>",
  )
  if (rectM[6] !== gradId) {
    throw new Error(
      `build-app-icon.mjs: background <rect> references gradient "#${rectM[6]}" but the parsed gradient id is "${gradId}".`,
    )
  }
  const rect = {
    x: num(rectM[1]),
    y: num(rectM[2]),
    width: num(rectM[3]),
    height: num(rectM[4]),
    rx: num(rectM[5]),
  }

  const groupM = must(
    /<g\s+fill="none"\s+stroke="(#[0-9a-fA-F]{6})"\s+stroke-width="([-\d.]+)"\s+stroke-linecap="round"\s*>([\s\S]*?)<\/g>/,
    "the connector <g> (stroke group)",
  )
  const strokeColor = hexToRgb(groupM[1])
  const strokeWidth = num(groupM[2])
  const lineMatches = [
    ...groupM[3].matchAll(/<line\s+x1="([-\d.]+)"\s+y1="([-\d.]+)"\s+x2="([-\d.]+)"\s+y2="([-\d.]+)"\s*\/>/g),
  ]
  if (lineMatches.length !== 2) {
    throw new Error(`build-app-icon.mjs: expected exactly 2 <line> connectors, found ${lineMatches.length}.`)
  }
  const lines = lineMatches.map((m) => ({
    x1: num(m[1]),
    y1: num(m[2]),
    x2: num(m[3]),
    y2: num(m[4]),
    width: strokeWidth,
    color: strokeColor,
  }))

  const circleMatches = [
    ...svgText.matchAll(/<circle\s+cx="([-\d.]+)"\s+cy="([-\d.]+)"\s+r="([-\d.]+)"\s+fill="(#[0-9a-fA-F]{6})"\s*\/>/g),
  ]
  if (circleMatches.length !== 3) {
    throw new Error(`build-app-icon.mjs: expected exactly 3 <circle> nodes, found ${circleMatches.length}.`)
  }
  const circles = circleMatches.map((m) => ({
    cx: num(m[1]),
    cy: num(m[2]),
    r: num(m[3]),
    color: hexToRgb(m[4]),
  }))

  return { rect, gradient: grad, lines, circles }
}

function hexToRgb(hex) {
  const clean = hex.replace("#", "")
  return {
    r: Number.parseInt(clean.slice(0, 2), 16),
    g: Number.parseInt(clean.slice(2, 4), 16),
    b: Number.parseInt(clean.slice(4, 6), 16),
  }
}

// ---------------------------------------------------------------------------
// 2. Rasterizer -- binary shape tests at MASTER_PX resolution; anti-aliasing
//    comes entirely from box-filtering that supersampled raster down to
//    each target size (step 3), not from analytic edge coverage here.
// ---------------------------------------------------------------------------

function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v
}

function insideRoundedRect(px, py, x0, y0, x1, y1, r) {
  if (px < x0 || px > x1 || py < y0 || py > y1) return false
  const cx = clamp(px, x0 + r, x1 - r)
  const cy = clamp(py, y0 + r, y1 - r)
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy <= r * r
}

function distToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1
  const dy = y2 - y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2
  t = clamp(t, 0, 1)
  const nx = x1 + t * dx
  const ny = y1 + t * dy
  const ex = px - nx
  const ey = py - ny
  return Math.sqrt(ex * ex + ey * ey)
}

function gradientColorAt(px, py, grad) {
  const dx = grad.x2 - grad.x1
  const dy = grad.y2 - grad.y1
  const len2 = dx * dx + dy * dy
  let t = len2 === 0 ? 0 : ((px - grad.x1) * dx + (py - grad.y1) * dy) / len2
  t = clamp(t, 0, 1)
  const [s0, s1] = grad.stops
  const span = s1.offset - s0.offset || 1
  const localT = clamp((t - s0.offset) / span, 0, 1)
  return {
    r: Math.round(s0.color.r + (s1.color.r - s0.color.r) * localT),
    g: Math.round(s0.color.g + (s1.color.g - s0.color.g) * localT),
    b: Math.round(s0.color.b + (s1.color.b - s0.color.b) * localT),
  }
}

/**
 * Renders the parsed mark into a straight-alpha RGBA Buffer of size
 * masterPx * masterPx. Design space is the SVG's own 0..256 viewBox;
 * `scale = masterPx / 256` maps one design unit to `scale` raster pixels.
 */
function rasterizeMaster(shapes, masterPx) {
  const scale = masterPx / 256
  const buf = Buffer.alloc(masterPx * masterPx * 4) // starts fully transparent (zeroed)
  const { rect, gradient, lines, circles } = shapes
  const x0 = rect.x
  const y0 = rect.y
  const x1 = rect.x + rect.width
  const y1 = rect.y + rect.height
  const rr = rect.rx
  const halfStroke = lines[0].width / 2

  for (let py = 0; py < masterPx; py++) {
    const sy = (py + 0.5) / scale
    for (let px = 0; px < masterPx; px++) {
      const sx = (px + 0.5) / scale
      const idx = (py * masterPx + px) * 4

      if (!insideRoundedRect(sx, sy, x0, y0, x1, y1, rr)) {
        continue // stays fully transparent
      }

      const bg = gradientColorAt(sx, sy, gradient)
      let r = bg.r
      let g = bg.g
      let b = bg.b

      let onGlyph = false
      for (const line of lines) {
        if (distToSegment(sx, sy, line.x1, line.y1, line.x2, line.y2) <= halfStroke) {
          onGlyph = true
          break
        }
      }
      if (!onGlyph) {
        for (const c of circles) {
          const dx = sx - c.cx
          const dy = sy - c.cy
          if (dx * dx + dy * dy <= c.r * c.r) {
            onGlyph = true
            break
          }
        }
      }
      if (onGlyph) {
        const c = circles[0].color // all glyph shapes share one colour (white) in this mark
        r = c.r
        g = c.g
        b = c.b
      }

      buf[idx] = r
      buf[idx + 1] = g
      buf[idx + 2] = b
      buf[idx + 3] = 255
    }
  }
  return buf
}

/**
 * Box-filter downsample from a masterPx x masterPx straight-alpha RGBA
 * buffer to an exact targetPx x targetPx straight-alpha RGBA buffer, using
 * premultiplied-alpha averaging so the transparent/opaque rounded-corner
 * boundary does not pick up a dark fringe.
 */
function downsample(masterBuf, masterPx, targetPx) {
  const factor = masterPx / targetPx
  if (!Number.isInteger(factor)) {
    throw new Error(`downsample: masterPx=${masterPx} is not an integer multiple of targetPx=${targetPx}`)
  }
  const out = Buffer.alloc(targetPx * targetPx * 4)
  const samples = factor * factor

  for (let ty = 0; ty < targetPx; ty++) {
    for (let tx = 0; tx < targetPx; tx++) {
      let sumR = 0
      let sumG = 0
      let sumB = 0
      let sumA = 0
      const baseY = ty * factor
      const baseX = tx * factor
      for (let dy = 0; dy < factor; dy++) {
        const rowIdx = (baseY + dy) * masterPx
        for (let dx = 0; dx < factor; dx++) {
          const idx = (rowIdx + baseX + dx) * 4
          const a = masterBuf[idx + 3]
          sumR += masterBuf[idx] * a
          sumG += masterBuf[idx + 1] * a
          sumB += masterBuf[idx + 2] * a
          sumA += a
        }
      }
      const outIdx = (ty * targetPx + tx) * 4
      if (sumA === 0) {
        // fully transparent block -- leave as zeroed transparent black
        continue
      }
      out[outIdx] = Math.round(sumR / sumA)
      out[outIdx + 1] = Math.round(sumG / sumA)
      out[outIdx + 2] = Math.round(sumB / sumA)
      out[outIdx + 3] = Math.round(sumA / samples)
    }
  }
  return out
}

// ---------------------------------------------------------------------------
// 3. Pure-JS PNG encoder (8-bit RGBA, filter-none scanlines, zlib deflate).
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    }
    table[n] = c >>> 0
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  }
  return (c ^ 0xffffffff) >>> 0
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

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function encodePng(width, height, rgba) {
  const ihdrData = Buffer.alloc(13)
  ihdrData.writeUInt32BE(width, 0)
  ihdrData.writeUInt32BE(height, 4)
  ihdrData[8] = 8 // bit depth
  ihdrData[9] = 6 // color type: RGBA
  ihdrData[10] = 0 // compression method
  ihdrData[11] = 0 // filter method
  ihdrData[12] = 0 // interlace method
  const ihdr = pngChunk("IHDR", ihdrData)

  const stride = width * 4
  const raw = Buffer.alloc((stride + 1) * height)
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1)
    raw[rowStart] = 0 // filter type: none
    rgba.copy(raw, rowStart + 1, y * stride, y * stride + stride)
  }
  const idatData = deflateSync(raw, { level: 9 })
  const idat = pngChunk("IDAT", idatData)
  const iend = pngChunk("IEND", Buffer.alloc(0))
  return Buffer.concat([PNG_SIGNATURE, ihdr, idat, iend])
}

/** Reads back a PNG's own IHDR width/height -- used only for verification. */
function readPngIhdrSize(pngBuf) {
  for (let i = 0; i < 8; i++) {
    if (pngBuf[i] !== PNG_SIGNATURE[i]) {
      throw new Error(`readPngIhdrSize: buffer does not start with the PNG signature at byte ${i}`)
    }
  }
  const chunkType = pngBuf.toString("ascii", 12, 16)
  if (chunkType !== "IHDR") {
    throw new Error(`readPngIhdrSize: expected IHDR as the first chunk, found "${chunkType}"`)
  }
  return { width: pngBuf.readUInt32BE(16), height: pngBuf.readUInt32BE(20) }
}

// ---------------------------------------------------------------------------
// 4. Multi-resolution ICO packer (PNG-compressed frames, valid since Vista).
// ---------------------------------------------------------------------------

function encodeIco(frames) {
  const count = frames.length
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0) // reserved, must be 0
  header.writeUInt16LE(1, 2) // type: 1 = icon
  header.writeUInt16LE(count, 4)

  const entries = []
  const datas = []
  let offset = 6 + 16 * count
  for (const frame of frames) {
    const entry = Buffer.alloc(16)
    entry[0] = frame.size >= 256 ? 0 : frame.size // width, 0 means 256
    entry[1] = frame.size >= 256 ? 0 : frame.size // height, 0 means 256
    entry[2] = 0 // color count (0 = not a palette image)
    entry[3] = 0 // reserved, must be 0
    entry.writeUInt16LE(1, 4) // color planes
    entry.writeUInt16LE(32, 6) // bits per pixel
    entry.writeUInt32LE(frame.png.length, 8) // size of the image data
    entry.writeUInt32LE(offset, 12) // offset of the image data from file start
    entries.push(entry)
    datas.push(frame.png)
    offset += frame.png.length
  }
  return Buffer.concat([header, ...entries, ...datas])
}

/**
 * Reads an .ico's own bytes back from disk and verifies its header against
 * what was actually requested -- reserved==0, type==1, frame count, and
 * every declared width/height against that frame's OWN embedded PNG IHDR.
 * Also checks every frame genuinely starts with the PNG signature, so a
 * PNG-renamed-.ico (or any other frame swap) cannot silently pass. Throws
 * on the first mismatch; returns the verified frame table on success.
 */
function verifyIco(icoPath, expectedSizes) {
  const buf = readFileSync(icoPath)
  const reserved = buf.readUInt16LE(0)
  const type = buf.readUInt16LE(2)
  const count = buf.readUInt16LE(4)

  if (reserved !== 0) throw new Error(`verifyIco: reserved field is ${reserved}, expected 0`)
  if (type !== 1) throw new Error(`verifyIco: type field is ${type}, expected 1 (icon)`)
  if (count !== expectedSizes.length) {
    throw new Error(`verifyIco: ICONDIR declares ${count} frames, expected ${expectedSizes.length}`)
  }

  const table = []
  for (let i = 0; i < count; i++) {
    const entryOffset = 6 + i * 16
    const rawWidth = buf[entryOffset]
    const rawHeight = buf[entryOffset + 1]
    const bitCount = buf.readUInt16LE(entryOffset + 6)
    const byteSize = buf.readUInt32LE(entryOffset + 8)
    const dataOffset = buf.readUInt32LE(entryOffset + 12)
    const declaredWidth = rawWidth === 0 ? 256 : rawWidth
    const declaredHeight = rawHeight === 0 ? 256 : rawHeight

    const frameBuf = buf.subarray(dataOffset, dataOffset + byteSize)
    for (let b = 0; b < 8; b++) {
      if (frameBuf[b] !== PNG_SIGNATURE[b]) {
        throw new Error(
          `verifyIco: frame #${i} (declared ${declaredWidth}x${declaredHeight}) does not start with the ` +
            `PNG signature at byte ${b} -- this is exactly the "PNG renamed .ico" failure this check exists to catch.`,
        )
      }
    }
    const ihdrSize = readPngIhdrSize(frameBuf)
    if (ihdrSize.width !== declaredWidth || ihdrSize.height !== declaredHeight) {
      throw new Error(
        `verifyIco: frame #${i} ICONDIRENTRY declares ${declaredWidth}x${declaredHeight} but its embedded ` +
          `PNG IHDR says ${ihdrSize.width}x${ihdrSize.height}`,
      )
    }
    const expected = expectedSizes[i]
    if (declaredWidth !== expected || declaredHeight !== expected) {
      throw new Error(
        `verifyIco: frame #${i} is ${declaredWidth}x${declaredHeight}, expected ${expected}x${expected} ` +
          `(ICO_SIZES order mismatch)`,
      )
    }

    table.push({
      index: i,
      declaredWidth,
      declaredHeight,
      ihdrWidth: ihdrSize.width,
      ihdrHeight: ihdrSize.height,
      bitCount,
      byteSize,
      dataOffset,
    })
  }
  return table
}

// ---------------------------------------------------------------------------
// 5. Drive the pipeline.
// ---------------------------------------------------------------------------

function main() {
  console.log(`[build-app-icon] reading master: ${path.relative(REPO_ROOT, MASTER_SVG_PATH)}`)
  const svgText = readFileSync(MASTER_SVG_PATH, "utf8")
  const shapes = parseMasterSvg(svgText)
  console.log(
    `[build-app-icon] parsed shapes: rect rx=${shapes.rect.rx}, ${shapes.lines.length} connectors, ` +
      `${shapes.circles.length} nodes, gradient ${shapes.gradient.stops.length} stops`,
  )

  const sizes = buildSizeList()
  console.log(`[build-app-icon] rasterizing master at ${MASTER_PX}x${MASTER_PX} (supersample)...`)
  const masterBuf = rasterizeMaster(shapes, MASTER_PX)

  console.log(`[build-app-icon] downsampling + encoding PNGs for sizes: ${sizes.join(", ")}`)
  const pngBySize = new Map()
  for (const size of sizes) {
    const rgba = downsample(masterBuf, MASTER_PX, size)
    pngBySize.set(size, encodePng(size, size, rgba))
  }

  // --- app.ico -------------------------------------------------------------
  const icoFrames = ICO_SIZES.map((size) => ({ size, png: pngBySize.get(size) }))
  const icoBuf = encodeIco(icoFrames)
  writeFileSync(ICO_OUT_PATH, icoBuf)
  console.log(`[build-app-icon] wrote ${path.relative(REPO_ROOT, ICO_OUT_PATH)} (${icoBuf.length} bytes)`)

  console.log(`[build-app-icon] verifying app.ico bytes read back from disk...`)
  const table = verifyIco(ICO_OUT_PATH, ICO_SIZES)
  console.log(`[build-app-icon] app.ico verified -- ${table.length} frames, all PNG-signed, all headers match:`)
  console.table(
    table.map((f) => ({
      "#": f.index,
      "declared (dir)": `${f.declaredWidth}x${f.declaredHeight}`,
      "IHDR (png)": `${f.ihdrWidth}x${f.ihdrHeight}`,
      bpp: f.bitCount,
      bytes: f.byteSize,
      offset: f.dataOffset,
    })),
  )

  // --- web app derivatives ---------------------------------------------------
  mkdirSync(PUBLIC_ICONS_DIR, { recursive: true })
  for (const size of WEB_SIZES) {
    const outPath = path.join(PUBLIC_ICONS_DIR, `icon-${size}.png`)
    writeFileSync(outPath, pngBySize.get(size))
  }
  console.log(`[build-app-icon] wrote ${WEB_SIZES.length} PNG derivatives under app/ui/app/public/icons/`)

  // The favicon <link> in app/ui/app/index.html already points at
  // "/vite.svg" (a leftover from the Vite scaffold that was never wired to
  // an actual project mark). index.html itself is outside this change's
  // scope, so rather than leave that reference dangling we replace the file
  // it already resolves to. favicon.svg is the honestly-named copy for
  // whoever next touches index.html to switch the <link> over to.
  writeFileSync(path.join(PUBLIC_DIR, "favicon.svg"), svgText)
  writeFileSync(path.join(PUBLIC_DIR, "vite.svg"), svgText)
  console.log(`[build-app-icon] wrote app/ui/app/public/favicon.svg and vite.svg (index.html's existing <link> target)`)

  console.log(`[build-app-icon] done.`)
}

main()
