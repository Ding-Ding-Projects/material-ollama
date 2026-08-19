// TypeScript mirror of app/store/store.go's UIPreferences (and the routes
// registered in app/ui/uh.go). Field names/optionality follow the Go
// `json` tags exactly — this is a transcription, not a redesign, so the
// frontend never drifts from what the server actually sends. Kept local to
// this screen (rather than added to codegen/gotypes.gen.ts, which this
// lane's allowed paths don't cover) the same way src/screens/models/types.ts
// hand-mirrors app/ui/hardware.go and app/ui/models.go.

export interface SchoolPrefs {
  on: boolean
  name: string
  pinSet: boolean
}

export interface NarrationPrefs {
  on: boolean
  lang: string
  /** Opaque from the server's point of view (see app/ui/uh.go — Narration
   * fields aren't validated server-side yet). This lane encodes BOTH the
   * English and Cantonese voice choices into this single backend field as
   * `{"en":"<voiceURI>","yue":"<voiceURI>"}` JSON, because
   * NarrationPrefs.Voice is one string and Go's struct isn't in this
   * lane's allowed paths to extend with a second field — see
   * `encodeVoicePrefs`/`decodeVoicePrefs` in `./narratorVoices`. */
  voice: string
  rate: number
}

export interface AppearancePrefs {
  seed: string
  theme: string
  density: string
  radius: number
  appName: string
  glyph: string
  overrides: Record<string, string>
}

export interface VocabRule {
  find: string
  repl: string
}

export interface ScheduleRule {
  time: string
  kind: string
}

export interface HardwareOverrides {
  ramBytes: number | null
  vramBytes: number | null
  note: string
}

export interface Endpoint {
  id: string
  kind: string
  label: string
  baseUrl: string
  tokenSet: boolean
}

export interface EndpointPrefs {
  activeId: string
  endpoints: Endpoint[]
}

export interface UIPreferences {
  version: number
  langMode: string
  funnyEn: number
  funnyYue: number
  emoji: boolean
  school: SchoolPrefs
  narration: NarrationPrefs
  appearance: AppearancePrefs
  vocab: VocabRule[] | null
  schedules: ScheduleRule[] | null
  hardware: Record<string, HardwareOverrides>
  endpoints: EndpointPrefs
}

/** Mirrors store.DefaultUIPreferences() exactly — used both as a safe
 * initial render value (before the real GET resolves) and as the
 * compiled-in-default half of every provenance readout in this screen. */
export const DEFAULT_UI_PREFERENCES: UIPreferences = Object.freeze({
  version: 1,
  langMode: "en",
  funnyEn: 2,
  funnyYue: 2,
  emoji: false,
  school: Object.freeze({ on: false, name: "", pinSet: false }),
  narration: Object.freeze({ on: false, lang: "en", voice: "", rate: 1 }),
  appearance: Object.freeze({
    seed: "",
    theme: "system",
    density: "comfortable",
    radius: 12,
    appName: "",
    glyph: "",
    overrides: Object.freeze({}),
  }),
  vocab: null,
  schedules: null,
  hardware: Object.freeze({}),
  endpoints: Object.freeze({ activeId: "", endpoints: [] }),
}) as UIPreferences

/** A deep-enough clone for building a PATCH body from the default shape —
 * `DEFAULT_UI_PREFERENCES` itself stays frozen and shared. */
export function cloneDefaultPreferences(): UIPreferences {
  return JSON.parse(JSON.stringify(DEFAULT_UI_PREFERENCES)) as UIPreferences
}
