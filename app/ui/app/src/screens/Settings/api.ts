// Local fetch client for the /api/v1/uh/* routes registered in
// app/ui/uh.go (uhGetPreferences, uhPatchPreferences, uhSetSchoolPIN,
// uhUnlockSchool, uhClearSchoolPIN). Kept local to this screen rather than
// added to src/api.ts, which this lane's allowed paths don't cover — same
// reasoning as src/screens/models/types.ts hand-mirroring server shapes
// instead of waiting on shared codegen.

import { API_BASE } from "@/lib/config"
import type { UIPreferences } from "./types"

async function json<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  })
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

export async function getUIPreferences(): Promise<UIPreferences> {
  const data = await json<{ preferences: UIPreferences }>("/api/v1/uh/preferences")
  return data.preferences
}

/** A PARTIAL preferences document — the server performs a read-modify-write
 * merge (see uhPatchPreferences), so only fields actually present here are
 * changed; everything else keeps its previously-saved value. */
export async function patchUIPreferences(
  patch: Partial<UIPreferences>,
): Promise<UIPreferences> {
  const data = await json<{ preferences: UIPreferences }>("/api/v1/uh/preferences", {
    method: "PATCH",
    body: JSON.stringify(patch),
  })
  return data.preferences
}

export async function setSchoolPIN(pin: string): Promise<{ pinSet: boolean }> {
  return json<{ pinSet: boolean }>("/api/v1/uh/school/pin", {
    method: "POST",
    body: JSON.stringify({ pin }),
  })
}

export async function clearSchoolPIN(): Promise<{ pinSet: boolean }> {
  return json<{ pinSet: boolean }>("/api/v1/uh/school/pin", { method: "DELETE" })
}

export async function unlockSchool(pin: string): Promise<{ unlocked: boolean }> {
  return json<{ unlocked: boolean }>("/api/v1/uh/school/unlock", {
    method: "POST",
    body: JSON.stringify({ pin }),
  })
}
