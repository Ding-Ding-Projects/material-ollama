import clsx from "clsx"
import type { FocusEventHandler, KeyboardEventHandler } from "react"
import { useEffect, useRef } from "react"

import { Icon } from "./Icon"

export interface CheckboxProps {
  readonly checked: boolean
  /** Tri-state. MD3 draws a dash rather than a tick, and the control
   * reports aria-checked="mixed" -- used by a "select all" header when
   * only some rows are selected. */
  readonly indeterminate?: boolean
  readonly onChange: (checked: boolean, event: { shiftKey: boolean }) => void
  readonly label: string
  readonly disabled?: boolean
  readonly className?: string
  /** Roving-tabindex passthrough, so a list can make the checkbox itself
   * the keyboard target rather than layering a second focusable element
   * on top of the row. */
  readonly tabIndex?: 0 | -1
  readonly onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  readonly onFocus?: FocusEventHandler<HTMLInputElement>
  readonly "data-roving-index"?: number
}

/**
 * The Material Design 3 selection checkbox.
 *
 * A real <input type="checkbox"> carries the role, the checked state, the
 * indeterminate state and every platform keyboard behaviour for free -- so
 * it stays, visually hidden and stretched over the whole target, while the
 * box beside it is drawn to the MD3 anatomy. A div with role="checkbox"
 * would be the lookalike this codebase refuses; an `accent-color` native
 * checkbox is the other lookalike, because accent-color paints the browser's
 * own shape and ignores the design's container, tick and state layer.
 *
 * Anatomy: an 18px container with a 2px outline at rest, filled `primary`
 * with an `on-primary` glyph when selected, a 40px touch target, and a
 * state layer on hover and focus.
 */
export function Checkbox({
  checked,
  indeterminate = false,
  onChange,
  label,
  disabled = false,
  className,
  tabIndex,
  onKeyDown,
  onFocus,
  ...rovingRest
}: CheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  // `indeterminate` is a property with no HTML attribute, so it can only be
  // set imperatively.
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  const selected = checked || indeterminate

  return (
    <span
      className={clsx(
        "group relative inline-flex h-10 w-10 shrink-0 items-center justify-center",
        disabled && "opacity-38 pointer-events-none",
        className,
      )}
    >
      <input
        ref={ref}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        aria-label={label}
        aria-checked={indeterminate ? "mixed" : checked}
        tabIndex={tabIndex}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        {...rovingRest}
        onClick={(event) => {
          // Read shiftKey from the click rather than the change event: a
          // native checkbox activated by Space also synthesizes a click,
          // and that synthetic click still carries the real modifier
          // state -- so this covers mouse and keyboard with one handler.
          onChange(!checked, { shiftKey: event.shiftKey })
        }}
        onChange={() => {
          /* State is driven from onClick, which is the only one of the two
           * that reliably carries shiftKey. React still requires a change
           * handler on a controlled checkbox or it warns. */
        }}
        className="peer absolute inset-0 h-full w-full cursor-pointer opacity-0"
      />
      {/* State layer: hover and focus, per MD3. */}
      <span
        aria-hidden="true"
        className={clsx(
          "pointer-events-none absolute inset-0 rounded-full transition-colors duration-150",
          "group-hover:bg-on-surface/8 peer-focus-visible:bg-primary/12",
        )}
      />
      <span
        aria-hidden="true"
        className={clsx(
          "pointer-events-none relative flex h-[18px] w-[18px] items-center justify-center",
          "rounded-[2px] border-2 transition-colors duration-150",
          selected ? "border-primary bg-primary" : "border-on-surface-variant bg-transparent",
          "peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-primary",
        )}
      >
        {selected ? (
          <Icon
            name={indeterminate ? "remove" : "check"}
            className="h-[14px] w-[14px] text-on-primary"
          />
        ) : null}
      </span>
    </span>
  )
}
