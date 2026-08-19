export interface DateRange {
  from: string | null
  to: string | null
}

/** Shared date-range matching: `null`/`null` matches everything; a
 * one-sided range is an open range; an inverted range (`from > to`)
 * matches nothing rather than silently reinterpreting it. Kept in its own
 * file (rather than alongside `DateRangeFilter`) so that component stays
 * component-only -- the same split `screens/docs/groupFeatures.ts`
 * already established for `DocsDrawer`. */
export function matchesDateRange(isoDate: string, range: DateRange): boolean {
  if (range.from && range.to && range.from > range.to) return false
  const day = isoDate.slice(0, 10)
  if (range.from && day < range.from) return false
  if (range.to && day > range.to) return false
  return true
}
