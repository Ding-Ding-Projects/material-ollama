// The toy element-lock list itself: create/find/remove a lock, verify a
// submitted credential against it, and track the per-lock "currently
// unlocked" and "currently waiting out a failed-attempt lockout" state.
//
// Placeholder-until-a-sibling-Go-lane persistence, same as
// ../uh/provider.tsx's PREFERENCES_STORAGE_KEY -- see locksCrypto.ts's
// header for why that is an honest choice for a feature whose own contract
// already says "not a security boundary, recover by deleting local data".
//
// Three independent localStorage/sessionStorage tables, each with its own
// change event so a consumer can subscribe to only what it needs:
//   - the lock list itself (durable -- survives a relaunch, like a real
//     lock would)
//   - "currently unlocked until" per lock (session-scoped: sessionStorage,
//     which Electron clears when the renderer's session ends, i.e.
//     approximately "until the app closes" for this single-window app --
//     see unlockDuration below for how each duration choice maps onto it)
//   - "currently failing/waiting" per lock (also session-scoped -- a fresh
//     app launch is a fair place for a fresh set of attempts, and nothing
//     about a toy lock's contract requires that state to survive a
//     restart)

import { hashPassword, randomHex, verifyPassword, verifyTotp } from "./locksCrypto"

export type LockMethod = "password" | "totp"

/**
 * How long a successful unlock stays in effect, matching the shared "Unlock
 * duration is the user's choice" contract's three options exactly:
 * this-surface-only, a set number of minutes, or until the app closes.
 * "surface" is intentionally NOT represented in session storage at all --
 * see `Lockable.tsx`, which keeps it as component-local React state that
 * resets the moment the locked element unmounts, because that is what
 * "this surface only" means.
 */
export type LockDurationChoice =
  | { readonly kind: "surface" }
  | { readonly kind: "minutes"; readonly minutes: number }
  | { readonly kind: "untilClose" }

export interface LockRecord {
  readonly id: string
  /** Human-readable name of the locked element, shown in the wizard, the
   * unlock prompt, and the enumerable lock list -- never the credential. */
  readonly label: string
  readonly method: LockMethod
  readonly duration: LockDurationChoice
  readonly createdAt: number
  // Password method fields (mutually exclusive with the TOTP field below --
  // enforced by createLock, never trusted from storage alone since this is
  // a placeholder table a corrupted/hand-edited localStorage could violate).
  readonly passwordSalt?: string
  readonly passwordHash?: string
  // TOTP method field -- see locksCrypto.ts's header for why the secret
  // itself (not just a hash) has to live here for a client-only verifier.
  readonly totpSecret?: string
}

const LOCKS_STORAGE_KEY = "material-ollama:toy-locks"
const LOCKS_CHANGED_EVENT = "material-ollama:toy-locks-changed"

const SESSION_UNLOCK_KEY = "material-ollama:toy-locks-session-unlock"
const ATTEMPTS_KEY = "material-ollama:toy-locks-attempts"

/** Fixed batch of attempts granted per lock, whether that grant comes from
 * ordinary time passing or from clearing the wait through the unlock
 * ladder -- see locksLadder.ts's `clearLockoutByLadder`, which reuses this
 * exact constant rather than inventing a second number, so "the ladder
 * returns exactly the same number [of attempts] and not one more" is true
 * by construction instead of by convention. */
export const LOCKS_MAX_ATTEMPTS = 3

const LOCKS_INITIAL_BACKOFF_MS = 15_000
const LOCKS_MAX_BACKOFF_MS = 5 * 60_000

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

function readJSON<T>(storage: Storage, key: string, fallback: T): T {
  try {
    const raw = storage.getItem(key)
    if (!raw) return fallback
    const parsed: unknown = JSON.parse(raw)
    return (parsed as T) ?? fallback
  } catch {
    return fallback
  }
}

function writeJSON(storage: Storage, key: string, value: unknown): void {
  try {
    storage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can legitimately refuse (quota, private mode, disabled) --
    // the toy lock feature degrades to "nothing persists this session"
    // rather than throwing through a caller that only wanted to lock a
    // button.
  }
}

function notifyLocksChanged(): void {
  if (!hasWindow()) return
  window.dispatchEvent(new Event(LOCKS_CHANGED_EVENT))
}

export { LOCKS_CHANGED_EVENT }

// --- Lock list CRUD ----------------------------------------------------

export function listLocks(): readonly LockRecord[] {
  if (!hasWindow()) return []
  return readJSON<LockRecord[]>(window.localStorage, LOCKS_STORAGE_KEY, [])
}

function saveLocks(locks: readonly LockRecord[]): void {
  if (!hasWindow()) return
  writeJSON(window.localStorage, LOCKS_STORAGE_KEY, locks)
  notifyLocksChanged()
}

export function findLock(id: string): LockRecord | undefined {
  return listLocks().find((lock) => lock.id === id)
}

export function isLocked(id: string): boolean {
  return findLock(id) !== undefined
}

export interface CreateLockInput {
  readonly id: string
  readonly label: string
  readonly duration: LockDurationChoice
  readonly method: LockMethod
  /** Required when method is "password". */
  readonly password?: string
  /** Required when method is "totp" -- pass a freshly generated secret
   * (see locksCrypto.ts's `generateTotpSecret`) rather than letting the
   * store invent one silently, so the wizard can show/confirm it first. */
  readonly totpSecret?: string
}

/**
 * Creates (or replaces) the lock for `id`. Each lock gets its OWN
 * independently generated salt/hash or secret -- there is no shared or
 * master credential anywhere in this module, matching "each lock carries
 * its own credential" exactly: nothing here reads or writes any other
 * lock's record.
 */
export async function createLock(input: CreateLockInput): Promise<LockRecord> {
  const base = {
    id: input.id,
    label: input.label,
    duration: input.duration,
    createdAt: Date.now(),
  }

  let record: LockRecord
  if (input.method === "password") {
    if (!input.password) throw new Error("createLock: password method requires a password")
    const passwordSalt = randomHex(16)
    const passwordHash = await hashPassword(input.password, passwordSalt)
    record = { ...base, method: "password", passwordSalt, passwordHash }
  } else {
    if (!input.totpSecret) throw new Error("createLock: totp method requires a secret")
    record = { ...base, method: "totp", totpSecret: input.totpSecret }
  }

  const withoutExisting = listLocks().filter((lock) => lock.id !== input.id)
  saveLocks([...withoutExisting, record])
  resetAttempts(input.id)
  clearUnlocked(input.id)
  return record
}

export function removeLock(id: string): void {
  const remaining = listLocks().filter((lock) => lock.id !== id)
  saveLocks(remaining)
  clearUnlocked(id)
  resetAttempts(id)
}

export function removeLocks(ids: readonly string[]): void {
  const idSet = new Set(ids)
  const remaining = listLocks().filter((lock) => !idSet.has(lock.id))
  saveLocks(remaining)
  for (const id of ids) {
    clearUnlocked(id)
    resetAttempts(id)
  }
}

export async function verifyCredential(lock: LockRecord, submitted: string): Promise<boolean> {
  if (lock.method === "password") {
    if (!lock.passwordSalt || !lock.passwordHash) return false
    return verifyPassword(submitted, lock.passwordSalt, lock.passwordHash)
  }
  if (!lock.totpSecret) return false
  return verifyTotp(submitted, lock.totpSecret)
}

// --- Session-scoped "currently unlocked" state --------------------------

type SessionUnlockMap = Record<string, number>

function readSessionUnlocks(): SessionUnlockMap {
  if (!hasWindow()) return {}
  return readJSON<SessionUnlockMap>(window.sessionStorage, SESSION_UNLOCK_KEY, {})
}

function saveSessionUnlocks(map: SessionUnlockMap): void {
  if (!hasWindow()) return
  writeJSON(window.sessionStorage, SESSION_UNLOCK_KEY, map)
  notifyLocksChanged()
}

/** Sentinel `unlockedUntil` for "until the app closes" -- sessionStorage
 * itself is what actually bounds this to the app's lifetime; the sentinel
 * just needs to compare greater than any real `Date.now()`. */
const UNTIL_CLOSE_SENTINEL = Number.MAX_SAFE_INTEGER

/** Applies a lock's duration choice after a credential check succeeds.
 * "surface" duration is handled entirely by the caller (`Lockable.tsx`)
 * as component-local state and must NOT reach this function -- see that
 * component for why "this surface only" cannot be a persisted value. */
export function markUnlocked(id: string, duration: LockDurationChoice, now: number = Date.now()): void {
  if (duration.kind === "surface") return
  const until = duration.kind === "untilClose" ? UNTIL_CLOSE_SENTINEL : now + duration.minutes * 60_000
  const map = readSessionUnlocks()
  saveSessionUnlocks({ ...map, [id]: until })
}

export function isSessionUnlocked(id: string, now: number = Date.now()): boolean {
  const until = readSessionUnlocks()[id]
  return typeof until === "number" && now < until
}

export function clearUnlocked(id: string): void {
  const map = readSessionUnlocks()
  if (!(id in map)) return
  const rest = { ...map }
  delete rest[id]
  saveSessionUnlocks(rest)
}

// --- Session-scoped failed-attempt lockout -------------------------------

export interface LockAttemptState {
  readonly attemptsRemaining: number
  /** Epoch ms until which new attempts are refused; 0 means not waiting. */
  readonly lockedUntil: number
  /** How many times this lock has fully exhausted its attempts and
   * entered a wait -- drives the exponential backoff. Clearing a wait
   * (by time OR by the ladder) never resets this: "the underlying lockout
   * still lengthens with each consecutive lockout... and clearing the
   * ladder leaves that escalation untouched." */
  readonly backoffIndex: number
}

const DEFAULT_ATTEMPT_STATE: LockAttemptState = {
  attemptsRemaining: LOCKS_MAX_ATTEMPTS,
  lockedUntil: 0,
  backoffIndex: 0,
}

type AttemptsMap = Record<string, LockAttemptState>

function readAttemptsMap(): AttemptsMap {
  if (!hasWindow()) return {}
  return readJSON<AttemptsMap>(window.sessionStorage, ATTEMPTS_KEY, {})
}

function saveAttemptsMap(map: AttemptsMap): void {
  if (!hasWindow()) return
  writeJSON(window.sessionStorage, ATTEMPTS_KEY, map)
  notifyLocksChanged()
}

export function getAttemptState(id: string): LockAttemptState {
  return readAttemptsMap()[id] ?? DEFAULT_ATTEMPT_STATE
}

function backoffForIndex(index: number): number {
  const backoff = LOCKS_INITIAL_BACKOFF_MS * 2 ** Math.max(0, index - 1)
  return Math.min(backoff, LOCKS_MAX_BACKOFF_MS)
}

/** Whether `id` currently refuses new unlock attempts, live-recomputed
 * against `now` rather than trusting a stale stored `lockedUntil` -- once
 * the wait has genuinely elapsed the lock is simply usable again, with no
 * extra step required (matching ordinary rate-limit semantics, and
 * matching app/ui/uh.go's own `unlockLimiter.locked()` for the School PIN,
 * which this mirrors). */
export function isWaiting(id: string, now: number = Date.now()): boolean {
  return getAttemptState(id).lockedUntil > now
}

export function remainingWaitMs(id: string, now: number = Date.now()): number {
  return Math.max(0, getAttemptState(id).lockedUntil - now)
}

/** Records one failed unlock attempt. Once attempts reach zero, a wait
 * begins (exponentially longer each time this lock has entered one), and
 * `attemptsRemaining` is set back to `LOCKS_MAX_ATTEMPTS` for AFTER that
 * wait ends -- assignment, never addition, so there is no arithmetic path
 * by which failing repeatedly could ever grant more than the fixed batch. */
export function recordFailure(id: string, now: number = Date.now()): LockAttemptState {
  const map = readAttemptsMap()
  const current = map[id] ?? DEFAULT_ATTEMPT_STATE
  const attemptsRemaining = Math.max(0, current.attemptsRemaining - 1)

  let next: LockAttemptState
  if (attemptsRemaining > 0) {
    next = { ...current, attemptsRemaining }
  } else {
    const backoffIndex = current.backoffIndex + 1
    next = {
      attemptsRemaining: LOCKS_MAX_ATTEMPTS,
      lockedUntil: now + backoffForIndex(backoffIndex),
      backoffIndex,
    }
  }

  saveAttemptsMap({ ...map, [id]: next })
  return next
}

/** A correct credential clears everything about the lockout state --
 * unlike a ladder-cleared wait, `backoffIndex` resets too, because a real
 * successful unlock is not the same event as "the wait timed out". */
export function resetAttempts(id: string): void {
  const map = readAttemptsMap()
  if (!(id in map)) return
  const rest = { ...map }
  delete rest[id]
  saveAttemptsMap(rest)
}

/**
 * Clears an in-progress wait WITHOUT touching `backoffIndex` and WITHOUT
 * granting anything beyond the fixed `LOCKS_MAX_ATTEMPTS` batch -- used
 * only by locksLadder.ts's `clearLockoutByLadder`, never called directly
 * from UI. Exported so the ladder module (a sibling `uh/locks*` file, not
 * this one) can compose it without reaching into this module's private
 * storage shape.
 */
export function clearWaitOnly(id: string): void {
  const map = readAttemptsMap()
  const current = map[id] ?? DEFAULT_ATTEMPT_STATE
  if (current.lockedUntil === 0) return
  saveAttemptsMap({
    ...map,
    [id]: { attemptsRemaining: LOCKS_MAX_ATTEMPTS, lockedUntil: 0, backoffIndex: current.backoffIndex },
  })
}

// --- Search --------------------------------------------------------------

export interface LockSearchOptions {
  readonly regex?: boolean
  readonly flags?: string
}

/**
 * Plain-text-by-default search over a lock's label and id, with an
 * explicit regex opt-in -- the same default-off contract every search
 * field in this app follows. An invalid pattern returns no matches rather
 * than throwing, so a mid-typed regex never crashes the list.
 */
export function searchLocks(
  locks: readonly LockRecord[],
  query: string,
  options: LockSearchOptions = {},
): readonly LockRecord[] {
  if (!query) return locks
  if (options.regex) {
    let pattern: RegExp
    try {
      pattern = new RegExp(query, options.flags ?? "i")
    } catch {
      return []
    }
    return locks.filter((lock) => pattern.test(lock.label) || pattern.test(lock.id))
  }
  const needle = query.toLowerCase()
  return locks.filter(
    (lock) => lock.label.toLowerCase().includes(needle) || lock.id.toLowerCase().includes(needle),
  )
}
