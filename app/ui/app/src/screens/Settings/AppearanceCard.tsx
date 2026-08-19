import { useEffect, useRef, useState } from "react"
import { Button, ConfirmDialog, SegmentedControl, Slider, Surface, TextField } from "@/components/md3"
import { AppMark } from "@/components/md3/AppMark"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { useTheme } from "@/theme/ThemeProvider"
import { DEFAULT_APPEARANCE } from "@/theme/scheme"
import { fact, useT } from "@/uh"
import { SettingRow } from "./SettingRow"
import { isDefaultValue } from "./provenance"
import { normalizeHex } from "./colorMath"
import { ColorTranslator } from "./ColorTranslator"
import { DebouncedTextField } from "./DebouncedTextField"
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types"
import "./settingsUi.dict"

const SEED_PRESETS = [
  "#4c57d6",
  "#6a4fc0",
  "#8a5a00",
  "#006a6a",
  "#984061",
  "#33691e",
  "#b3261e",
  "#1a73e8",
]

interface GlyphOption {
  id: string
  icon: SymbolName | null
}

const GLYPH_OPTIONS: GlyphOption[] = [
  { id: "", icon: null },
  { id: "raven", icon: "raven" },
  { id: "robot_2", icon: "robot_2" },
  { id: "smart_toy", icon: "smart_toy" },
  { id: "bolt", icon: "bolt" },
  { id: "rocket_launch", icon: "rocket_launch" },
  { id: "neurology", icon: "neurology" },
  { id: "deployed_code", icon: "deployed_code" },
  { id: "memory", icon: "memory" },
]

export interface AppearanceCardProps {
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

/**
 * Seed colour, theme mode, corner radius, app display name, logo glyph,
 * and the full infinite colour translator. Every colour/shape control
 * dual-writes: it calls the real `useTheme()` setters (so it applies to
 * this window's own chrome immediately, per `ThemeProvider.tsx`) AND
 * PATCHes `/api/v1/uh/preferences` (so it survives a restart and, in
 * principle, drives every other window this app opens). On first load,
 * if a previously-saved backend value differs from what booted locally,
 * this card pushes the backend value into `useTheme()` once — closing the
 * loop the other direction too.
 */
export function AppearanceCard({ preferences, patchPreferences, preferencesLoading }: AppearanceCardProps) {
  const t = useT("settingsUi")
  const theme = useTheme()
  const [confirmReset, setConfirmReset] = useState(false)
  const reconciledRef = useRef(false)

  // One-time reconciliation: a previously-saved backend appearance wins
  // over whatever ThemeProvider booted from its own localStorage copy,
  // the first time real preferences arrive.
  useEffect(() => {
    if (reconciledRef.current || preferencesLoading) return
    reconciledRef.current = true
    const saved = preferences.appearance
    if (saved.seed && normalizeHex(saved.seed) && saved.seed !== theme.appearance.seed) {
      theme.setSeed(saved.seed)
    }
    if (saved.theme && saved.theme !== "system" && saved.theme !== theme.appearance.theme) {
      theme.setTheme(saved.theme === "dark" ? "dark" : saved.theme === "auto" ? "auto" : "light")
    }
    if (saved.radius && saved.radius !== theme.appearance.radius) {
      theme.setRadius(saved.radius)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preferencesLoading, preferences.appearance])

  const seed = theme.appearance.seed
  const [hexDraft, setHexDraft] = useState(seed)
  useEffect(() => setHexDraft(seed), [seed])

  // The translator is a mixing workspace, not a live-bound control: it
  // starts at the current seed but lets you explore freely without
  // touching the theme until you deliberately commit with "Use as seed
  // colour" — that's what makes that action a real, distinct step rather
  // than a no-op sitting beside a control that already always applies.
  const [translatorColor, setTranslatorColor] = useState(seed)
  useEffect(() => setTranslatorColor(seed), [seed])

  const applySeed = (hex: string) => {
    theme.setSeed(hex)
    patchPreferences({ appearance: { ...preferences.appearance, seed: hex } })
  }

  const applyThemeMode = (mode: "light" | "dark" | "auto") => {
    theme.setTheme(mode)
    patchPreferences({ appearance: { ...preferences.appearance, theme: mode } })
  }

  const applyRadius = (radius: number) => {
    theme.setRadius(radius)
    patchPreferences({ appearance: { ...preferences.appearance, radius } })
  }

  const applyAppName = (appName: string) => {
    patchPreferences({ appearance: { ...preferences.appearance, appName } })
  }

  const applyGlyph = (glyph: string) => {
    patchPreferences({ appearance: { ...preferences.appearance, glyph } })
  }

  const handleReset = () => {
    theme.resetAppearance()
    patchPreferences({
      appearance: {
        ...preferences.appearance,
        seed: DEFAULT_APPEARANCE.seed,
        theme: "system",
        radius: DEFAULT_APPEARANCE.radius,
        appName: "",
        glyph: "",
      },
    })
  }

  const disabledReason = preferencesLoading ? t("savingNow") : undefined
  const previewName = preferences.appearance.appName || t("appNamePlaceholder")
  const selectedGlyph = GLYPH_OPTIONS.find((option) => option.id === preferences.appearance.glyph) ?? GLYPH_OPTIONS[0]

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("appearanceTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("appearanceSub")}</p>
      </header>

      <SettingRow
        icon="palette"
        title={t("seedLabel")}
        explanation={t("seedExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.appearance.seed, DEFAULT_UI_PREFERENCES.appearance.seed) ? t("provenanceDefault") : t("provenanceStored")} ${seed}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            {SEED_PRESETS.map((preset) => (
              <button
                key={preset}
                type="button"
                aria-label={fact(`${t("seedSwatchLabel")} — ${preset}`, "user-input")}
                aria-pressed={seed.toLowerCase() === preset}
                onClick={() => applySeed(preset)}
                className="relative h-9 w-9 shrink-0 rounded-full border-2 outline-none before:absolute before:-inset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p)]"
                style={{
                  backgroundColor: preset,
                  borderColor: seed.toLowerCase() === preset ? "var(--on-s)" : "transparent",
                }}
              >
                {seed.toLowerCase() === preset ? (
                  <Icon name="check" size={16} className="absolute inset-0 m-auto text-white drop-shadow" />
                ) : null}
              </button>
            ))}
          </div>
          <div className="flex items-end gap-2">
            <TextField
              value={hexDraft}
              onChange={(next) => {
                setHexDraft(next)
                const normalized = normalizeHex(next)
                if (normalized) applySeed(normalized)
              }}
              mono
              label={t("seedHexLabel")}
              error={!normalizeHex(hexDraft) ? t("seedHexInvalid") : undefined}
              className="max-w-[160px]"
            />
          </div>
        </div>
      </SettingRow>

      <SettingRow
        icon="brightness_auto"
        title={t("themeLabel")}
        explanation={t("themeExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.appearance.theme, DEFAULT_UI_PREFERENCES.appearance.theme) ? t("provenanceDefault") : t("provenanceStored")} ${theme.appearance.theme}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <SegmentedControl
          value={theme.appearance.theme === "auto" ? "auto" : theme.resolvedMode}
          onChange={applyThemeMode}
          label={t("themeLabel")}
          options={[
            { value: "light", label: t("themeLight") },
            { value: "dark", label: t("themeDark") },
            { value: "auto", label: t("themeAuto") },
          ]}
        />
      </SettingRow>

      <SettingRow
        icon="deployed_code"
        title={t("radiusLabel")}
        explanation={t("radiusExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.appearance.radius, DEFAULT_UI_PREFERENCES.appearance.radius) ? t("provenanceDefault") : t("provenanceStored")} ${theme.appearance.radius}px`,
          "count",
        )}
        disabledReason={disabledReason}
      >
        <Slider
          min={4}
          max={28}
          step={1}
          value={theme.appearance.radius}
          onChange={applyRadius}
          label={t("radiusLabel")}
          valueLabel={`${theme.appearance.radius}px`}
        />
      </SettingRow>

      <SettingRow
        icon="edit_square"
        title={t("appNameLabel")}
        explanation={t("appNameExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.appearance.appName, DEFAULT_UI_PREFERENCES.appearance.appName) ? t("provenanceDefault") : t("provenanceStored")} ${previewName}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex items-end gap-2">
          <DebouncedTextField
            value={preferences.appearance.appName}
            onCommit={applyAppName}
            label={t("appNameLabel")}
            placeholder={t("appNamePlaceholder")}
            className="max-w-[240px]"
          />
          <Button variant="text" size="sm" onClick={() => applyAppName("")} disabled={!preferences.appearance.appName}>
            {t("appNameReset")}
          </Button>
        </div>
      </SettingRow>

      <SettingRow
        icon="bookmark"
        title={t("glyphLabel")}
        explanation={t("glyphExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.appearance.glyph, DEFAULT_UI_PREFERENCES.appearance.glyph) ? t("provenanceDefault") : t("provenanceStored")} ${selectedGlyph.id || "brand"}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex flex-wrap gap-2">
          {GLYPH_OPTIONS.map((option) => {
            const selected = (preferences.appearance.glyph || "") === option.id
            return (
              <button
                key={option.id || "brand"}
                type="button"
                aria-pressed={selected}
                aria-label={fact(option.id ? `${t("glyphLabel")} — ${option.id}` : t("glyphBrand"), "user-input")}
                onClick={() => applyGlyph(option.id)}
                className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full border outline-none before:absolute before:-inset-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--p)]"
                style={{
                  borderColor: selected ? "var(--p)" : "var(--outline-v)",
                  backgroundColor: selected ? "var(--pc)" : "transparent",
                }}
              >
                {option.icon ? (
                  <Icon name={option.icon} size={20} className="text-on-surface" />
                ) : (
                  <AppMark size={20} />
                )}
              </button>
            )
          })}
        </div>
      </SettingRow>

      <Surface tier="high" radius="lg" className="flex items-center gap-3 p-4">
        <span className="text-[11px] font-medium text-on-surface-variant">{t("previewLabel")}</span>
        {selectedGlyph.icon ? (
          <Icon name={selectedGlyph.icon} size={22} className="text-primary" />
        ) : (
          <AppMark size={22} />
        )}
        <span className="text-sm font-semibold">{fact(previewName, "user-input")}</span>
      </Surface>

      <ColorTranslator
        value={translatorColor}
        onChange={setTranslatorColor}
        onUseAsSeed={() => applySeed(translatorColor)}
      />

      <div className="flex justify-end border-t border-outline-variant pt-4">
        <Button variant="outlined" size="sm" icon="restart_alt" onClick={() => setConfirmReset(true)}>
          {t("resetAppearanceBtn")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("resetAppearanceBtn")}
        body={t("resetAppearanceExplain")}
        keyword="RESET"
        actionLabel={t("resetAppearanceBtn")}
        onConfirm={handleReset}
      />
    </Surface>
  )
}
