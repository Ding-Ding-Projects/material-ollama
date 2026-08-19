import clsx from "clsx"
import type { FocusEventHandler, KeyboardEventHandler } from "react"
import { useEffect, useRef } from "react"
import { FOCUS_RING } from "@/components/md3/tokens"
import type { Localized } from "@/uh"

export interface BulkCheckboxProps {
  readonly checked: boolean
  /** Tri-state: renders the native indeterminate visual (a dash rather
   * than a check) -- used by the header "select all" control when only
   * some rows are selected. Native `<input type="checkbox">` semantics,
   * not a custom div, so screen readers get the real checkbox role and
   * state for free. */
  readonly indeterminate?: boolean
  readonly onChange: (checked: boolean, event: { shiftKey: boolean }) => void
  readonly ariaLabel: Localized
  readonly className?: string
  /** Roving-tabindex passthrough (see uh/a11yRovingTabindex.ts) -- lets
   * BulkSelectableList make the checkbox itself the real keyboard target
   * for arrow-key row navigation, rather than a second, separate
   * focusable element layered on top of the row. All optional so
   * BulkCheckbox stays usable stand-alone (e.g. a header "select all"
   * checkbox that isn't part of a roving group). */
  readonly tabIndex?: 0 | -1
  readonly onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  readonly onFocus?: FocusEventHandler<HTMLInputElement>
  readonly "data-roving-index"?: number
}

/** The multi-select checkbox every bulk-selectable row (and the header
 * "select all") uses. Real native semantics; `indeterminate` is set
 * imperatively via a ref because it has no HTML attribute equivalent. */
export function BulkCheckbox({
  checked,
  indeterminate = false,
  onChange,
  ariaLabel,
  className,
  tabIndex,
  onKeyDown,
  onFocus,
  ...rovingRest
}: BulkCheckboxProps) {
  const ref = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate
  }, [indeterminate])

  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      {...rovingRest}
      onClick={(event) => {
        // Read shiftKey from the click, not the change event -- a
        // native <input type="checkbox"> also synthesizes a `click` when
        // activated by Space/Enter while focused, and that synthetic
        // click still carries the real modifier-key state, so this
        // covers both mouse clicks and the keyboard equivalent for free.
        onChange(!checked, { shiftKey: event.shiftKey })
      }}
      onChange={() => {
        /* no-op: state change is driven from onClick above (it needs the
         * shiftKey flag, which ChangeEvent doesn't reliably carry); React
         * still requires a change handler on a controlled checkbox or it
         * warns about a read-only input. */
      }}
      className={clsx(
        "h-[18px] w-[18px] shrink-0 cursor-pointer rounded-[4px] border-2 border-outline",
        "accent-primary",
        FOCUS_RING,
        className,
      )}
    />
  )
}
