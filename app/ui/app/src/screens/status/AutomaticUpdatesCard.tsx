import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useRef, useState } from "react"
import { getSettings, updateSettings } from "@/api"
import { checkForUpdates, cancelUpdate, deferUpdate, downloadUpdate, restartToInstall, getUpdateStatus, UpdateRequestError } from "./api"
import type { UpdateStatus } from "./types"
import { Settings } from "@/gotypes"
import { Button, ProgressBar, Surface, Switch, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import { hasComposerUnsavedWork, useComposerUnsavedWork } from "@/lib/unsavedWork"
import { useStreamingContext } from "@/contexts/StreamingContext"
import "./status.dict"

/**
 * The automatic-updates card: reads and writes the real `AutoUpdateEnabled`
 * setting through the same GET/POST /api/v1/settings endpoints
 * the settings screen's own toggle already uses (see the auto-update
 * handling in app/ui/ui.go around its settings handler, which cancels or
 * triggers a real update check on the same field). This is a second
 * control surface for one real setting, not a fork of it -- exactly the
 * "prefer the real control over a printout of it" rule the shared
 * instructions ask for wherever a value is shown.
 */
export function AutomaticUpdatesCard() {
  const t = useT("status")
  const snackbar = useSnackbar()
  const queryClient = useQueryClient()
  const [working, setWorking] = useState(false)
  const actionPending = useRef(false)
  const composerUnsaved = useComposerUnsavedWork()
  const { streamingChatIds, loadingChats } = useStreamingContext()
  const unsavedWork = composerUnsaved || streamingChatIds.size > 0 || loadingChats.size > 0
  const updateQuery = useQuery({
    queryKey: ["automatic-update-status"],
    queryFn: getUpdateStatus,
    refetchInterval: 1000,
    refetchIntervalInBackground: true,
    retry: false,
  })
  const update = updateQuery.data
  const busy = working || ["checking", "downloading", "installing", "restarting"].includes(update?.state ?? "")

  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettings,
  })

  const mutation = useMutation({
    mutationFn: updateSettings,
    onSuccess: (data) => {
      queryClient.setQueryData(["settings"], data)
      snackbar.show(t("autoUpdatesSavedToast"))
    },
    onError: () => {
      snackbar.show(t("autoUpdatesSaveError"))
    },
  })

  const settings = settingsQuery.data?.settings

  const runUpdateAction = async (action: () => Promise<UpdateStatus>) => {
    if (actionPending.current) return
    actionPending.current = true
    setWorking(true)
    try {
      await queryClient.cancelQueries({ queryKey: ["automatic-update-status"] })
      queryClient.setQueryData(["automatic-update-status"], await action())
    } catch (error) {
      if (error instanceof UpdateRequestError) queryClient.setQueryData(["automatic-update-status"], error.status)
      snackbar.show(t("updateActionError"), 7000)
    } finally {
      actionPending.current = false
      setWorking(false)
      void queryClient.invalidateQueries({ queryKey: ["automatic-update-status"] })
    }
  }

  const restart = () => {
    const currentUnsaved = hasComposerUnsavedWork() || streamingChatIds.size > 0 || loadingChats.size > 0
    if (currentUnsaved) { snackbar.show(t("updateUnsavedWork")); return }
    void runUpdateAction(() => restartToInstall(currentUnsaved))
  }

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-3.5 p-5" data-testid="automatic-updates-card">
      <div className="flex items-center gap-2.5">
        <Icon name="system_update_alt" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("autoUpdatesHeading")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="status" k="autoUpdatesBody" channel="copy" />
      </p>

      {settingsQuery.isLoading ? (
        <ProgressBar label={t("autoUpdatesHeading")} className="max-w-xs" />
      ) : settingsQuery.isError || !settings ? (
        <p className="text-[12.5px] text-error">
          <Txt ns="status" k="autoUpdatesLoadError" channel="copy" />
        </p>
      ) : (
        <Switch
          checked={settings.AutoUpdateEnabled}
          onChange={(checked) => {
            mutation.mutate(new Settings({ ...settings, AutoUpdateEnabled: checked }))
          }}
          label={t("autoUpdatesToggleLabel")}
          disabled={mutation.isPending}
        />
      )}

      <p className="text-[11.5px] text-on-surface-variant">
        <Txt ns="status" k="autoUpdatesUnsignedNote" channel="copy" />
      </p>

      <div className="flex flex-wrap items-center gap-2" data-testid="update-actions">
        <Button variant="tonal" size="sm" disabled={busy} onClick={() => runUpdateAction(checkForUpdates)}>
          {t("checkForUpdates")}
        </Button>
        {update?.state === "available" ? (
          <Button variant="filled" size="sm" icon="download" disabled={working} loading={working} onClick={() => runUpdateAction(downloadUpdate)}>
            {t("downloadUpdate")}
          </Button>
        ) : null}
        {update?.state === "downloading" ? (
          <Button variant="tonal" size="sm" disabled={working} onClick={() => runUpdateAction(cancelUpdate)}>
            {t("cancelUpdate")}
          </Button>
        ) : null}
        {update?.canRestart && (update.state === "ready-to-restart" || update.state === "deferred") ? (
          <Button variant="filled" size="sm" icon="restart_alt" disabled={working || unsavedWork || Boolean(update.persistenceError)} onClick={restart}>
            {t("restartToInstall")}
          </Button>
        ) : null}
        {update?.canLater && update.state === "ready-to-restart" ? (
          <Button variant="text" size="sm" disabled={working} onClick={() => runUpdateAction(deferUpdate)}>
            {t("laterUpdate")}
          </Button>
        ) : null}
      </div>
      {update?.canRestart && unsavedWork ? <p role="status" className="text-[12px] text-error">{t("updateUnsavedWork")}</p> : null}
      {update ? (
        <div className="flex flex-col gap-2 text-[12px] text-on-surface-variant" data-testid="update-status" aria-live="polite">
          <span>{t("updateStateLabel")}: {t(updateStateKeys[update.state] ?? "updateActionError")}{update.version ? ` · ${update.version}` : ""}</span>
          {update.currentVersion ? <span>{t("currentVersionLabel")}: {update.currentVersion}</span> : null}
          {update.bytesTotal ? <ProgressBar value={(update.bytesDownloaded ?? 0) / update.bytesTotal * 100} label={t("updateProgressLabel")} /> : null}
          {update.state === "downloading" ? <span>{t("updateBytes").split("{done}").join(String(update.bytesDownloaded ?? 0)).split("{total}").join(update.bytesTotal ? String(update.bytesTotal) : t("updateUnknown"))}{update.rateBytesPerSecond != null ? ` · ${t("updateRate").split("{rate}").join(String(Math.round(update.rateBytesPerSecond)))}` : ""}{update.etaSeconds != null ? ` · ${t("updateEta").split("{seconds}").join(String(Math.ceil(update.etaSeconds)))}` : ""}</span> : null}
          {update.releaseNotesUrl?.startsWith("https://") ? <a className="text-primary underline" href={update.releaseNotesUrl} target="_blank" rel="noreferrer">{t("releaseNotesLink")}</a> : null}
          {update.unsignedWarning ? <span>{t("updateUnsignedWarning")}</span> : null}
          {update.error || update.errorCode ? <span className="text-error">{t(updateErrorKeys[update.errorCode ?? ""] ?? "updateActionError")}</span> : null}
          {update.persistenceError ? <span className="text-error">{t("updatePersistenceError")}</span> : null}
        </div>
      ) : null}
      {updateQuery.isError ? <p role="status" className="text-error">{t("updateStatusError")}</p> : null}
    </Surface>
  )
}

const updateStateKeys = {
  idle: "updateIdle", checking: "updateChecking", "up-to-date": "updateCurrent",
  unavailable: "updateUnavailable", available: "updateAvailable", downloading: "updateDownloading",
  "ready-to-restart": "updateReady", deferred: "updateDeferred", installing: "updateInstalling",
  restarting: "updateRestarting", cancelled: "updateCancelled", offline: "updateOffline",
  "invalid-metadata": "updateInvalidMetadata", "hash-mismatch": "updateHashMismatch",
  "corrupt-package": "updateCorruptPackage", rollback: "updateRollback", error: "updateActionError",
} as const
const updateErrorKeys: Record<string, keyof typeof import("./status.dict").statusDict.dict> = {
  "unsaved-work": "updateUnsavedWork", offline: "updateOffline", "invalid-metadata": "updateInvalidMetadata",
  "hash-mismatch": "updateHashMismatch", "corrupt-package": "updateCorruptPackage",
  "receipt-invalid": "updateReceiptInvalid", "feed-unavailable": "updateFeedUnavailable",
  "version-unavailable": "updateVersionUnavailable", cancelled: "updateCancelled",
  storage: "updateStorageError", download: "updateDownloadError", install: "updateInstallError",
  "not-ready": "updateNotReady", busy: "updateBusy", "invalid-request": "updateActionError",
}
