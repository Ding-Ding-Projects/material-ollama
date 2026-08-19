import { beforeEach, describe, expect, it } from "vitest"
import { generateTotpSecret, totpCodeAt } from "./locksCrypto"
import {
  LOCKS_MAX_ATTEMPTS,
  clearUnlocked,
  createLock,
  findLock,
  isSessionUnlocked,
  isWaiting,
  listLocks,
  markUnlocked,
  recordFailure,
  removeLock,
  removeLocks,
  resetAttempts,
  searchLocks,
  verifyCredential,
} from "./locksStore"

describe("locksStore: lock CRUD and independent credentials", () => {
  beforeEach(() => {
    window.localStorage.clear()
    window.sessionStorage.clear()
  })

  it("creates a password lock and verifies only the right password", async () => {
    const lock = await createLock({
      id: "settings.dangerZone",
      label: "Danger zone",
      method: "password",
      password: "sw0rdfish",
      duration: { kind: "surface" },
    })

    expect(findLock("settings.dangerZone")).toEqual(lock)
    expect(await verifyCredential(lock, "sw0rdfish")).toBe(true)
    expect(await verifyCredential(lock, "wrong")).toBe(false)
    // The plaintext never round-trips back out of the record.
    expect(JSON.stringify(lock)).not.toContain("sw0rdfish")
  })

  it("creates a TOTP lock and verifies a real code from its own secret", async () => {
    const secret = generateTotpSecret()
    const lock = await createLock({
      id: "chat.exportButton",
      label: "Export chat",
      method: "totp",
      totpSecret: secret,
      duration: { kind: "minutes", minutes: 10 },
    })

    const code = await totpCodeAt(secret, Date.now())
    expect(await verifyCredential(lock, code)).toBe(true)
    expect(await verifyCredential(lock, "000000")).toBe(false)
  })

  it("two locks never share a credential -- unlocking one never unlocks the other", async () => {
    const lockA = await createLock({
      id: "lock-a",
      label: "A",
      method: "password",
      password: "password-a",
      duration: { kind: "surface" },
    })
    const lockB = await createLock({
      id: "lock-b",
      label: "B",
      method: "password",
      password: "password-b",
      duration: { kind: "surface" },
    })

    expect(await verifyCredential(lockA, "password-b")).toBe(false)
    expect(await verifyCredential(lockB, "password-a")).toBe(false)
    expect(lockA.passwordSalt).not.toBe(lockB.passwordSalt)
    expect(lockA.passwordHash).not.toBe(lockB.passwordHash)
  })

  it("removeLock clears the record and its session state", async () => {
    await createLock({
      id: "lock-remove",
      label: "Removable",
      method: "password",
      password: "p",
      duration: { kind: "minutes", minutes: 5 },
    })
    markUnlocked("lock-remove", { kind: "minutes", minutes: 5 })
    expect(isSessionUnlocked("lock-remove")).toBe(true)

    removeLock("lock-remove")
    expect(findLock("lock-remove")).toBeUndefined()
    expect(isSessionUnlocked("lock-remove")).toBe(false)
  })

  it("removeLocks bulk-removes without touching an id not in the list", async () => {
    await createLock({ id: "bulk-1", label: "One", method: "password", password: "p", duration: { kind: "surface" } })
    await createLock({ id: "bulk-2", label: "Two", method: "password", password: "p", duration: { kind: "surface" } })
    await createLock({ id: "bulk-3", label: "Three", method: "password", password: "p", duration: { kind: "surface" } })

    removeLocks(["bulk-1", "bulk-2"])

    expect(findLock("bulk-1")).toBeUndefined()
    expect(findLock("bulk-2")).toBeUndefined()
    expect(findLock("bulk-3")).toBeDefined()
  })

  it("listLocks reflects every created lock", async () => {
    await createLock({ id: "list-1", label: "One", method: "password", password: "p", duration: { kind: "surface" } })
    await createLock({ id: "list-2", label: "Two", method: "password", password: "p", duration: { kind: "surface" } })
    const ids = listLocks().map((lock) => lock.id)
    expect(ids).toEqual(expect.arrayContaining(["list-1", "list-2"]))
  })
})

describe("locksStore: session unlock duration semantics", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("'surface' duration never touches session storage -- caller must handle it locally", () => {
    markUnlocked("surface-lock", { kind: "surface" })
    expect(isSessionUnlocked("surface-lock")).toBe(false)
  })

  it("'minutes' duration expires after the chosen window", () => {
    const now = 1_000_000
    markUnlocked("minutes-lock", { kind: "minutes", minutes: 10 }, now)
    expect(isSessionUnlocked("minutes-lock", now + 5 * 60_000)).toBe(true)
    expect(isSessionUnlocked("minutes-lock", now + 11 * 60_000)).toBe(false)
  })

  it("'untilClose' duration stays unlocked far into the future", () => {
    const now = 1_000_000
    markUnlocked("until-close-lock", { kind: "untilClose" }, now)
    expect(isSessionUnlocked("until-close-lock", now + 365 * 24 * 60 * 60_000)).toBe(true)
  })

  it("clearUnlocked ends any active session unlock immediately", () => {
    markUnlocked("clear-lock", { kind: "untilClose" })
    expect(isSessionUnlocked("clear-lock")).toBe(true)
    clearUnlocked("clear-lock")
    expect(isSessionUnlocked("clear-lock")).toBe(false)
  })
})

describe("locksStore: failed-attempt lockout", () => {
  beforeEach(() => {
    window.sessionStorage.clear()
  })

  it("locks out after LOCKS_MAX_ATTEMPTS failures and recovers after the wait elapses", () => {
    const lockId = "attempts-lock"
    const now = 2_000_000
    let state = recordFailure(lockId, now)
    for (let i = 1; i < LOCKS_MAX_ATTEMPTS; i += 1) {
      state = recordFailure(lockId, now)
    }
    expect(isWaiting(lockId, now)).toBe(true)
    expect(state.lockedUntil).toBeGreaterThan(now)

    // Time genuinely passes past the wait -- usable again with no extra step.
    expect(isWaiting(lockId, state.lockedUntil + 1)).toBe(false)
  })

  it("a correct unlock (resetAttempts) clears everything, including backoffIndex", () => {
    const lockId = "reset-lock"
    for (let i = 0; i < LOCKS_MAX_ATTEMPTS; i += 1) recordFailure(lockId)
    resetAttempts(lockId)
    const state = recordFailure(lockId) // one fresh failure after a clean reset
    expect(state.attemptsRemaining).toBe(LOCKS_MAX_ATTEMPTS - 1)
    expect(state.lockedUntil).toBe(0)
  })
})

describe("locksStore: search", () => {
  const locks = [
    { id: "settings.dangerZone", label: "Danger zone", method: "password" as const, duration: { kind: "surface" as const }, createdAt: 0 },
    { id: "chat.exportButton", label: "Export chat", method: "totp" as const, duration: { kind: "surface" as const }, createdAt: 0 },
  ]

  it("plain-text search matches label or id, case-insensitively", () => {
    expect(searchLocks(locks, "danger").map((l) => l.id)).toEqual(["settings.dangerZone"])
    expect(searchLocks(locks, "EXPORT").map((l) => l.id)).toEqual(["chat.exportButton"])
    expect(searchLocks(locks, "")).toEqual(locks)
  })

  it("regex search is an explicit opt-in and an invalid pattern matches nothing", () => {
    expect(searchLocks(locks, "^chat\\.", { regex: true }).map((l) => l.id)).toEqual(["chat.exportButton"])
    expect(searchLocks(locks, "[", { regex: true })).toEqual([])
  })
})
