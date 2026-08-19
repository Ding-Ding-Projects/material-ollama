import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { getSettings, updateSettings } from "@/api"
import { ProgressBar, Surface, Switch, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import "./status.dict"

/**
 * The automatic-updates card: reads and writes the real `AutoUpdateEnabled`
 * setting through the same GET/POST /api/v1/settings endpoints
 * components/Settings.tsx's own toggle already uses (see the auto-update
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
            mutation.mutate({ ...settings, AutoUpdateEnabled: checked })
          }}
          label={t("autoUpdatesToggleLabel")}
          disabled={mutation.isPending}
        />
      )}

      <p className="text-[11.5px] text-on-surface-variant">
        <Txt ns="status" k="autoUpdatesUnsignedNote" channel="copy" />
      </p>
    </Surface>
  )
}
