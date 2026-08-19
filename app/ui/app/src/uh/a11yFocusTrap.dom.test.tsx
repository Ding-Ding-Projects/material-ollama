import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { useState } from "react"
import { describe, expect, it } from "vitest"
import { useFocusTrap } from "./a11yFocusTrap"

function Overlay({ active }: { active: boolean }) {
  const containerRef = useFocusTrap<HTMLDivElement>(active)
  if (!active) return null
  return (
    <div ref={containerRef} data-testid="trap">
      <button type="button">first</button>
      <button type="button">middle</button>
      <button type="button">last</button>
    </div>
  )
}

function ToggleHarness() {
  const [open, setOpen] = useState(false)
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>
        open trigger
      </button>
      <Overlay active={open} />
      {open ? (
        <button type="button" onClick={() => setOpen(false)}>
          close
        </button>
      ) : null}
      <button type="button">outside after</button>
    </div>
  )
}

function StaticHarness() {
  return (
    <div>
      <button type="button">outside before</button>
      <Overlay active />
      <button type="button">outside after</button>
    </div>
  )
}

describe("useFocusTrap", () => {
  it("focuses the first focusable element inside the container on activation", () => {
    render(<StaticHarness />)
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
  })

  it("wraps Tab from the last item back to the first, never escaping the container", async () => {
    const user = userEvent.setup()
    render(<StaticHarness />)

    screen.getByRole("button", { name: "last" }).focus()
    await user.tab()
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
  })

  it("wraps Shift+Tab from the first item back to the last", async () => {
    const user = userEvent.setup()
    render(<StaticHarness />)

    screen.getByRole("button", { name: "first" }).focus()
    await user.tab({ shift: true })
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus()
  })

  it("cycles through middle items normally, then wraps at the boundary", async () => {
    const user = userEvent.setup()
    render(<StaticHarness />)

    screen.getByRole("button", { name: "middle" }).focus()
    await user.tab()
    expect(screen.getByRole("button", { name: "last" })).toHaveFocus()
    await user.tab()
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus()
  })

  it("moves focus into the overlay on activation and restores it to the trigger on deactivation", async () => {
    const user = userEvent.setup()
    render(<ToggleHarness />)

    const trigger = screen.getByRole("button", { name: "open trigger" })
    trigger.focus()
    expect(trigger).toHaveFocus()

    await user.click(trigger)
    expect(screen.getByRole("button", { name: "first" })).toHaveFocus()

    await user.click(screen.getByRole("button", { name: "close" }))
    expect(trigger).toHaveFocus()
  })
})
