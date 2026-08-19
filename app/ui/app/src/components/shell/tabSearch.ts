/**
 * The one match predicate every discovery search in the tab system shares
 * — current-strip search, within-a-group search, groups-by-name search,
 * and the master search across every open tab all call `tabQueryMatches`
 * with their own independent `TabSearchQuery` state, so "plain text is the
 * default, regex is an explicit opt-in" and what counts as a match can
 * never quietly disagree between the four surfaces.
 *
 * Deliberately framework-free (no React import) so it is trivial to unit
 * test without a DOM, and reusable from any of the four search components.
 */

export interface TabSearchQuery {
  readonly text: string
  readonly regexMode: boolean
  /** Only meaningful when `regexMode` is true — the flags the anchored
   * RegexBuilder popover applied (see TabSearchField.tsx). */
  readonly flags: string
}

export const EMPTY_TAB_SEARCH_QUERY: TabSearchQuery = Object.freeze({
  text: "",
  regexMode: false,
  flags: "",
})

/**
 * An empty query matches everything — no filter has been typed yet, so
 * nothing should be hidden. A malformed regex (possible mid-type, before
 * the pattern is valid) matches nothing rather than throwing, so a search
 * field never crashes the strip it filters.
 */
export function tabQueryMatches(label: string, query: TabSearchQuery): boolean {
  const text = query.text.trim()
  if (!text) return true
  if (query.regexMode) {
    try {
      return new RegExp(text, query.flags || undefined).test(label)
    } catch {
      return false
    }
  }
  return label.toLowerCase().includes(text.toLowerCase())
}

/** Filters an arbitrary list of `{label}`-bearing items against a query,
 * preserving order — the shared implementation every discovery search's
 * `results` memo calls into. */
export function filterByTabQuery<T extends { label: string }>(
  items: readonly T[],
  query: TabSearchQuery,
): T[] {
  if (!query.text.trim()) return [...items]
  return items.filter((item) => tabQueryMatches(item.label, query))
}
