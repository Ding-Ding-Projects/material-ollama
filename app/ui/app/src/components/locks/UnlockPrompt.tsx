import { useEffect, useState } from "react"
import { Button, TextField } from "@/components/md3"
import { Txt, useT, useUh } from "@/uh"
import "./locks.dict"
import { AnchoredPanel } from "./AnchoredPanel"
import { UnlockLadder } from "./UnlockLadder"
import { localDataFolderPath } from "./localDataFolder"
import {
  getAttemptState,
  isWaiting,
  markUnlocked,
  recordFailure,
  remainingWaitMs,
  resetAttempts,
  verifyCredential,
  type LockRecord,
} from "@/uh/locksStore"
import { ladderSkipsRemaining, resetLadderProgress } from "@/uh/locksLadder"
import { recordHistory } from "@/uh/locksHistory"

export interface UnlockPromptProps {
  open: boolean
  anchorEl: HTMLElement | null
  onClose: () => void
  lock: LockRecord | undefined
  label: string
  /** Called after a genuinely correct credential was submitted. The
   * caller (`Lockable`) is what actually flips visible state for a
   * "surface" duration lock -- see its own comment for why that has to
   * stay component-local rather than living in `locksStore`. */
  onUnlocked: () => void
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.ceil(ms / 1000)
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * The anchored non-modal unlock prompt. While the lock is genuinely
 * waiting out a failed-attempt lockout, offers the unlock ladder as
 * something to do instead of watching the clock -- and per that module's
 * own contract, winning the ladder only ever clears the wait: this
 * component still asks for the real credential afterward, every time.
 */
export function UnlockPrompt({ open, anchorEl, onClose, lock, label, onUnlocked }: UnlockPromptProps) {
  const t = useT("locks")
  const voice = useUh()
  const [credential, setCredential] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [showLadder, setShowLadder] = useState(false)
  const [, forceTick] = useState(0)

  useEffect(() => {
    if (!open) {
      setCredential("")
      setError(null)
      setSubmitting(false)
      setShowLadder(false)
    }
  }, [open])

  const waiting = Boolean(lock) && isWaiting(lock!.id)

  useEffect(() => {
    if (!open || !lock || !waiting) return
    const interval = window.setInterval(() => forceTick((n) => n + 1), 500)
    return () => window.clearInterval(interval)
  }, [open, lock, waiting])

  if (!lock) return null

  async function handleUnlock() {
    if (!lock) return
    setSubmitting(true)
    setError(null)
    try {
      const correct = await verifyCredential(lock, credential)
      if (correct) {
        resetAttempts(lock.id)
        resetLadderProgress(lock.id)
        markUnlocked(lock.id, lock.duration)
        recordHistory({ lockId: lock.id, label, action: "unlocked" })
        onUnlocked()
        onClose()
        return
      }
      recordFailure(lock.id)
      recordHistory({ lockId: lock.id, label, action: "failedAttempt" })
      setError(t("wrongCredential"))
      setCredential("")
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AnchoredPanel open={open} onClose={onClose} anchorEl={anchorEl} label={`${t("unlockTitleUnlock")} ${label}`}>
      <div className="flex items-center gap-1.5 text-[15px] font-semibold">
        <Txt ns="locks" k="unlockTitleUnlock" />
        <span aria-hidden="true">“</span>
        <Txt channel="fact" value={label} kind="tag" />
        <span aria-hidden="true">”</span>
      </div>
      <p className="text-[11px] leading-[1.5] text-on-surface-variant">
        <Txt ns="locks" k="toyRecoveryNote" />{" "}
        <Txt channel="fact" value={localDataFolderPath()} kind="path" as="code" className="font-mono" />
      </p>

      {waiting && showLadder ? (
        <UnlockLadder
          lockId={lock.id}
          schoolOn={voice.schoolOn}
          lockedUntilMs={getAttemptState(lock.id).lockedUntil}
          onCleared={() => {
            recordHistory({ lockId: lock.id, label, action: "ladderCleared" })
            setShowLadder(false)
            forceTick((n) => n + 1)
          }}
        />
      ) : waiting ? (
        <div className="flex flex-col gap-2">
          <p className="text-[12.5px] text-on-surface-variant">
            <Txt ns="locks" k="waitingBody" />
          </p>
          <div className="flex items-baseline gap-1.5 text-[13px]">
            <Txt ns="locks" k="clockRemaining" />
            <Txt channel="fact" value={formatRemaining(remainingWaitMs(lock.id))} kind="timestamp" as="span" className="font-mono font-semibold" />
          </div>
          {ladderSkipsRemaining() > 0 ? (
            <Button variant="tonal" size="sm" onClick={() => setShowLadder(true)}>
              <Txt ns="locks" k="playInstead" />
            </Button>
          ) : (
            <p className="text-[11.5px] text-on-surface-variant">
              <Txt ns="locks" k="ladderBudgetExhausted" />
            </p>
          )}
        </div>
      ) : (
        <>
          <TextField
            label={lock.method === "password" ? t("passwordFieldLabel") : t("codeFieldLabel")}
            type={lock.method === "password" ? "password" : "text"}
            value={credential}
            onChange={setCredential}
          />
          {error ? <p className="text-[12px] text-error">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="text" size="sm" onClick={onClose}>
              <Txt ns="locks" k="cancelButton" />
            </Button>
            <Button variant="filled" size="sm" onClick={handleUnlock} loading={submitting}>
              <Txt ns="locks" k="unlockButton" />
            </Button>
          </div>
        </>
      )}
    </AnchoredPanel>
  )
}
