import clsx from "clsx"
import { useId } from "react"
import { FOCUS_RING } from "./tokens"

export interface SliderProps {
  min: number
  max: number
  step: number
  value: number
  onChange: (value: number) => void
  label?: string
  /** A formatted readout shown beside the label, e.g. "180px" or a funny-
   * level name like "Playful" — the design shows this next to every slider
   * it labels (corner radius, funny level, …). */
  valueLabel?: string
  disabled?: boolean
  className?: string
}

/**
 * A native `<input type="range">` — the design deliberately keeps sliders
 * native rather than reimplementing thumb dragging, and colors the thumb
 * via `accent-color`, which is what the mockup's own global stylesheet does
 * (`input[type=range]{accent-color:var(--p)}`). We can't add that rule to
 * the app's CSS from this lane, so it's applied locally via an arbitrary
 * `accent-[var(--p)]` utility referencing the raw token directly.
 */
export function Slider({
  min,
  max,
  step,
  value,
  onChange,
  label,
  valueLabel,
  disabled = false,
  className,
}: SliderProps) {
  const id = useId()
  return (
    <div className={clsx("flex flex-col gap-1", className)}>
      {label ? (
        <div className="flex items-center justify-between gap-2 text-xs font-medium">
          <label htmlFor={id}>{label}</label>
          {valueLabel ? (
            <span className="font-mono text-on-surface-variant">{valueLabel}</span>
          ) : null}
        </div>
      ) : null}
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(Number(event.target.value))}
        aria-label={label ? undefined : "Slider"}
        aria-valuetext={valueLabel}
        className={clsx(
          "h-1.5 w-full cursor-pointer appearance-none rounded-full bg-surface-highest accent-[var(--p)]",
          "disabled:cursor-not-allowed disabled:opacity-38",
          FOCUS_RING,
        )}
      />
    </div>
  )
}
