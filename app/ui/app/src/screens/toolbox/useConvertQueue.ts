import { useCallback, useEffect, useRef, useState } from "react"
import {
  cancelConvertJob,
  createConvertJob,
  deleteConvertJob,
  getConvertJobs,
  subscribeConvertEvents,
  type ConvertJob,
  type CreateConvertJobRequest,
} from "./convertApi"

export interface UseConvertQueue {
  jobs: ConvertJob[]
  /** Whether the live SSE stream is connected. When false, the REST
   * fallback below keeps `jobs` reasonably current via polling -- the
   * same degraded-but-honest pattern useModelStore.ts's pull-queue hook
   * uses, rather than pretending the connection never dropped. */
  live: boolean
  createJob: (request: CreateConvertJobRequest) => Promise<ConvertJob>
  cancelJob: (id: string) => Promise<void>
  deleteJob: (id: string) => Promise<void>
  busyIds: ReadonlySet<string>
}

/**
 * Live-streams the conversion job queue over SSE (GET
 * /api/v1/convert/events), seeded by one REST call so the queue paints
 * immediately, falling back to REST polling if the stream never connects
 * or drops (jsdom and some dev-server proxies have no EventSource at
 * all -- see convertApi.ts's subscribeConvertEvents guard).
 */
export function useConvertQueue(): UseConvertQueue {
  const [jobs, setJobs] = useState<ConvertJob[]>([])
  const [live, setLive] = useState(false)
  const [busyIds, setBusyIds] = useState<ReadonlySet<string>>(new Set())
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const fetchJobs = useCallback(async () => {
    try {
      setJobs(await getConvertJobs())
    } catch {
      // A failed poll leaves the last-known list in place rather than
      // clearing it -- a transient network hiccup shouldn't make an
      // in-flight job appear to vanish.
    }
  }, [])

  useEffect(() => {
    fetchJobs()
    const unsubscribe = subscribeConvertEvents({
      onSnapshot: (data) => {
        setJobs(data)
        setLive(true)
      },
      onQueue: (data) => {
        setJobs(data)
        setLive(true)
      },
      onError: () => setLive(false),
    })
    return unsubscribe
  }, [fetchJobs])

  // While the stream is down, poll every 3s so the queue still updates.
  useEffect(() => {
    if (live) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return
    }
    pollRef.current = setInterval(fetchJobs, 3000)
    return () => {
      if (pollRef.current) clearInterval(pollRef.current)
    }
  }, [live, fetchJobs])

  function runBusy(id: string, action: () => Promise<unknown>) {
    setBusyIds((prev) => new Set(prev).add(id))
    return action().finally(() => {
      setBusyIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    })
  }

  const createJob = useCallback(async (request: CreateConvertJobRequest) => {
    const job = await createConvertJob(request)
    setJobs((prev) => [...prev, job])
    return job
  }, [])

  const cancelJob = useCallback((id: string) => runBusy(id, () => cancelConvertJob(id)).then(() => fetchJobs()), [
    fetchJobs,
  ])

  const deleteJob = useCallback(
    (id: string) =>
      runBusy(id, () => deleteConvertJob(id)).then(() => {
        setJobs((prev) => prev.filter((j) => j.id !== id))
      }),
    [],
  )

  return { jobs, live, createJob, cancelJob, deleteJob, busyIds }
}
