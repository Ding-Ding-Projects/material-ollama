// Local fetch wrappers for this lane's Docker/GPU-capability and model-
// catalog-completeness endpoints (app/ui/docker.go, app/ui/catalog.go).
// Kept here rather than added to the shared src/api.ts (outside this
// lane's allowed paths) -- the same pattern screens/status/api.ts already
// follows for the routes that lane owns. getHardware, getInstalledModels,
// fetchHealth and enqueueModelPull already exist as real, working exports
// of src/api.ts and are imported directly from there by this lane's
// hooks rather than re-wrapped here.
import { API_BASE } from "@/lib/config"
import type {
  CatalogRefreshResponse,
  CatalogStatusResponse,
  DockerProbeGpuResponse,
  DockerStatusResponse,
} from "./types"

export async function getDockerStatus(): Promise<DockerStatusResponse> {
  const response = await fetch(`${API_BASE}/api/v1/docker/status`)
  if (!response.ok) {
    throw new Error(`Failed to fetch Docker status: ${response.status}`)
  }
  return (await response.json()) as DockerStatusResponse
}

/** POST /api/v1/docker/probe-gpu -- a real, potentially slow probe (it
 * may run a throwaway container). docker.go persists its result as the
 * new lastGpuProbe server-side, so a caller that reloads GET /status
 * afterward would see the same result this returns directly. */
export async function probeDockerGpu(): Promise<DockerProbeGpuResponse> {
  const response = await fetch(`${API_BASE}/api/v1/docker/probe-gpu`, { method: "POST" })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Failed to probe GPU passthrough: ${response.status}`)
  }
  return (await response.json()) as DockerProbeGpuResponse
}

export async function getModelCatalogStatus(): Promise<CatalogStatusResponse> {
  const response = await fetch(`${API_BASE}/api/v1/models/catalog/status`)
  if (!response.ok) {
    throw new Error(`Failed to fetch catalog status: ${response.status}`)
  }
  return (await response.json()) as CatalogStatusResponse
}

/** POST /api/v1/models/catalog/refresh starts a background refresh and
 * returns immediately (refreshing: true) -- it does not itself return
 * the finished snapshot, so callers re-poll GET /status afterward. */
export async function refreshModelCatalog(): Promise<CatalogRefreshResponse> {
  const response = await fetch(`${API_BASE}/api/v1/models/catalog/refresh`, { method: "POST" })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Failed to start catalog refresh: ${response.status}`)
  }
  return (await response.json()) as CatalogRefreshResponse
}
