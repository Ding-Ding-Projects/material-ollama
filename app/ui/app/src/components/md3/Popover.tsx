import * as Headless from "@headlessui/react"
import clsx from "clsx"
import type { ReactNode } from "react"
import { FOCUS_RING, OVERLAY_RADIUS, OVERLAY_SURFACE, type AnchorPosition } from "./tokens"

export interface PopoverProps {
  /** The trigger's visible content — Popover renders the real <button>
   * itself, so pass content here rather than another interactive element. */
  trigger: ReactNode
  triggerLabel?: string
  children: ReactNode
  anchor?: AnchorPosition
  className?: string
  triggerClassName?: string
}

/** A generic anchored popover panel — the base every non-menu overlay
 * (color pickers, small forms, info panels) can build on. */
export function Popover({
  trigger,
  triggerLabel,
  children,
  anchor = "bottom start",
  className,
  triggerClassName,
}: PopoverProps) {
  return (
    <Headless.Popover>
      <Headless.PopoverButton
        aria-label={triggerLabel}
        className={clsx(
          "relative inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-[12.5px] text-on-surface-variant",
          FOCUS_RING,
          triggerClassName,
        )}
      >
        {trigger}
      </Headless.PopoverButton>
      <Headless.PopoverPanel
        transition
        anchor={anchor}
        className={clsx(
          "z-[75] p-4",
          OVERLAY_SURFACE,
          OVERLAY_RADIUS.panel,
          "elev-2",
          className,
        )}
      >
        {children}
      </Headless.PopoverPanel>
    </Headless.Popover>
  )
}
