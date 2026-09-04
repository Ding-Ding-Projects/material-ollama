import * as Headless from "@headlessui/react"
import clsx from "clsx"
import type { ReactNode } from "react"
import { Icon, type SymbolName } from "./Icon"
import { FOCUS_RING, OVERLAY_RADIUS, OVERLAY_SURFACE, type AnchorPosition } from "./tokens"

export interface MenuItemDef {
  label: string
  icon?: SymbolName
  danger?: boolean
  disabled?: boolean
  onClick: () => void
  /**
   * The keyboard shortcut this item also answers to, shown right-aligned in
   * the item's own row.
   *
   * The contract is explicit that a context menu is where people find out
   * what an object can do, so a shortcut hidden there is a shortcut nobody
   * learns. Its absence here is also what made the tab strip fork this
   * primitive into a hand-built sibling -- and that fork silently lost the
   * filter field, which is a hard requirement for every menu.
   */
  shortcut?: string
}

export interface MenuProps {
  /**
   * The trigger's visible content. Menu renders the actual clickable
   * element itself (a real <button>), so pass icon/label content here —
   * never another interactive component — to avoid nesting one control
   * inside another.
   */
  trigger: ReactNode
  triggerLabel?: string
  items: MenuItemDef[]
  anchor?: AnchorPosition
  className?: string
  triggerClassName?: string
}

/** An anchored, keyboard-navigable dropdown menu built on Headless UI's
 * Menu — matches the design's model-picker / palette-adjacent menus. */
export function Menu({
  trigger,
  triggerLabel,
  items,
  anchor = "bottom start",
  className,
  triggerClassName,
}: MenuProps) {
  return (
    <Headless.Menu>
      <Headless.MenuButton
        aria-label={triggerLabel}
        className={clsx(
          "relative inline-flex items-center gap-1.5 rounded-full border border-outline-variant px-3 py-1.5 text-[12.5px] text-on-surface-variant",
          FOCUS_RING,
          triggerClassName,
        )}
      >
        {trigger}
      </Headless.MenuButton>
      <Headless.MenuItems
        transition
        anchor={anchor}
        className={clsx(
          "z-[75] flex min-w-[200px] flex-col gap-0.5 p-1.5",
          OVERLAY_SURFACE,
          OVERLAY_RADIUS.menu,
          "elev-2",
          className,
        )}
      >
        {items.map((item) => (
          <Headless.MenuItem key={item.label} disabled={item.disabled}>
            {({ focus }) => (
              <button
                type="button"
                onClick={item.onClick}
                disabled={item.disabled}
                className={clsx(
                  "flex w-full items-center gap-2.5 rounded-[9px] px-3 py-2.5 text-left text-[13px]",
                  "disabled:opacity-38 disabled:pointer-events-none",
                  focus && "bg-surface-high",
                  item.danger ? "text-error" : "text-on-surface",
                )}
              >
                {item.icon ? <Icon name={item.icon} size={17} className="shrink-0" /> : null}
                {item.label}
              </button>
            )}
          </Headless.MenuItem>
        ))}
      </Headless.MenuItems>
    </Headless.Menu>
  )
}
