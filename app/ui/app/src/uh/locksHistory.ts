// The redacted mutation history for the toy lock system -- the
// "secret-display-history" contract row, scoped to what this lane actually
// owns (a lock's own create/remove/change events), rather than the whole
// app's document-level local Git history (a separate, much larger
// universal feature owned elsewhere).
//
// Every entry is append-only (a restore/removal is itself a new entry, per
// the shared "Local version control" contract's "restoring is itself
// recorded as a new revision, never a rewrite of history") and REDACTED:
// no password, no password hash, no salt, no TOTP secret, and no submitted
// unlock code ever reaches this module. What gets recorded is which lock,
// which action, when, and a short factual note about what changed (e.g.
// "method changed password -> totp") -- exactly the kind of "what changed"
// label the shared local-history contract asks for ("Deleted the GitHub
// account", not "Updated"), without ever writing down the one thing that
// would make this list dangerous.

const HISTORY_STORAGE_KEY = "material-ollama:toy-locks-history"
const HISTORY_CHANGED_EVENT = "material-ollama:toy-locks-history-changed"
const HISTORY_MAX_ENTRIES = 300

export type LockHistoryAction = "created" | "removed" | "unlocked" | "failedAttempt" | "ladderCleared"

export interface LockHistoryEntry {
  readonly entryId: string
  readonly lockId: string
  /** The locked element's label at the time of the event -- never the
   * credential, and never re-derived later so a renamed element's older
   * history entries still read sensibly. */
  readonly label: string
  readonly action: LockHistoryAction
  readonly at: number
  /** Optional short factual note, e.g. "method: password", "duration:
   * until this app closes" -- redacted by construction: callers only ever
   * pass non-secret metadata here, and this module does not accept
   * anything named password/hash/secret/code. */
  readonly detail?: string
}

function hasWindow(): boolean {
  return typeof window !== "undefined"
}

function readEntries(): LockHistoryEntry[] {
  if (!hasWindow()) return []
  try {
    const raw = window.localStorage.getItem(HISTORY_STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as LockHistoryEntry[]) : []
  } catch {
    return []
  }
}

function saveEntries(entries: readonly LockHistoryEntry[]): void {
  if (!hasWindow()) return
  try {
    window.localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(entries))
  } catch {
    // Same fail-open-to-"nothing recorded" posture as locksStore.ts.
  }
  window.dispatchEvent(new Event(HISTORY_CHANGED_EVENT))
}

export { HISTORY_CHANGED_EVENT }

export function listHistory(): readonly LockHistoryEntry[] {
  return readEntries()
}

export interface RecordHistoryInput {
  readonly lockId: string
  readonly label: string
  readonly action: LockHistoryAction
  readonly detail?: string
}

/** Appends one entry, oldest-first, trimming from the front once the log
 * exceeds `HISTORY_MAX_ENTRIES` -- an unbounded log is its own kind of
 * local-data-folder bloat, and this feature's whole recovery story is
 * "delete the folder", so an ever-growing file works against that. */
export function recordHistory(input: RecordHistoryInput, now: number = Date.now()): LockHistoryEntry {
  const entry: LockHistoryEntry = {
    entryId: `${now}-${Math.random().toString(36).slice(2, 8)}`,
    lockId: input.lockId,
    label: input.label,
    action: input.action,
    at: now,
    detail: input.detail,
  }
  const next = [...readEntries(), entry]
  const trimmed = next.length > HISTORY_MAX_ENTRIES ? next.slice(next.length - HISTORY_MAX_ENTRIES) : next
  saveEntries(trimmed)
  return entry
}

export interface HistorySearchOptions {
  readonly regex?: boolean
  readonly flags?: string
  readonly actions?: readonly LockHistoryAction[]
  readonly fromMs?: number
  readonly toMs?: number
}

/** Composes a text query (plain by default, regex opt-in) with an action
 * filter and a date range -- "search and date filter compose rather than
 * override one another" per the shared changelog/history contract. */
export function searchHistory(
  entries: readonly LockHistoryEntry[],
  query: string,
  options: HistorySearchOptions = {},
): readonly LockHistoryEntry[] {
  let matches = entries

  if (options.actions && options.actions.length > 0) {
    const allowed = new Set(options.actions)
    matches = matches.filter((entry) => allowed.has(entry.action))
  }
  if (typeof options.fromMs === "number") {
    const from = options.fromMs
    matches = matches.filter((entry) => entry.at >= from)
  }
  if (typeof options.toMs === "number") {
    const to = options.toMs
    matches = matches.filter((entry) => entry.at <= to)
  }

  if (!query) return matches

  if (options.regex) {
    let pattern: RegExp
    try {
      pattern = new RegExp(query, options.flags ?? "i")
    } catch {
      return []
    }
    return matches.filter(
      (entry) => pattern.test(entry.label) || pattern.test(entry.detail ?? "") || pattern.test(entry.lockId),
    )
  }

  const needle = query.toLowerCase()
  return matches.filter(
    (entry) =>
      entry.label.toLowerCase().includes(needle) ||
      (entry.detail ?? "").toLowerCase().includes(needle) ||
      entry.lockId.toLowerCase().includes(needle),
  )
}

/**
 * A redacted plain-text export of the given entries -- "export omits
 * secrets and says so" per the shared export contract. There is nothing
 * TO omit here (this module never accepted a secret in the first place),
 * but the header line says so explicitly anyway rather than leaving that
 * as an inference the reader has to make.
 */
export function exportHistoryText(entries: readonly LockHistoryEntry[]): string {
  const lines = [
    "Toy lock history export -- no credentials, hashes, secrets, or unlock codes are ever recorded here.",
    "",
    ...entries.map((entry) => {
      const when = new Date(entry.at).toISOString()
      const detail = entry.detail ? ` -- ${entry.detail}` : ""
      return `${when}  ${entry.action.padEnd(14)}  ${entry.label} (${entry.lockId})${detail}`
    }),
  ]
  return lines.join("\n")
}
