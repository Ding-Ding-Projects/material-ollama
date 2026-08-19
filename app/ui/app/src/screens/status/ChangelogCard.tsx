import { useCallback, useMemo, useRef, useState } from "react"
import { SearchField, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { RegexBuilder, type RegexBuilderHandle } from "@/components/md3/RegexBuilder"
import { Txt, fact, useT } from "@/uh"
import { CHANGELOG_ENTRIES, commitUrl, shortSha, type ChangelogEntry } from "./changelogEntries"
import { matchesDateRange, type DateRange } from "./dateRange"
import { DateRangeFilter } from "./DateRangeFilter"
import "./status.dict"

function matchesQuery(entry: ChangelogEntry, query: string, regex: boolean): boolean {
  const trimmed = query.trim()
  if (!trimmed) return true
  if (!regex) return entry.subject.toLowerCase().includes(trimmed.toLowerCase())
  try {
    return new RegExp(trimmed, "i").test(entry.subject)
  } catch {
    // A pattern mid-typing (unbalanced parens, trailing backslash) is a
    // normal, expected state -- treat it as "no matches" rather than
    // throwing through the render, exactly as ModelsScreen's matchesQuery
    // already does for the same reason.
    return false
  }
}

/**
 * The changelog viewer: real commits from CHANGELOG_ENTRIES (see that
 * file for why this repository's own git history, hand-copied, is the
 * only honest source available to this lane), filterable by date range
 * and by a plain/regex search over commit subjects, each linking straight
 * to its real GitHub commit page.
 */
export function ChangelogCard() {
  const t = useT("status")
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)
  const [range, setRange] = useState<DateRange>({ from: null, to: null })
  const [builderOpen, setBuilderOpen] = useState(false)
  const builderRef = useRef<RegexBuilderHandle>(null)

  const filtered = useMemo(
    () =>
      CHANGELOG_ENTRIES.filter(
        (entry) => matchesDateRange(entry.date, range) && matchesQuery(entry, query, regexMode),
      ),
    [query, regexMode, range],
  )

  const openBuilder = useCallback(() => {
    setBuilderOpen(true)
    requestAnimationFrame(() => builderRef.current?.focusPattern())
  }, [])

  const handleApply = useCallback((pattern: string, flags: string) => {
    setQuery(pattern)
    setRegexMode(true)
    void flags // subjects are single-line; multiline/dotall flags have no
    // visible effect here, but the pattern itself is still honoured.
  }, [])

  const countText = fact(
    t("changelogCount").split("{n}").join(String(filtered.length)).split("{total}").join(String(CHANGELOG_ENTRIES.length)),
    "count",
  )

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5" data-testid="changelog-card">
      <div className="flex items-center gap-2.5">
        <Icon name="menu_book" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("changelogHeading")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="status" k="changelogBody" channel="copy" />
      </p>

      <div className="flex flex-col gap-3">
        <SearchField
          value={query}
          onChange={(value) => {
            setQuery(value)
            setRegexMode(false)
          }}
          placeholder={t("changelogSearchPlaceholder")}
          label={t("changelogSearchLabel")}
          onOpenBuilder={openBuilder}
        />
        <DateRangeFilter value={range} onChange={setRange} />
        <p className="text-[11px] text-on-surface-variant">{countText}</p>
      </div>

      {builderOpen ? (
        <div className="rounded-token border border-outline-variant bg-surface-low p-3.5">
          <RegexBuilder ref={builderRef} initialSample={query} onApply={handleApply} />
        </div>
      ) : null}

      {filtered.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] text-on-surface-variant">
          <Txt ns="status" k="changelogNoMatches" channel="copy" />
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {filtered.map((entry) => (
            <li key={entry.sha} className="flex items-start gap-3 py-2.5">
              <span className="w-[84px] shrink-0 pt-0.5 text-[11px] text-on-surface-variant">
                <Txt channel="fact" value={entry.date} kind="timestamp" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[13px] text-on-surface">
                  <Txt channel="content">{entry.subject}</Txt>
                </p>
                <a
                  href={commitUrl(entry.sha)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-0.5 inline-flex items-center gap-1 rounded text-[11px] font-mono text-primary hover:underline"
                >
                  <Icon name="open_in_new" size={12} className="shrink-0" />
                  <Txt channel="fact" value={shortSha(entry.sha)} kind="digest" />
                  <span className="font-sans">— {t("changelogViewCommit")}</span>
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Surface>
  )
}
