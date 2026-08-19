// Public surface of the uh layer. Prefer importing from "@/uh" over reaching
// into individual files — the internal module layout is free to move.

export type { Localized, FactKind } from "./localized"
export { fact } from "./localized"

export type { Voice, LangMode, FunnyLevel } from "./provider"
export {
  UhProvider,
  useUh,
  PREFERENCES_STORAGE_KEY,
  PREFERENCES_CHANGED_EVENT,
} from "./provider"

export type { TFunction } from "./t"
export { useT } from "./t"

export type { FunnyLang, FunnyOptions } from "./funny"
export { funny } from "./funny"

export type { VocabRule } from "./vocab"
export { applyVocab } from "./vocab"

export type { SchoolGatedFeature } from "./school"
export { useShows } from "./school"

export type { NarrationLang, NarrationOutcome } from "./narration"
export { narration } from "./narration"

export type { TxtProps, LabelProps, CopyProps, ContentProps, FactProps } from "./Txt"
export { Txt } from "./Txt"

export type { Dict, DictEntry, DictHandle, DictRegistry } from "./dict"
export { defineDict, getDict } from "./dict"
