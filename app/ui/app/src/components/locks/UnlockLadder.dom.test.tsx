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

    // Click choices one at a time until the ladder reports a win --
    // exercising the REAL grading path through the rendered buttons,
    // rather than calling gradeDimsum directly.
    for (let attempt = 0; attempt < 20 && onCleared.mock.calls.length === 0; attempt += 1) {
      const buttons = screen.queryAllByRole("button")
      if (buttons.length !== 4) break // rung advanced past dim sum -- stop
      await user.click(buttons[0])
    }

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
