import clsx from "clsx"
import type { ButtonHTMLAttributes } from "react"

import { Icon } from "./Icon"
import { FOCUS_RING } from "./tokens"

export interface ColorSwatchProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label" | "color"> {
  /** Any CSS colour. This is functional data encoding -- the swatch IS the
   * value -- so it is exempt from the chrome palette rule, exactly as a
   * chart series is. */
  color: string
  /** Required. A swatch has no text, so this is its only accessible name,
   * and "blue" is a better name than "#1a73e8" for someone listening to it. */
  label: string
  selected?: boolean
  size?: "sm" | "md"
  className?: string
}

const SIZES = {
  sm: { box: "h-5 w-5", tick: 12 },
  md: { box: "h-7 w-7", tick: 16 },
} as const

/**
 * A selectable colour sample.
 *
 * No Material primitive represents one: IconButton always paints its own
 * variant background and always renders a glyph, so a swatch built from it
 * shows the wrong colour and a tick on every unselected option. That gap is
 * why three separate colour pickers in this app kept raw <button> elements --
 * the seed picker, the app-mark glyph row and the tab-group colour row.
 *
 * The selected treatment is a ring plus a tick rather than a ring alone,
 * because a ring is a colour cue and colour is the one thing this control
 * cannot use to signal state -- every option is already a different colour.
 * The tick is drawn in the swatch's own contrast colour where one is given.
 */
export function ColorSwatch({
  color,
  label,
  selected = false,
  size = "md",
  className,
  disabled,
  ...rest
}: ColorSwatchProps) {
  const sizing = SIZES[size]

  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full",
        "border border-outline-variant transition-transform duration-150",
        "disabled:opacity-38 disabled:pointer-events-none",
        selected && "ring-2 ring-primary ring-offset-2 ring-offset-surface",
        sizing.box,
        FOCUS_RING,
        className,
      )}
      style={{ backgroundColor: color }}
      {...rest}
    >
      {selected ? (
        <Icon name="check" size={sizing.tick} className="text-on-primary mix-blend-difference" />
      ) : null}
    </button>
  )
}
