import clsx from "clsx"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Icon } from "./Icon"
import type { MenuItemDef } from "./Menu"
import { FOCUS_RING_WITHIN, OVERLAY_RADIUS, OVERLAY_SURFACE } from "./tokens"

export interface ContextMenuProps {
  /** Pointer position the menu opened at (e.g. from a contextmenu event's
   * clientX/clientY) — clamped to the viewport after mount so it never
   * renders off-screen. */
  x: number
  y: number
  items: MenuItemDef[]
  onClose: () => void
  /** Shows the filter field + `.* ` regex-builder affordance at the top,
   * matching the design's tab/chat context menus. */
  filterable?: boolean
  onOpenRegexBuilder?: () => void
}

/**
 * A right-click menu positioned at an arbitrary point rather than anchored
 * to a trigger element, so it can't reuse Headless UI's Menu. Bounded by
 * the viewport and scrolls internally instead of clipping past a height
 * cap, per the overlay contract every primitive here follows.
 */
export function ContextMenu({ x, y, items, onClose, filterable = false, onOpenRegexBuilder }: ContextMenuProps) {
  const [query, setQuery] = useState("")
  const [position, setPosition] = useState({ left: x, top: y })
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.min(x, window.innerWidth - rect.width - margin),
      top: Math.min(y, window.innerHeight - rect.height - margin),
    })
    // Re-measure once after content settles at its natural size.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [x, y, query, items.length])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

  const filtered = filterable && query
    ? items.filter((item) => item.label.toLowerCase().includes(query.toLowerCase()))
    : items

  return (
    <div
      className="fixed inset-0 z-[80]"
      onClick={onClose}
      onContextMenu={(event) => {
        event.preventDefault()
        onClose()
      }}
    >
      <div
        ref={panelRef}
        role="menu"
        onClick={(event) => event.stopPropagation()}
        style={{ left: position.left, top: position.top }}
        className={clsx(
          "absolute flex max-h-[60vh] min-w-[220px] flex-col gap-0.5 overflow-y-auto p-1.5",
          OVERLAY_SURFACE,
          OVERLAY_RADIUS.menu,
          "elev-2",
        )}
      >
        {filterable ? (
          <div className="flex items-center gap-1 px-1 pt-0.5 pb-1.5">
            <input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Filter menu…"
              aria-label="Filter menu"
              className={clsx(
                "min-w-0 flex-1 rounded-lg bg-surface-highest px-2.5 py-1.5 text-xs outline-none",
                FOCUS_RING_WITHIN,
              )}
            />
            {onOpenRegexBuilder ? (
              <button
                type="button"
                onClick={onOpenRegexBuilder}
                title="Regex builder"
                aria-label="Regex builder"
                className="rounded-md px-1.5 py-1 font-mono text-[11px] text-outline hover:bg-surface-high hover:text-on-surface"
              >
                .*
              </button>
            ) : null}
          </div>
        ) : null}
        {filtered.map((item) => (
          <button
            key={item.label}
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              item.onClick()
              onClose()
            }}
            className={clsx(
              "flex items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13px]",
              "hover:bg-surface-high disabled:opacity-38 disabled:pointer-events-none",
              item.danger ? "text-error" : "text-on-surface",
            )}
          >
            {item.icon ? <Icon name={item.icon} size={17} className="shrink-0" /> : null}
            <span className="flex-1">{item.label}</span>
            {item.shortcut ? (
              // Exposed as text rather than an aria-keyshortcuts attribute:
              // the row's accessible name already carries the label, and
              // announcing the keys twice is worse than announcing them once.
              <span className="shrink-0 font-mono text-[11px] text-on-surface-variant">
                {item.shortcut}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
