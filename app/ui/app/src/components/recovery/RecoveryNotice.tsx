import clsx from "clsx"
import { Button, Surface } from "@/components/md3"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { fact, useT, type Localized } from "@/uh"
import "./recovery.dict"

export type RecoverySeverity = "error" | "warning" | "info"

const SEVERITY_ICON: Record<RecoverySeverity, SymbolName> = {
  error: "error",
  warning: "warning",
  info: "sync",
}

/** error gets the design's real error-container treatment (matching
 * AuthenticatorSection's inline error banner); warning and info share the
 * same neutral surface-high treatment CatalogSection/HardwareFitBar
 * already use for a soft "here's a heads up" notice -- only the icon
 * carries the difference between them. */
const SEVERITY_TONE = {
  error: { surface: "bg-error-container", title: "text-on-error-container", body: "text-on-error-container" },
  warning: { surface: "bg-surface-high", title: "text-on-surface", body: "text-on-surface-variant" },
  info: { surface: "bg-surface-high", title: "text-on-surface", body: "text-on-surface-variant" },
} as const satisfies Record<RecoverySeverity, { surface: string; title: string; body: string }>

export interface RecoveryNoticeAction {
  label: Localized
  onClick: () => void
  loading?: boolean
  disabled?: boolean
  icon?: SymbolName
}

export interface RecoveryNoticeProps {
  /** Machine-readable state id, rendered as data-testid so a test or
   * capture harness can target one specific notice without matching on
   * translated copy. Never shown to the user directly. */
  state: string
  severity: RecoverySeverity
  /** Defaults to a severity-appropriate glyph; pass one explicitly to
   * name the actual thing that's missing (e.g. "memory" for a GPU
   * notice) rather than a generic warning triangle. */
  icon?: SymbolName
  title: Localized
  explanation: Localized
  /** Raw, unedited text straight from the server -- Docker's Reason, a
   * catalog verdict's reason, or a pull preflight's exact refusal
   * message. Rendered verbatim via fact() rather than re-authored, so it
   * can never drift from what the backend actually said (see the
   * brief's hard rule). */
  reason?: string
  /** The server's own NextStep guidance (currently only docker.go's
   * GPUCapability carries one). Rendered verbatim, same as `reason`. */
  nextStep?: string
  /** Re-issues the exact request that produced this notice. Every
   * RecoveryNotice carries one -- a Retry that doesn't retry is exactly
   * the defect this component exists to prevent. */
  onRetry: () => void
  retrying?: boolean
  /** A distinct, real in-app fix beyond "check again" -- e.g. "Refresh
   * catalog" (POST .../catalog/refresh) or "Probe GPU passthrough"
   * (POST .../docker/probe-gpu). Omit when the only available recovery
   * is re-checking. */
  action?: RecoveryNoticeAction
  className?: string
}

/**
 * The one reusable "something the user needs is missing, stopped,
 * unhealthy, or offline" surface every screen renders in place of a bare
 * fetch error or a spinner that resolves to nothing. Always carries a
 * real state name, a plain-language explanation, and a Retry that
 * actually re-issues the failed request -- never a link out to a web
 * search.
 */
export function RecoveryNotice({
  state,
  severity,
  icon,
  title,
  explanation,
  reason,
  nextStep,
  onRetry,
  retrying = false,
  action,
  className,
}: RecoveryNoticeProps) {
  const t = useT("recovery")
  const resolvedIcon = icon ?? SEVERITY_ICON[severity]
  const tone = SEVERITY_TONE[severity]

  return (
    <Surface
      outlined
      radius="lg"
      role={severity === "error" ? "alert" : "status"}
      data-testid={`recovery-notice-${state}`}
      className={clsx("flex flex-col gap-3 p-4", tone.surface, className)}
    >
      <div className="flex items-start gap-2.5">
        <Icon name={resolvedIcon} size={20} className={clsx("mt-0.5 shrink-0", tone.title)} />
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className={clsx("text-[13px] font-semibold", tone.title)}>{title}</span>
          <span className={clsx("text-[12.5px] leading-[1.5]", tone.body)}>{explanation}</span>
          {reason ? (
            <p className={clsx("text-[11.5px] leading-[1.5]", tone.body)}>
              <span className="font-medium">{t("reasonLabel")}: </span>
              {fact(reason, "user-input")}
            </p>
          ) : null}
          {nextStep ? (
            <p className={clsx("text-[11.5px] leading-[1.5]", tone.body)}>
              <span className="font-medium">{t("nextStepLabel")}: </span>
              {fact(nextStep, "user-input")}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2">
        {action ? (
          <Button
            variant="tonal"
            size="sm"
            icon={action.icon}
            loading={action.loading}
            disabled={action.disabled}
            onClick={action.onClick}
          >
            {action.label}
          </Button>
        ) : null}
        <Button variant="outlined" size="sm" icon="sync" loading={retrying} onClick={onRetry}>
          {t("retry")}
        </Button>
      </div>
    </Surface>
  )
}
