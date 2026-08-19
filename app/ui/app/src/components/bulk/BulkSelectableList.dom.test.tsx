import { act, fireEvent, render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { UhProvider } from "@/uh"
import { fact } from "@/uh/localized"
import { BulkSelectableList } from "./BulkSelectableList"
import { useBulkSelection, type UseBulkSelectionResult } from "./useBulkSelection"

interface Widget {
  id: string
  name: string
}

const widgets: Widget[] = [
  { id: "w1", name: "Alpha" },
  { id: "w2", name: "Bravo" },
  { id: "w3", name: "Charlie" },
  { id: "w4", name: "Delta" },
]

function Harness({
  items = widgets,
  onSelectionChange,
}: {
  items?: Widget[]
  onSelectionChange?: (selection: UseBulkSelectionResult) => void
}) {
  const selection = useBulkSelection({ ids: items.map((item) => item.id) })
  onSelectionChange?.(selection)
  return (
    <UhProvider>
      <BulkSelectableList
        items={items}
        getId={(item) => item.id}
        renderPrimary={(item) => item.name}
        selection={selection}
        ariaLabel={fact("Widgets", "user-input")}
        rowAriaLabel={(item) => fact(`Select ${item.name}`, "user-input")}
        emptyState={<span>Nothing here</span>}
      />
      <output data-testid="selected-ids">{[...selection.selectedIds].sort().join(",")}</output>
      <output data-testid="scope">{selection.scope}</output>
      <output data-testid="count">{selection.count}</output>
    </UhProvider>
  )
}

function getCheckbox(name: string): HTMLInputElement {
  return screen.getByRole("checkbox", { name }) as HTMLInputElement
}

describe("BulkSelectableList", () => {
  it("renders an honest empty state and no rows for an empty list", () => {
    render(<Harness items={[]} />)
    expect(screen.getByText("Nothing here")).toBeInTheDocument()
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })

  it("click toggles exactly one row's checkbox", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(getCheckbox("Select Bravo"))
    expect(getCheckbox("Select Bravo")).toBeChecked()
    expect(getCheckbox("Select Alpha")).not.toBeChecked()
    expect(screen.getByTestId("selected-ids")).toHaveTextContent("w2")

    await user.click(getCheckbox("Select Bravo"))
    expect(getCheckbox("Select Bravo")).not.toBeChecked()
    expect(screen.getByTestId("selected-ids")).toHaveTextContent("")
  })

  it("shift-click selects the whole inclusive range from the last-clicked row", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(getCheckbox("Select Alpha"))
    // fireEvent (not userEvent.pointer) so the synthetic click's
    // `shiftKey` flag is set directly and unambiguously -- this is the
    // exact same `event.shiftKey` value BulkCheckbox's onClick handler
    // reads, so it's a faithful, direct test of that real code path.
    fireEvent.click(getCheckbox("Select Charlie"), { shiftKey: true })

    expect(getCheckbox("Select Alpha")).toBeChecked()
    expect(getCheckbox("Select Bravo")).toBeChecked()
    expect(getCheckbox("Select Charlie")).toBeChecked()
    expect(getCheckbox("Select Delta")).not.toBeChecked()
  })

  it("keyboard equivalent: arrow keys roam between rows and Space toggles the focused row", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    getCheckbox("Select Alpha").focus()
    expect(getCheckbox("Select Alpha")).toHaveFocus()

    await user.keyboard("{ArrowDown}")
    expect(getCheckbox("Select Bravo")).toHaveFocus()

    await user.keyboard(" ")
    expect(getCheckbox("Select Bravo")).toBeChecked()
    expect(getCheckbox("Select Alpha")).not.toBeChecked()
  })

  it("keyboard equivalent: Shift+Space range-selects from the last toggle, same as shift-click", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    getCheckbox("Select Alpha").focus()
    await user.keyboard(" ") // select Alpha, sets the anchor
    await user.keyboard("{ArrowDown}{ArrowDown}") // move to Charlie without toggling
    expect(getCheckbox("Select Charlie")).toHaveFocus()
    expect(getCheckbox("Select Charlie")).not.toBeChecked()

    await user.keyboard("{Shift>} {/Shift}")

    expect(getCheckbox("Select Alpha")).toBeChecked()
    expect(getCheckbox("Select Bravo")).toBeChecked()
    expect(getCheckbox("Select Charlie")).toBeChecked()
    expect(getCheckbox("Select Delta")).not.toBeChecked()
  })

  it("only one checkbox is a Tab stop at a time -- the rest are reachable by arrow keys (roving tabindex)", () => {
    render(<Harness />)
    const boxes = ["Alpha", "Bravo", "Charlie", "Delta"].map((name) => getCheckbox(`Select ${name}`))
    expect(boxes.map((box) => box.tabIndex)).toEqual([0, -1, -1, -1])
  })

  // The required proof: inverse selection matches the complement of the
  // positive selection, exercised through the real list component and
  // real user interactions (not just the hook in isolation -- see
  // useBulkSelection.dom.test.ts for that half).
  it("inverse selection matches the exact complement of the positive selection", async () => {
    const user = userEvent.setup()
    let latestSelection: UseBulkSelectionResult | undefined
    render(<Harness onSelectionChange={(selection) => (latestSelection = selection)} />)

    await user.click(getCheckbox("Select Alpha"))
    await user.click(getCheckbox("Select Charlie"))

    const before = new Map(widgets.map((widget) => [widget.id, latestSelection!.isSelected(widget.id)]))
    expect([...before.values()].filter(Boolean)).toHaveLength(2)

    act(() => {
      latestSelection!.invert()
    })

    // Re-render happened as a result of invert()'s state update; read the
    // freshest selection snapshot back off the rendered output.
    for (const widget of widgets) {
      const wasSelected = before.get(widget.id)!
      const checkbox = getCheckbox(`Select ${widget.name}`)
      if (wasSelected) {
        expect(checkbox).not.toBeChecked()
      } else {
        expect(checkbox).toBeChecked()
      }
    }
    expect(screen.getByTestId("count")).toHaveTextContent("2")
    expect(screen.getByTestId("selected-ids")).toHaveTextContent("w2,w4")
  })

  it("renders a caller-supplied rich control per row instead of printed text (the rich-controls contract)", async () => {
    const user = userEvent.setup()
    const onToggleActive = vi.fn()
    render(<RichControlHarness onToggleActive={onToggleActive} />)

    const control = screen.getByRole("button", { name: "toggle Bravo" })
    await user.click(control)
    expect(onToggleActive).toHaveBeenCalledWith("w2")
    // Clicking the rich control must NOT also toggle the row's own
    // selection checkbox -- it's a real, independent control, not a
    // decorative stand-in for the row click.
    expect(getCheckbox("Select Bravo")).not.toBeChecked()
  })
})

function RichControlHarness({ onToggleActive }: { onToggleActive: (id: string) => void }) {
  const selection = useBulkSelection({ ids: widgets.map((w) => w.id) })
  return (
    <UhProvider>
      <BulkSelectableList
        items={widgets}
        getId={(item) => item.id}
        renderPrimary={(item) => item.name}
        renderRichControl={(item) => (
          <button type="button" onClick={() => onToggleActive(item.id)}>
            toggle {item.name}
          </button>
        )}
        selection={selection}
        ariaLabel={fact("Widgets", "user-input")}
        rowAriaLabel={(item) => fact(`Select ${item.name}`, "user-input")}
      />
    </UhProvider>
  )
}
