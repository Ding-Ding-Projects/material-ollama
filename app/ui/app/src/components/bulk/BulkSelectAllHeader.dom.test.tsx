import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"
import { UhProvider } from "@/uh"
import { BulkSelectAllHeader } from "./BulkSelectAllHeader"
import { useBulkSelection } from "./useBulkSelection"

const ids = ["a", "b", "c"]

function Harness({ totalMatchCount }: { totalMatchCount?: number }) {
  const selection = useBulkSelection({ ids, totalMatchCount })
  return (
    <UhProvider>
      <BulkSelectAllHeader ids={ids} selection={selection} />
      <button type="button" onClick={() => selection.toggle("b")}>
        toggle b
      </button>
      <output data-testid="count">{selection.count}</output>
    </UhProvider>
  )
}

function getMasterCheckbox(): HTMLInputElement {
  return screen.getByRole("checkbox", { name: "Select all on this page" }) as HTMLInputElement
}

describe("BulkSelectAllHeader", () => {
  it("is the entry point from a genuinely empty selection -- clicking it alone selects everything on the page", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    expect(getMasterCheckbox()).not.toBeChecked()
    expect(getMasterCheckbox()).not.toBePartiallyChecked()

    await user.click(getMasterCheckbox())
    expect(screen.getByTestId("count")).toHaveTextContent("3")
  })

  it("shows the indeterminate state for a partial selection, and checked for a full one", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(screen.getByRole("button", { name: "toggle b" }))
    expect(getMasterCheckbox()).not.toBeChecked()
    expect(getMasterCheckbox()).toBePartiallyChecked()

    await user.click(getMasterCheckbox())
    expect(getMasterCheckbox()).toBeChecked()
    expect(getMasterCheckbox()).not.toBePartiallyChecked()
    expect(screen.getByTestId("count")).toHaveTextContent("3")
  })

  it("unchecking the fully-checked master checkbox clears the selection", async () => {
    const user = userEvent.setup()
    render(<Harness />)

    await user.click(getMasterCheckbox())
    expect(screen.getByTestId("count")).toHaveTextContent("3")

    await user.click(getMasterCheckbox())
    expect(screen.getByTestId("count")).toHaveTextContent("0")
    expect(getMasterCheckbox()).not.toBeChecked()
    expect(getMasterCheckbox()).not.toBePartiallyChecked()
  })

  it("offers 'Select all matching' only once the whole page is selected AND there are more matches than are loaded", async () => {
    const user = userEvent.setup()
    render(<Harness totalMatchCount={40} />)

    expect(screen.queryByRole("button", { name: "Select all matching" })).not.toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "toggle b" }))
    expect(screen.queryByRole("button", { name: "Select all matching" })).not.toBeInTheDocument()

    await user.click(getMasterCheckbox())
    expect(screen.getByRole("button", { name: "Select all matching" })).toBeInTheDocument()

    await user.click(screen.getByRole("button", { name: "Select all matching" }))
    expect(screen.getByTestId("count")).toHaveTextContent("40")
    // Once scope is genuinely "all", the redundant page-scoped button is
    // no longer shown either.
    expect(screen.queryByRole("button", { name: "Select all matching" })).not.toBeInTheDocument()
  })

  it("never offers 'Select all matching' when the whole result set is already loaded", async () => {
    const user = userEvent.setup()
    render(<Harness totalMatchCount={ids.length} />)
    await user.click(getMasterCheckbox())
    expect(screen.queryByRole("button", { name: "Select all matching" })).not.toBeInTheDocument()
  })

  it("renders nothing at all for a genuinely empty list", () => {
    render(<EmptyHarness />)
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument()
  })
})

function EmptyHarness() {
  const selection = useBulkSelection({ ids: [] })
  return (
    <UhProvider>
      <BulkSelectAllHeader ids={[]} selection={selection} />
    </UhProvider>
  )
}
