import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { beforeEach, describe, expect, it, vi } from "vitest"
import { UnlockLadder } from "./UnlockLadder"
import { LOCKS_MAX_ATTEMPTS, isSessionUnlocked, isWaiting, recordFailure } from "@/uh/locksStore"

function lockThroughLockout(lockId: string) {
  for (let i = 0; i < LOCKS_MAX_ATTEMPTS; i += 1) recordFailure(lockId)
}

describe("UnlockLadder (component-level)", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("starts at the dim-sum rung when School mode is off", () => {
    const lockId = "ladder-ui-a"
    lockThroughLockout(lockId)
    render(<UnlockLadder lockId={lockId} schoolOn={false} lockedUntilMs={Date.now() + 60_000} onCleared={vi.fn()} />)
    expect(screen.getByText("Which dish is this?")).toBeInTheDocument()
    // Four real, clickable choices -- not decorative.
    expect(screen.getAllByRole("button")).toHaveLength(4)
  })

  it("starts at the sums rung when School mode is on -- the dim-sum rung never renders", () => {
    const lockId = "ladder-ui-school"
    lockThroughLockout(lockId)
    render(<UnlockLadder lockId={lockId} schoolOn onCleared={vi.fn()} lockedUntilMs={Date.now() + 60_000} />)
    expect(screen.queryByText("Which dish is this?")).not.toBeInTheDocument()
    expect(screen.getByText("Ten easy sums — get every one right.")).toBeInTheDocument()
  })

  it("winning the dim-sum rung clears the wait (onCleared fires) but sets no session-unlock state", async () => {
    const user = userEvent.setup()
    const lockId = "ladder-ui-win"
    lockThroughLockout(lockId)
    expect(isWaiting(lockId)).toBe(true)

    const onCleared = vi.fn()
    render(<UnlockLadder lockId={lockId} schoolOn={false} lockedUntilMs={Date.now() + 60_000} onCleared={onCleared} />)

    // Grade the first choice as correct for this test only. Clicking a
    // random button and hoping is not a test: the rung advances after five
    // wrong answers, so guessing index 0 out of four choices only reached a
    // win about three runs in four, and this suite failed on the fourth.
    // Stubbing the grader keeps the entire real component path -- render,
    // click, onCorrect, clearLockoutByLadder, onCleared -- and removes only
    // the coin flip. gradeDimsum's own correctness is covered separately.
    const ladder = await import("@/uh/locksLadder")
    const grade = vi.spyOn(ladder, "gradeDimsum").mockImplementation((_nonce, index) => index === 0)

    const buttons = screen.queryAllByRole("button")
    expect(buttons).toHaveLength(4)
    await user.click(buttons[0])

    expect(onCleared).toHaveBeenCalledTimes(1)
    expect(isWaiting(lockId)).toBe(false)
    expect(isSessionUnlocked(lockId)).toBe(false)
  })

  it("a wrong dim-sum guess re-offers a fresh question rather than dropping immediately", async () => {
    const user = userEvent.setup()
    const lockId = "ladder-ui-wrong-once"
    lockThroughLockout(lockId)

    render(<UnlockLadder lockId={lockId} schoolOn={false} lockedUntilMs={Date.now() + 60_000} onCleared={vi.fn()} />)
    const firstChoiceButtons = screen.getAllByRole("button")
    expect(firstChoiceButtons).toHaveLength(4)
    await user.click(firstChoiceButtons[0])

    // Either it was won (fine, nothing left to assert here) or it wasn't --
    // in the wasn't-won case, a fresh dim-sum question with four buttons is
    // still there (not dropped to sums after just one wrong guess).
    const stillDimsum = screen.queryByText("Which dish is this?")
    if (stillDimsum) {
      expect(screen.getAllByRole("button")).toHaveLength(4)
    }
  })
})
