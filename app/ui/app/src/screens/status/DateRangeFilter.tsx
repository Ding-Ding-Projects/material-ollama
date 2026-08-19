import clsx from "clsx"
import { useId } from "react"
import { Chip } from "@/components/md3"
import { Icon } from "@/components/md3/Icon"
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
 * history: two native `<input type="date">` fields (browser-native
 * anchored calendar popover *and* free typing -- both required by the
 * changelog-viewer contract, and a native control gets both for free
 * with none of the custom-calendar-grid bug surface) plus a row of
 * one-tap presets. "From" after "To" is reported inline rather than
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
            <button
              type="button"
              onClick={() => setPreset(null, null)}
              aria-label={t("dateFilterClear")}
              className={clsx(
                "relative inline-flex items-center gap-1 rounded-full px-2 py-1 text-[11.5px] text-on-surface-variant hover:bg-surface-high",
                FOCUS_RING_WITHIN,
              )}
            >
              <Icon name="close" size={13} />
              {t("dateFilterClear")}
            </button>
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
