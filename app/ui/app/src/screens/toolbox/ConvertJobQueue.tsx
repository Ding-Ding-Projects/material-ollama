import { useMemo, useState } from "react"
import { Button, Checkbox, ConfirmDialog } from "@/components/md3"
import { fact, useT } from "@/uh"
import type { ConvertJob } from "./convertApi"
import { ConvertJobRow } from "./ConvertJobRow"
import "./convert.dict"

const FINISHED_STATES = new Set<ConvertJob["state"]>(["completed", "failed", "canceled"])

export interface ConvertJobQueueProps {
  jobs: ConvertJob[]
  busyIds: ReadonlySet<string>
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  /** Re-queues a finished job's exact source/target pair -- routed through
   * the same `useConvertQueue.createJob` the initial "Convert" button
   * uses, so a retried job lands in local state immediately rather than
   * waiting on the next SSE tick or poll to appear. */
  onRetry: (job: ConvertJob) => void
}

/**
 * The job queue with real bulk actions -- select-all (scoped to what is
 * currently in the list, stated as a real "N selected" count rather than
 * an ambiguous "select all matches"), bulk cancel, bulk remove, and a
 * one-click "clear finished" that sweeps every completed/failed/canceled
 * job. Every bulk action reviews what it is about to do (the exact
 * count) before running, per the bulk-actions contract.
 */
export function ConvertJobQueue({ jobs, busyIds, onCancel, onDelete, onRetry }: ConvertJobQueueProps) {
  const t = useT("convert")
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set())
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false)

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const allSelected = jobs.length > 0 && selected.size === jobs.length
  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(jobs.map((j) => j.id)))
  }

  const selectedCancelable = useMemo(
    () => jobs.filter((j) => selected.has(j.id) && (j.state === "queued" || j.state === "running")),
    [jobs, selected],
  )
  const selectedDeletable = useMemo(
    () => jobs.filter((j) => selected.has(j.id) && j.state !== "running"),
    [jobs, selected],
  )
  const finished = useMemo(() => jobs.filter((j) => FINISHED_STATES.has(j.state)), [jobs])

  const handleBulkCancel = () => {
    for (const job of selectedCancelable) onCancel(job.id)
  }

  const handleBulkDelete = () => {
    for (const job of selectedDeletable) onDelete(job.id)
    setSelected(new Set())
    setConfirmBulkDelete(false)
  }

  const handleClearFinished = () => {
    for (const job of finished) onDelete(job.id)
  }

  if (jobs.length === 0) {
    return <p className="py-4 text-center text-[12.5px] text-on-surface-variant">{t("jobQueueEmpty")}</p>
  }

  const countText = fact(t("selectedCount").split("{n}").join(String(selected.size)), "count")

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-1.5 text-[11.5px] text-on-surface-variant">
          <Checkbox checked={allSelected} onChange={toggleSelectAll} label={t("selectAll")} />
          {t("selectAll")}
        </div>
        {selected.size > 0 ? <span className="text-[11.5px] text-on-surface-variant">{countText}</span> : null}
        <div className="ml-auto flex gap-2">
          {selectedCancelable.length > 0 ? (
            <Button variant="text" size="sm" onClick={handleBulkCancel}>
              {t("bulkCancel")}
            </Button>
          ) : null}
          {selectedDeletable.length > 0 ? (
            <Button variant="text" size="sm" onClick={() => setConfirmBulkDelete(true)}>
              {t("bulkDelete")}
            </Button>
          ) : null}
          {finished.length > 0 ? (
            <Button variant="text" size="sm" icon="delete_sweep" onClick={handleClearFinished}>
              {t("clearFinished")}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-2">
        {jobs.map((job) => (
          <ConvertJobRow
            key={job.id}
            job={job}
            selected={selected.has(job.id)}
            onToggleSelect={toggleSelect}
            onCancel={onCancel}
            onDelete={onDelete}
            onRetry={onRetry}
            busy={busyIds.has(job.id)}
          />
        ))}
      </div>

      <ConfirmDialog
        open={confirmBulkDelete}
        onClose={() => setConfirmBulkDelete(false)}
        title={t("bulkDelete")}
        body={fact(t("bulkDeleteBody").split("{n}").join(String(selectedDeletable.length)), "user-input")}
        keyword="REMOVE"
        actionLabel={t("bulkDelete")}
        onConfirm={handleBulkDelete}
      />
    </div>
  )
}
