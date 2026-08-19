import type { Localized } from "./localized"
import type { FunnyLevel } from "./provider"

export type FunnyLang = "en" | "yue"

export interface FunnyOptions {
  readonly lang: FunnyLang
  readonly level: FunnyLevel
  readonly emoji: boolean
}

// Suffix tables straight from the design prototype — index is the funny
// level (0-4). Levels 0 and 1 are both "no suffix": 0 is fully serious, 1 is
// a deliberately unstyled first notch before the voice starts showing.
const SUFFIX_EN: readonly string[] = ["", "", " Nice.", " Woohoo!", " Absolutely legendary!!"]
const SUFFIX_YUE: readonly string[] = ["", "", "，幾好吖。", "，正呀！", "，勁到飛起！！"]

/**
 * Pure text transform: appends a funny-level suffix (and, at level >= 2 with
 * emoji enabled, an emoji) to already-localized text. Never touches facts —
 * callers only ever pass this the string that came back from `t()`, never a
 * string containing an interpolated `fact()` value (see `Txt.tsx`, which
 * renders facts as separate sibling nodes for exactly this reason).
 */
export function funny(text: Localized, opts: FunnyOptions): Localized {
  const suffixes = opts.lang === "yue" ? SUFFIX_YUE : SUFFIX_EN
  let out = (text as string) + suffixes[opts.level]
  if (opts.emoji && opts.level >= 2) {
    out += opts.level >= 4 ? " 🎉🥟" : " ✨"
  }
  return out as Localized
}
