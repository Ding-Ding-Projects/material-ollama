import { API_BASE } from "@/lib/config"
import type { AppEvent, HistoryEventsResponse, ReleaseInfo, UpdateStatus } from "./types"

/**
 * Local fetch wrappers for this lane's two real backends. Kept here rather
 * than added to the shared src/api.ts (outside this lane's allowed paths)
 * -- the same pattern this project already uses for docs.go's endpoints
 * being wrapped directly in src/api.ts by the lane that owns them.
 */

export async function getReleaseInfo(): Promise<ReleaseInfo> {
  const response = await fetch(`${API_BASE}/api/v1/release`)
  if (!response.ok) {
    throw new Error(`Failed to fetch release info: ${response.status}`)
  }
  return (await response.json()) as ReleaseInfo
}

export async function getHistoryEvents(): Promise<AppEvent[]> {
  const response = await fetch(`${API_BASE}/api/v1/history`)
  if (!response.ok) {
    throw new Error(`Failed to fetch history: ${response.status}`)
  }
  const data = (await response.json()) as HistoryEventsResponse
  return data.events ?? []
}

export interface AppendHistoryRequest {
  kind: string
  summary: string
}

export async function appendHistoryEvent(req: AppendHistoryRequest): Promise<AppEvent> {
  const response = await fetch(`${API_BASE}/api/v1/history`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  })
  if (!response.ok) {
    const text = await response.text()
    throw new Error(text || `Failed to record history event: ${response.status}`)
  }
  return (await response.json()) as AppEvent
}

export class UpdateRequestError extends Error {
  readonly status: UpdateStatus
  constructor(status: UpdateStatus) {
    super("Update request could not be completed")
    this.status = status
  }
}

async function updateRequest(path: string, init?: RequestInit): Promise<UpdateStatus> {
  const response = await fetch(`${API_BASE}${path}`, { ...init, signal: AbortSignal.timeout(path.endsWith("/restart") ? 11 * 60 * 1000 : 15000) })
  const data = (await response.json()) as UpdateStatus
  if (!response.ok) throw new UpdateRequestError(data)
  return data
}

export function getUpdateStatus(): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update")
}

export function checkForUpdates(): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update/check", { method: "POST" })
}

export function downloadUpdate(): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update/download", { method: "POST" })
}

export function cancelUpdate(): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update/cancel", { method: "POST" })
}

export function deferUpdate(): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update/later", { method: "POST" })
}

export function restartToInstall(unsavedWork: boolean): Promise<UpdateStatus> {
  return updateRequest("/api/v1/update/restart", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirmed: true, unsavedWork }),
  })
}
