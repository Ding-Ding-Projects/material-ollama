import { Button, Dialog } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
import { ScrollRegion } from "@/uh/a11yScrollRegion"
import { Txt, useT, type Localized } from "@/uh"
import "./bulk.dict"

export interface BulkActionPreviewDialogProps {
  readonly open: boolean
  readonly onClose: () => void
  readonly onConfirm: () => void
  readonly title: Localized
  /** Exactly how many of the current selection this action will actually
   * change -- "42 selected" and "42 will change" must be allowed to
   * differ, and this is what tells the truth about it. */
  readonly affectedCount: number
  readonly selectedCount: number
  /** A short reason for the gap between `selectedCount` and
   * `affectedCount`, e.g. "already in that state" -- required whenever
   * they differ so the gap is never left unexplained. */
  readonly skippedReason?: Localized
  /** Optional exact list of what will change, shown in a bounded,
   * scrollable region rather than clipped or omitted. */
  readonly affectedLabels?: readonly Localized[]
  readonly confirmLabel: Localized
}

/**
 * "Show the exact count and a reviewable preview of the affected items
 * before anything destructive [or otherwise consequential] runs." This is
 * the general-purpose preview step for a bulk action; a genuinely
 * irreversible action (delete) additionally goes through md3's
 * `ConfirmDialog` two-key-and-typed-keyword gate (see BulkActionBar.tsx)
 * rather than only this lighter review.
 */
export function BulkActionPreviewDialog({
  open,
  onClose,
  onConfirm,
  title,
  affectedCount,
  selectedCount,
  skippedReason,
  affectedLabels,
  confirmLabel,
}: BulkActionPreviewDialogProps) {
  const t = useT("bulk")
  const skippedCount = Math.max(0, selectedCount - affectedCount)

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="sm"
      title={title}
      actions={
        <>
          <Button variant="text" onClick={onClose}>
            <Txt ns="bulk" k="cancelRunning" channel="label" />
          </Button>
          <Button variant="filled" onClick={onConfirm} disabled={affectedCount === 0}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <div className="flex items-center gap-2 text-[13px]">
          <Icon name="check_circle" size={16} className="shrink-0 text-primary" />
          <span>
            <span className="font-semibold">{affectedCount}</span> <Txt ns="bulk" k="itemsWillChange" channel="label" />
          </span>
        </div>
        {skippedCount > 0 ? (
          <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
            <Icon name="cancel" size={15} className="shrink-0" />
            <span>
              <span className="font-semibold">{skippedCount}</span> <Txt ns="bulk" k="itemsSkipped" channel="label" />
              {skippedReason ? <>{" — "}{skippedReason}</> : null}
            </span>
          </div>
        ) : null}
        {affectedLabels && affectedLabels.length > 0 ? (
          <ScrollRegion ariaLabel={t("previewHeading")} maxHeightPx={200} className="rounded-[10px] border border-outline-variant bg-surface-low">
            <ul className="flex flex-col gap-1 p-2 text-[12.5px]">
              {affectedLabels.map((label, index) => (
                <li key={index} className="truncate px-1.5 py-1">
                  {label}
                </li>
              ))}
            </ul>
          </ScrollRegion>
        ) : null}
      </div>
    </Dialog>
  )
}
