import { useT } from "@/uh"
import { RecoveryNotice } from "./RecoveryNotice"
import { useOllamaHealthRecovery } from "./useOllamaHealthRecovery"
import "./recovery.dict"

/**
 * Renders only when the local Ollama runtime genuinely isn't answering
 * GET /api/version (proxied straight through to the real server -- see
 * useOllamaHealthRecovery). Silent while checking or healthy, exactly
 * like every other error banner in this app.
 */
export function OllamaHealthNotice() {
  const t = useT("recovery")
  const { status, retrying, retry } = useOllamaHealthRecovery()

  if (status !== "down") return null

  return (
    <RecoveryNotice
      state="ollama-down"
      severity="error"
      icon="monitor_heart"
      title={t("ollamaDownTitle")}
      explanation={t("ollamaDownBody")}
      onRetry={retry}
      retrying={retrying}
    />
  )
}
