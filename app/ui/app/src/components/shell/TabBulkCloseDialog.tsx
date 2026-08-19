import { useEffect, useMemo, useState } from "react"
import { Button, Chip, Dialog, SegmentedControl, Switch } from "@/components/md3"
import { Txt, useT } from "@/uh"
import { TabSearchField } from "./TabSearchField"
import { EMPTY_TAB_SEARCH_QUERY, type TabSearchQuery } from "./tabSearch"
import { selectBulkClose, type BulkCloseCandidate, type BulkCloseMode } from "./tabBulkClose"
import "./shell.dict"

export interface TabBulkCloseDialogProps {
  open: boolean
  onClose: () => void
  candidates: readonly BulkCloseCandidate[]
  onConfirm: (tabIds: readonly string[]) => void
}

/**
 * "Close tabs containing text" and "close tabs NOT containing text" —
 * sharing exactly one match predicate (see tabBulkClose.ts) so the two
 * directions can never disagree about what a match is. Shows the affected
 * count and a reviewable preview before anything closes, and excludes
 * pinned tabs by default (with an explicit opt-in and an honest note about
 * what got excluded and why), per the shared bulk-close contract.
 */
export function TabBulkCloseDialog({ open, onClose, candidates, onConfirm }: TabBulkCloseDialogProps) {
  const t = useT("shell")
  const tApp = useT("app")
  const [mode, setMode] = useState<BulkCloseMode>("containing")
  const [query, setQuery] = useState<TabSearchQuery>(EMPTY_TAB_SEARCH_QUERY)
  const [includePinned, setIncludePinned] = useState(false)

  useEffect(() => {
    if (!open) return
    setQuery(EMPTY_TAB_SEARCH_QUERY)
    setIncludePinned(false)
    setMode("containing")
  }, [open])

  const result = useMemo(
    () => selectBulkClose(candidates, query, mode, includePinned),
    [candidates, query, mode, includePinned],
  )

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="md"
      icon="tab_close"
      title={t("bulkCloseTitle")}
      actions={
        <>
          <Button variant="text" size="sm" onClick={onClose}>
            {tApp("cancel")}
          </Button>
          <Button
            variant="danger"
            size="sm"
            icon="tab_close"
            disabled={result.toClose.length === 0}
            onClick={() => {
              onConfirm(result.toClose.map((candidate) => candidate.tabId))
              onClose()
            }}
          >
            {t("bulkCloseConfirm")} (<Txt channel="fact" value={result.toClose.length} kind="count" />)
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <SegmentedControl
          label={t("bulkCloseTitle")}
          options={[
            { value: "containing", label: t("bulkCloseContaining") },
            { value: "notContaining", label: t("bulkCloseNotContaining") },
          ]}
          value={mode}
          onChange={setMode}
        />
        <TabSearchField
          query={query}
          onQueryChange={setQuery}
          label={t("bulkCloseQueryLabel")}
          placeholder={t("bulkCloseQueryPlaceholder")}
        />
        <Switch checked={includePinned} onChange={setIncludePinned} label={t("bulkCloseIncludePinned")} />

        <div className="flex min-h-[64px] flex-wrap gap-1.5 rounded-[10px] bg-surface-low p-2.5">
          {result.toClose.length === 0 ? (
            <p className="px-1 py-2 text-[12.5px] text-on-surface-variant">{t("bulkClosePreviewNone")}</p>
          ) : (
            result.toClose.map((candidate) => (
              <Chip key={candidate.tabId} as="span">
                {candidate.label}
              </Chip>
            ))
          )}
        </div>
        {result.excludedPinned.length > 0 ? (
          <p className="text-[11px] text-on-surface-variant">
            <Txt channel="fact" value={result.excludedPinned.length} kind="count" /> {t("bulkCloseExcludedNote")}
          </p>
        ) : null}
      </div>
    </Dialog>
  )
}
