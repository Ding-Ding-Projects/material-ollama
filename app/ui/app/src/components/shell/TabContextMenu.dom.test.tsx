import { fireEvent, render, screen } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"

import { TabContextMenu, type TabContextMenuItemDef } from "./TabContextMenu"

/**
 * There was no test on this file at all, which is how it shipped without the
 * one thing the contract is least willing to bend on.
 *
 * The tab menu had been forked from the shared ContextMenu because MenuItemDef
 * carried no `shortcut` field. The fork kept the items and lost the filter
 * field, and nothing noticed for as long as nothing asserted it -- a
 * design-parity capture is what eventually caught it, by putting the reference
 * menu (which opens with "Filter menu...") beside the built one (which opened
 * with nothing).
 *
 * "It only has five items" is explicitly not an exemption, so the filter test
 * below is the load-bearing one here.
 */
const items: TabContextMenuItemDef[] = [
  { key: "pin", label: "Pin tab", icon: "keep", onClick: vi.fn() },
  { key: "close-others", label: "Close other tabs", icon: "tab_close", onClick: vi.fn() },
  { key: "close", label: "Close tab", icon: "close", danger: true, shortcut: "Ctrl+W", onClick: vi.fn() },
]

const renderMenu = (overrides: Partial<React.ComponentProps<typeof TabContextMenu>> = {}) =>
  render(<TabContextMenu x={10} y={10} items={items} onClose={vi.fn()} {...overrides} />)

describe("TabContextMenu", () => {
  it("carries its own filter field, with no exemption for being short", () => {
    renderMenu()
    expect(screen.getByRole("textbox", { name: /filter menu/i })).toBeTruthy()
  })

  it("filters the items it shows without changing what they do", () => {
    renderMenu()
    expect(screen.getAllByRole("menuitem")).toHaveLength(3)
    fireEvent.change(screen.getByRole("textbox", { name: /filter menu/i }), {
      target: { value: "close other" },
    })
    const remaining = screen.getAllByRole("menuitem")
    expect(remaining).toHaveLength(1)
    expect(remaining[0].textContent).toContain("Close other tabs")
  })

  it("offers the regex builder from the filter field when a handler is given", () => {
    const onOpenRegexBuilder = vi.fn()
    renderMenu({ onOpenRegexBuilder })
    fireEvent.click(screen.getByRole("button", { name: /regex builder/i }))
    expect(onOpenRegexBuilder).toHaveBeenCalled()
  })

  it("shows an item's keyboard shortcut, which is the whole reason the fork existed", () => {
    renderMenu()
    const close = screen.getByRole("menuitem", { name: /close tab/i })
    expect(close.textContent).toContain("Ctrl+W")
  })

  it("shows no shortcut column for an item that has none", () => {
    renderMenu()
    // A padded-out placeholder would train people to look for keys that do
    // not exist, so an item without a real shortcut shows nothing at all.
    const pin = screen.getByRole("menuitem", { name: /pin tab/i })
    expect(pin.textContent).toBe("Pin tab")
  })

  it("closes on Escape", () => {
    const onClose = vi.fn()
    renderMenu({ onClose })
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("runs an item's action and then closes", () => {
    const onClose = vi.fn()
    const onClick = vi.fn()
    render(
      <TabContextMenu
        x={0}
        y={0}
        items={[{ key: "pin", label: "Pin tab", onClick }]}
        onClose={onClose}
      />,
    )
    fireEvent.click(screen.getByRole("menuitem", { name: /pin tab/i }))
    expect(onClick).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })
})
