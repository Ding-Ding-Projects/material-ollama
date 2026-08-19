import { describe, expect, it } from "vitest";
import {
  BLACK,
  WHITE,
  contrastRatio,
  hexToRgb,
  hslToRgb,
  hsvToRgb,
  normalizeHex,
  rgbToHex,
  rgbToHsl,
  rgbToHsv,
} from "./colorMath";

// The infinite colour translator's real bidirectional maths. "No DOM, no
// side effects, safe to import from a 'node' test environment" per this
// file's own header comment -- this proves the round-trips it exists for
// actually hold, and that malformed input fails closed to null rather
// than throwing (every caller in this lane treats that as "not applied
// yet", per normalizeHex's own doc comment).
describe("colorMath", () => {
  it("normalizeHex accepts 3- and 6-digit hex with or without '#', and rejects garbage", () => {
    expect(normalizeHex("#4C57D6")).toBe("#4c57d6");
    expect(normalizeHex("4c57d6")).toBe("#4c57d6");
    expect(normalizeHex("#abc")).toBe("#aabbcc");
    expect(normalizeHex("abc")).toBe("#aabbcc");
    expect(normalizeHex("not-a-color")).toBeNull();
    expect(normalizeHex("#12345")).toBeNull();
  });

  it("round-trips hex -> rgb -> hex exactly", () => {
    const rgb = hexToRgb("#4c57d6");
    expect(rgb).toEqual({ r: 0x4c, g: 0x57, b: 0xd6 });
    expect(rgbToHex(rgb!)).toBe("#4c57d6");
  });

  it("round-trips rgb -> hsl -> rgb within a one-unit-per-channel tolerance", () => {
    const original = { r: 76, g: 87, b: 214 };
    const hsl = rgbToHsl(original);
    const back = hslToRgb(hsl);
    expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
  });

  it("round-trips rgb -> hsv -> rgb within a one-unit-per-channel tolerance", () => {
    const original = { r: 76, g: 87, b: 214 };
    const hsv = rgbToHsv(original);
    const back = hsvToRgb(hsv);
    expect(Math.abs(back.r - original.r)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.g - original.g)).toBeLessThanOrEqual(1);
    expect(Math.abs(back.b - original.b)).toBeLessThanOrEqual(1);
  });

  it("computes the real WCAG maximum (21:1) contrast between pure black and white", () => {
    expect(contrastRatio(BLACK, WHITE)).toBeCloseTo(21, 1);
    expect(contrastRatio(WHITE, BLACK)).toBeCloseTo(21, 1);
  });

  it("reports a contrast ratio of exactly 1 between a colour and itself", () => {
    expect(contrastRatio({ r: 76, g: 87, b: 214 }, { r: 76, g: 87, b: 214 })).toBeCloseTo(1, 5);
  });
});
