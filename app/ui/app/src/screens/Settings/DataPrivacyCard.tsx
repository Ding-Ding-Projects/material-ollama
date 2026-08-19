import { useState } from "react"
import { Badge, Button, ConfirmDialog, Surface, useSnackbar } from "@/components/md3"
import { useT } from "@/uh"
import { SettingRow } from "./SettingRow"
import { cloneDefaultPreferences, type UIPreferences } from "./types"

export interface DataPrivacyCardProps {
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

/** Builds a downloadable JSON export and clicks a throwaway anchor —
 * the standard client-side "save this as a file" pattern, no server
 * round trip, no third-party library. */
function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

/**
 * Data & privacy: an honest statement of where preferences actually live
 * (this app's own local database, nothing else — see `./api.ts`, every
 * call in this screen targets `/api/v1/uh/*` on this machine), a real JSON
 * export of the current preferences document, and a full reset gated
 * behind the destructive-action super-confirmation.
 */
export function DataPrivacyCard({ preferences, patchPreferences, preferencesLoading }: DataPrivacyCardProps) {
  const t = useT("settingsUi")
  const snackbar = useSnackbar()
  const [confirmReset, setConfirmReset] = useState(false)

  const handleExport = () => {
    downloadJson("material-ollama-preferences.json", preferences)
    snackbar.show(t("exportedFact"))
  }

  const handleResetAll = () => {
    const defaults = cloneDefaultPreferences()
    patchPreferences(defaults)
  }

  const disabledReason = preferencesLoading ? t("savingNow") : undefined

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("dataPrivacyTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("dataPrivacySub")}</p>
      </header>

      <SettingRow icon="lock" title={t("localOnlyLabel")} explanation={t("localOnlyExplain")}>
        <Badge variant="label" tone="tertiary">
          {t("localOnlyLabel")}
        </Badge>
      </SettingRow>

      <SettingRow
        icon="download"
        title={t("exportLabel")}
        explanation={t("exportExplain")}
        disabledReason={disabledReason}
      >
        <Button variant="outlined" size="sm" icon="download" onClick={handleExport}>
          {t("exportBtn")}
        </Button>
      </SettingRow>

      <SettingRow
        icon="delete_sweep"
        title={t("resetAllLabel")}
        explanation={t("resetAllExplain")}
        disabledReason={disabledReason}
      >
        <Button variant="outlined" size="sm" icon="restart_alt" onClick={() => setConfirmReset(true)}>
          {t("resetAllBtn")}
        </Button>
      </SettingRow>

      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title={t("resetAllBtn")}
        body={t("resetAllExplain")}
        keyword="RESET"
        actionLabel={t("resetAllBtn")}
        onConfirm={handleResetAll}
      />
    </Surface>
  )
}
