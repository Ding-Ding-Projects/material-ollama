import { useCallback, useEffect, useState } from "react"
import { getDockerStatus, probeDockerGpu } from "./api"
import type { DockerStatusResponse } from "./types"

export interface UseDockerGpuRecovery {
  status: DockerStatusResponse | null
  loading: boolean
  probing: boolean
  error: string | null
  /** Re-fetches GET .../docker/status (the cheap summary; never re-runs
   * the probe). */
  retry: () => void
  /** Runs the real, potentially slow POST .../docker/probe-gpu and folds
   * its result straight into `status.lastGpuProbe` -- docker.go persists
   * the same result server-side, so a caller that reloaded GET /status
   * afterward would see it too. */
  probe: () => void
}

/**
 * GET /api/v1/docker/status plus its one real recovery action, POST
 * /api/v1/docker/probe-gpu -- the container-based GPU-passthrough
 * capability app/ui/docker.go already exposes with zero frontend
 * consumer before this lane.
 */
export function useDockerGpuRecovery(): UseDockerGpuRecovery {
  const [status, setStatus] = useState<DockerStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [probing, setProbing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      setStatus(await getDockerStatus())
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

  const probe = useCallback(async () => {
    setProbing(true)
    try {
      const result = await probeDockerGpu()
      setStatus((prev) => (prev ? { ...prev, lastGpuProbe: result.gpu } : prev))
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setProbing(false)
    }
  }, [])

  return { status, loading, probing, error, retry: load, probe }
}
