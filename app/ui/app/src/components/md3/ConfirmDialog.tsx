import * as Headless from "@headlessui/react"
import clsx from "clsx"
import { useEffect, useId, useState } from "react"
import { Icon } from "./Icon"
import { FOCUS_RING, FOCUS_RING_WITHIN, OVERLAY_BACKDROP, OVERLAY_RADIUS, OVERLAY_SURFACE } from "./tokens"

export interface ConfirmDialogProps {
  open: boolean
  onClose: () => void
  title: string
  body: string
  /** The exact word the user must type (case-insensitive, trimmed) before
   * the destructive action arms — never a decision the caller can skip. */
  keyword: "DELETE" | "REMOVE" | "RESET" | "CLEAR"
  actionLabel: string
  onConfirm: () => void
  className?: string
}

/**
 * The destructive-action super-confirmation gate: nothing here is
 * ambiguous about what will happen or that it can't be undone, and the
 * action button stays inert — visually and functionally — until the exact
 * keyword is typed. Matches the design's confirm-delete dialog precisely,
 * including its literal white-on-error armed button (there is no `on-err`
 * token in the raw MD3 palette, only `on-err-c` for the container tone).
 */
export function ConfirmDialog({
  open,
  onClose,
  title,
  body,
  keyword,
  actionLabel,
  onConfirm,
  className,
}: ConfirmDialogProps) {
  const [text, setText] = useState("")
  const inputId = useId()

  useEffect(() => {
    if (!open) setText("")
  }, [open])

  const armed = text.trim().toUpperCase() === keyword

  const handleConfirm = () => {
    if (!armed) return
    onConfirm()
    onClose()
  }

  return (
    <Headless.Dialog open={open} onClose={onClose} role="alertdialog" className="relative z-[70]">
      <Headless.DialogBackdrop transition className={OVERLAY_BACKDROP} />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <Headless.DialogPanel
          transition
          className={clsx(
            "flex w-[min(440px,92vw)] flex-col gap-3.5 p-6",
            OVERLAY_SURFACE,
            OVERLAY_RADIUS.dialog,
            "elev-2",
            className,
          )}
        >
          <Icon name="warning" size={26} className="text-error" />
          <Headless.DialogTitle className="text-lg font-semibold">{title}</Headless.DialogTitle>
          <p className="text-[13.5px] leading-[1.55] whitespace-pre-wrap text-on-surface-variant">{body}</p>
          <label htmlFor={inputId} className="sr-only">
            Type {keyword} to confirm
          </label>
          <input
            id={inputId}
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={`Type ${keyword} to confirm`}
            autoComplete="off"
            className={clsx(
              "rounded-xl border border-outline-variant bg-surface-low px-3.5 py-2.5 font-mono text-[13px] outline-none",
              FOCUS_RING_WITHIN,
            )}
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className={clsx(
                "relative rounded-full px-[18px] py-2.5 text-[13.5px] font-semibold text-primary hover:bg-surface-high",
                FOCUS_RING,
              )}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={!armed}
              className={clsx(
                "relative rounded-full px-5 py-2.5 text-[13.5px] font-semibold transition-colors duration-150",
                armed
                  ? "bg-error text-white"
                  : "cursor-not-allowed bg-surface-highest text-outline",
                FOCUS_RING,
              )}
            >
              {actionLabel}
            </button>
          </div>
        </Headless.DialogPanel>
      </div>
    </Headless.Dialog>
  )
}
