// The unlock ladder: something to do while a failed unlock is waiting out
// its lockout, instead of watching a countdown. Rungs, in order:
// dim sum (four choices) -> ten easy sums after five wrong dishes ->
// whack-a-mole after a wrong sum -> the clock. See this repository's
// shared instructions ("The unlock ladder — play your way out of a
// lockout") for the full contract this module implements; the two
// properties that make it safe rather than merely fun are both enforced
// structurally here, not left as conventions a caller has to remember:
//
//   1. Winning clears the WAIT, never the credential. This module never
//      touches locksStore's session-unlock state (`markUnlocked`) — it
//      only ever calls `clearWaitOnly`, which is a completely separate
//      table. There is no code path here that could sign a lock in.
//   2. Winning never refunds attempts beyond the fixed batch. `clearWaitOnly`
//      *assigns* `LOCKS_MAX_ATTEMPTS`, it never adds to whatever was
//      already there — so calling `clearLockoutByLadder` any number of
//      times (budget permitting) can never accumulate more than the one
//      fixed number ordinary time-based recovery already grants.
//
// Every challenge is generated with a single-use nonce and graded against a
// module-private answer table that the caller never sees — the closest a
// client-only desktop app (no second machine to act as "the server") can
// get to the real contract's "generated and graded server-side against a
// single-use nonce", stated honestly as a structural boundary rather than
// a network round trip that does not exist here. A nonce is deleted the
// moment it is graded, whether the answer was right or wrong, so a
// question can never be retried and an answer can never be replayed.

import { LOCKS_MAX_ATTEMPTS, clearWaitOnly, isWaiting } from "./locksStore"

export type LadderRung = "dimsum" | "sums" | "mole" | "clock"

/**
 * Under School mode, every dim-sum capability behaves as though it were
 * never installed — including this rung, which IS a dim-sum capability.
 * The dim-sum rung is therefore absent when School mode is on, not shown
 * and skipped with a message (a message naming the hidden thing is exactly
 * what School mode forbids). This is the one function that decides the
 * starting rung, so no call site can independently get this wrong.
 */
export function startingRung(schoolOn: boolean): LadderRung {
  return schoolOn ? "sums" : "dimsum"
}

// --- Rolling-hour skip budget --------------------------------------------
//
// A dim-sum question is one-in-four, ten small sums are trivial to
// compute, and a mole schedule is arithmetic — so without a budget, a
// script could clear an unlimited number of waits and the "lockout" would
// not exist at all. `LADDER_BUDGET` skips per rolling hour is the whole
// reason this feature is safe to ship rather than merely charming.

const LADDER_BUDGET_KEY = "material-ollama:toy-locks-ladder-budget"
export const LADDER_BUDGET = 3
export const LADDER_BUDGET_WINDOW_MS = 60 * 60_000

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

function readBudgetEvents(): number[] {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(LADDER_BUDGET_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed.filter((value): value is number => typeof value === "number") : []
  } catch {
    return []
  }
}

function saveBudgetEvents(events: readonly number[]): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(LADDER_BUDGET_KEY, JSON.stringify(events))
  } catch {
    // Fails open to "no budget persisted", same posture as locksStore.ts.
  }
}

export function ladderSkipsRemaining(now: number = Date.now()): number {
  const recent = readBudgetEvents().filter((at) => now - at < LADDER_BUDGET_WINDOW_MS)
  return Math.max(0, LADDER_BUDGET - recent.length)
}

function consumeLadderSkip(now: number = Date.now()): boolean {
  const recent = readBudgetEvents().filter((at) => now - at < LADDER_BUDGET_WINDOW_MS)
  if (recent.length >= LADDER_BUDGET) return false
  saveBudgetEvents([...recent, now])
  return true
}

/**
 * Clears `lockId`'s in-progress wait after the ladder is won. Returns
 * `false` (and changes nothing) when there is no active wait to clear, or
 * when the rolling-hour skip budget is exhausted — in either case the
 * clock is the only way through, and the caller should say so.
 *
 * This function's entire job, deliberately: consume one skip token, then
 * delegate to `clearWaitOnly`, which is the ONLY thing it touches. It does
 * not call `markUnlocked`, it does not read or write a credential, and it
 * does not know or care which rung was won — by the time this runs, the
 * ladder has already decided the user is done playing.
 */
export function clearLockoutByLadder(lockId: string, now: number = Date.now()): boolean {
  if (!isWaiting(lockId, now)) return false
  if (!consumeLadderSkip(now)) return false
  clearWaitOnly(lockId)
  return true
}

export { LOCKS_MAX_ATTEMPTS }

// --- Per-lockout ladder progress (rung + wrong-dish count) ---------------
//
// "one dim-sum question... then ten easy sums after FIVE wrong dishes" --
// the dim-sum rung is not one-shot, it re-offers a fresh question after
// each wrong guess, up to five wrong guesses, before dropping down. That
// count has to survive a page reload within the same lockout (otherwise
// reloading would trivially reset it), so it lives in sessionStorage,
// keyed by the wait's own `lockedUntil` timestamp — the moment a NEW wait
// begins (a different `lockedUntil`), progress starts over, exactly as a
// fresh lockout should.

const PROGRESS_KEY = "material-ollama:toy-locks-ladder-progress"

interface LadderProgressRecord {
  readonly lockedUntil: number
  readonly rung: LadderRung
  readonly wrongDishCount: number
}

type ProgressMap = Record<string, LadderProgressRecord>

function readProgressMap(): ProgressMap {
  if (!hasWindow()) return {}
  try {
    const raw = window.sessionStorage.getItem(PROGRESS_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    return parsed && typeof parsed === "object" ? (parsed as ProgressMap) : {}
  } catch {
    return {}
  }
}

function saveProgressMap(map: ProgressMap): void {
  if (!hasWindow()) return
  try {
    window.sessionStorage.setItem(PROGRESS_KEY, JSON.stringify(map))
  } catch {
    // Fails open, matching every other storage write in this module.
  }
}

const DIMSUM_MAX_WRONG = 5

export interface LadderProgress {
  readonly rung: LadderRung
  readonly wrongDishCount: number
}

/**
 * The ladder progress for `lockId`'s CURRENT wait cycle (identified by
 * `lockedUntil`). A different `lockedUntil` than whatever is stored means
 * this is a new lockout, so progress resets to the school-aware starting
 * rung with a clean slate.
 */
export function getLadderProgress(lockId: string, schoolOn: boolean, lockedUntil: number): LadderProgress {
  const stored = readProgressMap()[lockId]
  if (stored && stored.lockedUntil === lockedUntil) {
    return { rung: stored.rung, wrongDishCount: stored.wrongDishCount }
  }
  return { rung: startingRung(schoolOn), wrongDishCount: 0 }
}

function writeProgress(lockId: string, lockedUntil: number, progress: LadderProgress): LadderProgress {
  const map = readProgressMap()
  saveProgressMap({ ...map, [lockId]: { lockedUntil, ...progress } })
  return progress
}

/** One wrong dim-sum guess. Stays on "dimsum" (a fresh question follows)
 * until the fifth wrong guess, then drops to "sums". */
export function recordDimsumWrong(
  lockId: string,
  schoolOn: boolean,
  lockedUntil: number,
): LadderProgress {
  const current = getLadderProgress(lockId, schoolOn, lockedUntil)
  const wrongDishCount = current.wrongDishCount + 1
  const rung: LadderRung = wrongDishCount >= DIMSUM_MAX_WRONG ? "sums" : "dimsum"
  return writeProgress(lockId, lockedUntil, { rung, wrongDishCount })
}

export function recordSumsWrong(lockId: string, schoolOn: boolean, lockedUntil: number): LadderProgress {
  const current = getLadderProgress(lockId, schoolOn, lockedUntil)
  return writeProgress(lockId, lockedUntil, { ...current, rung: "mole" })
}

export function recordMoleFailed(lockId: string, schoolOn: boolean, lockedUntil: number): LadderProgress {
  const current = getLadderProgress(lockId, schoolOn, lockedUntil)
  return writeProgress(lockId, lockedUntil, { ...current, rung: "clock" })
}

export function resetLadderProgress(lockId: string): void {
  const map = readProgressMap()
  if (!(lockId in map)) return
  const rest = { ...map }
  delete rest[lockId]
  saveProgressMap(rest)
}

// --- Dim sum rung ----------------------------------------------------------
//
// Dish KEYS only, not display text — locksLadder.ts is plain logic with no
// dependency on the uh/dict system, so the presentation layer
// (UnlockLadder.tsx) is what turns a key into bilingual text via
// `useT("locks")`. Keep this list in sync with the matching `dish*` entries
// in components/locks/locks.dict.ts.

export const DISH_KEYS = [
  "dishHarGow",
  "dishSiuMai",
  "dishCharSiuBao",
  "dishEggTart",
  "dishTurnipCake",
  "dishRiceRoll",
  "dishSpringRoll",
  "dishCustardBun",
] as const

export type DishKey = (typeof DISH_KEYS)[number]

export interface DimsumChallenge {
  readonly nonce: string
  readonly choices: readonly [DishKey, DishKey, DishKey, DishKey]
}

const dimsumAnswers = new Map<string, number>()

function randomNonce(): string {
  const bytes = new Uint8Array(9)
  if (hasWindow() && window.crypto) {
    window.crypto.getRandomValues(bytes)
  } else {
    for (let i = 0; i < bytes.length; i += 1) bytes[i] = Math.floor(Math.random() * 256)
  }
  let out = ""
  for (const byte of bytes) out += byte.toString(16).padStart(2, "0")
  return out
}

function pickFour(): DishKey[] {
  const pool = [...DISH_KEYS]
  const picked: DishKey[] = []
  while (picked.length < 4 && pool.length > 0) {
    const index = Math.floor(Math.random() * pool.length)
    picked.push(pool[index])
    pool.splice(index, 1)
  }
  return picked
}

export function generateDimsumChallenge(): DimsumChallenge {
  const choices = pickFour() as [DishKey, DishKey, DishKey, DishKey]
  const correctIndex = Math.floor(Math.random() * choices.length)
  const nonce = randomNonce()
  dimsumAnswers.set(nonce, correctIndex)
  return { nonce, choices }
}

/** Consumes `nonce` (whether right or wrong) and reports whether
 * `choiceIndex` was the correct dish. An unknown/already-graded nonce is
 * always wrong — there is nothing left to replay. */
export function gradeDimsum(nonce: string, choiceIndex: number): boolean {
  const correctIndex = dimsumAnswers.get(nonce)
  dimsumAnswers.delete(nonce)
  return correctIndex !== undefined && correctIndex === choiceIndex
}

// --- Sums rung -------------------------------------------------------------

export interface SumsProblem {
  readonly a: number
  readonly b: number
  readonly op: "+" | "-"
}

export interface SumsChallenge {
  readonly nonce: string
  readonly problems: readonly SumsProblem[]
}

const SUMS_COUNT = 10

const sumsAnswers = new Map<string, readonly number[]>()

function randomInt(maxInclusive: number): number {
  return Math.floor(Math.random() * (maxInclusive + 1))
}

function makeProblem(): { problem: SumsProblem; answer: number } {
  const op: SumsProblem["op"] = Math.random() < 0.5 ? "+" : "-"
  if (op === "+") {
    const a = randomInt(9)
    const b = randomInt(9)
    return { problem: { a, b, op }, answer: a + b }
  }
  // Subtraction stays single-digit-friendly and non-negative: a >= b.
  const b = randomInt(9)
  const a = b + randomInt(9)
  return { problem: { a, b, op }, answer: a - b }
}

export function generateSumsChallenge(): SumsChallenge {
  const problems: SumsProblem[] = []
  const answers: number[] = []
  for (let i = 0; i < SUMS_COUNT; i += 1) {
    const { problem, answer } = makeProblem()
    problems.push(problem)
    answers.push(answer)
  }
  const nonce = randomNonce()
  sumsAnswers.set(nonce, answers)
  return { nonce, problems }
}

/** Every one of the ten answers must be correct, in order. Consumes the
 * nonce regardless of outcome. */
export function gradeSums(nonce: string, answers: readonly number[]): boolean {
  const expected = sumsAnswers.get(nonce)
  sumsAnswers.delete(nonce)
  if (!expected || answers.length !== expected.length) return false
  return expected.every((value, index) => value === answers[index])
}

// --- Whack-a-mole rung -------------------------------------------------

export interface MoleSpawn {
  readonly moleId: string
  /** Milliseconds after round start this mole becomes hittable. */
  readonly atMs: number
}

export interface MoleChallenge {
  readonly nonce: string
  readonly durationMs: number
  readonly moles: readonly MoleSpawn[]
  readonly targetHits: number
  /** How long a mole stays hittable after `atMs`, in ms. */
  readonly visibleMs: number
}

interface MoleAnswer {
  readonly startedAtMs: number
  readonly durationMs: number
  readonly visibleMs: number
  readonly moles: readonly MoleSpawn[]
  readonly targetHits: number
}

const moleAnswers = new Map<string, MoleAnswer>()

const MOLE_COUNT = 6
const MOLE_ROUND_MS = 6_000
const MOLE_VISIBLE_MS = 1_100
const MOLE_TARGET_HITS = 3

/** `now` is accepted explicitly (defaulting to `Date.now()`) so a test can
 * pin the round's start instant instead of racing the real clock. */
export function generateMoleChallenge(now: number = Date.now()): MoleChallenge {
  const moles: MoleSpawn[] = []
  const step = Math.floor(MOLE_ROUND_MS / MOLE_COUNT)
  for (let i = 0; i < MOLE_COUNT; i += 1) {
    moles.push({ moleId: `mole-${i}`, atMs: i * step })
  }
  const nonce = randomNonce()
  moleAnswers.set(nonce, {
    startedAtMs: now,
    durationMs: MOLE_ROUND_MS,
    visibleMs: MOLE_VISIBLE_MS,
    moles,
    targetHits: MOLE_TARGET_HITS,
  })
  return { nonce, durationMs: MOLE_ROUND_MS, moles, targetHits: MOLE_TARGET_HITS, visibleMs: MOLE_VISIBLE_MS }
}

export interface MoleHit {
  readonly moleId: string
  /** Milliseconds after round start the hit was registered. */
  readonly atMs: number
}

/**
 * Grades a whack-a-mole submission. Consumes the nonce regardless of
 * outcome. Two rules keep this from being gameable by a script that
 * already knows the schedule:
 *
 *   - `gradedAtMs` (the wall-clock instant grading happens, defaulting to
 *     `Date.now()`) must be at least `startedAtMs + durationMs` — a
 *     submission that arrives before the round has actually finished is
 *     rejected outright, timed game or not.
 *   - each `moleId` counts at most once, and only when its hit landed
 *     within that mole's own visible window — a flurry of hits on one
 *     cell, or a hit on a cell that was never shown, cannot inflate the
 *     score.
 */
export function gradeMole(nonce: string, hits: readonly MoleHit[], gradedAtMs: number = Date.now()): boolean {
  const answer = moleAnswers.get(nonce)
  moleAnswers.delete(nonce)
  if (!answer) return false

  if (gradedAtMs < answer.startedAtMs + answer.durationMs) return false

  const scheduleById = new Map(answer.moles.map((mole) => [mole.moleId, mole]))
  const countedMoleIds = new Set<string>()

  for (const hit of hits) {
    if (countedMoleIds.has(hit.moleId)) continue
    const scheduled = scheduleById.get(hit.moleId)
    if (!scheduled) continue
    const windowStart = scheduled.atMs
    const windowEnd = scheduled.atMs + answer.visibleMs
    if (hit.atMs >= windowStart && hit.atMs <= windowEnd) {
      countedMoleIds.add(hit.moleId)
    }
  }

  return countedMoleIds.size >= answer.targetHits
}
