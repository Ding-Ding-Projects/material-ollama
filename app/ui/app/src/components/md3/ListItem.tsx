import clsx from "clsx"
import type { MouseEventHandler, ReactNode, Ref } from "react"
import { FOCUS_RING_INSET, TONE_CLASSES } from "./tokens"

export interface ListItemProps {
  leading?: ReactNode
  title: ReactNode
  supporting?: ReactNode
  /** Often a real interactive control (an overflow IconButton, a remove
   * action) — the row itself is a div[role=button] rather than a real
   * <button> specifically so a nested trailing button stays valid HTML
   * instead of a button nested inside a button. */
  trailing?: ReactNode
  selected?: boolean
  /** `pill` (fully rounded — chat list, docs list) or `rounded` (the
   * user's corner-radius token — denser card-style lists). */
  shape?: "pill" | "rounded"
  onClick?: () => void
  onContextMenu?: MouseEventHandler<HTMLDivElement>
  /**
   * Pointer hover, and a ref to the row's own element.
   *
   * A list with keyboard navigation needs both: hover to drive the
   * highlighted index, and real geometry to scroll the highlighted row into
   * view. Without them the model picker's row had to stay a raw <button>,
   * because converting it would have broken arrow-key navigation in a way
   * no static test would have noticed.
   */
  onMouseEnter?: MouseEventHandler<HTMLDivElement>
  onMouseLeave?: MouseEventHandler<HTMLDivElement>
  itemRef?: Ref<HTMLDivElement>
  /** Anything the row needs to carry for its own bookkeeping, e.g. a
   * data-index a scroll helper measures against. */
  "data-index"?: number
  className?: string
}

/**
 * The chat-list / docs-list row: secondary-container fill when selected,
 * transparent with a surface-highest hover otherwise.
 */
export function ListItem({
  leading,
  title,
  supporting,
  trailing,
  selected = false,
  shape = "pill",
  onClick,
  onContextMenu,
  onMouseEnter,
  onMouseLeave,
  itemRef,
  className,
  ...rest
}: ListItemProps) {
  return (
    <div
      ref={itemRef}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-current={selected || undefined}
      onClick={onClick}
      onContextMenu={onContextMenu}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      data-index={rest["data-index"]}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      className={clsx(
        "flex w-full items-center gap-2 px-3 py-2.5 text-left text-[13px]",
        "transition-colors duration-150",
        onClick && "cursor-pointer",
        shape === "pill" ? "rounded-full" : "rounded-token",
        selected ? TONE_CLASSES.secondary : "bg-transparent text-on-surface hover:bg-surface-highest",
        FOCUS_RING_INSET,
        className,
      )}
    >
      {leading ? <span className="flex shrink-0 items-center">{leading}</span> : null}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {supporting ? (
          <span className="block truncate text-[11.5px] text-on-surface-variant">{supporting}</span>
        ) : null}
      </span>
      {trailing ? <span className="flex shrink-0 items-center">{trailing}</span> : null}
    </div>
  )
}
