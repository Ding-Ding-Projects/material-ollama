import { beforeEach, describe, expect, it } from "vitest"
import {
  LADDER_BUDGET,
  LOCKS_MAX_ATTEMPTS,
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
  startingRung,
} from "./locksLadder"
import {
  getAttemptState,
  isSessionUnlocked,
  isWaiting,
  recordFailure,
} from "./locksStore"

function lockThroughLockout(lockId: string): void {
  for (let i = 0; i < LOCKS_MAX_ATTEMPTS; i += 1) {
    recordFailure(lockId)
  }
}

describe("locksLadder: winning clears the wait, never the credential, never refunds", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("clearLockoutByLadder sets NO session-unlock state for the lock", () => {
    const lockId = "lock-a"
    lockThroughLockout(lockId)
    expect(isWaiting(lockId)).toBe(true)

    const cleared = clearLockoutByLadder(lockId)

    expect(cleared).toBe(true)
    // The wait is gone...
    expect(isWaiting(lockId)).toBe(false)
    // ...but the element is still just as locked as before: nothing here
    // ever calls markUnlocked, so there is no session-unlock entry at all.
    expect(isSessionUnlocked(lockId)).toBe(false)
  })

  it("clearLockoutByLadder never grants more than the fixed LOCKS_MAX_ATTEMPTS batch", () => {
    const lockId = "lock-b"
    lockThroughLockout(lockId)

    clearLockoutByLadder(lockId)
    const afterFirstClear = getAttemptState(lockId)
    expect(afterFirstClear.attemptsRemaining).toBe(LOCKS_MAX_ATTEMPTS)

    // Lock it out again and clear it again (still inside the rolling-hour
    // budget) -- the second win must not stack on top of the first. The
    // assignment-not-addition contract means there is no number this could
    // grow to beyond the one fixed batch.
    lockThroughLockout(lockId)
    clearLockoutByLadder(lockId)
    const afterSecondClear = getAttemptState(lockId)
    expect(afterSecondClear.attemptsRemaining).toBe(LOCKS_MAX_ATTEMPTS)
    expect(afterSecondClear.attemptsRemaining).not.toBeGreaterThan(LOCKS_MAX_ATTEMPTS)
  })

  it("never refunds attempts to a lock that was not actually waiting", () => {
    const lockId = "lock-c"
    // Never locked out at all -- nothing to clear.
    const cleared = clearLockoutByLadder(lockId)
    expect(cleared).toBe(false)
    expect(getAttemptState(lockId).attemptsRemaining).toBe(LOCKS_MAX_ATTEMPTS)
  })

  it("clearing does not reset backoffIndex -- escalation survives a ladder win", () => {
    const lockId = "lock-d"
    lockThroughLockout(lockId)
    expect(getAttemptState(lockId).backoffIndex).toBe(1)

    clearLockoutByLadder(lockId)
    expect(getAttemptState(lockId).backoffIndex).toBe(1)

    lockThroughLockout(lockId)
    expect(getAttemptState(lockId).backoffIndex).toBe(2)
  })

  it("caps ladder skips at LADDER_BUDGET per rolling hour, independent of per-lock state", () => {
    expect(ladderSkipsRemaining()).toBe(LADDER_BUDGET)

    for (let i = 0; i < LADDER_BUDGET; i += 1) {
      const lockId = `lock-budget-${i}`
      lockThroughLockout(lockId)
      expect(clearLockoutByLadder(lockId)).toBe(true)
    }
    expect(ladderSkipsRemaining()).toBe(0)

    // One more lock, still genuinely waiting, but the budget is spent --
    // the clock is the only way through now.
    const overBudgetLock = "lock-over-budget"
    lockThroughLockout(overBudgetLock)
    expect(isWaiting(overBudgetLock)).toBe(true)
    expect(clearLockoutByLadder(overBudgetLock)).toBe(false)
    expect(isWaiting(overBudgetLock)).toBe(true)
  })
})

describe("locksLadder: starting rung", () => {
  it("starts at dim sum when School mode is off", () => {
    expect(startingRung(false)).toBe("dimsum")
  })

  it("starts at the sums when School mode is on -- the dim-sum rung is absent, not skipped", () => {
    expect(startingRung(true)).toBe("sums")
  })

  it("getLadderProgress uses the school-aware starting rung for a fresh lockout cycle", () => {
    const lockedUntil = Date.now() + 30_000
    expect(getLadderProgress("lock-school-off", false, lockedUntil).rung).toBe("dimsum")
    expect(getLadderProgress("lock-school-on", true, lockedUntil).rung).toBe("sums")
  })
})

describe("locksLadder: rung progression", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("stays on dimsum for four wrong guesses, drops to sums on the fifth", () => {
    const lockId = "lock-progress"
    const lockedUntil = Date.now() + 30_000
    let progress = getLadderProgress(lockId, false, lockedUntil)
    expect(progress.rung).toBe("dimsum")

    for (let i = 1; i <= 4; i += 1) {
      progress = recordDimsumWrong(lockId, false, lockedUntil)
      expect(progress.rung).toBe("dimsum")
      expect(progress.wrongDishCount).toBe(i)
    }

    progress = recordDimsumWrong(lockId, false, lockedUntil)
    expect(progress.rung).toBe("sums")
    expect(progress.wrongDishCount).toBe(5)
  })

  it("drops sums -> mole -> clock on each subsequent failure", () => {
    const lockId = "lock-progress-2"
    const lockedUntil = Date.now() + 30_000
    expect(recordSumsWrong(lockId, false, lockedUntil).rung).toBe("mole")
    expect(recordMoleFailed(lockId, false, lockedUntil).rung).toBe("clock")
  })

  it("a new lockout cycle (different lockedUntil) resets progress from scratch", () => {
    const lockId = "lock-progress-3"
    const firstCycle = Date.now() + 30_000
    recordDimsumWrong(lockId, false, firstCycle)
    recordDimsumWrong(lockId, false, firstCycle)
    expect(getLadderProgress(lockId, false, firstCycle).wrongDishCount).toBe(2)

    const secondCycle = firstCycle + 60_000
    expect(getLadderProgress(lockId, false, secondCycle)).toEqual({ rung: "dimsum", wrongDishCount: 0 })
  })
})

describe("locksLadder: dim sum grading is single-use", () => {
  it("a challenge offers four choices", () => {
    const challenge = generateDimsumChallenge()
    expect(challenge.choices).toHaveLength(4)
    expect(new Set(challenge.choices).size).toBe(4)
  })

  it("consumes the nonce on the first grade -- a replay is always wrong", () => {
    const challenge = generateDimsumChallenge()
    gradeDimsum(challenge.nonce, 0)
    // Whatever the first call returned, the nonce is gone now: replaying
    // it (same index or the actually-correct one) can never succeed.
    for (let index = 0; index < challenge.choices.length; index += 1) {
      expect(gradeDimsum(challenge.nonce, index)).toBe(false)
    }
  })

  it("an unknown nonce is always wrong", () => {
    expect(gradeDimsum("not-a-real-nonce", 0)).toBe(false)
  })

  it("over many independent challenges, both a right and a wrong guess actually occur", () => {
    // Grading is genuinely tied to a random per-challenge correct index,
    // not hard-coded true/false -- over enough trials, guessing index 0
    // must land on both outcomes (chance of all-same across 60 trials at
    // 1-in-4 odds is astronomically small).
    const outcomes = new Set<boolean>()
    for (let i = 0; i < 60; i += 1) {
      const challenge = generateDimsumChallenge()
      outcomes.add(gradeDimsum(challenge.nonce, 0))
    }
    expect(outcomes.has(true)).toBe(true)
    expect(outcomes.has(false)).toBe(true)
  })
})

describe("locksLadder: sums grading requires all ten correct, single-use", () => {
  it("rejects a wrong batch and consumes the nonce", () => {
    const challenge = generateSumsChallenge()
    expect(challenge.problems).toHaveLength(10)
    const wrongAnswers = challenge.problems.map(() => -999)
    expect(gradeSums(challenge.nonce, wrongAnswers)).toBe(false)
    // Replaying even the right answers now fails -- the nonce is gone.
    const correctAnswers = challenge.problems.map((p) => (p.op === "+" ? p.a + p.b : p.a - p.b))
    expect(gradeSums(challenge.nonce, correctAnswers)).toBe(false)
  })

  it("accepts the exact correct batch on a fresh nonce", () => {
    const challenge = generateSumsChallenge()
    const correctAnswers = challenge.problems.map((p) => (p.op === "+" ? p.a + p.b : p.a - p.b))
    expect(gradeSums(challenge.nonce, correctAnswers)).toBe(true)
  })
})

describe("locksLadder: whack-a-mole grading", () => {
  it("rejects a submission that arrives before the round has genuinely elapsed", () => {
    const startedAt = 1_000_000
    const challenge = generateMoleChallenge(startedAt)
    const hits = challenge.moles
      .slice(0, challenge.targetHits)
      .map((mole) => ({ moleId: mole.moleId, atMs: mole.atMs }))
    // Grading one millisecond before the round's own duration has elapsed.
    const tooEarly = startedAt + challenge.durationMs - 1
    expect(gradeMole(challenge.nonce, hits, tooEarly)).toBe(false)
  })

  it("counts each mole once, ignoring an out-of-window or duplicate hit", () => {
    const startedAt = 2_000_000
    const challenge = generateMoleChallenge(startedAt)
    const [first, second, third] = challenge.moles
    const gradedAt = startedAt + challenge.durationMs
    const hits = [
      { moleId: first.moleId, atMs: first.atMs },
      { moleId: first.moleId, atMs: first.atMs }, // duplicate hit on the same mole
      { moleId: second.moleId, atMs: second.atMs + challenge.visibleMs + 500 }, // outside its window
      { moleId: third.moleId, atMs: third.atMs },
      { moleId: "not-a-real-mole", atMs: 0 },
    ]
    // Only `first` and `third` count -> below targetHits (3).
    expect(gradeMole(challenge.nonce, hits, gradedAt)).toBe(false)
  })

  it("passes once enough distinct in-window hits are submitted after the round ends", () => {
    const startedAt = 3_000_000
    const challenge = generateMoleChallenge(startedAt)
    const gradedAt = startedAt + challenge.durationMs
    const hits = challenge.moles
      .slice(0, challenge.targetHits)
      .map((mole) => ({ moleId: mole.moleId, atMs: mole.atMs }))
    expect(gradeMole(challenge.nonce, hits, gradedAt)).toBe(true)
  })
})
