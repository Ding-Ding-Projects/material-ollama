// Typed client for /api/v1/convert/* (see app/ui/convert.go): the real
// catalog, byte-signature probe, persisted job queue, and its SSE fan-out.
import { API_BASE } from "@/lib/config"

export interface ConvertFormat {
  id: string
  label: string
  extensions?: string[]
  mimeTypes?: string[]
  available: boolean
  missingDependency?: string
  expectedPath?: string
  lossyTo?: string[]
}

export interface ConvertCategory {
  id: string
  label: string
  formats: ConvertFormat[]
}

export interface ConvertLossReport {
  lossy: boolean
  irreversible: boolean
  reasons?: string[]
}

export interface ConvertProbeResult {
  path: string
  filename: string
  sizeBytes: number
  detectedMimeType?: string
  detectedFormat?: string
  declaredExtension?: string
  declaredFormat?: string
  sourceFormat?: string
  mismatch: boolean
  warnings?: string[]
  lossReport?: ConvertLossReport
}

export type ConvertJobState = "queued" | "running" | "completed" | "failed" | "canceled"

export interface ConvertJob {
  id: string
  inputPath: string
  inputFilename: string
  sourceFormat: string
  targetFormat: string
  outputPath?: string
  state: ConvertJobState
  message?: string
  lossReport: ConvertLossReport
  acknowledged: boolean
  error?: string
  inputBytes?: number
  outputBytes?: number
  createdAt: string
  updatedAt: string
}

async function convertJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, init)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`
    try {
      const body = await response.clone().json()
      if (body && typeof body.error === "string" && body.error) message = body.error
    } catch {
      const text = await response.text().catch(() => "")
      if (text) message = text
    }
    throw new Error(message)
  }
  return (await response.json()) as T
}

export async function getConvertCatalog(): Promise<ConvertCategory[]> {
  const data = await convertJson<{ categories: ConvertCategory[] }>("/api/v1/convert/catalog")
  return data.categories || []
}

export function probeConvertFile(path: string, targetFormat?: string): Promise<ConvertProbeResult> {
  return convertJson<ConvertProbeResult>("/api/v1/convert/probe", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ path, targetFormat }),
  })
}

export async function getConvertJobs(): Promise<ConvertJob[]> {
  const data = await convertJson<{ jobs: ConvertJob[] }>("/api/v1/convert/jobs")
  return data.jobs || []
}

export interface CreateConvertJobRequest {
  path: string
  sourceFormat?: string
  targetFormat: string
  acknowledgeLossy: boolean
}

export function createConvertJob(request: CreateConvertJobRequest): Promise<ConvertJob> {
  return convertJson<ConvertJob>("/api/v1/convert/jobs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
}

export function cancelConvertJob(id: string): Promise<{ state: string }> {
  return convertJson<{ state: string }>(`/api/v1/convert/jobs/${encodeURIComponent(id)}/cancel`, { method: "POST" })
}

export function deleteConvertJob(id: string): Promise<{ state: string }> {
  return convertJson<{ state: string }>(`/api/v1/convert/jobs/${encodeURIComponent(id)}`, { method: "DELETE" })
}

/** SSE subscription for the conversion queue (GET /api/v1/convert/events).
 * The first event is always "snapshot"; every later "queue" event carries
 * the complete job list again (see convert.go's convertManager.publish) --
 * there is no delta format to merge, so callers just replace their state
 * wholesale on every event. */
export function subscribeConvertEvents(handlers: {
  onSnapshot: (jobs: ConvertJob[]) => void
  onQueue: (jobs: ConvertJob[]) => void
  onError?: (error: Event) => void
}): () => void {
  if (typeof EventSource === "undefined") {
    // No SSE support in this runtime (e.g. a test environment) -- callers
    // fall back to their own REST polling rather than crashing here.
    return () => {}
  }
  const source = new EventSource(`${API_BASE}/api/v1/convert/events`)
  source.addEventListener("snapshot", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as ConvertJob[]
    handlers.onSnapshot(data || [])
  })
  source.addEventListener("queue", (event) => {
    const data = JSON.parse((event as MessageEvent).data) as ConvertJob[]
    handlers.onQueue(data || [])
  })
  source.onerror = (error) => handlers.onError?.(error)
  return () => source.close()
}

/**
 * Opens the native OS file picker (app/cmd/app/webview.go's `selectFiles`
 * binding) and returns the picked file's real filesystem path -- the ONLY
 * path this build's converter will ever accept, since the backend refuses
 * any path that didn't come through this exact dialog (see convert.go's
 * pathIsPicked). Returns `null` on cancel.
 *
 * That dialog is shared with the chat attachment picker and inherits its
 * extension allow-list (documents/images/common text/code types) and 10MB
 * cap -- a real, pre-existing platform limitation this lane's allowed
 * paths cannot widen (the binding lives in app/cmd/app/webview.go). Audio,
 * video and large-archive conversions are listed in the catalog honestly,
 * but this specific desktop build cannot currently pick a source file for
 * them; `pickConvertFile` documents this rather than pretending otherwise.
 */
export async function pickConvertFile(): Promise<{ path: string; filename: string } | null> {
  if (typeof window === "undefined" || !window.webview?.selectFile) return null
  const picked = await window.webview.selectFile()
  if (!picked) return null
  return { path: picked.path, filename: picked.filename }
}
