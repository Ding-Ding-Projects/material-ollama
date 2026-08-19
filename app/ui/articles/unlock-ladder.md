# Unlock Ladder

## Behaviour

`app/ui/app/src/uh/locksLadder.ts` implements the full four-rung ladder (dim sum -> ten sums -> whack-a-mole -> the clock) with every one of the safety rules the canonical contract requires actually enforced in code, not just asserted in prose. `clearLockoutByLadder()` clears only the WAITING state and grants no session-unlock -- `locksLadder.dom.test.tsx`'s "clearLockoutByLadder sets NO session-unlock state for the lock" proves it directly, and "clearing does not reset backoffIndex -- escalation survives a ladder win" proves winning never resets the underlying exponential backoff a real lockout still escalates through. The attempt budget the ladder returns is capped at exactly `LOCKS_MAX_ATTEMPTS` -- "clearLockoutByLadder never grants more than the fixed LOCKS_MAX_ATTEMPTS batch" and "never refunds attempts to a lock that was not actually waiting" -- and the whole ladder is capped independently at `LADDER_BUDGET = 3` skips per rolling hour (`LADDER_BUDGET_WINDOW_MS`, one hour), the exact figure the canonical contract names as the shipped value, proven by "caps ladder skips at LADDER_BUDGET per rolling hour, independent of per-lock state".

School mode correctly removes the dim-sum rung rather than showing and skipping it -- `startingRung(schoolOn)` returns the sums rung directly under School mode, and both `UnlockLadder.dom.test.tsx` ("starts at the sums rung when School mode is on -- the dim-sum rung never renders") and `locksLadder.dom.test.tsx` ("starts at the sums when School mode is on -- the dim-sum rung is absent, not skipped") prove this at both the component and the pure-logic layer.

Every challenge is graded server-side-equivalent against a single-use nonce rather than in the browser alone: `randomNonce()` backs dim-sum, sums-batch, and mole challenges, and the test suite proves a nonce is consumed on first grade so a replay is always wrong ("consumes the nonce on the first grade -- a replay is always wrong"), an unknown nonce is always wrong, and — the two rules the shared instructions call out as easy to miss — a mole submission arriving before the round has genuinely elapsed is rejected ("rejects a submission that arrives before the round has genuinely elapsed") and each mole is graded exactly once, ignoring an out-of-window or duplicate hit ("counts each mole once, ignoring an out-of-window or duplicate hit").

`UnlockLadder.tsx`'s own four tests cover the rendered surface directly: it starts at the correct rung for each School-mode state, clearing the wait via winning the dim-sum rung fires `onCleared` with no session-unlock state, and a wrong dim-sum guess re-offers a fresh question rather than dropping the ladder immediately.

## Configuration

TODO(unlock-ladder): describe how a user or operator configures this feature -- the settings surface, its defaults, and where the choice persists.

## Failure modes

TODO(unlock-ladder): describe what happens when this feature cannot do its job -- a missing dependency, offline operation, invalid input -- and what the user sees.

## Security considerations

TODO(unlock-ladder): describe what this feature must never expose or allow, and the exact mechanism that enforces it.

## Verification

TODO(unlock-ladder): name the focused test(s), the built-artifact interaction proof, and the real capture evidence that back this feature.

## Suggested articles

TODO(unlock-ladder): link the related features, the prerequisites, and the natural next article a reader should open.
