import { useCallback, useEffect, useState } from "react"
import { getModelCatalogStatus, refreshModelCatalog } from "./api"
import type { CatalogStatusResponse } from "./types"

export interface UseCatalogRecovery {
  status: CatalogStatusResponse | null
  loading: boolean
  refreshing: boolean
  error: string | null
  /** Re-fetches GET .../catalog/status without starting a new refresh. */
  retry: () => void
  /** Starts a real POST .../catalog/refresh, then re-fetches status once
   * it returns -- refresh itself only reports that a background refresh
   * started, not the finished snapshot (see catalog.go's modelCatalogRefresh). */
  refresh: () => void
}

/**
 * GET /api/v1/models/catalog/status plus its one real recovery action,
 * POST /api/v1/models/catalog/refresh -- both already registered,
 * already-working server routes with no frontend consumer before this
 * lane (CatalogSection.tsx's "no catalog" copy predates this endpoint).
 */
export function useCatalogRecovery(): UseCatalogRecovery {
  const [status, setStatus] = useState<CatalogStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await getModelCatalogStatus())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    try {
      await refreshModelCatalog()
      await load()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setRefreshing(false)
    }
  }, [load])

  return { status, loading, refreshing, error, retry: load, refresh }
}
