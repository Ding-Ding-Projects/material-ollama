import { useState } from "react"
import { useMutation, useQuery } from "@tanstack/react-query"
import { Icon } from "@/components/md3/Icon"
import { useSnackbar } from "@/components/md3"
import { fact, useT } from "@/uh"
import { getLaunchIntegrations, runLaunchIntegration, type LaunchIntegration } from "@/api"
import { useSettings } from "@/hooks/useSettings"
import { LaunchIntegrationCard } from "./launch/LaunchIntegrationCard"
import "./launch/launch.dict"

/**
 * The real `/launch` destination from the nav rail: a grid of coding-agent
 * harness cards backed by GET /api/v1/launch/integrations, each with a
 * Launch button that POSTs /api/v1/launch/run and genuinely opens a new
 * terminal running `ollama launch <slug>` -- see app/ui/launch.go. Distinct
 * from the pre-existing `/c/launch` (chatId "launch") screen that
 * CodexHarness and others still link to, which keeps rendering the
 * clipboard-only LaunchCommands unchanged.
 */
export default function LaunchScreen() {
  const t = useT("app")
  const tl = useT("launch")
  const { setSettings } = useSettings()
  const { show } = useSnackbar()
  // Scoped to the one card currently launching, so a click on one harness
  // never disables the Launch button on any other card.
  const [pendingId, setPendingId] = useState<string | null>(null)

  const integrationsQuery = useQuery({
    queryKey: ["launchIntegrations"],
    queryFn: getLaunchIntegrations,
  })

  const runMutation = useMutation({
    mutationFn: (integration: LaunchIntegration) => runLaunchIntegration(integration.id),
  })

  const rememberHomeView = (homeView: string) => {
    // Best-effort: the launch/copy action already happened either way, and
    // this is only the "what should reopen next time" preference.
    setSettings({ LastHomeView: homeView }).catch(() => {})
  }

  const handleLaunch = async (integration: LaunchIntegration) => {
    setPendingId(integration.id)
    try {
      const result = await runMutation.mutateAsync(integration)
      rememberHomeView(result.homeView)
      show(fact(`${integration.name} ${tl("launchStarted")}`, "user-input"))
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error)
      show(fact(`${integration.name} ${tl("launchFailed")}: ${reason}`, "user-input"))
    } finally {
      setPendingId(null)
    }
  }

  const handleCopy = (integration: LaunchIntegration) => {
    rememberHomeView(integration.homeView)
    show(tl("copied"))
  }

  const integrations = integrationsQuery.data ?? []

  return (
    <div className="flex h-full flex-col overflow-y-auto px-6 py-8 sm:px-8" data-capture-id="launch" data-capture-ready="true">
      <div className="mx-auto w-full max-w-3xl">
        <h1 className="text-xl font-semibold text-on-surface">{t("launchTitle")}</h1>
        <p className="mt-1 text-sm text-on-surface-variant">{t("launchSub")}</p>

        {integrationsQuery.isLoading ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-on-surface-variant">
            <Icon name="sync" size={16} className="animate-spin" />
            {tl("loading")}
          </div>
        ) : integrationsQuery.isError ? (
          <div className="mt-10 flex items-center gap-2 text-sm text-error">
            <Icon name="error" size={16} />
            {tl("loadFailed")}
          </div>
        ) : (
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {integrations.map((integration) => (
              <LaunchIntegrationCard
                key={integration.id}
                integration={integration}
                launching={pendingId === integration.id}
                onLaunch={handleLaunch}
                onCopy={handleCopy}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
