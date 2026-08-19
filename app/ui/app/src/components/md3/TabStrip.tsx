import clsx from "clsx"
import type { KeyboardEvent, MouseEvent } from "react"
import { Icon, type SymbolName } from "./Icon"
import { FOCUS_RING_INSET } from "./tokens"

export interface TabStripTab {
  id: string
  label: string
  icon: SymbolName
  pinned?: boolean
  /** A CSS color for the small group-membership dot (e.g. "#7cb342"). */
  groupColor?: string
}

export interface TabStripProps {
  tabs: TabStripTab[]
  activeId: string
  onActivate: (id: string) => void
  onClose: (id: string) => void
  onContextMenu?: (id: string, event: MouseEvent) => void
  /** Renders a trailing "Close all unpinned tabs" affordance. */
  onCloseAll?: () => void
  className?: string
}

/**
 * The browser-style 38px tab strip: active tab matches the page background
 * (bg-background against the strip's own surface-low), 10px top corners,
 * a group-membership dot, a pin glyph, and a close button on every tab.
 */
export function TabStrip({ tabs, activeId, onActivate, onClose, onContextMenu, onCloseAll, className }: TabStripProps) {
  const move = (from: number, delta: number) => {
    const next = tabs[(from + delta + tabs.length) % tabs.length]
    if (next) onActivate(next.id)
  }

  const handleKeyDown = (event: KeyboardEvent<HTMLElement>, index: number) => {
    if (event.key === "ArrowRight") {
      event.preventDefault()
      move(index, 1)
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      move(index, -1)
    } else if (event.key === "Home") {
      event.preventDefault()
      const first = tabs[0]
      if (first) onActivate(first.id)
    } else if (event.key === "End") {
      event.preventDefault()
      const last = tabs[tabs.length - 1]
      if (last) onActivate(last.id)
    }
  }

  return (
    <div
      className={clsx(
        "flex h-[38px] items-center gap-1 bg-surface-low px-2",
        "border-b border-outline-variant",
        className,
      )}
    >
      <div
        role="tablist"
        aria-label="Open tabs"
        className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden [scrollbar-width:none]"
      >
        {tabs.map((tab, index) => {
          const active = tab.id === activeId
          // A real <button> can't contain another <button> (the close
          // control), so the tab itself is a div[role=tab] with its own
          // click/keydown wiring, and the close affordance is a genuine
          // nested <button> — keyboard-operable on its own rather than a
          // mouse-only span.
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              tabIndex={active ? 0 : -1}
              onClick={() => onActivate(tab.id)}
              onContextMenu={onContextMenu ? (event) => onContextMenu(tab.id, event) : undefined}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault()
                  onActivate(tab.id)
                  return
                }
                handleKeyDown(event, index)
              }}
              className={clsx(
                "flex h-full min-w-[56px] max-w-[200px] flex-none cursor-pointer items-center gap-1.5 rounded-t-[10px] border border-b-0 border-outline-variant py-[5px] pr-2 pl-3 text-[12.5px]",
                active ? "bg-background text-on-surface" : "bg-transparent text-on-surface-variant",
                FOCUS_RING_INSET,
              )}
            >
              {tab.groupColor ? (
                <span
                  aria-hidden="true"
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: tab.groupColor }}
                />
              ) : null}
              <Icon name={tab.icon} size={16} className="shrink-0" />
              <span className="min-w-0 flex-1 truncate whitespace-nowrap">{tab.label}</span>
              {tab.pinned ? <Icon name="keep" size={14} className="shrink-0 text-outline" /> : null}
              <button
                type="button"
                aria-label={`Close ${tab.label}`}
                onClick={(event) => {
                  event.stopPropagation()
                  onClose(tab.id)
                }}
                className="relative inline-flex shrink-0 items-center rounded-full p-0.5 text-outline before:absolute before:-inset-1 before:content-[''] hover:bg-surface-highest hover:text-on-surface"
              >
                <Icon name="close" size={14} />
              </button>
            </div>
          )
        })}
      </div>
      {onCloseAll ? (
        <button
          type="button"
          onClick={onCloseAll}
          title="Close all unpinned tabs"
          aria-label="Close all unpinned tabs"
          className={clsx(
            "relative flex h-7 shrink-0 items-center gap-1 rounded-full px-2.5 text-[11.5px] text-on-surface-variant hover:bg-surface-high",
            FOCUS_RING_INSET,
          )}
        >
          <Icon name="tab_close" size={16} />
          Close all
        </button>
      ) : null}
    </div>
  )
}
