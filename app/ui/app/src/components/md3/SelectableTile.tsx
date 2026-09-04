import clsx from "clsx"
import type { ButtonHTMLAttributes, ReactNode } from "react"

import { FOCUS_RING } from "./tokens"

export interface SelectableTileProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label" | "children"> {
  /** Required. The tile carries a mark rather than text, so this is its
   * only accessible name. */
  label: string
  selected?: boolean
  size?: "sm" | "md"
  className?: string
  children: ReactNode
}

const SIZES = { sm: "h-9 w-9", md: "h-10 w-10" } as const

/**
 * A round, single-choice tile whose content is arbitrary.
 *
 * IconButton is the right primitive whenever the content is a sprite glyph,
 * and it cannot be the right one here: the app-mark option in the appearance
 * editor renders the brand component rather than a SymbolName, so a row built
 * from IconButton would either drop that option or render it as a mixed row
 * of two different controls. That is the gap that kept the glyph picker a raw
 * button.
 *
 * Selection is the MD3 selected-container treatment -- primary-container fill
 * with a primary outline -- and it is announced through aria-pressed rather
 * than left to the fill alone, so the state is not colour-only.
 */
export function SelectableTile({
  label,
  selected = false,
  size = "md",
  className,
  disabled,
  children,
  ...rest
}: SelectableTileProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      aria-pressed={selected}
      disabled={disabled}
      className={clsx(
        "relative inline-flex shrink-0 items-center justify-center rounded-full border",
        "transition-colors duration-150",
        "disabled:opacity-38 disabled:pointer-events-none",
        selected
          ? "border-primary bg-primary-container"
          : "border-outline-variant bg-transparent hover:bg-surface-high",
        SIZES[size],
        FOCUS_RING,
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  )
}
