import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { Button, Surface, Switch, TextField, useSnackbar } from "@/components/md3"
import { fact, useT } from "@/uh"
import { SettingRow } from "./SettingRow"
import { isDefaultValue } from "./provenance"
import { DebouncedTextField } from "./DebouncedTextField"
import { clearSchoolPIN, setSchoolPIN, unlockSchool } from "./api"
import { DEFAULT_UI_PREFERENCES, type UIPreferences } from "./types"
import "./settingsUi.dict"

export interface SchoolModeCardProps {
  preferences: UIPreferences
  patchPreferences: (partial: Partial<UIPreferences>) => void
  preferencesLoading: boolean
}

/**
 * School mode: on/off, rename, and PIN management. The PIN itself is never
 * read back from the server (see app/ui/uh.go — only `PinSet` is ever
 * returned); this card only ever sends a PIN, never displays or infers
 * one, per the refusal on characterizing stored secrets.
 *
 * Turning School mode OFF genuinely requires the PIN (POST
 * /api/v1/uh/school/unlock) — turning it ON does not, matching the "self-
 * imposed speed bump" contract: the PIN is what gets you back OUT, not
 * what lets you in.
 */
export function SchoolModeCard({ preferences, patchPreferences, preferencesLoading }: SchoolModeCardProps) {
  const t = useT("settingsUi")
  // Reuses the shell's own "That PIN didn't match." / "Cancel" / "Unlock"
  // strings from the already-shipped School unlock dialog copy (see
  // src/uh/dict/app.dict.ts) rather than re-authoring near-duplicates.
  const tApp = useT("app")
  const snackbar = useSnackbar()
  const queryClient = useQueryClient()

  const [unlocking, setUnlocking] = useState(false)
  const [unlockPin, setUnlockPin] = useState("")
  const [unlockError, setUnlockError] = useState<string | null>(null)

  const [newPin, setNewPin] = useState("")
  const [pinError, setPinError] = useState<string | null>(null)

  const unlockMutation = useMutation({
    mutationFn: unlockSchool,
    onSuccess: (result) => {
      if (!result.unlocked) {
        setUnlockError(tApp("wrongPin"))
        return
      }
      setUnlocking(false)
      setUnlockPin("")
      setUnlockError(null)
      patchPreferences({ school: { ...preferences.school, on: false } })
    },
    onError: () => setUnlockError(tApp("wrongPin")),
  })

  const setPinMutation = useMutation({
    mutationFn: setSchoolPIN,
    onSuccess: () => {
      queryClient.setQueryData(["uh", "preferences"], {
        ...preferences,
        school: { ...preferences.school, pinSet: true },
      })
      setNewPin("")
      setPinError(null)
      snackbar.show(t("schoolPinSaved"))
    },
    onError: () => setPinError(t("schoolPinSaveFailed")),
  })

  const clearPinMutation = useMutation({
    mutationFn: clearSchoolPIN,
    onSuccess: () => {
      queryClient.setQueryData(["uh", "preferences"], {
        ...preferences,
        school: { ...preferences.school, pinSet: false },
      })
      snackbar.show(t("schoolPinCleared"))
    },
  })

  const disabledReason = preferencesLoading ? t("savingNow") : undefined

  const handleToggle = (checked: boolean) => {
    if (checked) {
      if (!preferences.school.pinSet) {
        snackbar.show(t("schoolCannotDisable"))
        return
      }
      patchPreferences({ school: { ...preferences.school, on: true } })
      return
    }
    setUnlocking(true)
    setUnlockError(null)
  }

  const handleUnlockSubmit = () => {
    if (!unlockPin) return
    unlockMutation.mutate(unlockPin)
  }

  const handleSetPin = () => {
    if (newPin.trim().length < 4) {
      setPinError(t("schoolPinTooShort"))
      return
    }
    setPinMutation.mutate(newPin.trim())
  }

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-5 p-5">
      <header>
        <h2 className="text-base font-semibold text-on-surface">{t("schoolTitle")}</h2>
        <p className="text-[12.5px] text-on-surface-variant">{t("schoolSub")}</p>
      </header>

      <SettingRow
        icon="lock"
        title={t("schoolOnLabel")}
        explanation={t("schoolOnExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.school.on, DEFAULT_UI_PREFERENCES.school.on) ? t("provenanceDefault") : t("provenanceStored")} ${preferences.school.on ? "on" : "off"}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <div className="flex flex-col gap-2.5">
          <Switch checked={preferences.school.on} onChange={handleToggle} label={t("schoolOnToggleLabel")} />
          {unlocking ? (
            <div className="flex flex-col gap-2 rounded-[10px] border border-outline-variant bg-surface-low p-3">
              <TextField
                value={unlockPin}
                onChange={setUnlockPin}
                type="password"
                mono
                label={t("schoolPinLabel")}
                placeholder={t("schoolPinPlaceholder")}
                error={unlockError ?? undefined}
              />
              <div className="flex justify-end gap-2">
                <Button variant="text" size="sm" onClick={() => setUnlocking(false)}>
                  {tApp("cancel")}
                </Button>
                <Button
                  variant="filled"
                  size="sm"
                  loading={unlockMutation.isPending}
                  onClick={handleUnlockSubmit}
                  disabled={!unlockPin}
                >
                  {tApp("unlock")}
                </Button>
              </div>
            </div>
          ) : null}
        </div>
      </SettingRow>

      <SettingRow
        icon="edit"
        title={t("schoolNameLabel")}
        explanation={t("schoolNameExplain")}
        provenance={fact(
          `${isDefaultValue(preferences.school.name, DEFAULT_UI_PREFERENCES.school.name) ? t("provenanceDefault") : t("provenanceStored")} ${preferences.school.name || t("schoolNamePlaceholder")}`,
          "user-input",
        )}
        disabledReason={disabledReason}
      >
        <DebouncedTextField
          value={preferences.school.name}
          onCommit={(name) => patchPreferences({ school: { ...preferences.school, name } })}
          label={t("schoolNameLabel")}
          placeholder={t("schoolNamePlaceholder")}
        />
      </SettingRow>

      <SettingRow
        icon="lock_open"
        title={t("schoolPinLabel")}
        explanation={t("schoolPinExplain")}
        provenance={
          preferences.school.pinSet
            ? fact(t("schoolPinSetStatus"), "user-input")
            : fact(t("schoolPinUnsetStatus"), "user-input")
        }
        disabledReason={disabledReason}
      >
        <div className="flex items-end gap-2">
          <TextField
            value={newPin}
            onChange={setNewPin}
            type="password"
            mono
            label={t("schoolPinLabel")}
            placeholder={t("schoolPinPlaceholder")}
            error={pinError ?? undefined}
            className="min-w-0 flex-1"
          />
          <Button
            variant="outlined"
            size="sm"
            loading={setPinMutation.isPending}
            onClick={handleSetPin}
            disabled={!newPin}
          >
            {preferences.school.pinSet ? t("schoolPinChangeBtn") : t("schoolPinSetBtn")}
          </Button>
          {preferences.school.pinSet ? (
            <Button
              variant="text"
              size="sm"
              loading={clearPinMutation.isPending}
              onClick={() => clearPinMutation.mutate()}
            >
              {t("schoolPinClearBtn")}
            </Button>
          ) : null}
        </div>
      </SettingRow>
    </Surface>
  )
}
