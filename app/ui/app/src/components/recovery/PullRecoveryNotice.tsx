import { useT } from "@/uh"
import { RecoveryNotice } from "./RecoveryNotice"
import "./recovery.dict"

export interface PullRecoveryNoticeProps {
  error: string | null
  diskLow: boolean
  retrying: boolean
  onRetry: () => void
}

/**
 * The Models screen's quick-pull failure notice -- fed by usePullRecovery
 * rather than owning its own fetch, since the same failed attempt also
 * has to keep CatalogSection's `pulling` prop in sync. `diskLow` picks
 * more specific copy for models.go's real disk-space preflight refusal;
 * the exact server message is always shown verbatim as `reason` either
 * way.
 */
export function PullRecoveryNotice({ error, diskLow, retrying, onRetry }: PullRecoveryNoticeProps) {
  const t = useT("recovery")

  if (!error) return null

  return (
    <RecoveryNotice
      state={diskLow ? "pull-disk-low" : "pull-failed"}
      severity="error"
      icon={diskLow ? "folder" : "download"}
      title={diskLow ? t("diskLowTitle") : t("pullFailedTitle")}
      explanation={diskLow ? t("diskLowBody") : t("pullFailedBody")}
      reason={error}
      onRetry={onRetry}
      retrying={retrying}
    />
  )
}
