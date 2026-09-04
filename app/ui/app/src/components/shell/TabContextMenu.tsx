import { ContextMenu } from "@/components/md3"
import type { MenuItemDef } from "@/components/md3/Menu"
import type { SymbolName } from "@/components/md3/Icon"

export interface TabContextMenuItemDef {
  readonly key: string
  readonly label: string
  readonly icon?: SymbolName
  readonly danger?: boolean
  readonly disabled?: boolean
  /** Display text for a keyboard shortcut, e.g. "Ctrl+W" -- set ONLY when
   * that exact shortcut genuinely fires for this item in this context
   * (see useShellKeyboardShortcuts.ts). Omitted entirely rather than
   * shown-but-inert when no real shortcut applies here. */
  readonly shortcut?: string
  readonly onClick: () => void
}

export interface TabContextMenuProps {
  x: number
  y: number
  items: readonly TabContextMenuItemDef[]
  onClose: () => void
  /** Opens the full regex builder from the menu's own filter field. */
  onOpenRegexBuilder?: () => void
}

/**
 * The tab strip's right-click menu.
 *
 * This used to be a hand-built sibling of the shared ContextMenu, forked for
 * one reason its own comment recorded honestly: MenuItemDef had no `shortcut`
 * field, and the lane that needed one could not edit the kit. The fork worked,
 * and it cost something nobody noticed -- the shared primitive renders a filter
 * field and its regex-builder affordance behind `filterable`, and the fork
 * silently did not. A design-parity capture caught it: the reference menu opens
 * with "Filter menu..." at its head and the built menu had nothing.
 *
 * The contract has no exemption for short menus, so the fix is to delete the
 * fork rather than to reimplement the field a second time. `shortcut` now lives
 * on MenuItemDef, which is where the fork should have pushed it originally.
 */
export function TabContextMenu({ x, y, items, onClose, onOpenRegexBuilder }: TabContextMenuProps) {
  // `key` is this surface's own stable identity for a row; the shared menu
  // keys by label, which is unique within one menu.
  const menuItems: MenuItemDef[] = items.map(({ key: _key, ...item }) => ({ ...item }))

  return (
    <ContextMenu
      x={x}
      y={y}
      items={menuItems}
      onClose={onClose}
      filterable
      onOpenRegexBuilder={onOpenRegexBuilder}
    />
  )
}
