import type { FocusEventHandler, KeyboardEventHandler } from "react"

import { Checkbox } from "@/components/md3"
import type { Localized } from "@/uh"

export interface BulkCheckboxProps {
  readonly checked: boolean
  /** Tri-state: a dash rather than a tick, for the header "select all"
   * control when only some rows are selected. */
  readonly indeterminate?: boolean
  readonly onChange: (checked: boolean, event: { shiftKey: boolean }) => void
  readonly ariaLabel: Localized
  readonly className?: string
  /** Roving-tabindex passthrough (see uh/a11yRovingTabindex.ts) -- lets
   * BulkSelectableList make the checkbox itself the real keyboard target
   * for arrow-key row navigation, rather than a second, separate
   * focusable element layered on top of the row. */
  readonly tabIndex?: 0 | -1
  readonly onKeyDown?: KeyboardEventHandler<HTMLInputElement>
  readonly onFocus?: FocusEventHandler<HTMLInputElement>
  readonly "data-roving-index"?: number
}

/**
 * The multi-select checkbox every bulk-selectable row (and the header
 * "select all") uses.
 *
 * This was a native <input type="checkbox"> painted with `accent-primary`,
 * which is a lookalike rather than a primitive: accent-color hands the
 * browser its own shape and ignores the design's container, tick and state
 * layer entirely. It now delegates to the MD3 Checkbox, which keeps the
 * native input underneath for real semantics and draws the MD3 anatomy over
 * it. The props are unchanged, so every caller is untouched.
 */
export function BulkCheckbox({ ariaLabel, ...rest }: BulkCheckboxProps) {
  return <Checkbox label={ariaLabel} {...rest} />
}
