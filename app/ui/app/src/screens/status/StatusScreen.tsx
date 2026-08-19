import { Icon } from "@/components/md3/Icon"
import { Txt, useT } from "@/uh"
import { AutomaticUpdatesCard } from "./AutomaticUpdatesCard"
import { ChangelogCard } from "./ChangelogCard"
import { DimSumCatalogCard } from "./DimSumCatalogCard"
import { DimSumSurpriseCard } from "./DimSumSurpriseCard"
import { LocalHistoryCard } from "./LocalHistoryCard"
import { ReleaseCard } from "./ReleaseCard"
import { SupportTicketsCard } from "./SupportTicketsCard"
import "./status.dict"

/**
 * The real Status screen: release identity + the unsigned-by-policy fact
 * from GET /api/v1/release, the real automatic-updates setting, the build-
 * embedded dim-sum release catalog and its startup surprise, a changelog
 * built from this repository's own real commit history, local version
 * history from GET/POST /api/v1/history with export, and a fully local
 * (School-mode-independent) Support Tickets desk. Nothing here is sample
 * data, and every control that looks operable is wired to something real.
 */
export function StatusScreen() {
  const t = useT("status")

  return (
    <div
      className="mx-auto flex max-w-3xl flex-col gap-5 overflow-y-auto px-8 py-8"
      data-capture-id="status"
      data-capture-ready="true"
    >
      <header className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
          <Icon name="monitor_heart" size={22} />
        </span>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold text-on-surface">{t("pageTitle")}</h1>
          <p className="max-w-2xl text-[13px] text-on-surface-variant">
            <Txt ns="status" k="pageSubtitle" channel="copy" />
          </p>
        </div>
      </header>

      <DimSumSurpriseCard />
      <ReleaseCard />
      <AutomaticUpdatesCard />
      <DimSumCatalogCard />
      <ChangelogCard />
      <LocalHistoryCard />
      <SupportTicketsCard />
    </div>
  )
}

export default StatusScreen
