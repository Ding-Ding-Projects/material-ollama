import { useState } from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Button, Chip, ConfirmDialog, Surface, Switch, useSnackbar } from "@/components/md3"
import { getInferenceCompute, getSettings, updateSettings } from "@/api"
import { Settings as SettingsGoType } from "@/gotypes"
import { fact, useT, type TFunction } from "@/uh"
import { SettingRow } from "./SettingRow"
import { isDefaultValue } from "./provenance"
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types"
import "./settingsUi.dict"

const CONTEXT_PRESETS = [4096, 8192, 16384, 32768, 65536, 131072, 262144]
const DEFAULT_CONTEXT_LENGTH = 0
const DEFAULT_EXPOSE = false
const DEFAULT_AUTO_UPDATE = true
const DEFAULT_MODELS_DIR = ""

function formatContextLength(bytes: number): string {
  return bytes >= 1024 ? `${bytes / 1024}k` : String(bytes)
}

export interface GeneralCardProps {
  /** The `emoji` toggle lives in the newer /api/v1/uh/preferences blob —
   * this card takes it (and the setter) as props from the screen's one
   * shared `usePreferencesSync()` rather than opening a second copy of
   * that query, so every card reads/writes the same cached document. */
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

/**
 * General settings: model storage location, network exposure, auto-update,
 * and context length — the four fields the pre-rewrite `Settings.tsx`
 * persisted through GET/POST /api/v1/settings (see `useSettings.ts`). This
 * card keeps using that same real, already-shipped endpoint for those four
 * rather than routing them through the newer /api/v1/uh/preferences blob,
 * which app/ui/uh.go's own header comment explains was carved out
 * specifically to avoid the whole-object-PATCH footgun these fields don't
 * need fixed — they were never affected by it. The dialog-emoji toggle, by
 * contrast, genuinely lives in that newer blob (UIPreferences.Emoji), so
 * it's the one row here backed by the shared preferences prop instead.
 */
export function GeneralCard({ preferences, patchPreferences, preferencesLoading }: GeneralCardProps) {
  const t = useT("settingsUi")
  const snackbar = useSnackbar()
  const queryClient = useQueryClient()
  const [confirmReset, setConfirmReset] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  })
  const settings = data?.settings ?? null

  const { data: inferenceCompute } = useQuery({
    queryKey: ["inferenceCompute"],
    queryFn: getInferenceCompute,
  })
  const defaultContextLength = inferenceCompute?.defaultContextLength

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (result) => {
      queryClient.setQueryData(["settings"], result)
      snackbar.show(t("savedJustNow"))
    },
  })

  const change = (field: keyof SettingsGoType, value: boolean | string | number) => {
    if (!settings) return
    mutation.mutate(new SettingsGoType({ ...settings, [field]: value }))
  }

  const handleBrowse = async () => {
    if (!window.webview?.selectModelsDirectory) return
    try {
      const directory = await window.webview.selectModelsDirectory()
      if (directory) change("Models", directory)
    } catch {
      // The picker itself reports the reason through its own OS dialog;
      // nothing further to surface here beyond leaving the field unchanged.
    }
  }

  const handleReset = () => {
    mutation.mutate(
      new SettingsGoType({
        ...(settings ?? {}),
        Expose: DEFAULT_EXPOSE,
        Models: DEFAULT_MODELS_DIR,
        ContextLength: DEFAULT_CONTEXT_LENGTH,
        AutoUpdateEnabled: DEFAULT_AUTO_UPDATE,
      }),
    )
  }

  const disabledReason = !settings
    ? isError
      ? t("loadFailed")
      : isLoading
        ? t("savingNow")
        : undefined
    : undefined

  const contextValue = settings?.ContextLength || defaultContextLength || 0

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("generalTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("generalSub")}</p>
      </header>

      <SettingRow
        icon="mood"
        title={t("emojiLabel")}
        explanation={t("emojiExplain")}
        provenance={provenanceBoolFact(t, preferences.emoji, DEFAULT_UI_PREFERENCES.emoji)}
        disabledReason={preferencesLoading ? t("savingNow") : undefined}
      >
        <Switch
          checked={preferences.emoji}
          onChange={(checked) => patchPreferences({ emoji: checked })}
          label={t("emojiToggleLabel")}
        />
      </SettingRow>

      <SettingRow
        icon="folder"
        title={t("modelLocationLabel")}
        explanation={t("modelLocationExplain")}
        provenance={
          settings
            ? fact(
                `${isDefaultValue(settings.Models, DEFAULT_MODELS_DIR) ? t("provenanceDefault") : t("provenanceStored")} ${settings.Models || t("provenanceDefault")}`,
                "path",
              )
            : fact(t("provenanceDefault"), "path")
        }
        disabledReason={disabledReason}
      >
        <div className="flex items-center gap-2">
          <div className="min-w-0 flex-1 truncate rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2 font-mono text-[12.5px] text-on-surface-variant">
            {fact(settings?.Models || "—", "path")}
          </div>
          <Button
            variant="outlined"
            size="sm"
            icon="folder"
            onClick={handleBrowse}
            disabled={!window.webview?.selectModelsDirectory}
          >
            {t("browseBtn")}
          </Button>
        </div>
      </SettingRow>

      <SettingRow
        icon="wifi"
        title={t("exposeLabel")}
        explanation={t("exposeExplain")}
        provenance={
          settings
            ? provenanceBoolFact(t, settings.Expose, DEFAULT_EXPOSE)
            : provenanceBoolFact(t, DEFAULT_EXPOSE, DEFAULT_EXPOSE)
        }
        disabledReason={disabledReason}
      >
        <Switch
          checked={!!settings?.Expose}
          onChange={(checked) => change("Expose", checked)}
          label={t("exposeToggleLabel")}
        />
      </SettingRow>

      <SettingRow
        icon="download_2"
        title={t("autoUpdateLabel")}
        explanation={t("autoUpdateExplain")}
        provenance={
          settings
            ? provenanceBoolFact(t, settings.AutoUpdateEnabled, DEFAULT_AUTO_UPDATE)
            : provenanceBoolFact(t, DEFAULT_AUTO_UPDATE, DEFAULT_AUTO_UPDATE)
        }
        disabledReason={disabledReason}
      >
        <Switch
          checked={settings ? !!settings.AutoUpdateEnabled : DEFAULT_AUTO_UPDATE}
          onChange={(checked) => change("AutoUpdateEnabled", checked)}
          label={t("autoUpdateToggleLabel")}
        />
      </SettingRow>

      <SettingRow
        icon="memory"
        title={t("contextLengthLabel")}
        explanation={t("contextLengthExplain")}
        provenance={
          settings
            ? provenanceNumberFact(t, settings.ContextLength || 0, DEFAULT_CONTEXT_LENGTH, formatContextLength)
            : provenanceNumberFact(t, DEFAULT_CONTEXT_LENGTH, DEFAULT_CONTEXT_LENGTH, formatContextLength)
        }
        disabledReason={disabledReason || (!defaultContextLength ? t("savingNow") : undefined)}
      >
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-1.5">
            {CONTEXT_PRESETS.map((preset) => (
              <Chip
                key={preset}
                selected={contextValue === preset}
                mono
                onClick={() => change("ContextLength", preset)}
                disabled={!defaultContextLength}
              >
                {fact(formatContextLength(preset), "count")}
              </Chip>
            ))}
          </div>
          <p className="text-[11px] text-on-surface-variant">{t("restartNotice")}</p>
        </div>
      </SettingRow>

      <div className="flex justify-end border-t border-outline-variant pt-4">
        <Button variant="outlined" size="sm" icon="restart_alt" onClick={() => setConfirmReset(true)} disabled={!settings}>
          {t("resetGeneralBtn")}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("resetGeneralBtn")}
        body={t("resetGeneralExplain")}
        keyword="RESET"
        actionLabel={t("resetGeneralBtn")}
        onConfirm={handleReset}
      />
    </Surface>
  )
}

function provenanceBoolFact(t: TFunction<"settingsUi">, current: boolean, def: boolean) {
  const prefix = isDefaultValue(current, def) ? t("provenanceDefault") : t("provenanceStored")
  return fact(`${prefix} ${current ? "on" : "off"}`, "user-input")
}

function provenanceNumberFact(
  t: TFunction<"settingsUi">,
  current: number,
  def: number,
  format: (n: number) => string,
) {
  const prefix = isDefaultValue(current, def) ? t("provenanceDefault") : t("provenanceStored")
  return fact(`${prefix} ${format(current)}`, "count")
}
