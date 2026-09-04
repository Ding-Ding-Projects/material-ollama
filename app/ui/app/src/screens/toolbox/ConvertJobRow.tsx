import { Checkbox, IconButton, ProgressBar, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { fact, useT } from "@/uh"
import type { ConvertJob } from "./convertApi"
import { formatBytes } from "./toolboxFormat"
import "./convert.dict"

const STATE_LABEL_KEY = {
  queued: "stateQueued",
  running: "stateRunning",
  completed: "stateCompleted",
  failed: "stateFailed",
  canceled: "stateCanceled",
} as const

export interface ConvertJobRowProps {
  job: ConvertJob
  selected: boolean
  onToggleSelect: (id: string) => void
  onCancel: (id: string) => void
  onDelete: (id: string) => void
  onRetry: (job: ConvertJob) => void
  busy: boolean
}

/**
 * One row of the conversion queue. Progress is exactly what the backend
 * actually reports -- a job state, not a synthetic percentage: queued and
 * failed/canceled render a static bar, running renders the design's real
 * indeterminate sweep (ProgressBar's `value`-less mode), and completed
 * renders a full bar. There is no interpolated byte counter here because
 * convert.go's job record carries no such field -- inventing one would be
 * exactly the "simulated progress" this build's contract forbids.
 */
export function ConvertJobRow({ job, selected, onToggleSelect, onCancel, onDelete, onRetry, busy }: ConvertJobRowProps) {
  const t = useT("convert")
  const canCancel = job.state === "queued" || job.state === "running"
  const canDelete = job.state !== "running"
  const canRetry = job.state === "failed" || job.state === "canceled"
  const progressValue = job.state === "completed" ? 100 : job.state === "running" ? undefined : 0

  return (
    <Surface outlined radius="lg" className="flex flex-col gap-1.5 p-3.5">
      <div className="flex items-center gap-3">
        <Checkbox
          checked={selected}
          onChange={() => onToggleSelect(job.id)}
          label={fact(`Select ${job.inputFilename}`, "user-input")}
          className="-my-1.5"
        />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[12.5px] font-medium text-on-surface" title={job.inputFilename}>
            {fact(job.inputFilename, "path")}
          </p>
          <p className="text-[11px] text-on-surface-variant">
            {fact(job.sourceFormat, "user-input")} → {fact(job.targetFormat, "user-input")} ·{" "}
            {fact(formatBytes(job.inputBytes), "bytes")}
            {job.state === "completed" ? ` → ${fact(formatBytes(job.outputBytes), "bytes")}` : ""}
          </p>
        </div>
        <span className="w-[100px] shrink-0 text-right font-mono text-[11px] text-on-surface-variant">
          {t(STATE_LABEL_KEY[job.state])}
        </span>
        {canCancel ? (
          <IconButton
            icon="close"
            label={fact(`${t("cancelJob")} — ${job.inputFilename}`, "user-input")}
            size="sm"
            disabled={busy}
            onClick={() => onCancel(job.id)}
          />
        ) : null}
        {canRetry ? (
          <IconButton
            icon="restart_alt"
            label={fact(`${t("retryJob")} — ${job.inputFilename}`, "user-input")}
            size="sm"
            disabled={busy}
            onClick={() => onRetry(job)}
          />
        ) : null}
        {canDelete ? (
          <IconButton
            icon="delete"
            label={fact(`${t("deleteJob")} — ${job.inputFilename}`, "user-input")}
            size="sm"
            danger
            disabled={busy}
            onClick={() => onDelete(job.id)}
          />
        ) : null}
      </div>

      <ProgressBar
        value={progressValue}
        height={5}
        label={fact(`${t(STATE_LABEL_KEY[job.state])} — ${job.inputFilename}`, "user-input")}
      />

      {job.state === "completed" && job.outputPath ? (
        <p className="truncate text-[10.5px] text-on-surface-variant" title={job.outputPath}>
          {t("outputSavedTo")}: {fact(job.outputPath, "path")}
        </p>
      ) : null}

      {job.state === "failed" && job.error ? (
        <p className="flex items-start gap-1.5 text-[11px] text-error">
          <Icon name="error" size={13} className="mt-0.5 shrink-0" />
          <span>{fact(job.error, "user-input")}</span>
        </p>
      ) : null}
      {job.message ? <p className="text-[10.5px] text-on-surface-variant">{fact(job.message, "user-input")}</p> : null}
    </Surface>
  )
}
