// Pure colour-space maths for the infinite colour translator. Complements
// `@/theme/oklch` (hex <-> OKLCh, already shipped by the theme lane) rather
// than duplicating it — this file adds the conversions that lane never
// needed: hex <-> rgb, rgb <-> hsl, and a WCAG contrast readout. No DOM, no
// side effects, safe to import from a "node" test environment.

export interface Rgb {
  r: number
  g: number
  b: number
}

export interface Hsl {
  h: number
  s: number
  l: number
}

export interface Hsv {
  h: number
  s: number
  v: number
}

const HEX6_RE = /^#?[0-9a-fA-F]{6}$/
const HEX3_RE = /^#?[0-9a-fA-F]{3}$/

/** Accepts "#rgb", "#rrggbb", or either without the leading "#"; returns a
 * normalized "#rrggbb" lowercase string, or null for anything else. Never
 * throws — every caller in this lane treats an invalid in-progress hex
 * field as "not applied yet", not as an error. */
export function normalizeHex(input: string): string | null {
  const trimmed = input.trim()
  if (HEX6_RE.test(trimmed)) {
    return "#" + trimmed.replace("#", "").toLowerCase()
  }
  if (HEX3_RE.test(trimmed)) {
    const body = trimmed.replace("#", "")
    return (
      "#" +
      body
        .split("")
        .map((c) => c + c)
        .join("")
        .toLowerCase()
    )
  }
  return null
}

export function hexToRgb(hex: string): Rgb | null {
  const normalized = normalizeHex(hex)
  if (!normalized) return null
  const body = normalized.slice(1)
  return {
    r: parseInt(body.slice(0, 2), 16),
    g: parseInt(body.slice(2, 4), 16),
    b: parseInt(body.slice(4, 6), 16),
  }
}

function clampByte(value: number): number {
  return Math.min(255, Math.max(0, Math.round(value)))
}

export function rgbToHex({ r, g, b }: Rgb): string {
  const toHex = (channel: number) => clampByte(channel).toString(16).padStart(2, "0")
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`
}

export function rgbToHsl({ r, g, b }: Rgb): Hsl {
  const rn = clampByte(r) / 255
  const gn = clampByte(g) / 255
  const bn = clampByte(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const l = (max + min) / 2
  const delta = max - min

  if (delta === 0) {
    return { h: 0, s: 0, l: Math.round(l * 1000) / 10 }
  }

  const s = delta / (1 - Math.abs(2 * l - 1))

  let h: number
  switch (max) {
    case rn:
      h = ((gn - bn) / delta) % 6
      break
    case gn:
      h = (bn - rn) / delta + 2
      break
    default:
      h = (rn - gn) / delta + 4
  }
  h *= 60
  if (h < 0) h += 360

  return {
    h: Math.round(h * 10) / 10,
    s: Math.round(s * 1000) / 10,
    l: Math.round(l * 1000) / 10,
  }
}

export function hslToRgb({ h, s, l }: Hsl): Rgb {
  const hn = ((h % 360) + 360) % 360
  const sn = Math.min(100, Math.max(0, s)) / 100
  const ln = Math.min(100, Math.max(0, l)) / 100

  if (sn === 0) {
    const gray = clampByte(ln * 255)
    return { r: gray, g: gray, b: gray }
  }

  const c = (1 - Math.abs(2 * ln - 1)) * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = ln - c / 2

  let rp = 0
  let gp = 0
  let bp = 0
  if (hn < 60) [rp, gp, bp] = [c, x, 0]
  else if (hn < 120) [rp, gp, bp] = [x, c, 0]
  else if (hn < 180) [rp, gp, bp] = [0, c, x]
  else if (hn < 240) [rp, gp, bp] = [0, x, c]
  else if (hn < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]

  return {
    r: clampByte((rp + m) * 255),
    g: clampByte((gp + m) * 255),
    b: clampByte((bp + m) * 255),
  }
}

/**
 * rgb <-> hsv — used only by the 2D saturation/value field + hue slider
 * widget (the standard picker shape: two flat CSS gradients can render an
 * HSV plane exactly, but not an HSL one). Every other display in the
 * translator (hex/rgb/hsl/oklch) is derived from the resulting `Rgb`, so
 * the picker's internal model never leaks into what's shown.
 */
export function rgbToHsv({ r, g, b }: Rgb): Hsv {
  const rn = clampByte(r) / 255
  const gn = clampByte(g) / 255
  const bn = clampByte(b) / 255
  const max = Math.max(rn, gn, bn)
  const min = Math.min(rn, gn, bn)
  const delta = max - min

  let h = 0
  if (delta !== 0) {
    switch (max) {
      case rn:
        h = ((gn - bn) / delta) % 6
        break
      case gn:
        h = (bn - rn) / delta + 2
        break
      default:
        h = (rn - gn) / delta + 4
    }
    h *= 60
    if (h < 0) h += 360
  }

  const s = max === 0 ? 0 : delta / max
  const v = max

  return { h: Math.round(h * 10) / 10, s: Math.round(s * 1000) / 10, v: Math.round(v * 1000) / 10 }
}

export function hsvToRgb({ h, s, v }: Hsv): Rgb {
  const hn = ((h % 360) + 360) % 360
  const sn = Math.min(100, Math.max(0, s)) / 100
  const vn = Math.min(100, Math.max(0, v)) / 100

  const c = vn * sn
  const x = c * (1 - Math.abs(((hn / 60) % 2) - 1))
  const m = vn - c

  let rp = 0
  let gp = 0
  let bp = 0
  if (hn < 60) [rp, gp, bp] = [c, x, 0]
  else if (hn < 120) [rp, gp, bp] = [x, c, 0]
  else if (hn < 180) [rp, gp, bp] = [0, c, x]
  else if (hn < 240) [rp, gp, bp] = [0, x, c]
  else if (hn < 300) [rp, gp, bp] = [x, 0, c]
  else [rp, gp, bp] = [c, 0, x]

  return {
    r: clampByte((rp + m) * 255),
    g: clampByte((gp + m) * 255),
    b: clampByte((bp + m) * 255),
  }
}

/** WCAG 2.x relative luminance (0-1). */
function relativeLuminance({ r, g, b }: Rgb): number {
  const linearize = (channel: number) => {
    const c = channel / 255
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)
  }
  const rl = linearize(r)
  const gl = linearize(g)
  const bl = linearize(b)
  return 0.2126 * rl + 0.7152 * gl + 0.0722 * bl
}

/** WCAG 2.x contrast ratio (1-21) between two colours. Order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a)
  const lb = relativeLuminance(b)
  const lighter = Math.max(la, lb)
  const darker = Math.min(la, lb)
  return Math.round(((lighter + 0.05) / (darker + 0.05)) * 100) / 100
}

export const WHITE: Rgb = { r: 255, g: 255, b: 255 }
export const BLACK: Rgb = { r: 0, g: 0, b: 0 }
