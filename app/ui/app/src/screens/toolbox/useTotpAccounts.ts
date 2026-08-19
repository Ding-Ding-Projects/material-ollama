import { useCallback, useEffect, useMemo, useState } from "react"
import {
  createTotpAccount as createTotpAccountApi,
  deleteTotpAccount as deleteTotpAccountApi,
  getTotpCodes,
  listTotpAccounts,
  type CreateTotpAccountRequest,
  type TotpAccount,
  type TotpClockSkew,
  type TotpCodeEntry,
} from "./totpApi"

export interface UseTotpAccounts {
  accounts: TotpAccount[]
  /** Live codes keyed by account id -- GET /codes is polled every second
   * while this hook is mounted (a cheap, local, loopback call; nothing
   * here computes a code in the browser). */
  codesById: Map<string, TotpCodeEntry>
  clockSkew: TotpClockSkew | null
  systemTimeUtc: string | null
  loading: boolean
  /** The most recent poll/mutation error, or null. Every consumer is
   * expected to surface this at the surface where the failure happened
   * (see AuthenticatorSection) rather than only a passing toast. */
  error: string | null
  refresh: () => void
  createAccount: (request: CreateTotpAccountRequest) => Promise<TotpAccount>
  deleteAccount: (id: string) => Promise<void>
  deletingIds: ReadonlySet<string>
  creating: boolean
}

/**
 * The data/mutation surface AuthenticatorSection is built from -- every
 * value here is either the server's real response or a locally-tracked
 * in-flight flag; no TOTP code is ever computed client-side.
 */
export function useTotpAccounts(): UseTotpAccounts {
  const [accounts, setAccounts] = useState<TotpAccount[]>([])
  const [codes, setCodes] = useState<TotpCodeEntry[]>([])
  const [clockSkew, setClockSkew] = useState<TotpClockSkew | null>(null)
  const [systemTimeUtc, setSystemTimeUtc] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(new Set())
  const [creating, setCreating] = useState(false)

  const fetchAccounts = useCallback(async () => {
    try {
      setAccounts(await listTotpAccounts())
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }, [])

  const fetchCodes = useCallback(async () => {
    try {
      const resp = await getTotpCodes()
      setCodes(resp.codes)
      setClockSkew(resp.clockSkew)
      setSystemTimeUtc(resp.systemTimeUtc)
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
    fetchCodes()
    const id = setInterval(fetchCodes, 1000)
    return () => clearInterval(id)
  }, [fetchAccounts, fetchCodes])

  const codesById = useMemo(() => new Map(codes.map((c) => [c.id, c])), [codes])

  const createAccount = useCallback(
    async (request: CreateTotpAccountRequest) => {
      setCreating(true)
      try {
        const account = await createTotpAccountApi(request)
        await Promise.all([fetchAccounts(), fetchCodes()])
        return account
      } finally {
        setCreating(false)
      }
    },
    [fetchAccounts, fetchCodes],
  )

  const deleteAccount = useCallback(
    async (id: string) => {
      setDeletingIds((prev) => new Set(prev).add(id))
      try {
        await deleteTotpAccountApi(id)
        await Promise.all([fetchAccounts(), fetchCodes()])
      } finally {
        setDeletingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [fetchAccounts, fetchCodes],
  )

  return {
    accounts,
    codesById,
    clockSkew,
    systemTimeUtc,
    loading,
    error,
    refresh: fetchAccounts,
    createAccount,
    deleteAccount,
    deletingIds,
    creating,
  }
}
