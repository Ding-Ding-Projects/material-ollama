/**
 * OKLCH colour maths. Pure — no DOM, no side effects, safe to import from a
 * "node" test environment.
 *
 * `hexToOklch` reproduces the prototype's transform exactly: sRGB -> linear
 * sRGB -> LMS (cube-rooted) -> OKLab -> polar (L, C, H). `oklchToSrgbHex` is
 * the inverse, used only for the `format: 'hex'` fallback when the runtime
 * has no oklch() support (see boot.ts).
 */

export interface Oklch {
  L: number;
  c: number;
  h: number;
}

/** sRGB channel (0-1) -> linear sRGB channel (0-1). */
function srgbToLinear(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : Math.pow((channel + 0.055) / 1.055, 2.4);
}

/** linear sRGB channel (0-1) -> sRGB channel (0-1). */
function linearToSrgb(channel: number): number {
  return channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * Math.pow(channel, 1 / 2.4) - 0.055;
}

function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * Hex string (`#rgb` or `#rrggbb`) -> OKLCH. Falls back to the prototype's
 * default seed (`#8a5a00`) on empty input, matching `hexToOklch` in the
 * source design.
 */
export function hexToOklch(hex: string): Oklch {
  const n = (hex || "#8a5a00").replace("#", "");
  const v = n.length === 3
    ? n.split("").map((c) => c + c).join("")
    : n;
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;

  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);

  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B);
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B);
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B);

  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const Bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;

  let H = (Math.atan2(Bb, A) * 180) / Math.PI;
  if (H < 0) H += 360;

  return { L, c: Math.hypot(A, Bb), h: H };
}

/**
 * OKLCH -> sRGB linear channels via the OKLab -> LMS -> linear-sRGB matrices
 * (inverse of the ones in `hexToOklch`), with no gamut clipping.
 */
function oklchToLinearSrgb(L: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const A = Math.cos(hr) * c;
  const Bb = Math.sin(hr) * c;

  const l = L + 0.3963377774 * A + 0.2158037573 * Bb;
  const m = L - 0.1055613458 * A - 0.0638541728 * Bb;
  const s = L - 0.0894841775 * A - 1.291485548 * Bb;

  const l3 = l * l * l;
  const m3 = m * m * m;
  const s3 = s * s * s;

  const R = 4.0767416621 * l3 - 3.3077115913 * m3 + 0.2309699292 * s3;
  const G = -1.2684380046 * l3 + 2.6097574011 * m3 - 0.3413193965 * s3;
  const B = -0.0041960863 * l3 - 0.7034186147 * m3 + 1.707614701 * s3;

  return [R, G, B];
}

function isInGamut(R: number, G: number, B: number): boolean {
  return R >= 0 && R <= 1 && G >= 0 && G <= 1 && B >= 0 && B <= 1;
}

/**
 * OKLCH -> `#rrggbb`, for the no-oklch()-support fallback. Reduces chroma
 * in a simple binary search until the colour lands inside the sRGB gamut,
 * then converts to 8-bit hex.
 */
export function oklchToSrgbHex(L: number, c: number, h: number): string {
  let lo = 0;
  let hi = c;
  let [R, G, B] = oklchToLinearSrgb(L, c, h);

  if (!isInGamut(R, G, B)) {
    // Binary-search the chroma down to the gamut boundary at this L/h.
    for (let i = 0; i < 20; i++) {
      const mid = (lo + hi) / 2;
      const candidate = oklchToLinearSrgb(L, mid, h);
      if (isInGamut(...candidate)) {
        lo = mid;
        [R, G, B] = candidate;
      } else {
        hi = mid;
      }
    }
  }

  const toByte = (channel: number) =>
    Math.round(clamp01(linearToSrgb(clamp01(channel))) * 255);

  const rHex = toByte(R).toString(16).padStart(2, "0");
  const gHex = toByte(G).toString(16).padStart(2, "0");
  const bHex = toByte(B).toString(16).padStart(2, "0");

  return `#${rHex}${gHex}${bHex}`;
}
