import { useEffect, useMemo, useRef, useState } from "react"
import { Button, ConfirmDialog, SearchField } from "@/components/md3"
import { RegexBuilder } from "@/components/md3/RegexBuilder"
import { Txt, useT } from "@/uh"
import "./locks.dict"
import { AnchoredPanel } from "./AnchoredPanel"
import {
  HISTORY_CHANGED_EVENT,
  exportHistoryText,
  listHistory,
  recordHistory,
  searchHistory,
  type LockHistoryAction,
  type LockHistoryEntry,
} from "@/uh/locksHistory"
import {
  LOCKS_CHANGED_EVENT,
  isSessionUnlocked,
  isWaiting,
  listLocks,
  removeLocks,
  searchLocks,
  type LockRecord,
} from "@/uh/locksStore"

type LockStatus = "locked" | "unlocked" | "waiting"

/**
 * The lock list's manager screen: the enumerable, searchable,
 * bulk-manageable list `toy-locks` requires, plus the redacted mutation
 * history `secret-display-history` requires. Not wired into any route
 * yet — matching this codebase's current "primitives ship, wiring into a
 * real screen is a later lane's job" phase (see `@/components/md3`'s own
 * barrel comment) — but fully functional and independently mountable.
 *
 * One documented simplification: a "surface"-duration lock's unlocked
 * state is genuinely component-local to the `Lockable` that owns it (see
 * that file's own comment on why it cannot be anything else), so this
 * screen — which has no access to that component's React state — always
 * reports such a lock as "locked" here. That is not a display bug: from
 * anywhere other than the element itself, a surface-scoped lock IS locked,
 * because "this surface only" means exactly that.
 */
export function LockManager({ className }: { className?: string }) {
  const t = useT("locks")
  const [locks, setLocks] = useState<readonly LockRecord[]>(() => listLocks())
  const [, forceTick] = useState(0)
  const [query, setQuery] = useState("")
  const [regexMode, setRegexMode] = useState(false)
  const [builderOpen, setBuilderOpen] = useState(false)
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [pendingRemoveIds, setPendingRemoveIds] = useState<readonly string[] | null>(null)

  const [historyEntries, setHistoryEntries] = useState<readonly LockHistoryEntry[]>(() => listHistory())
  const [historyQuery, setHistoryQuery] = useState("")
  const [exportFeedback, setExportFeedback] = useState<string | null>(null)

  const searchAnchorRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const refresh = () => {
      setLocks(listLocks())
      forceTick((n) => n + 1)
    }
    window.addEventListener(LOCKS_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(LOCKS_CHANGED_EVENT, refresh)
  }, [])

  useEffect(() => {
    const refresh = () => setHistoryEntries(listHistory())
    window.addEventListener(HISTORY_CHANGED_EVENT, refresh)
    return () => window.removeEventListener(HISTORY_CHANGED_EVENT, refresh)
  }, [])

  function statusFor(lock: LockRecord): LockStatus {
    if (isWaiting(lock.id)) return "waiting"
    if (lock.duration.kind !== "surface" && isSessionUnlocked(lock.id)) return "unlocked"
    return "locked"
  }

  const filtered = useMemo(() => searchLocks(locks, query, { regex: regexMode }), [locks, query, regexMode]).map(
    (lock) => ({ lock, status: statusFor(lock) }),
  )

  const removableIds = filtered.filter((row) => row.status === "unlocked").map((row) => row.lock.id)
  const allRemovableSelected = removableIds.length > 0 && removableIds.every((id) => selected.has(id))

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    setSelected(allRemovableSelected ? new Set() : new Set(removableIds))
  }

  function confirmRemove(ids: readonly string[]) {
    setPendingRemoveIds(ids)
  }

  function handleConfirmedRemove() {
    if (!pendingRemoveIds) return
    const labelsById = new Map(locks.map((lock) => [lock.id, lock.label]))
    removeLocks(pendingRemoveIds)
    for (const id of pendingRemoveIds) {
      recordHistory({ lockId: id, label: labelsById.get(id) ?? id, action: "removed" })
    }
    setSelected((current) => {
      const next = new Set(current)
      for (const id of pendingRemoveIds) next.delete(id)
      return next
    })
    setPendingRemoveIds(null)
  }

  const historyMatches = useMemo(
    () => searchHistory(historyEntries, historyQuery, { regex: false }),
    [historyEntries, historyQuery],
  )

  async function handleExportHistory() {
    const text = exportHistoryText(historyMatches)
    try {
      await navigator.clipboard.writeText(text)
      setExportFeedback(text)
    } catch {
      // No clipboard permission (or none in this environment) -- still
      // surface the redacted text inline rather than claiming it copied.
      setExportFeedback(text)
    }
  }

  const historyActionLabel: Record<LockHistoryAction, "historyActionCreated" | "historyActionRemoved" | "historyActionUnlocked" | "historyActionFailedAttempt" | "historyActionLadderCleared"> = {
    created: "historyActionCreated",
    removed: "historyActionRemoved",
    unlocked: "historyActionUnlocked",
    failedAttempt: "historyActionFailedAttempt",
    ladderCleared: "historyActionLadderCleared",
  }

  return (
    <div className={className}>
      <h2 className="text-[15px] font-semibold">
        <Txt ns="locks" k="manageLocksTitle" />
      </h2>

      <div ref={searchAnchorRef} className="mt-2">
        <SearchField
          value={query}
          onChange={setQuery}
          placeholder={t("searchPlaceholder")}
          label={t("searchLabel")}
          regex={regexMode}
          onToggleRegex={() => setRegexMode((v) => !v)}
          onOpenBuilder={() => setBuilderOpen(true)}
        />
      </div>

      <AnchoredPanel
        open={builderOpen}
        onClose={() => setBuilderOpen(false)}
        anchorEl={searchAnchorRef.current}
        label={t("searchLabel")}
        className="w-[min(420px,92vw)]"
      >
        <RegexBuilder
          initialPattern={query}
          onApply={(pattern: string) => {
            setQuery(pattern)
            setRegexMode(true)
            setBuilderOpen(false)
          }}
        />
      </AnchoredPanel>

      {filtered.length === 0 ? (
        <p className="mt-3 text-[12.5px] text-on-surface-variant">
          <Txt ns="locks" k="emptyState" />
        </p>
      ) : (
        <>
          <div className="mt-3 flex items-center justify-between">
            <label className="flex items-center gap-2 text-[12.5px]">
              <input
                type="checkbox"
                checked={allRemovableSelected}
                onChange={toggleSelectAll}
                disabled={removableIds.length === 0}
              />
              <Txt ns="locks" k="selectAllLabel" />
            </label>
            <Button
              variant="danger"
              size="sm"
              disabled={selected.size === 0}
              onClick={() => confirmRemove([...selected])}
            >
              <Txt ns="locks" k="bulkRemoveButton" />
            </Button>
          </div>

          <table className="mt-2 w-full text-[12.5px]">
            <thead>
              <tr className="text-left text-[11px] text-on-surface-variant">
                <th className="w-8" />
                <th>
                  <Txt ns="locks" k="columnElement" />
                </th>
                <th>
                  <Txt ns="locks" k="columnMethod" />
                </th>
                <th>
                  <Txt ns="locks" k="columnStatus" />
                </th>
                <th className="w-20" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(({ lock, status }) => (
                <tr key={lock.id} className="border-t border-outline-variant">
                  <td>
                    <input
                      type="checkbox"
                      checked={selected.has(lock.id)}
                      disabled={status !== "unlocked"}
                      onChange={() => toggleSelected(lock.id)}
                    />
                  </td>
                  <td className="py-1.5">
                    <Txt channel="fact" value={lock.label} kind="tag" />
                  </td>
                  <td>
                    <Txt ns="locks" k={lock.method === "password" ? "methodPassword" : "methodTotp"} />
                  </td>
                  <td>
                    <Txt
                      ns="locks"
                      k={status === "locked" ? "statusLocked" : status === "unlocked" ? "statusUnlocked" : "statusWaiting"}
                    />
                  </td>
                  <td className="text-right">
                    {status === "unlocked" ? (
                      <button
                        type="button"
                        onClick={() => confirmRemove([lock.id])}
                        className="text-[11.5px] font-medium text-error hover:underline"
                      >
                        <Txt ns="locks" k="removeOneButton" />
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      <ConfirmDialog
        open={pendingRemoveIds !== null}
        onClose={() => setPendingRemoveIds(null)}
        title={t("bulkRemoveConfirmTitle")}
        body={t("bulkRemoveConfirmBody")}
        keyword="REMOVE"
        actionLabel={t("bulkRemoveButton")}
        onConfirm={handleConfirmedRemove}
      />

      <section className="mt-6">
        <h3 className="text-[13px] font-semibold">
          <Txt ns="locks" k="historyHeading" />
        </h3>
        <div className="mt-2">
          <SearchField
            value={historyQuery}
            onChange={setHistoryQuery}
            placeholder={t("searchPlaceholder")}
            label={t("historySearchLabel")}
          />
        </div>

        {historyMatches.length === 0 ? (
          <p className="mt-2 text-[12px] text-on-surface-variant">
            <Txt ns="locks" k="historyEmpty" />
          </p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-[11.5px]">
            {historyMatches
              .slice()
              .reverse()
              .map((entry) => (
                <li key={entry.entryId} className="flex items-center gap-1.5 text-on-surface-variant">
                  <Txt channel="fact" value={new Date(entry.at).toLocaleString()} kind="timestamp" as="span" className="font-mono" />
                  <Txt ns="locks" k={historyActionLabel[entry.action]} />
                  <Txt channel="fact" value={entry.label} kind="tag" />
                </li>
              ))}
          </ul>
        )}

        <Button variant="text" size="sm" className="mt-2" onClick={handleExportHistory}>
          <Txt ns="locks" k="exportHistoryButton" />
        </Button>
        {exportFeedback ? (
          <pre className="mt-2 max-h-40 overflow-y-auto rounded-[10px] bg-surface-low p-2 text-[10.5px] whitespace-pre-wrap">
            {exportFeedback}
          </pre>
        ) : null}
      </section>
    </div>
  )
}
