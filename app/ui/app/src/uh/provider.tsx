import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react"
import type { VocabRule } from "./vocab"

export type LangMode = "en" | "yue" | "both"
export type FunnyLevel = 0 | 1 | 2 | 3 | 4

/**
 * Everything downstream text formatting needs, resolved once from stored
 * preferences. Frozen so nobody can mutate a shared instance out from under
 * a component that already rendered with it.
 *
 * School mode is folded in at construction (see `buildVoice()` below): when
 * it is on, `langMode`/`funnyEn`/`funnyYue`/`emoji`/`vocab` are already
 * reset to their off values. Consumers never see the "school is on, but I
 * forgot to check" state, because there is no field to forget to check —
 * `schoolOn` is exposed only so `useShows()` (see `./school`) can decide
 * whether a control should render at all.
 */
export interface Voice {
  readonly langMode: LangMode
  readonly funnyEn: FunnyLevel
  readonly funnyYue: FunnyLevel
  readonly emoji: boolean
  readonly schoolOn: boolean
  readonly vocab: readonly VocabRule[]
}

/**
 * Placeholder storage key for preferences. A sibling lane is adding the real
 * (Go-backed) settings store; until then this reads/writes nothing on its
 * own — it only *reads* whatever lands under this key in `localStorage`, in
 * the shape below, and re-reads on the `storage` event (other tabs/windows)
 * and on `PREFERENCES_CHANGED_EVENT` (same tab — `storage` never fires for
 * the writer's own tab). Whatever eventually writes real preferences here
 * should keep this key and dispatch that event after writing so this
 * provider picks the change up live, with no reload.
 */
export const PREFERENCES_STORAGE_KEY = "material-ollama:preferences"
export const PREFERENCES_CHANGED_EVENT = "material-ollama:preferences-changed"

interface StoredPreferencesShape {
  readonly langMode?: unknown
  readonly funnyEn?: unknown
  readonly funnyYue?: unknown
  readonly emoji?: unknown
  readonly school?: { readonly on?: unknown } | unknown
  readonly vocab?: unknown
}

const EMPTY_VOCAB: readonly VocabRule[] = Object.freeze([])

const SCHOOL_VOICE: Voice = Object.freeze({
  langMode: "en",
  funnyEn: 0,
  funnyYue: 0,
  emoji: false,
  schoolOn: true,
  vocab: EMPTY_VOCAB,
})

const DEFAULT_VOICE: Voice = Object.freeze({
  langMode: "en",
  funnyEn: 0,
  funnyYue: 0,
  emoji: false,
  schoolOn: false,
  vocab: EMPTY_VOCAB,
})

function clampFunnyLevel(value: unknown): FunnyLevel {
  const n = typeof value === "number" && Number.isFinite(value) ? Math.trunc(value) : 0
  if (n <= 0) return 0
  if (n >= 4) return 4
  return n as FunnyLevel
}

function sanitizeLangMode(value: unknown): LangMode {
  return value === "yue" || value === "both" ? value : "en"
}

function isVocabRuleLike(value: unknown): value is { find: string; replace: string } {
  if (!value || typeof value !== "object") return false
  const candidate = value as Record<string, unknown>
  return typeof candidate.find === "string" && typeof candidate.replace === "string"
}

function sanitizeVocab(value: unknown): readonly VocabRule[] {
  if (!Array.isArray(value)) return EMPTY_VOCAB
  const rules = value
    .filter(isVocabRuleLike)
    .map((entry): VocabRule => ({ find: entry.find, replace: entry.replace }))
  return rules.length > 0 ? Object.freeze(rules) : EMPTY_VOCAB
}

function isSchoolOn(value: StoredPreferencesShape["school"]): boolean {
  if (!value || typeof value !== "object") return false
  return Boolean((value as { on?: unknown }).on)
}

function readStoredPreferences(): StoredPreferencesShape {
  if (typeof window === "undefined") return {}
  try {
    const raw = window.localStorage.getItem(PREFERENCES_STORAGE_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as StoredPreferencesShape) : {}
  } catch {
    return {}
  }
}

/**
 * Build a fresh, frozen `Voice` from whatever is currently in storage. This
 * is the ONE place school mode gets applied — every caller downstream (t,
 * funny, vocab, narration) sees only the already-adjusted result.
 */
function buildVoice(): Voice {
  const raw = readStoredPreferences()
  if (isSchoolOn(raw.school)) return SCHOOL_VOICE
  return Object.freeze({
    langMode: sanitizeLangMode(raw.langMode),
    funnyEn: clampFunnyLevel(raw.funnyEn),
    funnyYue: clampFunnyLevel(raw.funnyYue),
    emoji: Boolean(raw.emoji),
    schoolOn: false,
    vocab: sanitizeVocab(raw.vocab),
  })
}

const UhContext = createContext<Voice>(DEFAULT_VOICE)

export function UhProvider({ children }: { children: ReactNode }) {
  const [voice, setVoice] = useState<Voice>(buildVoice)

  useEffect(() => {
    const refresh = () => setVoice(buildVoice())
    window.addEventListener("storage", refresh)
    window.addEventListener(PREFERENCES_CHANGED_EVENT, refresh)
    // Preferences can legitimately change between this component's initial
    // render (module load) and this effect's first run (mount) — catch up
    // once so a slow-loading store doesn't leave a stale Voice in place.
    refresh()
    return () => {
      window.removeEventListener("storage", refresh)
      window.removeEventListener(PREFERENCES_CHANGED_EVENT, refresh)
    }
  }, [])

  return <UhContext.Provider value={voice}>{children}</UhContext.Provider>
}

/** The current, already school-mode-adjusted `Voice`. */
export function useUh(): Voice {
  return useContext(UhContext)
}
