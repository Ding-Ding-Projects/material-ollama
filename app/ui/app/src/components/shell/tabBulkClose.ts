/**
 * "Close tabs containing text" and "close tabs NOT containing text" share
 * exactly one matcher — `mode` only ever flips the boolean the shared
 * `test()` closure returns, so the two directions can never drift apart on
 * what counts as a match (see tabBulkClose.test.ts for the property this
 * buys: for any query, `containing` and `notContaining` partition the full
 * candidate set with zero overlap).
 *
 * Framework-free by design, same as tabSearch.ts, so the property above is
 * checked with a plain unit test rather than a rendered component.
 */

export interface BulkCloseCandidate {
  readonly tabId: string
  readonly label: string
  readonly pinned: boolean
}

export type BulkCloseMode = "containing" | "notContaining"

export interface BulkCloseQuery {
  readonly text: string
  readonly regexMode: boolean
  readonly flags: string
}

export interface BulkCloseResult {
  /** Tabs that satisfy the query in the requested direction and are not
   * excluded by the pinned guard — what will actually be closed. */
  readonly toClose: readonly BulkCloseCandidate[]
  /** Tabs that matched the direction but were excluded because they are
   * pinned and `includePinned` was false — shown in the preview so a
   * pinned tab never disappears from a bulk close with no explanation. */
  readonly excludedPinned: readonly BulkCloseCandidate[]
}

const EMPTY_RESULT: BulkCloseResult = Object.freeze({ toClose: [], excludedPinned: [] })

/**
 * Selects which candidates a bulk-close action would affect. Never runs on
 * an empty (or invalid-regex) query — both return the empty result rather
 * than matching everything or throwing, so a half-typed query can never
 * accidentally close every open tab.
 */
export function selectBulkClose(
  candidates: readonly BulkCloseCandidate[],
  query: BulkCloseQuery,
  mode: BulkCloseMode,
  includePinned: boolean,
): BulkCloseResult {
  const text = query.text.trim()
  if (!text) return EMPTY_RESULT

  let test: (label: string) => boolean
  if (query.regexMode) {
    let re: RegExp
    try {
      re = new RegExp(text, query.flags || undefined)
    } catch {
      return EMPTY_RESULT
    }
    test = (label) => re.test(label)
  } else {
    const needle = text.toLowerCase()
    test = (label) => label.toLowerCase().includes(needle)
  }

  const toClose: BulkCloseCandidate[] = []
  const excludedPinned: BulkCloseCandidate[] = []
  for (const candidate of candidates) {
    const isMatch = test(candidate.label)
    // The entire "inverse" mode is this one ternary — nothing else differs
    // between the two directions, which is the whole point.
    const selected = mode === "containing" ? isMatch : !isMatch
    if (!selected) continue
    if (candidate.pinned && !includePinned) {
      excludedPinned.push(candidate)
      continue
    }
    toClose.push(candidate)
  }
  return { toClose, excludedPinned }
}
