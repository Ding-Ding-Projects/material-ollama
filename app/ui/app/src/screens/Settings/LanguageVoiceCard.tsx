import { useMemo } from "react"
import { Chip, Button, Select, Slider, Surface, Switch } from "@/components/md3"
import { fact, useT, type FunnyLevel, type TFunction } from "@/uh"
import { SettingRow } from "./SettingRow"
import { isDefaultValue } from "./provenance"
import {
  AUTO_VOICE,
  decodeVoicePrefs,
  encodeVoicePrefs,
  isVoiceInstalled,
  previewVoice,
  useSpeechVoices,
} from "./narratorVoices"
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types"
import "./settingsUi.dict"

const FUNNY_LEVELS: FunnyLevel[] = [0, 1, 2, 3, 4]
const FUNNY_LEVEL_KEY = ["funnyLevel0", "funnyLevel1", "funnyLevel2", "funnyLevel3", "funnyLevel4"] as const

export interface LanguageVoiceCardProps {
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

function englishVoices(voices: SpeechSynthesisVoice[]) {
  return voices.filter((voice) => /^en(?:[-_]|$)/i.test(voice.lang))
}

function cantoneseVoices(voices: SpeechSynthesisVoice[]) {
  const hk = voices.filter((voice) => /^zh-hk/i.test(voice.lang))
  if (hk.length > 0) return hk
  return voices.filter((voice) => /^zh(?:[-_]|$)/i.test(voice.lang))
}

function provenanceBoolFact(t: TFunction<"settingsUi">, current: boolean, def: boolean) {
  const prefix = isDefaultValue(current, def) ? t("provenanceDefault") : t("provenanceStored")
  return fact(`${prefix} ${current ? "on" : "off"}`, "user-input")
}

function provenanceStringFact(t: TFunction<"settingsUi">, current: string, def: string) {
  const prefix = isDefaultValue(current, def) ? t("provenanceDefault") : t("provenanceStored")
  return fact(`${prefix} ${current}`, "user-input")
}

/**
 * Language mode, both funny-level sliders, and the narrator — including a
 * real per-language voice picker sourced from `speechSynthesis.getVoices()`
 * (see `./narratorVoices`). Every change here dual-writes: it PATCHes
 * `/api/v1/uh/preferences` (durable across restarts) and, via the shared
 * `usePreferencesSync()` in `SettingsScreen`, mirrors into the localStorage
 * contract `src/uh/provider.tsx` reads — so the funny-level styling on
 * every `<Txt channel="copy">` in the app, the emoji toggle, and the title
 * bar's School badge all update live, with no reload.
 */
export function LanguageVoiceCard({ preferences, patchPreferences, preferencesLoading }: LanguageVoiceCardProps) {
  const t = useT("settingsUi")
  const { voices, supported } = useSpeechVoices()

  const enVoices = useMemo(() => englishVoices(voices), [voices])
  const yueVoices = useMemo(() => cantoneseVoices(voices), [voices])
  const voicePrefs = useMemo(() => decodeVoicePrefs(preferences.narration.voice), [preferences.narration.voice])

  const setVoice = (lang: "en" | "yue", voiceURI: string) => {
    const next = { ...voicePrefs, [lang]: voiceURI }
    patchPreferences({ narration: { ...preferences.narration, voice: encodeVoicePrefs(next) } })
  }

  const enInstalled = isVoiceInstalled(voicePrefs.en, voices)
  const yueInstalled = isVoiceInstalled(voicePrefs.yue, voices)

  const disabledReason = preferencesLoading ? t("savingNow") : undefined

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("langVoiceTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("langVoiceSub")}</p>
      </header>

      <SettingRow
        icon="language"
        title={t("langModeLabel")}
        explanation={t("langModeExplain")}
        provenance={provenanceStringFact(t, preferences.langMode, DEFAULT_UI_PREFERENCES.langMode)}
        disabledReason={disabledReason}
      >
        <Select
          value={preferences.langMode}
          onChange={(value) => patchPreferences({ langMode: value })}
          ariaLabel={t("langModeLabel")}
          options={[
            { value: "en", label: t("langModeEnglish") },
            { value: "yue", label: t("langModeCantonese") },
            { value: "both", label: t("langModeBoth") },
          ]}
        />
      </SettingRow>

      <SettingRow
        icon="mood"
        title={t("funnyEnLabel")}
        explanation={t("funnyEnExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.funnyEn, DEFAULT_UI_PREFERENCES.funnyEn) ? t("provenanceDefault") : t("provenanceStored")} ${t(FUNNY_LEVEL_KEY[preferences.funnyEn])}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex flex-wrap gap-1.5">
          {FUNNY_LEVELS.map((level) => (
            <Chip
              key={level}
              selected={preferences.funnyEn === level}
              onClick={() => patchPreferences({ funnyEn: level })}
            >
              {t(FUNNY_LEVEL_KEY[level])}
            </Chip>
          ))}
        </div>
      </SettingRow>

      <SettingRow
        icon="mood"
        title={t("funnyYueLabel")}
        explanation={t("funnyYueExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.funnyYue, DEFAULT_UI_PREFERENCES.funnyYue) ? t("provenanceDefault") : t("provenanceStored")} ${t(FUNNY_LEVEL_KEY[preferences.funnyYue])}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex flex-wrap gap-1.5">
          {FUNNY_LEVELS.map((level) => (
            <Chip
              key={level}
              selected={preferences.funnyYue === level}
              onClick={() => patchPreferences({ funnyYue: level })}
            >
              {t(FUNNY_LEVEL_KEY[level])}
            </Chip>
          ))}
        </div>
      </SettingRow>

      <div className="h-px bg-outline-variant" />
      <h3 className="-mb-2 text-[13px] font-semibold text-on-surface">{t("narratorTitle")}</h3>

      <SettingRow
        icon="record_voice_over"
        title={t("narratorOnLabel")}
        explanation={t("narratorOnExplain")}
        provenance={provenanceBoolFact(t, preferences.narration.on, DEFAULT_UI_PREFERENCES.narration.on)}
        disabledReason={disabledReason || (!supported ? t("narratorUnsupported") : undefined)}
      >
        <Switch
          checked={preferences.narration.on}
          onChange={(checked) => patchPreferences({ narration: { ...preferences.narration, on: checked } })}
          label={t("narratorOnToggleLabel")}
        />
      </SettingRow>

      <SettingRow
        icon="language"
        title={t("narratorLangLabel")}
        explanation={t("narratorLangExplain")}
        provenance={provenanceStringFact(t, preferences.narration.lang, DEFAULT_UI_PREFERENCES.narration.lang)}
        disabledReason={disabledReason || (!supported ? t("narratorUnsupported") : undefined)}
      >
        <Select
          value={preferences.narration.lang}
          onChange={(value) => patchPreferences({ narration: { ...preferences.narration, lang: value } })}
          ariaLabel={t("narratorLangLabel")}
          options={[
            { value: "en", label: t("langModeEnglish") },
            { value: "yue", label: t("langModeCantonese") },
            { value: "both", label: t("langModeBoth") },
          ]}
        />
      </SettingRow>

      <SettingRow
        icon="record_voice_over"
        title={t("narratorVoiceEnLabel")}
        explanation={t("narratorVoiceEnExplain")}
        provenance={fact(
          voicePrefs.en
            ? `${t("provenanceStored")} ${voicePrefs.en}`
            : `${t("provenanceDefault")} ${t("narratorAutoOption")}`,
          "user-input",
        )}
        disabledReason={disabledReason || (!supported ? t("narratorUnsupported") : undefined)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Select
              value={voicePrefs.en}
              onChange={(value) => setVoice("en", value)}
              ariaLabel={t("narratorVoiceEnLabel")}
              options={[
                { value: AUTO_VOICE, label: t("narratorAutoOption") },
                ...enVoices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} (${voice.lang})` })),
              ]}
              className="min-w-0 flex-1"
            />
            <Button
              variant="outlined"
              size="sm"
              icon="play_arrow"
              disabled={!supported}
              onClick={() => previewVoice(t("narratorPreviewPhraseEn"), voicePrefs.en, voices)}
            >
              {t("narratorPreviewBtn")}
            </Button>
          </div>
          {voicePrefs.en && !enInstalled ? (
            <p className="text-[11px] text-error">{t("narratorNotInstalled")}</p>
          ) : null}
        </div>
      </SettingRow>

      <SettingRow
        icon="record_voice_over"
        title={t("narratorVoiceYueLabel")}
        explanation={t("narratorVoiceYueExplain")}
        provenance={fact(
          voicePrefs.yue
            ? `${t("provenanceStored")} ${voicePrefs.yue}`
            : `${t("provenanceDefault")} ${t("narratorAutoOption")}`,
          "user-input",
        )}
        disabledReason={disabledReason || (!supported ? t("narratorUnsupported") : undefined)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Select
              value={voicePrefs.yue}
              onChange={(value) => setVoice("yue", value)}
              ariaLabel={t("narratorVoiceYueLabel")}
              options={[
                { value: AUTO_VOICE, label: t("narratorAutoOption") },
                ...yueVoices.map((voice) => ({ value: voice.voiceURI, label: `${voice.name} (${voice.lang})` })),
              ]}
              className="min-w-0 flex-1"
            />
            <Button
              variant="outlined"
              size="sm"
              icon="play_arrow"
              disabled={!supported}
              onClick={() => previewVoice(t("narratorPreviewPhraseYue"), voicePrefs.yue, voices)}
            >
              {t("narratorPreviewBtn")}
            </Button>
          </div>
          {voicePrefs.yue && !yueInstalled ? (
            <p className="text-[11px] text-error">{t("narratorNotInstalled")}</p>
          ) : null}
        </div>
      </SettingRow>

      <SettingRow
        icon="bolt"
        title={t("narratorRateLabel")}
        explanation={t("narratorRateExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.narration.rate, DEFAULT_UI_PREFERENCES.narration.rate) ? t("provenanceDefault") : t("provenanceStored")} ${preferences.narration.rate.toFixed(1)}×`,
          "count",
        )}
        disabledReason={disabledReason || (!supported ? t("narratorUnsupported") : undefined)}
      >
        <Slider
          min={0.5}
          max={2}
          step={0.1}
          value={preferences.narration.rate}
          onChange={(value) => patchPreferences({ narration: { ...preferences.narration, rate: value } })}
          label={t("narratorRateLabel")}
          valueLabel={`${preferences.narration.rate.toFixed(1)}×`}
        />
      </SettingRow>
    </Surface>
  )
}
