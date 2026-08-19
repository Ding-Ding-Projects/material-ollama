import { useCallback, useEffect, useState } from "react"
import { fetchHealth } from "@/api"

export type OllamaHealthStatus = "checking" | "healthy" | "down"

export interface UseOllamaHealthRecovery {
  status: OllamaHealthStatus
  retrying: boolean
  retry: () => void
}

/**
 * Checks the local Ollama runtime through GET /api/version, which
 * app/ui/ui.go proxies straight through to the real Ollama server
 * (`ollamaProxy`) rather than answering from this app's own process -- so
 * a "down" result here means Ollama itself isn't responding, not just
 * that this app's own backend is unreachable. fetchHealth() already
 * swallows its own network/parse errors and resolves to false; this hook
 * adds the checking/retrying state a RecoveryNotice needs and re-checks
 * on demand.
 */
export function useOllamaHealthRecovery(): UseOllamaHealthRecovery {
  const [status, setStatus] = useState<OllamaHealthStatus>("checking")
  const [retrying, setRetrying] = useState(false)

  const check = useCallback(async () => {
    const healthy = await fetchHealth()
    setStatus(healthy ? "healthy" : "down")
  }, [])

  useEffect(() => {
    check()
  }, [check])

  const retry = useCallback(async () => {
    setRetrying(true)
    try {
      await check()
    } finally {
      setRetrying(false)
    }
  }, [check])

  return { status, retrying, retry }
}
