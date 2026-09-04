import clsx from "clsx"
import { useId } from "react"
import { Button, Chip } from "@/components/md3"
import { FOCUS_RING_WITHIN } from "@/components/md3/tokens"
import { Txt, useT } from "@/uh"
import type { DateRange } from "./dateRange"
import "./status.dict"

export type { DateRange } from "./dateRange"

export interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

function isoToday(): string {
  return new Date().toISOString().slice(0, 10)
}

/** Monday of the current week, ISO date. */
function isoStartOfWeek(): string {
  const now = new Date()
  const day = now.getDay() // 0 = Sunday
  const diff = day === 0 ? 6 : day - 1
  const monday = new Date(now)
  monday.setDate(now.getDate() - diff)
  return monday.toISOString().slice(0, 10)
}

/**
 * The date-range filter shared by the changelog viewer and local version
 * history: two native `<input type="date">` fields plus a row of one-tap
 * presets.
 *
 * Those two date fields are a deliberate, recorded exception to the
 * "Material Design 3 primitives only" rule, not an oversight. The
 * changelog-viewer contract requires BOTH an anchored calendar popover and
 * free typing in the locale's format. The Material kit has no date-picker
 * primitive, and a hand-built calendar grid would have to reimplement
 * keyboard navigation, locale parsing and the popover -- losing the native
 * picker entirely if any of that is wrong. The native control gives both
 * behaviours, and it wears the real Material tokens (outline-variant
 * border, surface-low fill, the shared focus ring), so it carries the
 * correct anatomy even though it is not a kit component. Every other
 * control on this surface is a kit primitive. "From" after "To" is reported inline rather than
 * silently swapped or ignored, so a mistyped range never silently filters
 * to nothing without saying why.
 */
export function DateRangeFilter({ value, onChange, className }: DateRangeFilterProps) {
  const t = useT("status")
  const fromId = useId()
  const toId = useId()

  const invalid = Boolean(value.from && value.to && value.from > value.to)

  const setPreset = (from: string | null, to: string | null) => onChange({ from, to })

  return (
    <div className={clsx("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-end gap-3">
        <div className="flex flex-col gap-1">
          <label htmlFor={fromId} className="text-[11px] font-medium text-on-surface-variant">
            {t("dateFromLabel")}
          </label>
          <input
            id={fromId}
            type="date"
            value={value.from ?? ""}
            aria-label={`${t("dateFilterLabel")} — ${t("dateFromLabel")}`}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange({ ...value, from: event.target.value || null })}
            className={clsx(
              "rounded-[10px] border border-outline-variant bg-surface-low px-2.5 py-1.5 text-[12.5px] outline-none",
              invalid && "border-error",
              FOCUS_RING_WITHIN,
            )}
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor={toId} className="text-[11px] font-medium text-on-surface-variant">
            {t("dateToLabel")}
          </label>
          <input
            id={toId}
            type="date"
            value={value.to ?? ""}
            aria-label={`${t("dateFilterLabel")} — ${t("dateToLabel")}`}
            aria-invalid={invalid || undefined}
            onChange={(event) => onChange({ ...value, to: event.target.value || null })}
            className={clsx(
              "rounded-[10px] border border-outline-variant bg-surface-low px-2.5 py-1.5 text-[12.5px] outline-none",
              invalid && "border-error",
              FOCUS_RING_WITHIN,
            )}
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5 pb-0.5">
          <Chip as="button" onClick={() => setPreset(isoToday(), isoToday())}>
            {t("dateFilterToday")}
          </Chip>
          <Chip as="button" onClick={() => setPreset(isoStartOfWeek(), isoToday())}>
            {t("dateFilterThisWeek")}
          </Chip>
          <Chip as="button" onClick={() => setPreset(null, null)}>
            {t("dateFilterAll")}
          </Chip>
          {value.from || value.to ? (
            <Button
              variant="text"
              size="sm"
              shape="pill"
              icon="close"
              onClick={() => setPreset(null, null)}
              aria-label={t("dateFilterClear")}
            >
              {t("dateFilterClear")}
            </Button>
          ) : null}
        </div>
      </div>
      {invalid ? (
        <p role="alert" className="text-[11px] text-error">
          <Txt ns="status" k="dateFilterInvalid" channel="copy" />
        </p>
      ) : null}
    </div>
  )
}
