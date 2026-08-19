import type { Localized } from "./localized"

export type NarrationLang = "en" | "yue"

export type NarrationOutcome =
  | { readonly status: "spoken" }
  | { readonly status: "skipped-disabled" }
  | { readonly status: "unsupported" }
  | { readonly status: "no-voice-for-language"; readonly lang: NarrationLang }

interface QueueItem {
  readonly text: string
  readonly lang: NarrationLang
  readonly rate: number
  readonly resolve: (outcome: NarrationOutcome) => void
}

function hasSpeechSynthesis(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window
}

/**
 * The app-wide spoken-narration queue. A module singleton, not a hook —
 * narration is a side effect that must stay serialized across the whole
 * app regardless of which component last triggered it, so it lives outside
 * React's render tree entirely. Off by default; a caller (settings UI, in a
 * sibling lane) turns it on with `setEnabled(true)`.
 *
 * Every narration goes through one FIFO queue with exactly one utterance in
 * flight. `speechSynthesis.cancel()` runs immediately before every
 * `speechSynthesis.speak()` call — that mirrors the design prototype and
 * works around a long-standing Chromium bug where a stale queued utterance
 * can otherwise wedge the synthesizer and stop firing `onend` forever.
 */
class NarrationQueue {
  private enabled = false
  private queue: QueueItem[] = []
  private draining = false
  private voicesPromise: Promise<SpeechSynthesisVoice[]> | null = null

  setEnabled(on: boolean): void {
    this.enabled = on
    if (!on) this.stop()
  }

  isEnabled(): boolean {
    return this.enabled
  }

  /** Drop everything queued and silence anything currently speaking. */
  stop(): void {
    const pending = this.queue.splice(0)
    for (const item of pending) item.resolve({ status: "skipped-disabled" })
    if (hasSpeechSynthesis()) window.speechSynthesis.cancel()
    this.draining = false
  }

  /** Speak one already-localized string in one language. Queued, not immediate. */
  speak(text: Localized, lang: NarrationLang, rate = 1): Promise<NarrationOutcome> {
    if (!this.enabled) return Promise.resolve({ status: "skipped-disabled" })
    if (!hasSpeechSynthesis()) return Promise.resolve({ status: "unsupported" })
    return new Promise<NarrationOutcome>((resolve) => {
      this.queue.push({ text: text as string, lang, rate, resolve })
      if (!this.draining) void this.drain()
    })
  }

  /**
   * "Both" narration language: English, then Cantonese, strictly
   * serialized — never interleaved, never simultaneous. Callers supply the
   * two already-localized strings (e.g. the `en`/`yue` halves of a dict
   * entry) rather than a single bilingual `t()` string, because splitting
   * "en · yue" back apart on its separator would be fragile the moment
   * real text contains that character.
   */
  async speakBoth(
    en: Localized,
    yue: Localized,
    rate = 1,
  ): Promise<readonly [NarrationOutcome, NarrationOutcome]> {
    const first = this.speak(en, "en", rate)
    const second = this.speak(yue, "yue", rate)
    return Promise.all([first, second])
  }

  private getVoices(): Promise<SpeechSynthesisVoice[]> {
    if (this.voicesPromise) return this.voicesPromise
    const synth = window.speechSynthesis
    const existing = synth.getVoices()
    if (existing.length > 0) {
      this.voicesPromise = Promise.resolve(existing)
      return this.voicesPromise
    }
    // Chromium returns [] synchronously on first call and fills the real
    // list in asynchronously behind `voiceschanged`. A fixed timeout is the
    // fallback for engines that never fire the event when there are
    // genuinely no voices installed at all.
    this.voicesPromise = new Promise<SpeechSynthesisVoice[]>((resolve) => {
      const onVoicesChanged = () => {
        const voices = synth.getVoices()
        if (voices.length > 0) {
          synth.removeEventListener("voiceschanged", onVoicesChanged)
          resolve(voices)
        }
      }
      synth.addEventListener("voiceschanged", onVoicesChanged)
      setTimeout(() => {
        synth.removeEventListener("voiceschanged", onVoicesChanged)
        resolve(synth.getVoices())
      }, 2000)
    })
    return this.voicesPromise
  }

  private pickVoice(
    voices: readonly SpeechSynthesisVoice[],
    lang: NarrationLang,
  ): SpeechSynthesisVoice | null {
    if (lang === "en") {
      return voices.find((v) => /^en(?:[-_]|$)/i.test(v.lang)) ?? null
    }
    // Prefer a real zh-HK (Hong Kong Cantonese) voice; fall back to any
    // zh-* voice before giving up. We never silently fall back to English —
    // see the "no-voice-for-language" outcome below.
    return (
      voices.find((v) => /^zh-hk/i.test(v.lang)) ??
      voices.find((v) => /^zh(?:[-_]|$)/i.test(v.lang)) ??
      null
    )
  }

  private speakOne(
    text: string,
    lang: NarrationLang,
    rate: number,
    voices: readonly SpeechSynthesisVoice[],
  ): Promise<NarrationOutcome> {
    const voice = this.pickVoice(voices, lang)
    if (!voice) return Promise.resolve({ status: "no-voice-for-language", lang })
    return new Promise<NarrationOutcome>((resolve) => {
      const synth = window.speechSynthesis
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.voice = voice
      utterance.lang = voice.lang
      utterance.rate = rate
      utterance.onend = () => resolve({ status: "spoken" })
      utterance.onerror = () => resolve({ status: "spoken" })
      synth.cancel()
      synth.speak(utterance)
    })
  }

  private async drain(): Promise<void> {
    this.draining = true
    while (this.queue.length > 0) {
      const item = this.queue.shift()
      if (!item) break
      const voices = await this.getVoices()
      const outcome = await this.speakOne(item.text, item.lang, item.rate, voices)
      item.resolve(outcome)
    }
    this.draining = false
  }
}

/** The one narration queue for the whole app. */
export const narration = new NarrationQueue()
