// A from-scratch, in-process QR Code (Model 2) encoder -- no dependency,
// no network, no remote QR-rendering service, ever. The whole point of
// rendering an otpauth:// pairing URI as a QR code is that the secret it
// carries never leaves this machine; handing that string to a hosted "QR
// generator" API would defeat the pairing flow's entire premise.
//
// This build cannot add an npm dependency (this lane's allowed paths
// don't reach package.json), so the encoder is genuinely built from the
// ISO/IEC 18004 algorithm here rather than vendored. Its shape follows
// the well-known public-domain reference structure (byte-mode segments,
// Reed-Solomon over GF(256) via the standard "shift-and-reduce" carryless
// multiply, the zigzag module-placement scan, BCH-encoded format/version
// info, and penalty-scored mask selection) rather than inventing a novel
// algorithm -- QR's placement and error-correction rules are a fixed
// public standard, not a design decision this file gets to make.
//
// Deliberately narrow scope, on purpose:
//   - Byte mode only. An otpauth:// URI is arbitrary ASCII/percent-encoded
//     text, not numeric or QR's restricted alphanumeric subset, so byte
//     mode (which accepts any UTF-8 bytes) is the one segment mode that
//     is ever correct here -- there is no optimization being left on the
//     table by skipping numeric/alphanumeric mode.
//   - Error-correction level L only. QR's other three levels (M/Q/H) need
//     their own error-correction/block-count tables; this file carries
//     only the level-L tables, cross-checked against each other at
//     several versions (the total codeword count implied by the L table
//     agrees with a second, independently-recalled table at v1, v5, v7,
//     v10, v15 and v20) before being trusted. Shipping a second table this
//     file cannot cross-check is how a QR ends up scanning as corrupted
//     data instead of failing loudly -- far worse than just not offering
//     the other levels.
//   - Versions 1-40 (the full standard range), auto-selected as the
//     smallest version whose level-L capacity fits the payload.
export interface QrMatrix {
  size: number
  /** modules[row][col] -- true = dark module. */
  modules: boolean[][]
}

// --- Level-L codeword tables (versions 1-40) --------------------------------
//
// TOTAL_CODEWORDS is the total number of 8-bit codewords (data + error
// correction) the matrix carries at that version, independent of EC
// level. ECC_PER_BLOCK_L / NUM_BLOCKS_L are level-L-specific. Every other
// quantity this encoder needs (how many of those codewords are DATA, how
// long each Reed-Solomon block is) is derived from these three arrays at
// runtime rather than duplicated as its own table -- fewer independently
// memorized numbers means fewer places a transcription slip can hide.
const TOTAL_CODEWORDS: readonly number[] = [
  26, 44, 70, 100, 134, 172, 196, 242, 292, 346, 404, 466, 532, 581, 655, 733, 815, 901, 991, 1085, 1156, 1258, 1364,
  1474, 1588, 1706, 1828, 1921, 2051, 2185, 2323, 2465, 2611, 2761, 2876, 3034, 3196, 3362, 3532, 3706,
]

const ECC_PER_BLOCK_L: readonly number[] = [
  7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30,
  30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30,
]

const NUM_BLOCKS_L: readonly number[] = [
  1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19,
  20, 21, 22, 24, 25,
]

const MAX_VERSION = 40

function dataCodewordsTotal(version: number): number {
  const i = version - 1
  return TOTAL_CODEWORDS[i] - ECC_PER_BLOCK_L[i] * NUM_BLOCKS_L[i]
}

// --- Bit buffer --------------------------------------------------------------

class BitBuffer {
  bits: number[] = []
  appendBits(value: number, length: number): void {
    for (let i = length - 1; i >= 0; i--) {
      this.bits.push((value >>> i) & 1)
    }
  }
  get length(): number {
    return this.bits.length
  }
}

/** Chooses the smallest version (1-40) whose level-L data capacity fits
 * `byteLen` bytes of byte-mode data (mode indicator + the version-
 * dependent character-count indicator + the data itself). Throws when
 * even version 40 can't hold it -- callers fall back to showing the
 * manual secret entry, which is always present regardless. */
function chooseVersion(byteLen: number): number {
  for (let version = 1; version <= MAX_VERSION; version++) {
    const countBits = version <= 9 ? 8 : 16
    const headerBits = 4 + countBits
    const capacityBits = dataCodewordsTotal(version) * 8
    if (headerBits + byteLen * 8 <= capacityBits) return version
  }
  throw new Error(`pairing data (${byteLen} bytes) is too large for a QR code even at version ${MAX_VERSION}`)
}

function buildDataCodewords(bytes: Uint8Array, version: number): number[] {
  const bb = new BitBuffer()
  bb.appendBits(0b0100, 4) // byte-mode indicator
  bb.appendBits(bytes.length, version <= 9 ? 8 : 16)
  for (const b of bytes) bb.appendBits(b, 8)

  const capacityBits = dataCodewordsTotal(version) * 8
  const terminatorLen = Math.max(0, Math.min(4, capacityBits - bb.length))
  bb.appendBits(0, terminatorLen)
  while (bb.length % 8 !== 0) bb.appendBits(0, 1)

  const bytesOut: number[] = []
  for (let i = 0; i < bb.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j++) byte = (byte << 1) | bb.bits[i + j]
    bytesOut.push(byte)
  }

  const total = dataCodewordsTotal(version)
  let padToggle = true
  while (bytesOut.length < total) {
    bytesOut.push(padToggle ? 0xec : 0x11)
    padToggle = !padToggle
  }
  return bytesOut
}

// --- Reed-Solomon over GF(256) ------------------------------------------------
//
// QR's field is GF(2^8) with the primitive polynomial x^8+x^4+x^3+x^2+1
// (0x11D) and generator element 2. `rsMultiply` is the standard carryless
// ("Russian peasant") multiply-with-modular-reduction routine for that
// field: no separate log/exp table is needed, which is one less table
// this file has to get right from memory.
function rsMultiply(x: number, y: number): number {
  let z = 0
  for (let i = 7; i >= 0; i--) {
    z = ((z << 1) ^ ((z >>> 7) * 0x11d)) & 0xff
    z ^= ((y >>> i) & 1) * x
    z &= 0xff
  }
  return z & 0xff
}

/** The Reed-Solomon generator (divisor) polynomial of the given degree,
 * i.e. the product (x - 2^0)(x - 2^1)...(x - 2^(degree-1)) over GF(256),
 * with the leading (implicit, always-1) coefficient dropped -- stored in
 * order of DESCENDING powers, `degree` coefficients long. */
function rsDivisor(degree: number): number[] {
  const result = new Array<number>(degree).fill(0)
  result[degree - 1] = 1
  let root = 1
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < result.length; j++) {
      result[j] = rsMultiply(result[j], root)
      if (j + 1 < result.length) result[j] ^= result[j + 1]
    }
    root = rsMultiply(root, 0x02)
  }
  return result
}

/** Polynomial long division of `data` by `divisor` over GF(256); the
 * remainder is exactly the block's error-correction codewords. */
function rsRemainder(data: number[], divisor: number[]): number[] {
  const result = new Array<number>(divisor.length).fill(0)
  for (const b of data) {
    const factor = (b ^ result[0]) & 0xff
    result.copyWithin(0, 1)
    result[result.length - 1] = 0
    for (let i = 0; i < result.length; i++) {
      result[i] ^= rsMultiply(divisor[i], factor)
    }
  }
  return result
}

/** Splits `dataBytes` (already padded to the version's full level-L data
 * capacity) into its Reed-Solomon blocks, computes each block's EC
 * codewords, and interleaves data-then-EC exactly as ISO/IEC 18004
 * requires (short blocks first, column-major within each group). */
function splitAndInterleave(dataBytes: number[], version: number): number[] {
  const i = version - 1
  const totalCw = TOTAL_CODEWORDS[i]
  const eccLen = ECC_PER_BLOCK_L[i]
  const numBlocks = NUM_BLOCKS_L[i]

  const shortBlockTotalLen = Math.floor(totalCw / numBlocks)
  const numShortBlocks = numBlocks - (totalCw % numBlocks)

  const divisor = rsDivisor(eccLen)
  const dataBlocks: number[][] = []
  const eccBlocks: number[][] = []
  let offset = 0
  for (let b = 0; b < numBlocks; b++) {
    const totalLen = b < numShortBlocks ? shortBlockTotalLen : shortBlockTotalLen + 1
    const dataLen = totalLen - eccLen
    const block = dataBytes.slice(offset, offset + dataLen)
    offset += dataLen
    dataBlocks.push(block)
    eccBlocks.push(rsRemainder(block, divisor))
  }

  const out: number[] = []
  const maxDataLen = Math.max(...dataBlocks.map((b) => b.length))
  for (let col = 0; col < maxDataLen; col++) {
    for (const block of dataBlocks) {
      if (col < block.length) out.push(block[col])
    }
  }
  for (let col = 0; col < eccLen; col++) {
    for (const block of eccBlocks) {
      out.push(block[col])
    }
  }
  return out
}

// --- Matrix construction -------------------------------------------------------

function getBit(value: number, index: number): boolean {
  return ((value >>> index) & 1) !== 0
}

/** ISO/IEC 18004 Annex E's alignment-pattern-position formula (the
 * version-32 step is a documented special case in the standard itself,
 * not an approximation here) -- computed rather than looked up from a
 * 40-row table, since a formula this short is far easier to get right
 * from memory than reciting forty rows of coordinates. */
function alignmentPatternPositions(version: number, size: number): number[] {
  if (version === 1) return []
  const numAlign = Math.floor(version / 7) + 2
  const step =
    version === 32 ? 26 : Math.floor((version * 4 + numAlign * 2 + 1) / (numAlign * 2 - 2)) * 2
  const result = new Array<number>(numAlign)
  result[0] = 6
  let pos = size - 7
  for (let idx = numAlign - 1; idx >= 1; idx--, pos -= step) {
    result[idx] = pos
  }
  return result
}

class QrBuilder {
  readonly version: number
  readonly size: number
  readonly modules: boolean[][]
  private readonly isFunction: boolean[][]

  constructor(version: number) {
    this.version = version
    this.size = version * 4 + 17
    this.modules = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
    this.isFunction = Array.from({ length: this.size }, () => new Array<boolean>(this.size).fill(false))
  }

  private set(x: number, y: number, dark: boolean): void {
    this.modules[y][x] = dark
    this.isFunction[y][x] = true
  }

  private drawFinderPattern(cx: number, cy: number): void {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const dist = Math.max(Math.abs(dx), Math.abs(dy))
        const x = cx + dx
        const y = cy + dy
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) {
          this.set(x, y, dist !== 2 && dist !== 4)
        }
      }
    }
  }

  private drawAlignmentPattern(cx: number, cy: number): void {
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1)
      }
    }
  }

  private drawVersionInformation(): void {
    if (this.version < 7) return
    let rem = this.version
    for (let i = 0; i < 12; i++) {
      rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25)
    }
    const bits = (this.version << 12) | rem
    for (let i = 0; i < 18; i++) {
      const bit = getBit(bits, i)
      const a = this.size - 11 + (i % 3)
      const b = Math.floor(i / 3)
      this.set(a, b, bit)
      this.set(b, a, bit)
    }
  }

  /** `mask` is 0-7. This build always emits an EC-level-L (`01`) format,
   * so the level bits are hardcoded rather than threaded as a parameter
   * -- there is nothing else this encoder can produce. */
  drawFormatBits(mask: number): void {
    const data = (0b01 << 3) | mask
    let rem = data
    for (let i = 0; i < 10; i++) {
      rem = (rem << 1) ^ ((rem >>> 9) * 0x537)
    }
    const bits = ((data << 10) | rem) ^ 0x5412
    for (let i = 0; i <= 5; i++) this.set(8, i, getBit(bits, i))
    this.set(8, 7, getBit(bits, 6))
    this.set(8, 8, getBit(bits, 7))
    this.set(7, 8, getBit(bits, 8))
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, getBit(bits, i))
    for (let i = 0; i <= 7; i++) this.set(this.size - 1 - i, 8, getBit(bits, i))
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, getBit(bits, i))
    this.set(8, this.size - 8, true) // the fixed dark module
  }

  drawFunctionPatterns(): void {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0)
      this.set(i, 6, i % 2 === 0)
    }
    this.drawFinderPattern(3, 3)
    this.drawFinderPattern(this.size - 4, 3)
    this.drawFinderPattern(3, this.size - 4)

    const positions = alignmentPatternPositions(this.version, this.size)
    const n = positions.length
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === n - 1) || (i === n - 1 && j === 0)) continue
        this.drawAlignmentPattern(positions[i], positions[j])
      }
    }

    this.drawFormatBits(0) // reserves the format-info cells; overwritten with the real mask later
    this.drawVersionInformation()
  }

  drawCodewords(data: number[]): void {
    let i = 0
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5
      for (let vert = 0; vert < this.size; vert++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j
          const upward = ((right + 1) & 2) === 0
          const y = upward ? this.size - 1 - vert : vert
          if (!this.isFunction[y][x] && i < data.length * 8) {
            this.modules[y][x] = getBit(data[i >>> 3], 7 - (i & 7))
            i++
          }
        }
      }
    }
  }

  /** XOR-toggles every non-function module matching `mask`'s condition.
   * Self-inverse: applying the same mask twice restores the prior state,
   * which is how the caller can trial all eight masks without rebuilding
   * the matrix each time. */
  applyMask(mask: number): void {
    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        if (this.isFunction[y][x]) continue
        if (maskCondition(mask, x, y)) {
          this.modules[y][x] = !this.modules[y][x]
        }
      }
    }
  }

  penalty(): number {
    return computePenalty(this.modules, this.size)
  }
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
      throw new Error(`invalid mask pattern ${mask}`)
  }
}

// The two 1:1:3:1:1-ratio (plus four light modules on one side) sequences
// the N3 penalty rule looks for, matching the finder pattern's own
// cross-section -- a QR that accidentally repeats this shape elsewhere
// tends to confuse real-world scanners about where a finder pattern is.
const FINDER_LIKE_A = [true, false, true, true, true, false, true, false, false, false, false]
const FINDER_LIKE_B = [false, false, false, false, true, false, true, true, true, false, true]

/** The four ISO/IEC 18004 mask-penalty rules (N1-N4). Only affects WHICH
 * of the 8 (equally valid, equally decodable) masks gets chosen -- an
 * imperfect penalty score can at worst pick a slightly less optimal
 * mask, never an invalid QR code, since the format info always states
 * exactly which mask was actually used. */
function computePenalty(modules: boolean[][], size: number): number {
  let penalty = 0

  const scoreRun = (get: (i: number) => boolean) => {
    let runColor = get(0)
    let runLen = 1
    for (let i = 1; i < size; i++) {
      const v = get(i)
      if (v === runColor) {
        runLen++
      } else {
        if (runLen >= 5) penalty += 3 + (runLen - 5)
        runColor = v
        runLen = 1
      }
    }
    if (runLen >= 5) penalty += 3 + (runLen - 5)
  }
  for (let y = 0; y < size; y++) scoreRun((x) => modules[y][x])
  for (let x = 0; x < size; x++) scoreRun((y) => modules[y][x])

  for (let y = 0; y < size - 1; y++) {
    for (let x = 0; x < size - 1; x++) {
      const c = modules[y][x]
      if (modules[y][x + 1] === c && modules[y + 1][x] === c && modules[y + 1][x + 1] === c) {
        penalty += 3
      }
    }
  }

  const matchesFinderLike = (get: (k: number) => boolean): boolean => {
    let matchA = true
    let matchB = true
    for (let k = 0; k < 11; k++) {
      const v = get(k)
      if (v !== FINDER_LIKE_A[k]) matchA = false
      if (v !== FINDER_LIKE_B[k]) matchB = false
    }
    return matchA || matchB
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x + 11 <= size; x++) {
      if (matchesFinderLike((k) => modules[y][x + k])) penalty += 40
    }
  }
  for (let x = 0; x < size; x++) {
    for (let y = 0; y + 11 <= size; y++) {
      if (matchesFinderLike((k) => modules[y + k][x])) penalty += 40
    }
  }

  let dark = 0
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules[y][x]) dark++
    }
  }
  const percentDark = (dark * 100) / (size * size)
  penalty += Math.floor(Math.abs(percentDark - 50) / 5) * 10

  return penalty
}

/**
 * Encodes `text` as a QR Code (Model 2, byte mode, error-correction
 * level L) and returns its module matrix. `text` is UTF-8 encoded first,
 * so any `otpauth://` URI -- which is plain ASCII plus percent-escapes --
 * round-trips exactly.
 */
export function encodeQr(text: string): QrMatrix {
  const bytes = new TextEncoder().encode(text)
  const version = chooseVersion(bytes.length)
  const dataBytes = buildDataCodewords(bytes, version)
  const allCodewords = splitAndInterleave(dataBytes, version)

  if (allCodewords.length !== TOTAL_CODEWORDS[version - 1]) {
    // Defensive: this can only happen if a future edit desynchronizes the
    // three level-L tables above from each other. Fail loudly rather than
    // silently drawing a matrix from the wrong number of codewords.
    throw new Error(
      `internal error: version ${version} produced ${allCodewords.length} codewords, expected ${TOTAL_CODEWORDS[version - 1]}`,
    )
  }

  const builder = new QrBuilder(version)
  builder.drawFunctionPatterns()
  builder.drawCodewords(allCodewords)

  let bestMask = 0
  let bestPenalty = Infinity
  for (let mask = 0; mask < 8; mask++) {
    builder.applyMask(mask)
    const penalty = builder.penalty()
    if (penalty < bestPenalty) {
      bestPenalty = penalty
      bestMask = mask
    }
    builder.applyMask(mask) // self-inverse undo
  }
  builder.applyMask(bestMask)
  builder.drawFormatBits(bestMask)

  return { size: builder.size, modules: builder.modules }
}

// --- Test-only exports ---------------------------------------------------------
//
// `qrEncoder.test.ts` decodes the matrices this file produces (reconstructing
// the zigzag scan order and block layout independently, then checking the
// Reed-Solomon relationship between each block's data and its EC codewords)
// as a real end-to-end proof that a written matrix is genuinely decodable --
// not just structurally shaped like one. These are exported so that check
// can reuse the same trusted GF(256) arithmetic and codeword tables rather
// than re-deriving them a second time (which would risk a second,
// uncorrelated transcription error instead of catching the first one).
export const __test = { TOTAL_CODEWORDS, ECC_PER_BLOCK_L, NUM_BLOCKS_L, rsRemainder, rsDivisor, dataCodewordsTotal }
