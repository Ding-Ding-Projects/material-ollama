import { useCallback, useState } from "react"
import { getHardware } from "@/api"
import type { HardwareResponse } from "@/screens/models/types"

export interface UseHardwareRecheck {
  /** `fromStore` until a manual recheck has completed at least once, then
   * the freshest of the two. */
  hardware: HardwareResponse | undefined
  rechecking: boolean
  recheck: () => void
}

/**
 * A one-off, independently-triggered GET /api/v1/hardware used only to
 * back the "recheck" control on the no-GPU-yet notice. It never polls on
 * its own -- the Models screen's existing store (useModelStore) already
 * refetches hardware every 30s -- this exists only so clicking Retry can
 * force an immediate re-read without this lane reaching into that hook's
 * internals (outside this lane's allowed paths).
 */
export function useHardwareRecheck(fromStore: HardwareResponse | undefined): UseHardwareRecheck {
  const [override, setOverride] = useState<HardwareResponse | undefined>(undefined)
  const [rechecking, setRechecking] = useState(false)

  const recheck = useCallback(async () => {
    setRechecking(true)
    try {
      setOverride(await getHardware())
    } catch {
      // A failed manual recheck just means "still don't know" -- leave
      // the notice showing whatever hardware snapshot it already had
      // rather than losing it to a transient error.
    } finally {
      setRechecking(false)
    }
  }, [])

  return { hardware: override ?? fromStore, rechecking, recheck }
}
