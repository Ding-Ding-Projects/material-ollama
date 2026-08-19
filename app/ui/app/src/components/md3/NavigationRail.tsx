import clsx from "clsx"
import { Icon } from "./Icon"
import { FOCUS_RING_INSET } from "./tokens"

export interface NavigationRailItem {
  id: string
  icon: string
  label: string
  to: string
}

export interface NavigationRailProps {
  items: NavigationRailItem[]
  activeId: string
  onNavigate: (item: NavigationRailItem) => void
  className?: string
}

/**
 * The 84px primary navigation rail: a 56×30 secondary-container pill
 * behind the active icon (filled glyph variant), a 10.5px/500 label below.
 */
export function NavigationRail({ items, activeId, onNavigate, className }: NavigationRailProps) {
  return (
    <nav
      aria-label="Main navigation"
      className={clsx("flex w-[84px] flex-none flex-col items-center gap-0.5 overflow-y-auto bg-surface-low py-2.5", className)}
    >
      {items.map((item) => {
        const active = item.id === activeId
        return (
          <button
            key={item.id}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onNavigate(item)}
            className={clsx(
              "relative flex w-[76px] flex-col items-center gap-[3px] py-1",
              active ? "text-on-surface" : "text-on-surface-variant",
              FOCUS_RING_INSET,
            )}
          >
            <span
              className={clsx(
                "flex h-[30px] w-14 items-center justify-center rounded-full",
                active && "bg-secondary-container",
              )}
            >
              <Icon name={item.icon} size={20} fill={active} />
            </span>
            <span className="text-center text-[10.5px] leading-[1.15] font-medium">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
