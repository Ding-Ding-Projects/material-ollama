import { useEffect, useRef, useState } from "react"
import { Button } from "@/components/md3"
import { Txt, useT } from "@/uh"
import "./locks.dict"
import {
  clearLockoutByLadder,
  gradeDimsum,
  gradeMole,
  gradeSums,
  generateDimsumChallenge,
  generateMoleChallenge,
  generateSumsChallenge,
  getLadderProgress,
  ladderSkipsRemaining,
  recordDimsumWrong,
  recordMoleFailed,
  recordSumsWrong,
  type DimsumChallenge,
  type DishKey,
  type MoleChallenge,
  type MoleHit,
  type SumsChallenge,
} from "@/uh/locksLadder"

export interface UnlockLadderProps {
  lockId: string
  schoolOn: boolean
  lockedUntilMs: number
  /** Fired only once `clearLockoutByLadder` genuinely succeeds -- the
   * caller (`UnlockPrompt`) still requires the real credential afterward;
   * this component never claims otherwise in its own copy. */
  onCleared: () => void
}

function formatCountdown(ms: number): string {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${String(seconds).padStart(2, "0")}`
}

/**
 * The four-rung minigame: dim sum -> sums -> whack-a-mole -> the clock.
 * Every rung ultimately calls `clearLockoutByLadder`, which is the single
 * function that decides whether winning actually clears anything (see
 * locksLadder.ts's header for why that boundary lives there and not here).
 * This component never touches session-unlock state directly.
 */
export function UnlockLadder({ lockId, schoolOn, lockedUntilMs, onCleared }: UnlockLadderProps) {
  const [progress, setProgress] = useState(() => getLadderProgress(lockId, schoolOn, lockedUntilMs))
  const [budgetSpent, setBudgetSpent] = useState(false)

  function attemptClear() {
    const cleared = clearLockoutByLadder(lockId)
    if (cleared) {
      onCleared()
    } else {
      setBudgetSpent(true)
    }
  }

  if (budgetSpent || ladderSkipsRemaining() <= 0) {
    return (
      <p className="text-[12.5px] text-on-surface-variant" role="status">
        <Txt ns="locks" k="ladderBudgetExhausted" />
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[11.5px] text-on-surface-variant">
        <Txt ns="locks" k="ladderIntro" />
      </p>
      {progress.rung === "dimsum" ? (
        <DimsumRung
          onWrong={() => setProgress(recordDimsumWrong(lockId, schoolOn, lockedUntilMs))}
          onCorrect={attemptClear}
        />
      ) : progress.rung === "sums" ? (
        <SumsRung
          onWrong={() => setProgress(recordSumsWrong(lockId, schoolOn, lockedUntilMs))}
          onCorrect={attemptClear}
        />
      ) : progress.rung === "mole" ? (
        <MoleRung
          onFail={() => setProgress(recordMoleFailed(lockId, schoolOn, lockedUntilMs))}
          onCorrect={attemptClear}
        />
      ) : (
        <ClockRung lockedUntilMs={lockedUntilMs} />
      )}
    </div>
  )
}

function DimsumRung({ onWrong, onCorrect }: { onWrong: () => void; onCorrect: () => void }) {
  const t = useT("locks")
  const [challenge, setChallenge] = useState<DimsumChallenge>(() => generateDimsumChallenge())
  const [feedback, setFeedback] = useState<string | null>(null)

  function choose(index: number) {
    const correct = gradeDimsum(challenge.nonce, index)
    if (correct) {
      onCorrect()
      return
    }
    setFeedback(t("ladderWrongTryAgain"))
    onWrong()
    setChallenge(generateDimsumChallenge())
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12.5px] font-medium">
        <Txt ns="locks" k="dimsumQuestionLabel" />
      </div>
      <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("dimsumQuestionLabel")}>
        {challenge.choices.map((dishKey: DishKey, index) => (
          <button
            key={`${challenge.nonce}-${dishKey}`}
            type="button"
            onClick={() => choose(index)}
            className="rounded-[10px] border border-outline-variant bg-surface-low px-2.5 py-2 text-[12.5px] hover:bg-surface-high"
          >
            <Txt ns="locks" k={dishKey} />
          </button>
        ))}
      </div>
      {feedback ? (
        <p role="status" className="text-[11.5px] text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
    </div>
  )
}

function SumsRung({ onWrong, onCorrect }: { onWrong: () => void; onCorrect: () => void }) {
  const t = useT("locks")
  const [challenge] = useState<SumsChallenge>(() => generateSumsChallenge())
  const [answers, setAnswers] = useState<string[]>(() => challenge.problems.map(() => ""))
  const [feedback, setFeedback] = useState<string | null>(null)

  function submit() {
    const parsed = answers.map((value) => Number.parseInt(value, 10))
    if (parsed.some((value) => Number.isNaN(value))) {
      setFeedback(t("ladderWrongTryAgain"))
      return
    }
    const correct = gradeSums(challenge.nonce, parsed)
    if (correct) {
      onCorrect()
      return
    }
    setFeedback(t("ladderWrongTryAgain"))
    onWrong()
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12.5px] font-medium">
        <Txt ns="locks" k="sumsQuestionLabel" />
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {challenge.problems.map((problem, index) => {
          const inputId = `sum-${challenge.nonce}-${index}`
          return (
            <label key={inputId} htmlFor={inputId} className="flex items-center gap-1.5 text-[12.5px]">
              <span className="font-mono">
                {problem.a} {problem.op} {problem.b} =
              </span>
              <input
                id={inputId}
                type="number"
                inputMode="numeric"
                value={answers[index]}
                onChange={(event) => {
                  const next = [...answers]
                  next[index] = event.target.value
                  setAnswers(next)
                }}
                className="w-14 rounded-md border border-outline-variant bg-surface-low px-1.5 py-1 text-[12.5px] outline-none"
              />
            </label>
          )
        })}
      </div>
      {feedback ? (
        <p role="status" className="text-[11.5px] text-on-surface-variant">
          {feedback}
        </p>
      ) : null}
      <Button variant="tonal" size="sm" onClick={submit}>
        <Txt ns="locks" k="sumsSubmit" />
      </Button>
    </div>
  )
}

const MOLE_POLL_MS = 100

function MoleRung({ onFail, onCorrect }: { onFail: () => void; onCorrect: () => void }) {
  const t = useT("locks")
  const startedAtRef = useRef(Date.now())
  const [challenge] = useState<MoleChallenge>(() => generateMoleChallenge(startedAtRef.current))
  const [elapsedMs, setElapsedMs] = useState(0)
  const hitsRef = useRef<MoleHit[]>([])
  const [hitCount, setHitCount] = useState(0)
  const [settled, setSettled] = useState(false)

  useEffect(() => {
    const interval = window.setInterval(() => {
      setElapsedMs(Date.now() - startedAtRef.current)
    }, MOLE_POLL_MS)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (settled || elapsedMs < challenge.durationMs) return
    setSettled(true)
    const passed = gradeMole(challenge.nonce, hitsRef.current, Date.now())
    if (passed) onCorrect()
    else onFail()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elapsedMs, settled])

  // `hitCount` bumps just to force this render to happen; the set itself
  // is cheap enough (at most `MOLE_COUNT` entries) to recompute plainly
  // rather than memoize against a ref that eslint's exhaustive-deps check
  // can't see is the thing actually changing.
  void hitCount
  const alreadyHit = new Set(hitsRef.current.map((h) => h.moleId))

  function whack(moleId: string) {
    if (settled || alreadyHit.has(moleId)) return
    hitsRef.current = [...hitsRef.current, { moleId, atMs: Date.now() - startedAtRef.current }]
    setHitCount(hitsRef.current.length)
  }

  const remainingMs = Math.max(0, challenge.durationMs - elapsedMs)

  return (
    <div className="flex flex-col gap-2">
      <div className="text-[12.5px] font-medium">
        <Txt ns="locks" k="moleIntroLabel" />
      </div>
      <div className="flex items-center justify-between text-[11.5px] text-on-surface-variant">
        <span>
          <Txt ns="locks" k="moleTargetLabel" /> <Txt channel="fact" value={challenge.targetHits} kind="count" />
        </span>
        <span>
          <Txt ns="locks" k="moleScoreLabel" /> <Txt channel="fact" value={hitCount} kind="count" />
        </span>
        <Txt channel="fact" value={formatCountdown(remainingMs)} kind="timestamp" as="span" className="font-mono" />
      </div>
      <div className="grid grid-cols-3 gap-1.5" role="group" aria-label={t("moleIntroLabel")}>
        {challenge.moles.map((mole) => {
          const visible =
            elapsedMs >= mole.atMs && elapsedMs <= mole.atMs + challenge.visibleMs && !alreadyHit.has(mole.moleId)
          return (
            <button
              key={mole.moleId}
              type="button"
              disabled={!visible}
              onClick={() => whack(mole.moleId)}
              aria-label={mole.moleId}
              className={
                visible
                  ? "h-11 rounded-[10px] bg-primary text-on-primary"
                  : "h-11 rounded-[10px] border border-outline-variant bg-surface-low opacity-60"
              }
            />
          )
        })}
      </div>
    </div>
  )
}

function ClockRung({ lockedUntilMs }: { lockedUntilMs: number }) {
  const [, setTick] = useState(0)
  useEffect(() => {
    const interval = window.setInterval(() => setTick((n) => n + 1), 500)
    return () => window.clearInterval(interval)
  }, [])
  const remaining = Math.max(0, lockedUntilMs - Date.now())
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[12.5px] text-on-surface-variant" role="status">
        <Txt ns="locks" k="clockOnlyBody" />
      </p>
      <div className="flex items-baseline gap-1.5 text-[13px]">
        <Txt ns="locks" k="clockRemaining" />
        <Txt channel="fact" value={formatCountdown(remaining)} kind="timestamp" as="span" className="font-mono font-semibold" />
      </div>
    </div>
  )
}
