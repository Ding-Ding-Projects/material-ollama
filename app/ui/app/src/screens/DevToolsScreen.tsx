import { useQuery } from "@tanstack/react-query"
import { getCapabilityRegistry, getConfigProfiles } from "@/api"
import { Badge, Button, ProgressBar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import { CommandParityPanel } from "./devtools/CommandParityPanel"
import { ConfigurationPanel } from "./devtools/ConfigurationPanel"
import { ConfigProfilesPanel } from "./devtools/ConfigProfilesPanel"
import "./devtools/devtools.dict"

/**
 * The real Developer Tools screen: the CLI-to-GUI parity table, the
 * effective-configuration provenance list, and the configuration-profile
 * manager -- all three built directly on the live capability registry and
 * config-profile backends (GET /api/v1/capabilities, GET/POST/PUT/DELETE
 * /api/v1/config/profiles). Nothing here is sample data; a slow or offline
 * service shows its own real loading/error state rather than a placeholder.
 */
export default function DevToolsScreen() {
  const t = useT("devtools")
  const registryQuery = useQuery({
    queryKey: ["capabilityRegistry"],
    queryFn: getCapabilityRegistry,
  })
  const profilesQuery = useQuery({
    queryKey: ["configProfiles"],
    queryFn: getConfigProfiles,
  })

  const loading = registryQuery.isLoading || profilesQuery.isLoading
  const failed = Boolean(registryQuery.error || profilesQuery.error)
  const registry = registryQuery.data
  const profiles = profilesQuery.data

  return (
    <div className="mx-auto flex max-w-4xl flex-col gap-6 px-8 py-8">
      <header className="flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
            <Icon name="terminal" size={22} />
          </span>
          <div className="min-w-0">
            <h1 className="text-xl font-semibold text-on-surface">{t("title")}</h1>
            {registry ? (
              <span className="block text-[11.5px] text-on-surface-variant">
                <Txt channel="fact" value={registry.cliName} kind="command" />
              </span>
            ) : null}
          </div>
        </div>
        <p className="max-w-2xl text-[13px] text-on-surface-variant">
          <Txt ns="devtools" k="subtitle" channel="copy" />
        </p>
        {registry ? (
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Badge variant="label" tone="neutral">
              <Txt channel="fact" value={registry.commands.length} kind="count" /> {t("commandsCount")}
            </Badge>
            <Badge variant="label" tone="tertiary">
              <Txt channel="fact" value={registry.commands.filter((command) => command.hidden).length} kind="count" />{" "}
              {t("hiddenCount")}
            </Badge>
            <Badge variant="label" tone="secondary">
              <Txt channel="fact" value={registry.configuration.length} kind="count" /> {t("optionsCount")}
            </Badge>
          </div>
        ) : null}
      </header>

      {loading ? (
        <div className="flex flex-col items-center gap-3 py-16">
          <ProgressBar label={t("loading")} className="max-w-xs" />
          <p className="text-[12.5px] text-on-surface-variant">
            <Txt ns="devtools" k="loading" channel="copy" />
          </p>
        </div>
      ) : failed || !registry || !profiles ? (
        <div className="flex flex-col items-center gap-3 rounded-token border border-error-container bg-error-container/40 px-6 py-10 text-center">
          <Icon name="error" size={24} className="text-error" />
          <p className="text-[13px] text-on-surface">
            <Txt ns="devtools" k="errorLoading" channel="copy" />
          </p>
          <Button
            variant="outlined"
            icon="sync"
            onClick={() => {
              void registryQuery.refetch()
              void profilesQuery.refetch()
            }}
          >
            {t("retry")}
          </Button>
        </div>
      ) : (
        <>
          <CommandParityPanel commands={registry.commands} />
          <ConfigurationPanel configuration={registry.configuration} />
          <ConfigProfilesPanel
            configuration={registry.configuration}
            profiles={profiles.profiles}
            activeProfile={profiles.activeProfile}
          />
        </>
      )}
    </div>
  )
}
