import { useCallback, useRef, useState } from "react"
import { enqueueModelPull } from "@/api"
import { useSnackbar } from "@/components/md3"
import { useT } from "@/uh"
import "@/screens/models/modelsUi.dict"

/** Matches models.go's real pullEnqueue preflight refusal text exactly
 * ("needs at least %s free; only %s free on %s") closely enough to pick
 * a more specific title/explanation for the disk case. The message
 * itself is always rendered verbatim from the server (see
 * PullRecoveryNotice) -- this only decides which copy frames it. */
export function isDiskPreflightRefusal(message: string): boolean {
  return /needs at least .+ free/i.test(message)
}

export interface UsePullRecovery {
  pull: (model: string) => void
  pulling: boolean
  error: string | null
  diskLow: boolean
  /** Re-attempts the last model that was queued. A no-op if nothing has
   * been attempted yet. */
  retry: () => void
}

/**
 * Stands in for useModelStore's store.pull on the Catalog section's
 * quick-pull control so a real preflight refusal (most commonly the
 * disk-space floor in models.go's pullEnqueue) gets a RecoveryNotice
 * carrying the exact server message and a working Retry, instead of only
 * a passing toast. enqueueModelPull is the exact same real POST
 * /api/v1/models/pull the store uses; a successful pull still shows up
 * in the queue via the existing SSE stream regardless of which caller
 * enqueued it.
 */
export function usePullRecovery(): UsePullRecovery {
  const snackbar = useSnackbar()
  const t = useT("modelsUi")
  const [pulling, setPulling] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const lastModel = useRef<string | null>(null)

  const run = useCallback(
    async (model: string) => {
      lastModel.current = model
      setPulling(true)
      try {
        await enqueueModelPull(model)
        setError(null)
        snackbar.show(`${model} ${t("pullQueuedToast")}`)
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e))
      } finally {
        setPulling(false)
      }
    },
    [snackbar, t],
  )

  const retry = useCallback(() => {
    if (lastModel.current) run(lastModel.current)
  }, [run])

  return {
    pull: run,
    pulling,
    error,
    diskLow: error !== null && isDiskPreflightRefusal(error),
    retry,
  }
}
