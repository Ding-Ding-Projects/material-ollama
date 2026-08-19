import * as Headless from "@headlessui/react"
import clsx from "clsx"
import type { ReactNode } from "react"
import { Icon } from "./Icon"
import { FOCUS_RING, OVERLAY_BACKDROP, OVERLAY_RADIUS, OVERLAY_SURFACE } from "./tokens"

export interface DialogProps {
  open: boolean
  onClose: () => void
  size?: "sm" | "md" | "lg"
  icon?: string
  title: ReactNode
  children: ReactNode
  /** Right-aligned footer button row — pass e.g. two <Button>s. */
  actions?: ReactNode
  className?: string
}

const SIZE_CLASSES: Record<NonNullable<DialogProps["size"]>, string> = {
  sm: "w-[min(400px,92vw)]",
  md: "w-[min(480px,92vw)]",
  lg: "w-[min(640px,94vw)]",
}

/**
 * The general-purpose modal dialog — surface-lowest, elev-2, 24px corners,
 * matching the "Edit appearance" panel. Overlays paint their own
 * background/border/elevation/shape and are bounded by the viewport,
 * scrolling internally rather than clipping content past a height cap.
 */
export function Dialog({ open, onClose, size = "md", icon, title, children, actions, className }: DialogProps) {
  return (
    <Headless.Dialog open={open} onClose={onClose} className="relative z-[70]">
      <Headless.DialogBackdrop transition className={OVERLAY_BACKDROP} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Headless.DialogPanel
          transition
          className={clsx(
            "flex max-h-[80vh] flex-col gap-4 overflow-y-auto p-[22px]",
            OVERLAY_SURFACE,
            OVERLAY_RADIUS.dialogCompact,
            "elev-2",
            SIZE_CLASSES[size],
            className,
          )}
        >
          <div className="flex items-center gap-2.5">
            {icon ? <Icon name={icon} size={22} className="shrink-0 text-primary" /> : null}
            <Headless.DialogTitle className="flex-1 text-[17px] font-semibold">
              {title}
            </Headless.DialogTitle>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className={clsx(
                "relative inline-flex shrink-0 items-center justify-center rounded-full p-1 text-on-surface-variant hover:bg-surface-high",
                "before:content-[''] before:absolute before:-inset-1.5",
                FOCUS_RING,
              )}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
          <div className="min-h-0">{children}</div>
          {actions ? <div className="flex items-center justify-end gap-2">{actions}</div> : null}
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}
