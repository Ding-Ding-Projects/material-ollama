import clsx from "clsx"
import type { KeyboardEvent } from "react"
import { Icon } from "./Icon"
import { FOCUS_RING_INSET, TONE_CLASSES } from "./tokens"

export interface SegmentedControlOption<T extends string> {
  value: T
  label: string
}

export interface SegmentedControlProps<T extends string> {
  options: SegmentedControlOption<T>[]
  value: T
  onChange: (value: T) => void
  /** Accessible name for the group as a whole (e.g. "Language mode"). */
  label: string
  className?: string
}

/**
 * A single shared-border pill row with one selected option shown via a
 * check icon and the secondary-container fill — matches the design's
 * language-mode switcher exactly. Uses radiogroup/radio semantics with a
 * roving tabIndex so arrow keys move the selection like a native radio set.
 */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  label,
  className,
}: SegmentedControlProps<T>) {
  const move = (from: number, delta: number) => {
    const next = options[(from + delta + options.length) % options.length]
    if (next) onChange(next.value)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault()
      move(index, -1)
    } else if (event.key === "Home") {
      event.preventDefault()
      const first = options[0]
      if (first) onChange(first.value)
    } else if (event.key === "End") {
      event.preventDefault()
      const last = options[options.length - 1]
      if (last) onChange(last.value)
    }
  }

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={clsx(
        "inline-flex w-fit overflow-hidden rounded-full border border-outline-variant",
        className,
      )}
    >
      {options.map((option, index) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            tabIndex={selected ? 0 : -1}
            onClick={() => onChange(option.value)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-5 py-2.5 text-sm font-medium whitespace-nowrap",
              "transition-colors duration-150",
              selected ? TONE_CLASSES.secondary : "bg-transparent text-on-surface-variant hover:bg-surface-high",
              FOCUS_RING_INSET,
            )}
          >
            {selected ? <Icon name="check" size={15} className="shrink-0" /> : null}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
