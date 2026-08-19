// Material Design 3-style appearance tokens, derived purely in the browser from a visitor-chosen
// seed colour and corner radius. Nothing here fetches a palette or a font from the network — every
// derived value is plain arithmetic over an sRGB hex string, applied live as CSS custom properties.

export const DEFAULT_SEED_COLOR = '#79a7ff'
export const DEFAULT_RADIUS = 18

type Rgb = { r: number; g: number; b: number }

function normalizeHex(input: string): string {
  const value = input.trim().replace(/^#/, '')
  if (/^[0-9a-fA-F]{6}$/.test(value)) return `#${value.toLowerCase()}`
  if (/^[0-9a-fA-F]{3}$/.test(value)) {
    const [r, g, b] = value.split('')
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }
  return DEFAULT_SEED_COLOR
}

function hexToRgb(hex: string): Rgb {
  const normalized = normalizeHex(hex)
  const int = parseInt(normalized.slice(1), 16)
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 }
}

function rgbToHex({ r, g, b }: Rgb): string {
  const clamp = (value: number) => Math.max(0, Math.min(255, Math.round(value)))
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, '0')).join('')}`
}

function relativeLuminance({ r, g, b }: Rgb): number {
  const channel = (value: number) => {
    const s = value / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function shade(rgb: Rgb, amount: number): Rgb {
  // amount > 0 lightens toward white, amount < 0 darkens toward black.
  const target = amount > 0 ? 255 : 0
  const t = Math.abs(amount)
  return {
    r: rgb.r + (target - rgb.r) * t,
    g: rgb.g + (target - rgb.g) * t,
    b: rgb.b + (target - rgb.b) * t,
  }
}

export type AccentTokens = {
  accent: string
  accentStrong: string
  accentInk: string
  contrastReadout: string
}

// Derives a hover/active "strong" shade and a readable ink colour from one seed, and reports the
// WCAG contrast ratio of that ink against the seed so the settings surface can show the reader a
// real number rather than an assumption. `isLightSurface` nudges the working tone toward a darker
// value on a white/light background — a pale seed chosen while looking at the dark theme would
// otherwise read as washed-out the moment the visitor switches to (or the system prefers) light.
export function deriveAccentTokens(seedHex: string, isLightSurface = false): AccentTokens {
  const rawSeed = hexToRgb(seedHex)
  const rawLuminance = relativeLuminance(rawSeed)
  const working = isLightSurface && rawLuminance > 0.55 ? shade(rawSeed, -0.32) : rawSeed
  const luminance = relativeLuminance(working)
  const strong = rgbToHex(shade(working, luminance > 0.5 ? -0.16 : 0.18))
  const lightInk = { r: 255, g: 255, b: 255 }
  const darkInk = { r: 13, g: 23, b: 43 }
  const contrast = (a: number, b: number) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05)
  const contrastWithLight = contrast(luminance, relativeLuminance(lightInk))
  const contrastWithDark = contrast(luminance, relativeLuminance(darkInk))
  const useLightInk = contrastWithLight >= contrastWithDark
  const accentInk = useLightInk ? '#ffffff' : '#0d172b'
  const bestContrast = useLightInk ? contrastWithLight : contrastWithDark
  return {
    accent: rgbToHex(working),
    accentStrong: strong,
    accentInk,
    contrastReadout: `${bestContrast.toFixed(2)}:1`,
  }
}

export function hexToRgbString(hex: string): string {
  const { r, g, b } = hexToRgb(hex)
  return `rgb(${r}, ${g}, ${b})`
}

export function clampRadius(value: number): number {
  if (Number.isNaN(value)) return DEFAULT_RADIUS
  return Math.max(2, Math.min(32, Math.round(value)))
}
