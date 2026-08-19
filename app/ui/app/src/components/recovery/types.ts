// Typed mirrors of the JSON shapes served by app/ui/docker.go's and
// app/ui/catalog.go's real, already-registered routes. Field names and
// optionality follow the Go struct tags exactly -- this is a
// transcription, not a redesign (the same convention
// screens/models/types.ts documents for hardware.go/models.go). Neither
// route has had a frontend consumer before this lane.

/** A yes/no/unknown fact about the host -- see docker.go's TriState. */
export type TriState = "unknown" | "yes" | "no"

/** The cheap, fast summary GET /api/v1/docker/status returns. It never
 * re-runs the GPU probe -- that only happens from an explicit POST
 * /probe-gpu (see GpuCapability below). */
export interface DockerStatus {
  present: boolean
  executablePath?: string
  version?: string
  serverVersion?: string
  osType?: string
  kernelVersion?: string
  backend?: string
  error?: string
  checkedAt: string
}

export type GpuVerdict = "gpu-available" | "cpu-only" | "unknown"
export type GpuProbeResult = "gpu-visible" | "no-gpu-in-container" | "flag-rejected" | "not-run"

/** The result of one real POST /api/v1/docker/probe-gpu run, or the last
 * one persisted server-side (see docker.go's GPUCapability). Reason and
 * NextStep are the server's own honest, already-written explanation --
 * this lane renders them verbatim rather than re-describing WSL2/toolkit
 * detection with parallel copy that could drift. */
export interface GpuCapability {
  dockerPresent: boolean
  dockerVersion?: string
  backend: string // "wsl2" | "hyper-v" | "windows-containers" | "unknown"
  nvidiaRuntime: TriState
  toolkitDetected: TriState
  probeResult: GpuProbeResult
  probeDetail?: string
  devicesSeen?: string[]
  verdict: GpuVerdict
  reason?: string
  nextStep?: string
  checkedAt: string
}

export interface DockerStatusResponse {
  docker: DockerStatus
  lastGpuProbe: GpuCapability | null
}

export interface DockerProbeGpuResponse {
  gpu: GpuCapability
  rocmSupported: boolean
  rocmReason: string
}

/** See catalog.go's CatalogVerdict* constants. */
export type CatalogVerdict = "complete" | "partial" | "unavailable"

/** GET /api/v1/models/catalog/status. `reason` is set for every verdict,
 * including "complete" -- it always explains how the catalog was built,
 * not just why it failed. */
export interface CatalogStatusResponse {
  refreshing: boolean
  cachedVariants: number
  refreshStartedAt?: string
  fetchedAt?: string
  ageSeconds?: number
  namesEnumerated?: number
  tagsEnumerated?: number
  failureCount?: number
  verdict: CatalogVerdict
  reason?: string
  sources?: string[]
  durationMs?: number
  truncatedByDeadline?: boolean
  truncatedByCap?: boolean
}

export interface CatalogRefreshResponse {
  refreshing: boolean
  refreshStartedAt: string
}
