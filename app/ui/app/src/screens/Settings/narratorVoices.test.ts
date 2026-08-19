import { describe, expect, it } from "vitest";
import { AUTO_VOICE, decodeVoicePrefs, encodeVoicePrefs } from "./narratorVoices";

// "NarrationPrefs.Voice (app/store/store.go) is a single opaque string...
// Both language choices are encoded into that one field as JSON so a real
// per-language picker can still round-trip through the real, already-
// registered PATCH endpoint instead of inventing a second, un-persisted
// storage path." This proves the encode/decode round-trip really is
// lossless, and that decode fails closed to "automatic for both" rather
// than throwing or silently losing one language's choice.
describe("narratorVoices: encodeVoicePrefs / decodeVoicePrefs", () => {
  it("round-trips two distinct per-language voice URIs exactly", () => {
    const prefs = { en: "Microsoft David - English (United States)", yue: "Cantonese (Hong Kong)" };
    const decoded = decodeVoicePrefs(encodeVoicePrefs(prefs));
    expect(decoded).toEqual(prefs);
  });

  it("decodes an empty stored string as automatic for both languages", () => {
    expect(decodeVoicePrefs("")).toEqual({ en: AUTO_VOICE, yue: AUTO_VOICE });
  });

  it("fails closed to automatic for both on malformed JSON, rather than throwing", () => {
    expect(() => decodeVoicePrefs("{not valid json")).not.toThrow();
    expect(decodeVoicePrefs("{not valid json")).toEqual({ en: AUTO_VOICE, yue: AUTO_VOICE });
  });

  it("defaults a missing or wrongly-typed field to automatic without discarding the other language's real value", () => {
    // Only `en` present -- an older or partial shape.
    expect(decodeVoicePrefs(JSON.stringify({ en: "Some Voice" }))).toEqual({
      en: "Some Voice",
      yue: AUTO_VOICE,
    });
    // `yue` present but the wrong type -- must not propagate a non-string
    // into the decoded prefs.
    expect(decodeVoicePrefs(JSON.stringify({ en: "Some Voice", yue: 42 }))).toEqual({
      en: "Some Voice",
      yue: AUTO_VOICE,
    });
  });

  it("rejects a JSON value that parses but is not an object (e.g. a bare array or number)", () => {
    expect(decodeVoicePrefs(JSON.stringify([1, 2, 3]))).toEqual({ en: AUTO_VOICE, yue: AUTO_VOICE });
    expect(decodeVoicePrefs("42")).toEqual({ en: AUTO_VOICE, yue: AUTO_VOICE });
  });
});
