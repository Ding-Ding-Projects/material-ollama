// Typed client for /api/v1/uh/totp/* (see app/ui/totp.go). Every value
// here is exactly what the server returns -- no code is ever computed in
// the browser, and a pairing secret only ever passes through this module
// for the one documented reveal (POST /pairing-uri) the server itself
// treats as a deliberate exception; it is never cached, logged, or
// persisted here.
import { API_BASE } from "@/lib/config"

export interface TotpAccount {
  id: string
  name: string
  algorithm: string
  digits: number
  period: number
  createdAt: string
  secretSet: boolean
}

export interface TotpClockSkew {
  available: boolean
  checkedAt?: string
  skewSeconds?: number
  likely?: boolean
  warning?: string
  reason?: string
}

export interface TotpCodeEntry {
  id: string
  name: string
  code?: string
  algorithm: string
  digits: number
  period: number
  secondsRemaining: number
  secretMissing?: boolean
}

export interface TotpCodesResponse {
  codes: TotpCodeEntry[]
  systemTimeUtc: string
  clockSkew: TotpClockSkew
}

export interface TotpPairingRequest {
  id?: string
  name?: string
  algorithm?: string
  digits?: number
  period?: number
}

export interface TotpPairingResponse {
  uri: string
  secret: string
  name: string
  algorithm: string
  digits: number
  period: number
}

async function totpJson<T>(path: string, init?: RequestInit): Promise<T> {
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

export async function listTotpAccounts(): Promise<TotpAccount[]> {
  const data = await totpJson<{ accounts: TotpAccount[] }>("/api/v1/uh/totp/accounts")
  return data.accounts || []
}

export function getTotpCodes(): Promise<TotpCodesResponse> {
  return totpJson<TotpCodesResponse>("/api/v1/uh/totp/codes")
}

/** Preview a brand-new pairing (no `id`) or re-pair an already-stored
 * account (with `id`) -- either way, nothing is persisted server-side by
 * this call alone; `createTotpAccount` below is the separate, explicit
 * step that actually stores the secret in the OS credential vault. */
export function previewTotpPairing(request: TotpPairingRequest): Promise<TotpPairingResponse> {
  return totpJson<TotpPairingResponse>("/api/v1/uh/totp/pairing-uri", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
}

export interface CreateTotpAccountRequest {
  name: string
  secret: string
  algorithm?: string
  digits?: number
  period?: number
}

export function createTotpAccount(request: CreateTotpAccountRequest): Promise<TotpAccount> {
  return totpJson<TotpAccount>("/api/v1/uh/totp/accounts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
  })
}

/** The confirmation keyword is fixed server-side (totp.go re-checks it
 * regardless of what the caller sends), so it is hardcoded here exactly
 * as `deleteInstalledModel` in api.ts hardcodes "REMOVE" for the same
 * reason -- the UI's job is to make the user type it via ConfirmDialog
 * before this is ever called, not to choose it. */
export function deleteTotpAccount(id: string): Promise<{ id: string; state: string }> {
  return totpJson<{ id: string; state: string }>(`/api/v1/uh/totp/accounts/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ confirm: "REMOVE" }),
  })
}
