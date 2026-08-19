import { IconButton, Menu, ProgressBar, Surface } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { Txt, fact, useT } from "@/uh"
import { FitBadge } from "./FitBadge"
import { formatBytes2, pullPercent } from "./format"
import type { PullQueueItemWithFit, PullState } from "./types"
import "./modelsUi.dict"

const STATE_LABEL_KEY = {
  queued: "stateQueued",
  downloading: "stateDownloading",
  paused: "statePaused",
  completed: "stateQueued", // never rendered — completed items aren't shown in this card
  failed: "stateFailed",
  canceled: "stateCanceled",
} as const satisfies Record<PullState, string>

function statusLine(item: PullQueueItemWithFit): string {
  const pct = pullPercent(item.completedBytes, item.totalBytes)
  if (item.state === "downloading" && pct !== undefined) {
    const completed = formatBytes2(item.completedBytes ?? 0)
    const total = formatBytes2(item.totalBytes ?? 0)
    return `${Math.round(pct)}% · ${completed} / ${total}`
  }
  return item.message || item.error || ""
}

interface PullQueueRowProps {
  item: PullQueueItemWithFit
  busy: boolean
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string, deleteData: boolean) => void
}

function PullQueueRow({ item, busy, onPause, onResume, onCancel }: PullQueueRowProps) {
  const t = useT("modelsUi")
  const pct = pullPercent(item.completedBytes, item.totalBytes)
  const canPause = item.state === "downloading"
  const canResume = item.state === "paused" || item.state === "failed" || item.state === "canceled"
  const canCancel = item.state !== "canceled"
  const line = statusLine(item)

  return (
    <div className="flex flex-col gap-1.5 py-1">
      <div className="flex items-center gap-3">
        <span
          className="w-[170px] shrink-0 truncate font-mono text-[12.5px]"
          title={item.model}
        >
          {fact(item.model, "model-name")}
        </span>
        <div className="min-w-0 flex-1">
          <ProgressBar value={pct} label={fact(`${t(STATE_LABEL_KEY[item.state])} — ${item.model}`, "user-input")} />
        </div>
        <span className="w-[90px] shrink-0 text-right font-mono text-[11px] text-on-surface-variant">
          <Txt ns="modelsUi" k={STATE_LABEL_KEY[item.state]} />
        </span>
        {item.fit ? <FitBadge fit={item.fit} modelLabel={item.model} /> : null}
        {canPause ? (
          <IconButton
            icon="pause"
            label={fact(`${t("pauseAction")} — ${item.model}`, "user-input")}
            size="sm"
            disabled={busy}
            onClick={() => onPause(item.id)}
          />
        ) : null}
        {canResume ? (
          <IconButton
            icon="play_arrow"
            label={fact(`${t("resumeAction")} — ${item.model}`, "user-input")}
            size="sm"
            disabled={busy}
            onClick={() => onResume(item.id)}
          />
        ) : null}
        {canCancel ? (
          <Menu
            trigger={
              <>
                <Icon name="close" size={13} />
                <span className="font-medium">
                  <Txt ns="modelsUi" k="cancelAction" />
                </span>
              </>
            }
            triggerLabel={fact(`${t("cancelAction")} — ${item.model}`, "user-input")}
            triggerClassName="!px-2.5 !py-1 !text-[11px]"
            anchor="bottom end"
            items={[
              { label: t("cancelKeepData"), icon: "keep", onClick: () => onCancel(item.id, false), disabled: busy },
              {
                label: t("cancelDeleteData"),
                icon: "delete",
                danger: true,
                onClick: () => onCancel(item.id, true),
                disabled: busy,
              },
            ]}
          />
        ) : null}
      </div>
      {item.state === "paused" ? (
        <p className="pl-[182px] text-[11px] text-on-surface-variant">
          <Txt ns="modelsUi" k="pausedNotice" channel="copy" />
        </p>
      ) : null}
      {line ? (
        <p className={`pl-[182px] text-[11px] ${item.state === "failed" ? "text-error" : "text-on-surface-variant"}`}>
          {fact(line, "user-input")}
        </p>
      ) : null}
    </div>
  )
}

export interface PullQueueCardProps {
  items: PullQueueItemWithFit[]
  busyIds: ReadonlySet<string>
  onPause: (id: string) => void
  onResume: (id: string) => void
  onCancel: (id: string, deleteData: boolean) => void
}

/**
 * Every item whose state isn't "completed" (a completed pull becomes an
 * installed model — see the grid below — so it drops out of this card
 * rather than lingering as a 100% bar forever).
 */
export function PullQueueCard({ items, busyIds, onPause, onResume, onCancel }: PullQueueCardProps) {
  const active = items.filter((item) => item.state !== "completed")
  if (active.length === 0) return null

  return (
    <Surface tier="lowest" outlined radius="token" className="flex flex-col gap-2.5 p-4">
      <span className="text-[13px] font-semibold text-primary">
        <Txt ns="models" k="pullQueue" />
      </span>
      <div className="flex flex-col divide-y divide-outline-variant">
        {active.map((item) => (
          <PullQueueRow
            key={item.id}
            item={item}
            busy={busyIds.has(item.id)}
            onPause={onPause}
            onResume={onResume}
            onCancel={onCancel}
          />
        ))}
      </div>
    </Surface>
  )
}
