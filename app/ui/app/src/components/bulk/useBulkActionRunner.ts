import { useCallback, useRef, useState } from "react"

// "Long-running [bulk actions] report progress, remain cancellable, and
// state partial results honestly." Every action a BulkAction.run()
// performs is the caller's own business; this hook is the reusable
// engine for running one PER ITEM, so the app never re-derives
// progress/cancel/partial-outcome bookkeeping by hand for each new bulk
// action it adds.

export type BulkItemOutcome = "succeeded" | "failed" | "cancelled"

export interface BulkRunResultItem {
  readonly id: string
  readonly outcome: BulkItemOutcome
  readonly error?: string
}

export interface BulkRunSummary {
  readonly results: readonly BulkRunResultItem[]
  readonly succeededCount: number
  readonly failedCount: number
  readonly cancelledCount: number
}

export type BulkRunnerStatus = "idle" | "running" | "done"

export interface UseBulkActionRunnerResult {
  readonly status: BulkRunnerStatus
  /** 0..total -- items processed so far (succeeded, failed, or
   * cancelled all count as "processed" for progress purposes). */
  readonly processedCount: number
  readonly total: number
  readonly cancelled: boolean
  readonly summary: BulkRunSummary | null
  /** Runs `perItem` for every id in sequence, reporting progress after
   * each one settles. Never runs two items concurrently -- a caller
   * whose `perItem` hits a shared, rate-limited resource doesn't need to
   * do its own throttling. */
  readonly run: (ids: readonly string[], perItem: (id: string) => Promise<void>) => Promise<BulkRunSummary>
  /** Requests cancellation. The item currently in flight is allowed to
   * finish (never aborted mid-write); every id after it is marked
   * "cancelled" rather than run, and the batch's own summary honestly
   * reports how many actually succeeded/failed/were cancelled -- never a
   * single all-or-nothing verdict for a batch that was interrupted. */
  readonly cancel: () => void
  readonly reset: () => void
}

function summarize(results: readonly BulkRunResultItem[]): BulkRunSummary {
  let succeededCount = 0
  let failedCount = 0
  let cancelledCount = 0
  for (const result of results) {
    if (result.outcome === "succeeded") succeededCount += 1
    else if (result.outcome === "failed") failedCount += 1
    else cancelledCount += 1
  }
  return { results, succeededCount, failedCount, cancelledCount }
}

export function useBulkActionRunner(): UseBulkActionRunnerResult {
  const [status, setStatus] = useState<BulkRunnerStatus>("idle")
  const [processedCount, setProcessedCount] = useState(0)
  const [total, setTotal] = useState(0)
  const [summary, setSummary] = useState<BulkRunSummary | null>(null)
  const cancelledRef = useRef(false)
  const [cancelled, setCancelled] = useState(false)

  const run = useCallback(
    async (ids: readonly string[], perItem: (id: string) => Promise<void>): Promise<BulkRunSummary> => {
      cancelledRef.current = false
      setCancelled(false)
      setStatus("running")
      setTotal(ids.length)
      setProcessedCount(0)
      setSummary(null)

      const results: BulkRunResultItem[] = []
      for (const id of ids) {
        if (cancelledRef.current) {
          results.push({ id, outcome: "cancelled" })
          setProcessedCount((count) => count + 1)
          continue
        }
        try {
          await perItem(id)
          results.push({ id, outcome: "succeeded" })
        } catch (error) {
          results.push({ id, outcome: "failed", error: error instanceof Error ? error.message : String(error) })
        }
        setProcessedCount((count) => count + 1)
      }

      const finalSummary = summarize(results)
      setSummary(finalSummary)
      setStatus("done")
      return finalSummary
    },
    [],
  )

  const cancel = useCallback(() => {
    cancelledRef.current = true
    setCancelled(true)
  }, [])

  const reset = useCallback(() => {
    cancelledRef.current = false
    setStatus("idle")
    setProcessedCount(0)
    setTotal(0)
    setSummary(null)
    setCancelled(false)
  }, [])

  return { status, processedCount, total, cancelled, summary, run, cancel, reset }
}
