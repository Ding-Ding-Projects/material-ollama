import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { useRovingTabindex, type RovingOrientation } from "./a11yRovingTabindex"

function List({
  items,
  orientation = "vertical",
  onActiveIndexChange,
}: {
  items: string[]
  orientation?: RovingOrientation
  onActiveIndexChange?: (index: number) => void
}) {
  const { containerRef, getItemProps } = useRovingTabindex({
    count: items.length,
    orientation,
    onActiveIndexChange,
  })
  return (
    <div ref={containerRef as React.RefObject<HTMLDivElement>} role="listbox">
      {items.map((label, index) => (
        <button key={label} type="button" {...getItemProps(index)}>
          {label}
        </button>
      ))}
    </div>
  )
}

describe("useRovingTabindex", () => {
  it("gives only the active item tabIndex 0, and every other item -1", () => {
    render(<List items={["a", "b", "c"]} />)
    const buttons = screen.getAllByRole("button")
    expect(buttons.map((b) => b.getAttribute("tabindex"))).toEqual(["0", "-1", "-1"])
  })

  it("ArrowDown moves the tab stop and DOM focus to the next item (vertical orientation)", async () => {
    const user = userEvent.setup()
    render(<List items={["a", "b", "c"]} />)

    screen.getByRole("button", { name: "a" }).focus()
    await user.keyboard("{ArrowDown}")

    expect(screen.getByRole("button", { name: "b" })).toHaveFocus()
    expect(screen.getByRole("button", { name: "b" })).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("tabindex", "-1")
  })

  it("ArrowUp moves backward and clamps at the first item rather than wrapping or throwing", async () => {
    const user = userEvent.setup()
    render(<List items={["a", "b", "c"]} />)

    screen.getByRole("button", { name: "a" }).focus()
    await user.keyboard("{ArrowUp}")
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus()
  })

  it("ArrowRight/ArrowLeft (not Up/Down) drive horizontal orientation", async () => {
    const user = userEvent.setup()
    render(<List items={["a", "b", "c"]} orientation="horizontal" />)

    screen.getByRole("button", { name: "a" }).focus()
    await user.keyboard("{ArrowDown}") // wrong axis -- must NOT move
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus()

    await user.keyboard("{ArrowRight}")
    expect(screen.getByRole("button", { name: "b" })).toHaveFocus()
  })

  it("Home jumps to the first item and End jumps to the last", async () => {
    const user = userEvent.setup()
    render(<List items={["a", "b", "c", "d"]} />)

    // A click (not a raw imperative `.focus()`) so the resulting onFocus
    // state update is properly wrapped in the same act() batch userEvent
    // already sets up for every interaction below.
    await user.click(screen.getByRole("button", { name: "b" }))
    await user.keyboard("{End}")
    expect(screen.getByRole("button", { name: "d" })).toHaveFocus()

    await user.keyboard("{Home}")
    expect(screen.getByRole("button", { name: "a" })).toHaveFocus()
  })

  it("clicking an item makes it the new tab stop, same as arrow navigation would", async () => {
    const user = userEvent.setup()
    render(<List items={["a", "b", "c"]} />)

    await user.click(screen.getByRole("button", { name: "c" }))
    expect(screen.getByRole("button", { name: "c" })).toHaveAttribute("tabindex", "0")
    expect(screen.getByRole("button", { name: "a" })).toHaveAttribute("tabindex", "-1")
  })

  it("reports the active index through onActiveIndexChange", async () => {
    const user = userEvent.setup()
    const onActiveIndexChange = vi.fn()
    render(<List items={["a", "b", "c"]} onActiveIndexChange={onActiveIndexChange} />)

    screen.getByRole("button", { name: "a" }).focus()
    await user.keyboard("{ArrowDown}")
    expect(onActiveIndexChange).toHaveBeenCalledWith(1)
  })
})
