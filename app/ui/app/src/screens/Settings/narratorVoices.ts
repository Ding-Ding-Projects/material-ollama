import { useEffect, useState } from "react"

/** The sentinel stored (and displayed) for "let the app pick automatically"
 * — never a real voice URI, so it can never collide with one. */
export const AUTO_VOICE = "" as const

export interface NarratorVoicePrefs {
  en: string
  yue: string
}

const EMPTY_VOICE_PREFS: NarratorVoicePrefs = { en: AUTO_VOICE, yue: AUTO_VOICE }

/**
 * `NarrationPrefs.Voice` (app/store/store.go) is a single opaque string —
 * there is no second backend field for a Cantonese voice, and extending
 * the Go struct is outside this lane's allowed paths. Both language
 * choices are encoded into that one field as JSON so a real per-language
 * picker can still round-trip through the real, already-registered PATCH
 * endpoint instead of inventing a second, un-persisted storage path.
 */
export function encodeVoicePrefs(prefs: NarratorVoicePrefs): string {
  return JSON.stringify(prefs)
}

export function decodeVoicePrefs(raw: string): NarratorVoicePrefs {
  if (!raw) return EMPTY_VOICE_PREFS
  try {
    const parsed: unknown = JSON.parse(raw)
    if (parsed && typeof parsed === "object") {
      const candidate = parsed as Record<string, unknown>
      return {
        en: typeof candidate.en === "string" ? candidate.en : AUTO_VOICE,
        yue: typeof candidate.yue === "string" ? candidate.yue : AUTO_VOICE,
      }
    }
  } catch {
    // Not JSON — either never set, or written by a future/older shape.
    // Treat as "automatic for both" rather than surfacing a parse error.
  }
  return EMPTY_VOICE_PREFS
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/**
 * The full, live voice list from `speechSynthesis.getVoices()`. Chromium
 * returns `[]` synchronously on the first call and fills the real list in
 * asynchronously behind `voiceschanged` — this hook subscribes and
 * re-reads rather than trusting one snapshot, so a picker built on it
 * never reports "no voices installed" on a machine that has forty.
 */
export function useSpeechVoices(): { voices: SpeechSynthesisVoice[]; supported: boolean } {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() =>
    hasSpeechSynthesis() ? window.speechSynthesis.getVoices() : [],
  )

  useEffect(() => {
    if (!hasSpeechSynthesis()) return
    const synth = window.speechSynthesis
    const refresh = () => setVoices(synth.getVoices())
    refresh()
    synth.addEventListener("voiceschanged", refresh)
    return () => synth.removeEventListener("voiceschanged", refresh)
  }, [])

  return { voices, supported: hasSpeechSynthesis() }
}

/** Speaks one short preview phrase directly (bypassing the app-wide
 * `src/uh/narration.ts` queue, which always auto-picks by language and has
 * no per-voice override — see this screen's header comment) so a picker's
 * "preview" action genuinely demonstrates the exact voice selected, not
 * just persists a preference nothing else consults yet. */
export function previewVoice(text: string, voiceURI: string, voices: readonly SpeechSynthesisVoice[]): boolean {
  if (!hasSpeechSynthesis()) return false
  const synth = window.speechSynthesis
  const utterance = new SpeechSynthesisUtterance(text)
  const voice = voiceURI ? voices.find((candidate) => candidate.voiceURI === voiceURI) : undefined
  if (voice) {
    utterance.voice = voice
    utterance.lang = voice.lang
  }
  synth.cancel()
  synth.speak(utterance)
  return true
}

/** Whether a stored voice URI is still installed on this machine — the
 * "say plainly when a chosen voice is not installed" half of the brief. */
export function isVoiceInstalled(voiceURI: string, voices: readonly SpeechSynthesisVoice[]): boolean {
  if (!voiceURI) return true
  return voices.some((voice) => voice.voiceURI === voiceURI)
}
