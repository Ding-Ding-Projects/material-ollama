import { useT } from "@/uh"
import { RecoveryNotice } from "./RecoveryNotice"
import { useCatalogRecovery } from "./useCatalogRecovery"
import "./recovery.dict"

/**
 * GET /api/v1/models/catalog/status plus a real "Refresh catalog"
 * action -- silent once the catalog verdict is "complete", visible for
 * "unavailable" (never fetched) and "partial" (a refresh that didn't
 * fully finish) alike. The reason shown is always the server's own
 * snapshot.Reason (see catalog.go), never re-authored copy.
 */
export function CatalogRecoveryNotice() {
  const t = useT("recovery")
  const { status, loading, refreshing, retry, refresh } = useCatalogRecovery()

  if (loading || !status || status.verdict === "complete") return null

  const neverFetched = status.verdict === "unavailable"

  return (
    <RecoveryNotice
      state={`catalog-${status.verdict}`}
      severity={neverFetched ? "warning" : "info"}
      icon="storefront"
      title={neverFetched ? t("catalogNeverFetchedTitle") : t("catalogStaleTitle")}
      explanation={neverFetched ? t("catalogNeverFetchedBody") : t("catalogStaleBody")}
      reason={status.reason}
      onRetry={retry}
      retrying={loading}
      action={{ label: t("refreshCatalog"), onClick: refresh, loading: refreshing, icon: "sync_alt" }}
    />
  )
}
