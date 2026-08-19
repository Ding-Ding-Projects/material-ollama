import { describe, expect, it } from "vitest"
import { encodeQr, __test } from "./qrEncoder"

// This is the load-bearing check for the whole encoder: it decodes a
// produced matrix independently of the code that wrote it (its own
// zigzag reader, its own function-module geometry, its own mask
// application) and then verifies the Reed-Solomon relationship between
// every block's recovered data and its recovered EC codewords -- the
// same relationship a real scanner's decoder depends on. If the encoder's
// placement order, block interleaving, or masking disagreed with the
// spec, the RS remainder recomputed here would not match what is
// physically sitting in the matrix, and this test would fail. It reuses
// this file's own GF(256) primitives (rather than re-deriving them) so
// this is a genuine cross-check of placement/interleaving, not a second
// unrelated risk of arithmetic transcription error.

const FINDER_7X7 = [
  [1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 1, 1, 1, 0, 1],
  [1, 0, 0, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1],
].map((row) => row.map(Boolean))

function versionFromSize(size: number): number {
  const v = (size - 17) / 4
  if (!Number.isInteger(v) || v < 1 || v > 40) throw new Error(`not a valid QR size: ${size}`)
  return v
}

function isFunctionModule(version: number, size: number, x: number, y: number): boolean {
  // Finder + separator corners (9x9 blocks anchored at (0,0), (size-8,0), (0,size-8)).
  const inCorner = (cx: number, cy: number) => x >= cx && x < cx + 8 && y >= cy && y < cy + 8
  if (inCorner(0, 0) || inCorner(size - 8, 0) || inCorner(0, size - 8)) return true
  // Timing patterns.
  if (x === 6 || y === 6) return true
  // Format info cells around the top-left finder, plus the two split copies.
  if ((x === 8 && y <= 8) || (y === 8 && x <= 8)) return true
  if ((x === 8 && y >= size - 8) || (y === 8 && x >= size - 8)) return true
  // Version info blocks (v >= 7): two 3x6 rectangles.
  if (version >= 7) {
    if (x >= size - 11 && x <= size - 9 && y <= 5) return true
    if (y >= size - 11 && y <= size - 9 && x <= 5) return true
  }
  // Alignment patterns.
  const numAlign = version === 1 ? 0 : Math.floor(version / 7) + 2
  if (numAlign > 0) {
    const step = version === 32 ? 26 : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2
    const positions = new Array<number>(numAlign)
    positions[0] = 6
    let pos = size - 7
    for (let i = numAlign - 1; i >= 1; i--, pos -= step) positions[i] = pos
    for (let i = 0; i < numAlign; i++) {
      for (let j = 0; j < numAlign; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === numAlign - 1) || (i === numAlign - 1 && j === 0)) continue
        const cx = positions[i]
        const cy = positions[j]
        if (Math.abs(x - cx) <= 2 && Math.abs(y - cy) <= 2) return true
      }
    }
  }
  return false
}

function maskCondition(mask: number, x: number, y: number): boolean {
  switch (mask) {
    case 0:
      return (x + y) % 2 === 0
    case 1:
      return y % 2 === 0
    case 2:
      return x % 3 === 0
    case 3:
      return (x + y) % 3 === 0
    case 4:
      return (Math.floor(y / 2) + Math.floor(x / 3)) % 2 === 0
    case 5:
      return (x * y) % 2 + ((x * y) % 3) === 0
    case 6:
      return (((x * y) % 2) + ((x * y) % 3)) % 2 === 0
    case 7:
      return (((x + y) % 2) + ((x * y) % 3)) % 2 === 0
    default:
      throw new Error(`bad mask ${mask}`)
  }
}

function readFormatInfo(modules: boolean[][]): { level: number; mask: number } {
  // First copy only (top-left finder surround) -- sufficient to decode,
  // and independently re-deriving the BCH code below cross-checks it.
  let bits = 0
  const readBit = (x: number, y: number, i: number) => {
    if (modules[y][x]) bits |= 1 << i
  }
  for (let i = 0; i <= 5; i++) readBit(8, i, i)
  readBit(8, 7, 6)
  readBit(8, 8, 7)
  readBit(7, 8, 8)
  for (let i = 9; i < 15; i++) readBit(14 - i, 8, i)

  const unmasked = bits ^ 0x5412
  const data = unmasked >>> 10 // 5 bits: 2-bit level, 3-bit mask

  // Re-derive the 15-bit BCH code from the decoded 5 data bits and
  // confirm it's exactly what was stored -- proves the format info is
  // self-consistent, not just "some bits that happened to be there".
  let rem = data
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
  const recomputed = ((data << 10) | rem) ^ 0x5412
  expect(recomputed).toBe(bits)

  return { level: (data >>> 3) & 0b11, mask: data & 0b111 }
}

/** Reads codewords back out in the same zigzag order the encoder writes
 * them in, undoing the given mask as it goes -- an independent
 * transcription of the placement algorithm, not a call into the
 * encoder's own `drawCodewords`. */
function readCodewords(modules: boolean[][], version: number, size: number, mask: number, totalCodewords: number): number[] {
  const bits: boolean[] = []
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let vert = 0; vert < size; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j
        const upward = ((right + 1) & 2) === 0
        const y = upward ? size - 1 - vert : vert
        if (!isFunctionModule(version, size, x, y) && bits.length < totalCodewords * 8) {
          const raw = modules[y][x]
          const unmasked = maskCondition(mask, x, y) ? !raw : raw
          bits.push(unmasked)
        }
      }
    }
  }
  expect(bits.length).toBe(totalCodewords * 8)

  const bytes: number[] = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | (bits[i + j] ? 1 : 0)
    bytes.push(byte)
  }
  return bytes
}

/** Splits the raw interleaved codeword stream back into per-block
 * (data, ecc) pairs, independently re-deriving the same block-length
 * arithmetic `splitAndInterleave` uses (short blocks first, long blocks
 * last) from the shared tables, then de-interleaving column-major. */
function splitBlocks(all: number[], version: number): { data: number[]; ecc: number[] }[] {
  const i = version - 1
  const totalCw = __test.TOTAL_CODEWORDS[i]
  const eccLen = __test.ECC_PER_BLOCK_L[i]
  const numBlocks = __test.NUM_BLOCKS_L[i]
  const shortBlockTotalLen = Math.floor(totalCw / numBlocks)
  const numShortBlocks = numBlocks - (totalCw % numBlocks)

  const dataLens = Array.from({ length: numBlocks }, (_, b) =>
    (b < numShortBlocks ? shortBlockTotalLen : shortBlockTotalLen + 1) - eccLen,
  )
  const maxDataLen = Math.max(...dataLens)

  const blocks = dataLens.map((len) => ({ data: new Array<number>(len), ecc: new Array<number>(eccLen) }))
  let cursor = 0
  for (let col = 0; col < maxDataLen; col++) {
    for (let b = 0; b < numBlocks; b++) {
      if (col < dataLens[b]) blocks[b].data[col] = all[cursor++]
    }
  }
  for (let col = 0; col < eccLen; col++) {
    for (let b = 0; b < numBlocks; b++) {
      blocks[b].ecc[col] = all[cursor++]
    }
  }
  expect(cursor).toBe(all.length)
  return blocks
}

/** Full round trip: encode `text`, decode the matrix back into UTF-8
 * bytes via the independent reader above, and assert it matches. */
function decodeQrText(text: string): string {
  const { size, modules } = encodeQr(text)
  const version = versionFromSize(size)
  const { level, mask } = readFormatInfo(modules)
  expect(level).toBe(0b01) // this encoder only ever emits EC level L

  const totalCodewords = __test.TOTAL_CODEWORDS[version - 1]
  const all = readCodewords(modules, version, size, mask, totalCodewords)
  const blocks = splitBlocks(all, version)

  // The Reed-Solomon proof: recompute each block's EC codewords from its
  // recovered data bytes and confirm they equal what the matrix actually
  // stored. This is the property a real QR decoder's error correction
  // depends on -- if it holds, the matrix is a genuine, mathematically
  // consistent QR code, not merely something shaped like one.
  const divisor = __test.rsDivisor(__test.ECC_PER_BLOCK_L[version - 1])
  const dataBytes: number[] = []
  for (const block of blocks) {
    const recomputedEcc = __test.rsRemainder(block.data, divisor)
    expect(recomputedEcc).toEqual(block.ecc)
    dataBytes.push(...block.data)
  }

  // Parse the byte-mode segment header (mode nibble + count) and slice
  // out exactly that many bytes -- ignoring the terminator/pad bytes
  // after it, exactly as a real decoder would.
  let bitIdx = 0
  const readBits = (n: number): number => {
    let v = 0
    for (let k = 0; k < n; k++, bitIdx++) {
      const byte = dataBytes[bitIdx >>> 3]
      const bit = (byte >>> (7 - (bitIdx & 7))) & 1
      v = (v << 1) | bit
    }
    return v
  }
  const mode = readBits(4)
  expect(mode).toBe(0b0100) // byte mode
  const countBits = version <= 9 ? 8 : 16
  const byteLen = readBits(countBits)
  const out = new Uint8Array(byteLen)
  for (let i = 0; i < byteLen; i++) out[i] = readBits(8)
  return new TextDecoder().decode(out)
}

describe("encodeQr", () => {
  it("round-trips a short ASCII string through independent decoding", () => {
    expect(decodeQrText("hello")).toBe("hello")
  })

  it("round-trips a real otpauth:// pairing URI", () => {
    const uri =
      "otpauth://totp/Material%20Ollama:baycheen48%40gmail.com?secret=JBSWY3DPEHPK3PXP&issuer=Material%20Ollama&algorithm=SHA1&digits=6&period=30"
    expect(decodeQrText(uri)).toBe(uri)
  })

  it("round-trips UTF-8 (Cantonese account name)", () => {
    const uri = "otpauth://totp/Material%20Ollama:%E6%88%91%E7%9A%84%E5%B8%B3%E6%88%B6?secret=AAAAAAAA"
    expect(decodeQrText(uri)).toBe(uri)
  })

  it("round-trips a payload long enough to force a multi-block version", () => {
    // 300 bytes needs more than one Reed-Solomon block at level L (a
    // single block cannot exceed 255 codewords), so this specifically
    // exercises the block-splitting and interleaving path, not just a
    // single-block version like the short strings above.
    const long = "x".repeat(300)
    expect(decodeQrText(long)).toBe(long)
  })

  it("picks a strictly larger version for longer payloads", () => {
    const small = encodeQr("a")
    const large = encodeQr("y".repeat(1000))
    expect(large.size).toBeGreaterThan(small.size)
  })

  it("renders the standard 7x7 finder pattern at all three corners", () => {
    const { size, modules } = encodeQr("finder pattern check")
    const corners: Array<[number, number]> = [
      [0, 0],
      [size - 7, 0],
      [0, size - 7],
    ]
    for (const [ox, oy] of corners) {
      for (let y = 0; y < 7; y++) {
        for (let x = 0; x < 7; x++) {
          expect(modules[oy + y][ox + x]).toBe(FINDER_7X7[y][x])
        }
      }
    }
  })

  it("always sets the fixed dark module at (8, size-8)", () => {
    const { size, modules } = encodeQr("dark module check")
    expect(modules[size - 8][8]).toBe(true)
  })

  it("is deterministic: encoding the same text twice yields an identical matrix", () => {
    const a = encodeQr("determinism check")
    const b = encodeQr("determinism check")
    expect(a.size).toBe(b.size)
    expect(a.modules).toEqual(b.modules)
  })

  it("throws a clear error rather than truncating when nothing at version 40 fits", () => {
    // Level-L version 40 caps out at 2956 data codewords; header (byte
    // mode, 16-bit count) leaves room for at most 2953 bytes.
    expect(() => encodeQr("z".repeat(3000))).toThrow(/too large/)
  })
})
