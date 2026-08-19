import { useQuery } from "@tanstack/react-query"
import { useMemo, useState } from "react"
import { getSettings } from "@/api"
import { Button, Select, Surface, useSnackbar } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { FOCUS_RING_WITHIN } from "@/components/md3/tokens"
import { Txt, fact, useT } from "@/uh"
import { matchesDateRange, type DateRange } from "./dateRange"
import { DateRangeFilter } from "./DateRangeFilter"
import { downloadJson, exportTimestamp } from "./exportUtils"
import type { AppEvent } from "./types"
import { useAppendHistoryEvent, useHistoryEvents } from "./useHistoryEvents"
import "./status.dict"

const ALL_ACTIONS = "__all__"

/**
 * The local version-history card: real rows from GET /api/v1/history
 * (app_events, schema v18), filterable by date range and by the exact set
 * of `kind` values actually present -- never a hand-guessed action list,
 * per the shared instructions' "derived from the history itself" rule --
 * plus a genuine write path (POST /api/v1/history) so the list has real
 * data to filter and export even before another feature starts appending
 * to it, and a JSON export honouring the active filter.
 */
export function LocalHistoryCard() {
  const t = useT("status")
  const snackbar = useSnackbar()
  const history = useHistoryEvents()
  const appendEvent = useAppendHistoryEvent()
  // Shares the ["settings"] cache key with components/Settings.tsx and
  // AutomaticUpdatesCard -- react-query dedupes this against whichever of
  // those already fetched it, so the export rarely costs an extra
  // request of its own.
  const settingsQuery = useQuery({ queryKey: ["settings"], queryFn: getSettings })

  const [range, setRange] = useState<DateRange>({ from: null, to: null })
  const [action, setAction] = useState(ALL_ACTIONS)
  const [note, setNote] = useState("")

  // `history.data ?? []` would mint a fresh empty array every render
  // while loading, which invalidates the two useMemo()s below on every
  // render rather than only when the data itself changes.
  const events = useMemo(() => history.data ?? [], [history.data])

  const actions = useMemo(() => {
    const set = new Set<string>()
    for (const event of events) set.add(event.kind)
    return [...set].sort()
  }, [events])

  const filtered = useMemo(
    () =>
      events.filter(
        (event) =>
          matchesDateRange(event.at, range) && (action === ALL_ACTIONS || event.kind === action),
      ),
    [events, range, action],
  )

  const handleAddNote = () => {
    const summary = note.trim()
    if (!summary) return
    appendEvent.mutate(
      { kind: "checkpoint", summary },
      {
        onSuccess: () => setNote(""),
      },
    )
  }

  const handleExport = () => {
    const settings = settingsQuery.data?.settings
    downloadJson(`material-ollama-status-export-${Date.now()}.json`, {
      schemaVersion: 1,
      exportedAt: exportTimestamp(),
      encoding: "UTF-8",
      // Settings carries no credential, token, or secret field (see
      // codegen/gotypes.gen.ts's Settings class) -- true because there was
      // never anything sensitive in this payload to begin with, not
      // because something was silently stripped out of it.
      secretsOmitted: true,
      filter: { from: range.from, to: range.to, action: action === ALL_ACTIONS ? null : action },
      settings: settings ? { ...settings } : null,
      events: filtered,
    })
    snackbar.show(t("exportedToast"))
  }

  const countText = fact(
    t("historyCount").split("{n}").join(String(filtered.length)).split("{total}").join(String(events.length)),
    "count",
  )

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-4 p-5" data-testid="local-history-card">
      <div className="flex items-center gap-2.5">
        <Icon name="schedule" size={20} className="shrink-0 text-on-surface-variant" />
        <h2 className="text-base font-semibold text-on-surface">{t("historyHeading")}</h2>
      </div>
      <p className="text-[12.5px] text-on-surface-variant">
        <Txt ns="status" k="historyBody" channel="copy" />
      </p>

      <div className="flex flex-col gap-2">
        <label htmlFor="status-history-note" className="text-[11px] font-medium text-on-surface-variant">
          {t("historyAddNoteLabel")}
        </label>
        <div className="flex gap-2">
          <input
            id="status-history-note"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t("historyAddNotePlaceholder")}
            maxLength={280}
            className={`min-w-0 flex-1 rounded-[10px] border border-outline-variant bg-surface-low px-3 py-2 text-[12.5px] outline-none placeholder:text-on-surface-variant ${FOCUS_RING_WITHIN}`}
          />
          <Button
            variant="tonal"
            size="sm"
            icon="edit_square"
            disabled={note.trim().length === 0}
            loading={appendEvent.isPending}
            onClick={handleAddNote}
          >
            {t("historyAddNoteSubmit")}
          </Button>
        </div>
        {appendEvent.isError ? (
          <p role="alert" className="text-[11px] text-error">
            <Txt ns="status" k="historyAddNoteError" channel="copy" />
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <DateRangeFilter value={range} onChange={setRange} />
        <div className="flex flex-col gap-1">
          <span className="text-[11px] font-medium text-on-surface-variant">{t("historyActionFilterLabel")}</span>
          <Select
            value={action}
            onChange={setAction}
            ariaLabel={t("historyActionFilterLabel")}
            options={[
              { value: ALL_ACTIONS, label: t("historyActionAll") },
              ...actions.map((kind) => ({ value: kind, label: kind })),
            ]}
          />
        </div>
        <Button
          variant="outlined"
          size="sm"
          icon="download"
          onClick={handleExport}
          disabled={history.isLoading}
        >
          {t("exportButtonLabel")}
        </Button>
      </div>
      <p className="text-[11px] text-on-surface-variant">
        <Txt ns="status" k="exportEncodingNote" channel="copy" />
      </p>
      <p className="text-[11px] text-on-surface-variant">{countText}</p>

      {history.isLoading ? null : events.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] text-on-surface-variant">
          <Txt ns="status" k="historyEmpty" channel="copy" />
        </p>
      ) : filtered.length === 0 ? (
        <p className="px-2 py-6 text-center text-[13px] text-on-surface-variant">
          <Txt ns="status" k="historyNoMatches" channel="copy" />
        </p>
      ) : (
        <ul className="flex flex-col divide-y divide-outline-variant">
          {filtered.map((event) => (
            <HistoryRow key={event.id} event={event} />
          ))}
        </ul>
      )}
    </Surface>
  )
}

function HistoryRow({ event }: { event: AppEvent }) {
  return (
    <li className="flex items-start gap-3 py-2.5">
      <span className="w-[150px] shrink-0 pt-0.5 text-[11px] text-on-surface-variant">
        <Txt channel="fact" value={event.at} kind="timestamp" />
      </span>
      <span className="w-[92px] shrink-0 truncate rounded-full bg-surface-high px-2 py-0.5 text-center font-mono text-[10.5px] text-on-surface-variant">
        <Txt channel="fact" value={event.kind} kind="tag" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] text-on-surface">
        <Txt channel="content">{event.summary}</Txt>
      </p>
    </li>
  )
}
