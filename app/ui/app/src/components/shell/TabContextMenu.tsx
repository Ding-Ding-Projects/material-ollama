import clsx from "clsx"
import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { Icon, type SymbolName } from "@/components/md3/Icon"
import { OVERLAY_RADIUS, OVERLAY_SURFACE } from "@/components/md3/tokens"

export interface TabContextMenuItemDef {
  readonly key: string
  readonly label: string
  readonly icon?: SymbolName
  readonly danger?: boolean
  readonly disabled?: boolean
  /** Display text for a keyboard shortcut, e.g. "Ctrl+W" — set ONLY when
   * that exact shortcut genuinely fires for this item in this context
   * (see useShellKeyboardShortcuts.ts). Omitted entirely rather than
   * shown-but-inert when no real shortcut applies here. */
  readonly shortcut?: string
  readonly onClick: () => void
}

export interface TabContextMenuProps {
  /** Pointer position the menu opened at, clamped to the viewport after
   * mount so it never renders off-screen — same contract every anchored
   * overlay in this app follows. */
  x: number
  y: number
  items: readonly TabContextMenuItemDef[]
  onClose: () => void
}

/**
 * The tab strip's own right-click menu. A hand-built sibling of
 * `@/components/md3/ContextMenu` rather than a reuse of it — that shared
 * primitive's `MenuItemDef` has no shortcut field, and adding one there is
 * outside this lane's allowed paths — but it mirrors that component's
 * overlay contract exactly: paints its own surface, clamps to the
 * viewport and scrolls internally rather than clipping, closes on Escape
 * or an outside click, and restores focus to the caller (AppShell) on
 * close.
 *
 * The one addition: a right-aligned, monospace shortcut column, shown
 * only for the items whose `shortcut` is set.
 */
export function TabContextMenu({ x, y, items, onClose }: TabContextMenuProps) {
  const [position, setPosition] = useState({ left: x, top: y })
  const panelRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const rect = panel.getBoundingClientRect()
    const margin = 8
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - rect.width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - rect.height - margin)),
    })
    // Re-measure once after content settles at its natural size.
  }, [x, y, items.length])

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKey)
    return () => document.removeEventListener("keydown", handleKey)
  }, [onClose])

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
          "absolute flex max-h-[60vh] min-w-[240px] flex-col gap-0.5 overflow-y-auto p-1.5",
          OVERLAY_SURFACE,
          OVERLAY_RADIUS.menu,
          "elev-2",
        )}
      >
        {items.map((item) => (
          <button
            key={item.key}
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
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.shortcut ? (
              <span aria-hidden="true" className="shrink-0 font-mono text-[10.5px] text-outline">
                {item.shortcut}
              </span>
            ) : null}
          </button>
        ))}
      </div>
    </div>
  )
}
