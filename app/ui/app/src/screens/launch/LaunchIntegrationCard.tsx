import { Icon } from "@/components/md3/Icon"
import { Button, Chip, Surface } from "@/components/md3"
import { fact, useT } from "@/uh"
import CopyButton from "@/components/CopyButton"
import type { LaunchIntegration } from "@/api"
import "./launch.dict"

export interface LaunchIntegrationCardProps {
  integration: LaunchIntegration
  /** True while THIS card's own POST /api/v1/launch/run is in flight --
   * scoped per-card so launching one harness never disables the others. */
  launching: boolean
  onLaunch: (integration: LaunchIntegration) => void
  onCopy: (integration: LaunchIntegration) => void
}

/**
 * One harness card: real registry name/description from the backend, the
 * exact `ollama launch <slug>` command in mono type (copyable), and a
 * Launch button that genuinely runs it. When the binary is not detected on
 * this machine the button is disabled and BOTH its tooltip and the visible
 * install-hint line name the exact missing piece and how to get it -- a
 * disabled control that does not say why reads as broken, per this
 * project's guided-forms contract.
 */
export function LaunchIntegrationCard({
  integration,
  launching,
  onLaunch,
  onCopy,
}: LaunchIntegrationCardProps) {
  const t = useT("launch")

  const disabledTitle = integration.installed
    ? undefined
    : fact(
        integration.installHint || `${integration.name} ${t("notInstalledReason")}`,
        "command",
      )

  return (
    <Surface tier="high" outlined radius="lg" className="flex flex-col gap-3 p-4">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-highest text-on-surface-variant"
        >
          <Icon name="terminal" size={20} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h2 className="truncate text-sm font-semibold text-on-surface">
              {fact(integration.name, "user-input")}
            </h2>
            <Chip
              as="span"
              selected={integration.installed}
              tone={integration.installed ? "secondary" : "neutral"}
              className="shrink-0 py-0.5 text-[11px]"
            >
              {integration.installed ? t("installedBadge") : t("notInstalledBadge")}
            </Chip>
          </div>
          <p className="mt-0.5 text-xs text-on-surface-variant">
            {fact(integration.description, "user-input")}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 rounded-token border border-outline-variant bg-surface-highest px-3 py-2">
        <code className="min-w-0 flex-1 truncate font-mono text-xs text-on-surface-variant">
          {fact(integration.command, "command")}
        </code>
        <CopyButton
          content={integration.command}
          size="md"
          title={t("copyAction")}
          className="text-on-surface-variant hover:bg-surface-high"
          onCopy={() => onCopy(integration)}
        />
      </div>

      {!integration.installed && integration.installHint ? (
        <p className="text-[11px] text-on-surface-variant">
          <span className="font-medium text-on-surface">{t("installHintPrefix")}</span>{" "}
          {fact(integration.installHint, "command")}
        </p>
      ) : null}

      <Button
        variant="filled"
        size="sm"
        icon="play_arrow"
        shape="token"
        disabled={!integration.installed}
        loading={launching}
        title={disabledTitle}
        onClick={() => onLaunch(integration)}
      >
        {t("launchAction")}
      </Button>
    </Surface>
  )
}
